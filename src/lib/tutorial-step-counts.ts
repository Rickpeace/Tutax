import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Schrittzahl je Anleitung — seitenweise gelesen. PostgREST kappt jede Antwort serverseitig
// bei max-rows = 1000: Die Bibliothek las früher alle Schritt-Zeilen in EINER Abfrage, ab
// 1000 Schritten im Konto zeigten Karten dann „0 Schritte“ und der Veröffentlichen-Schalter
// war als „leere Anleitung“ gesperrt. Gleiches Muster wie countAutomationSteps.
const STEP_PAGE = 1000;
// Viele IDs in einem `in(...)`-Filter sprengen die URL-Länge — in Häppchen abfragen.
const ID_CHUNK = 150;

export async function countTutorialSteps(
  client: SupabaseClient,
  ids: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += STEP_PAGE) {
      const { data, error } = await client
        .from("steps")
        .select("tutorial_id")
        .in("tutorial_id", chunk)
        .order("id", { ascending: true })
        .range(from, from + STEP_PAGE - 1)
        .returns<{ tutorial_id: string }[]>();
      if (error) {
        // Zählung ist Beiwerk — die Bibliothek soll deshalb nicht ganz ausfallen.
        console.error("countTutorialSteps:", error.message);
        break;
      }
      for (const s of data ?? []) counts.set(s.tutorial_id, (counts.get(s.tutorial_id) ?? 0) + 1);
      if (!data || data.length < STEP_PAGE) break;
    }
  }
  return counts;
}
