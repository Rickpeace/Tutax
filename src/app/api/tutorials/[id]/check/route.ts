import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runDriftCheck } from "@/lib/drift";

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
