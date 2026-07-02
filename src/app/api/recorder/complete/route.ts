import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  accountForRecorderToken,
  recorderJson,
  recorderPreflight,
} from "@/lib/recorder";
import { validateClicksOrNull } from "@/lib/clicks";

// Steply-Recorder-Direkt-Upload, Schritt 2: complete.
// Nachdem die Extension das Video an die signierte URL hochgeladen hat, meldet sie
// hier den Pfad (+ optional Titel/Klicks). Wir prüfen den Token erneut, stellen sicher
// dass der Pfad wirklich zum Konto gehört (kein Fremd-Pfad) und reihen einen video_job
// ein — ab da läuft die normale Video→Tutorial-Pipeline. CORS: siehe src/lib/recorder.ts.

export async function OPTIONS() {
  return recorderPreflight();
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: unknown;
    path?: unknown;
    title?: unknown;
    clicks?: unknown;
  };

  const account = await accountForRecorderToken(body?.token);
  if (!account) {
    return recorderJson({ error: "Ungültiger oder unbekannter Verbindungs-Token." }, 401);
  }

  // Pfad-Prüfung: MUSS im Konto-Ordner liegen (der handshake vergibt genau solche
  // Pfade). Verhindert, dass jemand mit gültigem Token einen fremden Pfad einreiht.
  const path = typeof body?.path === "string" ? body.path.trim() : "";
  if (!path || !path.startsWith(`${account.id}/`) || path.includes("..")) {
    return recorderJson({ error: "Ungültiger Video-Pfad." }, 400);
  }

  // Titel: optional, gekappt; Default wie besprochen.
  const rawTitle = typeof body?.title === "string" ? body.title.trim() : "";
  const title = rawTitle ? rawTitle.slice(0, 120) : "Bildschirmaufnahme";

  // Klicks: streng validieren, aber NICHT hart scheitern — kaputte Klicks werden
  // verworfen und das Tutorial trotzdem erstellt (gleiche Regeln wie video-upload.tsx,
  // Logik in src/lib/clicks.ts). Nur wenn valide → als jsonb in die Row.
  const clicks = body?.clicks === undefined ? null : validateClicksOrNull(body.clicks);

  const admin = createAdminClient();
  const row: Record<string, unknown> = {
    account_id: account.id,
    video_path: path,
    title,
    status: "queued",
  };
  if (clicks && clicks.length > 0) row.clicks = clicks;

  const { data: job, error } = await admin
    .from("video_jobs")
    .insert(row)
    .select("id")
    .single();
  if (error || !job) {
    return recorderJson({ error: "Der Auftrag konnte nicht angelegt werden." }, 500);
  }

  return recorderJson({ jobId: job.id });
}
