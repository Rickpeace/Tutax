"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";
import { matchesQuery } from "@/lib/search-match";
import type { TutorialStatus } from "@/lib/types";

export type TutorialHit = { id: string; title: string; status: TutorialStatus };

/**
 * Titel-Suche für die ⌘K-Palette: eigene Tutorials des aktiven Kontos, max. 8 Treffer. Läuft
 * über den RLS-Client (keine Admin-Rechte) — es werden also nur Tutorials sichtbar, auf die der
 * Nutzer ohnehin Zugriff hat.
 *
 * Umlaut- und Wortreihenfolge-tolerant wie die Hilfe-Seiten-Suche (Runde 5: „kontoauszug“ fand
 * „Kontoauszüge freigeben“ nicht) — die Titel des Kontos werden geladen und hier gefiltert
 * (Konten haben höchstens einige Hundert Anleitungen).
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

  const { data } = await supabase
    .from("tutorials")
    .select("id, title, status")
    .eq("account_id", account.id)
    .eq("is_template", false)
    .order("updated_at", { ascending: false })
    .limit(1000)
    .returns<TutorialHit[]>();

  return (data ?? []).filter((t) => matchesQuery(q, [t.title])).slice(0, 8);
}
