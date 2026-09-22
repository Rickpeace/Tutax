import { type NextRequest, NextResponse } from "next/server";
import { accountForRecorderToken, bearerToken, RECORDER_ME_CORS } from "@/lib/recorder";
import { createAdminClient } from "@/lib/supabase/admin";
import { failedVideoReason } from "@/lib/video-failure";

// Steply-Recorder (Welle 51): GET /api/recorder/video-status?id=<jobId>.
//
// Nach dem Video-Upload fragt das Erweiterungs-Panel (solange es offen ist) hier den Stand
// des video_jobs-Auftrags ab, damit „wird erstellt“ nicht mehr still im Nichts endet:
// fertig -> „In Steply öffnen“, gescheitert -> Grund in Klartext + „Erneut aufnehmen“.
//
// AUTH wie /api/recorder/me: „Authorization: Bearer <recorder_token>“ (Admin-Client, weil
// cross-origin ohne Session). Der Auftrag MUSS zum Token-Konto gehören (account_id-Filter) —
// fremde IDs liefern 404, genau wie unbekannte. Nur lesend. CORS: RECORDER_ME_CORS.
//
// Antwort: { status: "queued"|"processing"|"done"|"failed", progress, tutorialId, reason }.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: RECORDER_ME_CORS });
}

export async function GET(req: NextRequest) {
  const account = await accountForRecorderToken(bearerToken(req.headers.get("authorization")));
  if (!account) {
    return NextResponse.json(
      { error: "Ungültiger oder unbekannter Verbindungs-Token." },
      { status: 401, headers: RECORDER_ME_CORS },
    );
  }
  const id = (req.nextUrl.searchParams.get("id") || "").trim();
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Ungültige Auftrags-ID." }, { status: 400, headers: RECORDER_ME_CORS });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("video_jobs")
    .select("status, progress, tutorial_id, error")
    .eq("id", id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Status nicht abrufbar." }, { status: 500, headers: RECORDER_ME_CORS });
  }
  if (!data) {
    return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404, headers: RECORDER_ME_CORS });
  }

  const status = String(data.status);
  return NextResponse.json(
    {
      status,
      progress: status === "processing" ? (data.progress ?? null) : null,
      tutorialId: status === "done" ? (data.tutorial_id ?? null) : null,
      reason: status === "failed" ? failedVideoReason(data.error) : null,
    },
    { status: 200, headers: { ...RECORDER_ME_CORS, "Cache-Control": "no-store" } },
  );
}
