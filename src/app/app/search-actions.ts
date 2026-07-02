"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";
import type { TutorialStatus } from "@/lib/types";

export type TutorialHit = { id: string; title: string; status: TutorialStatus };

/**
 * Titel-Suche für die ⌘K-Palette: eigene Tutorials des aktiven Kontos, ilike auf
 * den Titel, max. 8 Treffer. Läuft über den RLS-Client (keine Admin-Rechte) —
 * es werden also nur Tutorials sichtbar, auf die der Nutzer ohnehin Zugriff hat.
 *
 * Ausnahme von der „Server-Actions = nur Mutationen“-Regel: eine bewusst kleine,
 * client-getriggerte Lese-Aktion (debounced Live-Suche). Bewusst NICHT gecacht —
 * die Ergebnisse sind nutzer- und query-spezifisch.
 */
export async function searchMyTutorials(query: string): Promise<TutorialHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const { account } = await requireAccount();
  const supabase = await createClient();

  // ilike-Sonderzeichen entschärfen, damit ein eingetipptes % / _ kein Platzhalter wird.
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);

  const { data } = await supabase
    .from("tutorials")
    .select("id, title, status")
    .eq("account_id", account.id)
    .eq("is_template", false)
    .ilike("title", `%${escaped}%`)
    .order("updated_at", { ascending: false })
    .limit(8)
    .returns<TutorialHit[]>();

  return data ?? [];
}
