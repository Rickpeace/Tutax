"use server";

import { takeHourlyAiRun } from "@/lib/ai-rate-limit";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";
import { translateTutorial as translateTutorialJob, type TranslateResult } from "@/lib/translate-jobs";
import { isBusiness, BUSINESS_REQUIRED } from "@/lib/plan";
import { withUserErrors, UserError } from "@/lib/action-error";

/**
 * „Übersetzen"-Knopf im Builder: ganzes Tutorial in alle aktivierten Sprachen.
 * Einzige aus dem Browser aufrufbare Übersetzungs-Aktion. Die eigentliche Arbeit (Admin-
 * Client, KI) liegt in `@/lib/translate-jobs` und prüft selbst keine Rechte — deshalb hier:
 * nur Inhaber/Bearbeiter (requireAccount weist Mitarbeiter ab), nur Business (Mehrsprachigkeit
 * laut Tarifseite; KI-Kosten) und nur Tutorials des AKTIVEN Kontos (RLS-sichtbar +
 * account_id-Abgleich).
 */
export const translateTutorial = withUserErrors(async function translateTutorial(
  tutorialId: string,
): Promise<TranslateResult> {
  const { account, userId: ctxUser } = await requireAccount();
  if (!isBusiness(account)) throw new UserError(BUSINESS_REQUIRED);
  const supabase = await createClient();
  const { data: tut } = await supabase
    .from("tutorials")
    .select("id")
    .eq("id", tutorialId)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!tut) throw new UserError("Anleitung nicht gefunden.");
  // Kostenbremse pro Person (Audit 23.09.: ohne Grenze beliebig oft auslösbar).
  if (!(await takeHourlyAiRun(ctxUser, "ai_translate", 20)))
    throw new UserError("Sie haben diese KI-Funktion in dieser Stunde schon oft genutzt. Bitte später erneut versuchen.");
  return translateTutorialJob(tutorialId);
});
