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
  opts?: { force?: boolean },
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("tutorials")
      .select("slug, status, accounts(slug)")
      .eq("id", tutorialId)
      .maybeSingle();
    if (!data) return;
    // Draft-Edits betreffen die öffentlichen Seiten nicht -> Cache in Ruhe lassen.
    // force: für Übergänge (unpublish wurde gerade auf draft gesetzt).
    if (!opts?.force && data.status !== "published") return;
    const acc = Array.isArray(data.accounts) ? data.accounts[0] : data.accounts;
    const accountSlug = (acc as { slug?: string } | null)?.slug;
    if (!accountSlug) return;
    updateTag(hubTag(accountSlug));
    if (data.slug) updateTag(tutTag(accountSlug, data.slug));
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
    if (data?.tutorial_id) await invalidateTutorialTags(data.tutorial_id);
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
