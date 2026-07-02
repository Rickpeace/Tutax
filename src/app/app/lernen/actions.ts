"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";

/**
 * Schulungsnachweis: Haken setzen. RLS-Client — die insert-Policy autorisiert
 * (user_id = auth.uid() UND Mitglied des Kontos). account_id = aktives Konto.
 * upsert(onConflict tutorial_id,user_id): Doppelklick bleibt idempotent.
 */
export async function markCompleted(tutorialId: string) {
  const { account, userId } = await requireAccount();
  const supabase = await createClient();
  const { error } = await supabase.from("tutorial_completions").upsert(
    { tutorial_id: tutorialId, user_id: userId, account_id: account.id },
    { onConflict: "tutorial_id,user_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/app/lernen");
  revalidatePath(`/app/lernen/${tutorialId}`);
}

/** Eigenen Haken zurücknehmen. delete-Policy: nur user_id = auth.uid(). */
export async function unmarkCompleted(tutorialId: string) {
  const { userId } = await requireAccount();
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
