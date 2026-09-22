"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";

// Steply-Recorder-Verbindungs-Token verwalten. Der Token authentifiziert die Browser-
// Extension gegen /api/recorder/* — statt Cookies/Sessions, weil die Extension cross-origin
// läuft. Seit Migration 0037 PRO PERSON und Organisation (recorder_tokens): wer neu verbindet,
// trennt niemand anderen mehr. Nur Inhaber/Bearbeiter (requireAccount weist Mitarbeiter ab).

/**
 * Erzeugt/rotiert den Verbindungs-Token. „Erneuern" setzt einfach einen neuen — der
 * alte wird damit sofort ungültig (dieselbe Spalte, überschrieben). Token wird
 * serverseitig via crypto.randomUUID() erzeugt (hochentropisch, uuid-Format passt zur
 * Spalte). Gibt den neuen Token zurück, damit die UI ihn direkt anzeigen kann.
 */
export async function rotateRecorderToken(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const { account, userId } = await requireAccount();

  const token = crypto.randomUUID();
  const { error } = await createAdminClient()
    .from("recorder_tokens")
    .upsert({ token, account_id: account.id, user_id: userId, created_at: new Date().toISOString() }, {
      onConflict: "account_id,user_id",
    });
  if (error) {
    return { ok: false, error: "Der Token konnte nicht erzeugt werden." };
  }

  revalidatePath("/app/settings", "layout");
  return { ok: true, token };
}
