import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { markStaleCore } from "@/lib/translate-core";

/**
 * Übersetzungen eines Tutorials als VERALTET markieren (Welle 13).
 *
 * Wird nach jedem erfolgreichen Edit am DEUTSCHEN Original aufgerufen (Schritt-Text,
 * Tutorial-Titel, Branch-Änderungen …). Ein einziges UPDATE über den Admin-Client
 * (die reine SQL-Logik steckt in translate-core.markStaleCore — dieselbe, die der
 * Live-Test nutzt): das Original bleibt anzeigbar, wird aber als „veraltet“
 * gekennzeichnet, bis nachübersetzt wird. Fehler werden geschluckt — Stale-Markierung
 * darf einen Edit nie kippen. Kein Cache-Invalidieren hier: Stale betrifft nur die
 * Builder-UI.
 */
export async function markTranslationsStale(tutorialId: string): Promise<void> {
  try {
    await markStaleCore(createAdminClient(), tutorialId);
  } catch (e) {
    console.error("markTranslationsStale:", e instanceof Error ? e.message : e);
  }
}

/** Wie markTranslationsStale, ausgehend von einer Step-ID. */
export async function markTranslationsStaleByStep(stepId: string): Promise<void> {
  try {
    const { data } = await createAdminClient()
      .from("steps")
      .select("tutorial_id")
      .eq("id", stepId)
      .maybeSingle();
    if (data?.tutorial_id) await markTranslationsStale(data.tutorial_id);
  } catch (e) {
    console.error("markTranslationsStaleByStep:", e instanceof Error ? e.message : e);
  }
}

/** Wie markTranslationsStaleByStep, ausgehend von einer Branch-ID. */
export async function markTranslationsStaleByBranch(branchId: string): Promise<void> {
  try {
    const { data } = await createAdminClient()
      .from("step_branches")
      .select("step_id")
      .eq("id", branchId)
      .maybeSingle();
    if (data?.step_id) await markTranslationsStaleByStep(data.step_id);
  } catch (e) {
    console.error("markTranslationsStaleByBranch:", e instanceof Error ? e.message : e);
  }
}
