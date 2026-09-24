"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";
import { UserError, withUserErrors } from "@/lib/action-error";

/**
 * Schulungsnachweis: Haken setzen. RLS-Client — die insert-Policy autorisiert
 * (user_id = auth.uid() UND Mitglied des Kontos). account_id = aktives Konto.
 * upsert(onConflict tutorial_id,user_id): Doppelklick bleibt idempotent.
 */
export const markCompleted = withUserErrors(async function markCompleted(tutorialId: string) {
  const { account, userId } = await requireAccount({ allowMember: true });
  const supabase = await createClient();
  // Integrität: Nachweis nur für Schulungen des AKTIVEN Kontos (intern ODER öffentlich mit
  // Schulungsnachweis/in_lernen — wie die Schulungs-Liste) — sonst ließe sich mit fremden
  // UUIDs eine Completion-Zeile im eigenen Konto fälschen.
  const { data: tut } = await supabase
    .from("tutorials")
    .select("id")
    .eq("id", tutorialId)
    .eq("account_id", account.id)
    .eq("status", "published")
    .or("visibility.eq.internal,in_lernen.eq.true")
    .maybeSingle();
  // Klartext statt stummem Fehlschlag (Runde 5: Schulung inzwischen zurückgezogen).
  if (!tut) throw new UserError("Diese Schulung wurde inzwischen zurückgezogen oder geändert – bitte laden Sie die Seite neu.");
  const { error } = await supabase.from("tutorial_completions").upsert(
    { tutorial_id: tutorialId, user_id: userId, account_id: account.id },
    { onConflict: "tutorial_id,user_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/app/lernen");
  revalidatePath(`/app/lernen/${tutorialId}`);
});

/** Eigenen Haken zurücknehmen. delete-Policy: nur user_id = auth.uid(). */
export async function unmarkCompleted(tutorialId: string) {
  const { userId } = await requireAccount({ allowMember: true });
  const supabase = await createClient();
  const { error } = await supabase
    .from("tutorial_completions")
    .delete()
    .eq("tutorial_id", tutorialId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/app/lernen");
  revalidatePath(`/app/lernen/${tutorialId}`);
}
