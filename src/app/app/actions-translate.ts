"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";
import { translateTutorial as translateTutorialJob, type TranslateResult } from "@/lib/translate-jobs";

/**
 * „Übersetzen"-Knopf im Builder: ganzes Tutorial in alle aktivierten Sprachen.
 * Einzige aus dem Browser aufrufbare Übersetzungs-Aktion. Die eigentliche Arbeit (Admin-
 * Client, KI) liegt in `@/lib/translate-jobs` und prüft selbst keine Rechte — deshalb hier:
 * nur Inhaber/Bearbeiter (requireAccount weist Mitarbeiter ab) und nur Tutorials des
 * AKTIVEN Kontos (RLS-sichtbar + account_id-Abgleich).
 */
export async function translateTutorial(tutorialId: string): Promise<TranslateResult> {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data: tut } = await supabase
    .from("tutorials")
    .select("id")
    .eq("id", tutorialId)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!tut) throw new Error("Anleitung nicht gefunden.");
  return translateTutorialJob(tutorialId);
}
