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
export async function publishTemplate(id: string) {
  await ensureAdmin();
  const admin = createAdminClient();
  const { data: t } = await admin.from("tutorials").select("title, slug").eq("id", id).single();
  if (!t) throw new Error("Nicht gefunden");

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
}

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
  revalidatePath("/admin");
}

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
