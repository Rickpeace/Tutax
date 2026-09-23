import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Schrittzahl je Automation — seitenweise gelesen (PostgREST kappt Antworten serverseitig bei
// max-rows = 1000), damit die Zählung auch bei vielen Schritten vollständig bleibt; überträgt
// nur die automation_id-Spalte. Gleiches Muster wie stepTutorialIds in
// app/api/recorder/tutorials/route.ts. Nutzbar mit Admin- ODER Session-Client (RLS).
const STEP_PAGE = 1000;

export async function countAutomationSteps(
  client: SupabaseClient,
  ids: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!ids.length) return counts;
  for (let from = 0; ; from += STEP_PAGE) {
    const { data, error } = await client
      .from("automation_steps")
      .select("automation_id")
      .in("automation_id", ids)
      .order("id", { ascending: true })
      .range(from, from + STEP_PAGE - 1)
      .returns<{ automation_id: string }[]>();
    if (error || !data) break;
    for (const s of data) counts.set(s.automation_id, (counts.get(s.automation_id) ?? 0) + 1);
    if (data.length < STEP_PAGE) break;
  }
  return counts;
}
