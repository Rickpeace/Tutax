import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runDriftCheck } from "@/lib/drift";
import { isPro, PRO_REQUIRED } from "@/lib/plan";
import { takeHourlyAiRun } from "@/lib/ai-rate-limit";

export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  // Zugriffs-Gate: RLS entscheidet, ob der Nutzer dieses Tutorial sehen darf.
  const { data: tut } = await supabase
    .from("tutorials")
    .select("id")
    .eq("id", id)
    .single();
  if (!tut) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  // Prüfen kostet KI-Aufrufe und schreibt Hinweise -> nur Inhaber/Bearbeiter (Migration 0037).
  const { data: canEdit } = await supabase.rpc("can_edit_tutorial", { tid: id });
  if (canEdit !== true) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  // Aktualität prüfen nutzt KI (kostet) → erst ab Pro; automatisch jede Woche ist Business.
  const { data: planRow } = await supabase
    .from("tutorials")
    .select("accounts!inner(plan)")
    .eq("id", id)
    .maybeSingle<{ accounts: { plan: string | null } | null }>();
  if (!isPro(planRow?.accounts ?? {})) return NextResponse.json({ error: PRO_REQUIRED }, { status: 403 });

  // Kosten-Bremse pro Person (Audit 23.09.): der 60-Min-Cooldown hängt an drift_checked_at, das
  // Bearbeiter per REST zurücksetzen können — das Stundenlimit hier nicht.
  if (!(await takeHourlyAiRun(user.id, "ai_drift", 10)))
    return NextResponse.json(
      { configured: true, cooldown: true, error: "Sie haben in dieser Stunde schon viele Prüfungen gestartet. Bitte später erneut versuchen." },
      { status: 429 },
    );

  const result = await runDriftCheck(supabase, id);

  switch (result.kind) {
    case "not_configured":
      return NextResponse.json({
        configured: false,
        message: "Drift-Prüfung startet, sobald der OPENAI_API_KEY hinterlegt ist.",
      });
    case "cooldown":
      return NextResponse.json(
        {
          configured: true,
          cooldown: true,
          error: `Zuletzt vor ${result.sinceMin} Min geprüft – bitte noch ${result.waitMin} Min warten.`,
        },
        { status: 429 },
      );
    case "error":
      return NextResponse.json({ configured: true, error: result.message }, { status: 200 });
    case "ok":
      return NextResponse.json({
        configured: true,
        is_stale: result.is_stale,
        severity: result.severity,
        summary: result.summary,
        issues: result.issues,
        sources: result.sources,
      });
  }
}
