import "server-only";
import { updateTag, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cache-Tags der öffentlichen Hilfe-Seiten (Cache Components):
 *  - hub-<accountSlug>: Hub-Liste + Theme des Kontos
 *  - tut-<accountSlug>/<tutorialSlug>: eine einzelne Tutorial-Seite
 * Mutationen rufen invalidateTutorialTags/invalidateHubTag → Endkunden sehen
 * Änderungen sofort; verpasste Pfade fängt cacheLife('hours') ab.
 */
export const hubTag = (accountSlug: string) => `hub-${accountSlug}`;
export const tutTag = (accountSlug: string, tutorialSlug: string) =>
  `tut-${accountSlug}/${tutorialSlug}`;

/**
 * Tag sofort verfallen lassen. updateTag gibt es nur in Server-Actions; in Route-Handlern
 * (z. B. Sofort-Anleitung per Erweiterung in eine veröffentlichte Anleitung) wirft es — dort
 * greift revalidateTag (stale-while-revalidate), statt still gar nicht zu invalidieren.
 */
function expireTag(tag: string): void {
  try {
    updateTag(tag);
  } catch {
    revalidateTag(tag, "max");
  }
}

/** Hub eines Kontos invalidieren (Theme-/Branding-/Katalog-Änderungen). */
export function invalidateHubTag(accountSlug: string | null | undefined): void {
  if (accountSlug) updateTag(hubTag(accountSlug));
}

/**
 * Tags eines Tutorials (per ID) invalidieren — schlägt Account-Slug + Tutorial-Slug
 * selbst nach. VOR einem Delete aufrufen (danach ist der Lookup weg). Fehler werden
 * geschluckt: Cache-Invalidierung darf keine Mutation kippen.
 */
export async function invalidateTutorialTags(
  tutorialId: string,
  /**
   * hub: false = nur die Seite DIESER Anleitung (Schritte, Bilder, Antworten). Der Hub-Tag hängt an
   * ALLEN Seiten des Kontos — ihn bei jeder Schritt-Änderung zu verwerfen, ließ jede Seite beim
   * nächsten Besuch neu rendern und in den Cache schreiben (Vercel-ISR-Writes, 24.09.2026).
   * Titel/Beschreibung/Kategorie/Sichtbarkeit stehen im Hub → dort Standard (true).
   */
  opts?: { force?: boolean; hub?: boolean },
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("tutorials")
      .select("slug, status, is_template, account_id, accounts(slug)")
      .eq("id", tutorialId)
      .maybeSingle();
    if (!data) return;
    // Draft-Edits betreffen die öffentlichen Seiten nicht -> Cache in Ruhe lassen.
    // force: für Übergänge (unpublish wurde gerade auf draft gesetzt).
    if (!opts?.force && data.status !== "published") return;
    // Globale Vorlage (kein Konto): sie erscheint in den Hubs ALLER Konten, die sie
    // aktiviert/angepasst haben -> deren Hubs (und damit ihre Seiten) invalidieren.
    if (data.is_template && !data.account_id) {
      await invalidateTemplateHubs(tutorialId);
      return;
    }
    const acc = Array.isArray(data.accounts) ? data.accounts[0] : data.accounts;
    const accountSlug = (acc as { slug?: string } | null)?.slug;
    if (!accountSlug) return;
    if (opts?.hub !== false || !data.slug) expireTag(hubTag(accountSlug));
    if (data.slug) expireTag(tutTag(accountSlug, data.slug));
  } catch (e) {
    console.error("cache-tag invalidation:", e instanceof Error ? e.message : e);
  }
}

/**
 * Alle Hubs invalidieren, in denen eine globale Vorlage vorkommt (Konten mit einer
 * account_templates-Zeile — aktiviert, abgeschaltet oder angepasst). Die Tutorial- und
 * Druckseiten tragen den Hub-Tag mit, fallen also mit. Für Admin-Änderungen an Vorlagen
 * (zurückziehen/löschen/veröffentlichen/Kategorie/Inhalt); VOR einem Delete aufrufen.
 * Wirft nie.
 */
export async function invalidateTemplateHubs(templateId: string): Promise<void> {
  try {
    const { data } = await createAdminClient()
      .from("account_templates")
      .select("accounts(slug)")
      .eq("template_id", templateId);
    const slugs = new Set<string>();
    for (const row of data ?? []) {
      const acc = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
      const slug = (acc as { slug?: string } | null)?.slug;
      if (slug) slugs.add(slug);
    }
    // Auch im Hintergrund (after(), z. B. nach der Vorlagen-Übersetzung) — siehe expireTag.
    for (const slug of slugs) expireTag(hubTag(slug));
  } catch (e) {
    console.error("cache-tag invalidation:", e instanceof Error ? e.message : e);
  }
}

/** Wie invalidateTutorialTags, aber ausgehend von einer Step-ID. */
export async function invalidateStepTags(stepId: string): Promise<void> {
  try {
    const { data } = await createAdminClient()
      .from("steps")
      .select("tutorial_id")
      .eq("id", stepId)
      .maybeSingle();
    if (data?.tutorial_id) await invalidateTutorialTags(data.tutorial_id, { hub: false });
  } catch (e) {
    console.error("cache-tag invalidation:", e instanceof Error ? e.message : e);
  }
}

/** Wie invalidateStepTags, aber ausgehend von einer Branch-ID. */
export async function invalidateBranchTags(branchId: string): Promise<void> {
  try {
    const { data } = await createAdminClient()
      .from("step_branches")
      .select("step_id")
      .eq("id", branchId)
      .maybeSingle();
    if (data?.step_id) await invalidateStepTags(data.step_id);
  } catch (e) {
    console.error("cache-tag invalidation:", e instanceof Error ? e.message : e);
  }
}

/**
 * Hub-Invalidierung aus ROUTE HANDLERN (Theme-/Logo-Routen): dort ist updateTag nicht
 * erlaubt -> revalidateTag mit "max"-Profil (stale-while-revalidate). Slug wird per
 * account_id nachgeschlagen.
 */
export async function revalidateHubByAccountId(accountId: string): Promise<void> {
  try {
    const { data } = await createAdminClient()
      .from("accounts")
      .select("slug")
      .eq("id", accountId)
      .maybeSingle();
    if (data?.slug) revalidateTag(hubTag(data.slug), "max");
  } catch (e) {
    console.error("cache-tag invalidation:", e instanceof Error ? e.message : e);
  }
}
