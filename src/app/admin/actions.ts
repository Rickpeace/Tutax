"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAdmin } from "@/lib/admin";
import { slugify, fallbackSlug } from "@/lib/slug";
import { after } from "next/server";
import { reindexAccount, reindexTemplateForAccounts, removeTutorialEmbeddings } from "@/lib/kb";
import { invalidateTemplateHubs, invalidateHubTag } from "@/lib/cache-tags";
import { translateTutorial } from "@/lib/translate-jobs";
import { retireHiddenTemplateForks } from "@/lib/template-forks";
import { withUserErrors, UserError } from "@/lib/action-error";
import { createClient } from "@/lib/supabase/server";
import { appBaseUrl } from "@/lib/url";
import { purgeAccountFiles } from "@/lib/storage-purge";
import { PROTECTED_SLUGS } from "@/lib/admin-customers";

async function ensureAdmin() {
  if (!(await checkAdmin())) throw new Error("Kein Admin-Zugriff");
}

/** Neues globales Template anlegen und im Builder öffnen. */
export async function createTemplate(formData: FormData) {
  await ensureAdmin();
  const title = String(formData.get("title") ?? "").trim() || "Neues Template";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tutorials")
    .insert({ account_id: null, is_template: true, title, status: "draft" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  redirect(`/app/tutorials/${data.id}`);
}

/** Template veröffentlichen (Slug eindeutig unter Templates). */
export const publishTemplate = withUserErrors(async function publishTemplate(id: string) {
  await ensureAdmin();
  const admin = createAdminClient();
  const { data: t } = await admin.from("tutorials").select("title, slug").eq("id", id).single();
  if (!t) throw new Error("Nicht gefunden");
  // Leere Vorlage nie veröffentlichen — sonst stünde bei allen Kunden mit aktivierter Vorlage
  // eine Anleitung ohne Inhalt auf der Hilfe-Seite (gleiche Regel wie publishTutorial).
  const { count: stepCount } = await admin.from("steps").select("id", { count: "exact", head: true }).eq("tutorial_id", id);
  if (!stepCount) {
    throw new UserError("Diese Vorlage hat noch keine Schritte. Legen Sie zuerst einen Schritt an, dann können Sie veröffentlichen.");
  }

  let slug = t.slug as string | null;
  if (!slug) {
    // Ohne Buchstaben/Zahlen im Titel: stabile Ersatz-Adresse aus der Kennung.
    const base = slugify(t.title) || fallbackSlug("vorlage", id);
    const { data: existing } = await admin
      .from("tutorials")
      .select("slug")
      .eq("is_template", true)
      .not("slug", "is", null);
    const taken = new Set((existing ?? []).map((x) => x.slug));
    slug = base;
    let n = 1;
    while (taken.has(slug)) slug = `${base}-${++n}`;
  }
  const { error } = await admin
    .from("tutorials")
    .update({ status: "published", slug, published_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  // Kunden-Hubs mit dieser Vorlage sofort aktualisieren (sonst bis zu 1 h alter Stand).
  await invalidateTemplateHubs(id);
  // Im Hintergrund: in alle Zusatzsprachen übersetzen (Vorlagen erscheinen auch in
  // EN/PL/TR-Hubs) und das Chatbot-Wissen der Konten wiederherstellen, die die Vorlage
  // aktiviert haben (Zurückziehen hatte es entfernt).
  after(() =>
    translateTutorial(id).catch((e) =>
      console.error("Vorlagen-Übersetzung beim Veröffentlichen:", e instanceof Error ? e.message : e),
    ),
  );
  after(() => reindexTemplateForAccounts(id));
  revalidatePath("/admin");
});

export async function unpublishTemplate(id: string) {
  await ensureAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("tutorials").update({ status: "draft" }).eq("id", id);
  if (error) throw new Error(error.message);
  // Pro-Account angelegte Embeddings dieses Templates account-übergreifend entfernen,
  // sonst antworten Kunden-Chatbots weiter aus dem depublizierten Template. Angepasste
  // Kopien (Forks) sind ab jetzt öffentlich ebenfalls nicht mehr erreichbar
  // (resolveCustomerTutorial) -> auch ihr Chatbot-Wissen entfernen.
  await removeTutorialEmbeddings(admin, id).catch(() => {});
  const { data: forks } = await admin
    .from("account_templates")
    .select("forked_tutorial_id")
    .eq("template_id", id)
    .not("forked_tutorial_id", "is", null);
  for (const f of forks ?? []) {
    await removeTutorialEmbeddings(admin, f.forked_tutorial_id as string).catch(() => {});
  }
  await invalidateTemplateHubs(id); // Kunden-Hubs zeigen die Vorlage sofort nicht mehr
  revalidatePath("/admin");
}

export async function deleteTemplate(id: string) {
  await ensureAdmin();
  const admin = createAdminClient();
  // Erst die (account-übergreifenden) Embeddings weg, dann die Vorlage.
  await removeTutorialEmbeddings(admin, id).catch(() => {});
  // VOR dem Delete: danach sind die account_templates-Zeilen (Cascade) weg.
  await invalidateTemplateHubs(id);
  // Abgeschaltete/verborgene angepasste Kopien der Kunden würden ohne Vorlage zu normalen
  // eigenen Anleitungen und damit wieder öffentlich → vorher auf Entwurf setzen.
  await retireHiddenTemplateForks(admin, id);
  const { error } = await admin.from("tutorials").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

// ---- Globale (Standard-)Kategorien -----------------------------------------

/** Globale Kategorie anlegen (erscheint beim Kunden + im Kunden-Hub). */
export async function createTemplateCategory(formData: FormData) {
  await ensureAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const admin = createAdminClient();
  // Höchste Position + 1 (nicht die Anzahl): nach einem Löschen gäbe es sonst doppelte
  // Positionen und die Reihenfolge in Admin + Kunden-Hubs würde zufällig.
  const { data: last } = await admin
    .from("categories")
    .select("position")
    .is("account_id", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin
    .from("categories")
    .insert({ account_id: null, name, position: ((last?.position as number | null) ?? -1) + 1 });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function deleteTemplateCategory(id: string) {
  await ensureAdmin();
  const admin = createAdminClient();
  // Kunden-Hubs gruppieren Vorlagen nach dieser Kategorie — VOR dem Löschen die betroffenen
  // Hubs merken (danach ist die Zuordnung weg), sonst zeigen sie sie bis zu 1 h weiter.
  const { data: tpls } = await admin
    .from("tutorials")
    .select("id")
    .eq("is_template", true)
    .eq("category_id", id);
  // Templates der Kategorie werden via FK (on delete set null) freigestellt.
  const { error } = await admin.from("categories").delete().eq("id", id).is("account_id", null);
  if (error) throw new Error(error.message);
  for (const t of tpls ?? []) await invalidateTemplateHubs(t.id as string);
  revalidatePath("/admin");
}

// ---- Kunden-Konten -----------------------------------------------------------

/**
 * Tarif eines Kunden-Kontos manuell setzen (Vollzugriff OHNE Zahlungsanbieter —
 * Richards Anforderung). Später setzt der LemonSqueezy-Webhook denselben Wert.
 */
export async function setAccountPlan(accountId: string, plan: "free" | "pro" | "business") {
  await ensureAdmin();
  if (plan !== "free" && plan !== "pro" && plan !== "business") throw new Error("Ungültiger Tarif");
  const admin = createAdminClient();
  const { data: before } = await admin.from("accounts").select("plan").eq("id", accountId).maybeSingle();
  const { data: acc, error } = await admin
    .from("accounts")
    .update({ plan })
    .eq("id", accountId)
    .select("slug")
    .single();
  if (error) throw new Error(error.message);
  // Der Tarif steuert, was die Hilfe-Seite zeigt (Logo/CI, Chat, „Erstellt mit Steply“) —
  // deren Cache sofort räumen, sonst gälte der alte Tarif dort bis zu einer Stunde weiter.
  if (acc?.slug) invalidateHubTag(acc.slug as string);
  // Gratis-Konten haben keinen Chatbot-/Such-Index (Embeddings kosten) — beim Upgrade nachbauen.
  // Nur beim Schritt VON Gratis: Pro ↔ Business hat den Index schon (sonst alles neu einbetten,
  // was nur OpenAI-Kosten erzeugt).
  const wasPaid = before?.plan === "pro" || before?.plan === "business";
  if (plan !== "free" && !wasPaid) after(() => reindexAccount(accountId));
  revalidatePath("/admin", "layout"); // Vorlagen- UND Kunden-Seiten
}

/**
 * Support: einem Teammitglied einen Link zum Passwort-Zurücksetzen per E-Mail schicken
 * (gleicher Weg wie „Passwort vergessen“ — der Link führt über /auth/confirm nach /reset).
 */
export const sendMemberPasswordLink = withUserErrors(async function sendMemberPasswordLink(userId: string): Promise<{ email: string }> {
  await ensureAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) throw new UserError("Diese Person wurde nicht gefunden.");
  const supabase = await createClient();
  const { error: sendErr } = await supabase.auth.resetPasswordForEmail(data.user.email, {
    redirectTo: `${appBaseUrl()}/auth/confirm?next=/reset`,
  });
  if (sendErr) {
    // Supabase meldet Mail-Server-Fehler als 500 mit leerem Text („{}“) — verständlich übersetzen.
    const detail = sendErr.message && sendErr.message !== "{}" ? ` (${sendErr.message})` : "";
    throw new UserError(
      sendErr.status === 429
        ? "Zu viele E-Mails in kurzer Zeit – bitte in ein paar Minuten erneut versuchen."
        : `Der Mail-Server hat die E-Mail an ${data.user.email} nicht angenommen${detail}. Bitte die Adresse prüfen oder den E-Mail-Versand in Supabase (Auth → SMTP) kontrollieren.`,
    );
  }
  return { email: data.user.email };
});

/**
 * Kunden (Organisation) endgültig löschen — nur mit dem exakten Namen als Bestätigung.
 * Reihenfolge: Dateien in allen Speicher-Bereichen → Organisation (alle Anleitungen, Schritte,
 * Wissen, Automationen, Einladungen … per Kaskade) → Personen, die danach in KEINER Organisation
 * mehr sind (sonst stünden sie ohne Team da). Admins und die eigenen Organisationen
 * (steply, demo) bleiben unangetastet.
 */
export const deleteCustomer = withUserErrors(async function deleteCustomer(
  accountId: string,
  confirmName: string,
): Promise<{ files: number; users: number }> {
  await ensureAdmin();
  const admin = createAdminClient();
  const { data: acc } = await admin.from("accounts").select("id, name, slug").eq("id", accountId).maybeSingle();
  if (!acc) throw new UserError("Diese Organisation gibt es nicht mehr.");
  if (PROTECTED_SLUGS.has(acc.slug as string)) {
    throw new UserError("Diese Organisation gehört zu Steply selbst und lässt sich hier nicht löschen.");
  }
  if (confirmName.trim() !== String(acc.name).trim()) {
    throw new UserError("Der eingegebene Name stimmt nicht mit dem Namen der Organisation überein.");
  }

  const { data: members } = await admin.from("account_members").select("user_id").eq("account_id", accountId);
  const memberIds = (members ?? []).map((m) => m.user_id as string);

  const purged = await purgeAccountFiles(admin, accountId);
  const { error: delErr } = await admin.from("accounts").delete().eq("id", accountId);
  if (delErr) throw new Error(delErr.message);

  // Personen ohne weitere Organisation mit löschen (Admins nie).
  const { data: admins } = await admin.from("admins").select("user_id");
  const adminIds = new Set((admins ?? []).map((a) => a.user_id as string));
  let usersDeleted = 0;
  for (const uid of memberIds) {
    if (adminIds.has(uid)) continue;
    const { count } = await admin.from("account_members").select("user_id", { count: "exact", head: true }).eq("user_id", uid);
    if ((count ?? 0) > 0) continue;
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (!error) usersDeleted++;
  }

  invalidateHubTag(acc.slug as string);
  revalidatePath("/admin", "layout");
  return { files: Object.values(purged).reduce((a, b) => a + b, 0), users: usersDeleted };
});

/** Template einer globalen Kategorie zuordnen (oder lösen mit null). */
export async function setTemplateCategory(templateId: string, categoryId: string | null) {
  await ensureAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("tutorials")
    .update({ category_id: categoryId })
    .eq("id", templateId)
    .eq("is_template", true);
  if (error) throw new Error(error.message);
  await invalidateTemplateHubs(templateId); // Kategorie im Kunden-Hub sofort aktuell
  revalidatePath("/admin");
}
