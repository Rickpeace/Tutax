"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";

// Steply-Recorder-Verbindungs-Token verwalten. Der Token (accounts.recorder_token,
// Migration 0023) authentifiziert die Browser-Extension gegen /api/recorder/* — statt
// Cookies/Sessions, weil die Extension cross-origin läuft. Nur Konto-Mitglieder dürfen
// ihn erzeugen/rotieren (requireAccount + accounts-RLS via my_account_ids()).

/**
 * Erzeugt/rotiert den Verbindungs-Token. „Erneuern" setzt einfach einen neuen — der
 * alte wird damit sofort ungültig (dieselbe Spalte, überschrieben). Token wird
 * serverseitig via crypto.randomUUID() erzeugt (hochentropisch, uuid-Format passt zur
 * Spalte). Gibt den neuen Token zurück, damit die UI ihn direkt anzeigen kann.
 */
export async function rotateRecorderToken(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const { account } = await requireAccount();
  const supabase = await createClient();

  const token = crypto.randomUUID();
  const { error } = await supabase
    .from("accounts")
    .update({ recorder_token: token })
    .eq("id", account.id);
  if (error) {
    return { ok: false, error: "Der Token konnte nicht erzeugt werden." };
  }

  revalidatePath("/app/settings/einbetten");
  return { ok: true, token };
}
