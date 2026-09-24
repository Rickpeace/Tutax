"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertActiveAccount, orgSwitchedError, requireAccount } from "@/lib/account";
import { withUserErrors, UserError } from "@/lib/action-error";
import { invalidateHubTag } from "@/lib/cache-tags";
import { ORG_NAME_MAX } from "@/lib/text-limits";
import { slugify } from "@/lib/slug";
import { createAdminClient } from "@/lib/supabase/admin";

// Org-Wechsel in einem anderen Tab: nur die Organisation einrichten, die die Seite zeigt.
/** "" = leer, false = ungültig, sonst die vollständige https-Adresse. */
function normalizeWebsite(raw: string): string | false {
  const t = raw.trim();
  if (!t) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || /\s/.test(t)) return false;
    return u.toString().replace(/\/$/, "");
  } catch {
    return false;
  }
}

export const completeOnboarding = withUserErrors(async function completeOnboarding(
  expectedAccountId: string,
  input: {
    name: string;
    websiteUrl: string;
  },
) {
  const ctx = await requireAccount();
  assertActiveAccount(expectedAccountId, ctx);
  const { account } = ctx;
  const supabase = await createClient();
  // Einrichtung soll nie an einer zu langen Eingabe scheitern -> hier gekappt (das
  // Formular begrenzt bereits auf ORG_NAME_MAX), Einstellungen lehnen dagegen ab.
  const name =
    input.name.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim().slice(0, ORG_NAME_MAX) ||
    account.name;

  // Website prüfen, BEVOR etwas gespeichert wird: vorher landete z. B. „meine firma“ ungeprüft
  // als Adresse (Audit 24.09.). „firma.de“ ohne https:// ist erlaubt und wird ergänzt.
  const url = normalizeWebsite(input.websiteUrl);
  if (url === false) throw new UserError("Bitte prüfen Sie die Website-Adresse (z. B. www.firma.de) – oder lassen Sie das Feld leer.");

  const { error } = await supabase
    .from("accounts")
    .update({ name, onboarded: true })
    .eq("id", account.id);
  if (error) throw new UserError("Die Einrichtung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
  // Name erscheint auf der Hilfe-Seite (Kopf, Titel) — gecachte Seiten sofort erneuern.
  if (name !== account.name) invalidateHubTag(account.slug);

  // Öffentliche Adresse aus dem Organisationsnamen statt aus der E-Mail (Runde 5: die Registrierung
  // bildet sie aus dem E-Mail-Anfang — „/h/vorname-nachname“ stand öffentlich im Netz, auch wenn
  // ein Kanzleiname angegeben war). Nur, solange die Adresse noch die automatisch vergebene ist.
  const emailLocal = slugify((ctx.email ?? "").split("@")[0] ?? "");
  const autoSlug = !!emailLocal && (account.slug === emailLocal || account.slug.startsWith(`${emailLocal}-`));
  const nameSlug = /\S+@\S+/.test(name) ? "" : slugify(name);
  if (autoSlug && nameSlug && nameSlug !== account.slug) {
    const admin = createAdminClient();
    const { data: taken } = await admin.from("accounts").select("slug").like("slug", `${nameSlug}%`);
    const used = new Set((taken ?? []).map((r) => r.slug as string));
    let candidate = nameSlug;
    for (let n = 2; used.has(candidate) && n < 100; n++) candidate = `${nameSlug}-${n}`;
    if (!used.has(candidate)) {
      const { error: se } = await supabase.from("accounts").update({ slug: candidate }).eq("id", account.id);
      if (!se) invalidateHubTag(candidate);
    }
  }

  if (url) {
    await supabase
      .from("themes")
      .update({ source_url: url })
      .eq("account_id", account.id);
  }
  redirect("/app");
});

export async function skipOnboarding(expectedAccountId: string) {
  const ctx = await requireAccount();
  // Gewechselt: nichts markieren, die App zeigt die jetzt aktive Organisation.
  if (orgSwitchedError(expectedAccountId, ctx)) redirect("/app");
  const { account } = ctx;
  const supabase = await createClient();
  await supabase.from("accounts").update({ onboarded: true }).eq("id", account.id);
  redirect("/app");
}
