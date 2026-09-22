"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Aktive Organisation wechseln (nur wenn der Nutzer dort Mitglied ist).
 *
 * Bewusst EIGENE, schlanke Datei: vorher lag die Aktion in app/app/actions.ts, das beim
 * Aufruf das ganze Modul samt Bildverarbeitung/KI/Übersetzung lädt — der Umschalter braucht
 * nur Supabase. Jede Ausnahme wird abgefangen, ins Server-Log geschrieben und als kurze
 * Meldung zurückgegeben (statt einer anonymen 500, die der Umschalter nur als „ging nicht"
 * zeigen konnte).
 */
export async function setActiveAccount(
  accountId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sitzung abgelaufen – bitte neu anmelden." };
    const { data: m } = await supabase
      .from("account_members")
      .select("account_id")
      .eq("user_id", user.id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!m) return { ok: false, error: "Sie sind kein Mitglied dieser Organisation." };
    // Serverseitig in den User-Metadaten merken -> geräteübergreifend gleich.
    const { error } = await supabase.auth.updateUser({ data: { active_account_id: accountId } });
    if (error) return { ok: false, error: "Wechsel fehlgeschlagen: " + error.message };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("setActiveAccount fehlgeschlagen:", e);
    return { ok: false, error: "Wechsel fehlgeschlagen (" + msg.slice(0, 160) + ")" };
  }
}
