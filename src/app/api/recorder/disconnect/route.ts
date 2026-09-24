import { type NextRequest } from "next/server";
import { recorderJson, recorderPreflight, revokeRecorderToken } from "@/lib/recorder";

// „Trennen“ in der Seitenleiste (Audit 24.09.): POST /api/recorder/disconnect, Body { token }.
//
// Vorher entfernte die Erweiterung den Token nur lokal — in Steply blieb der Browser unter
// „Ihre verbundenen Browser“ stehen und der Token war weiter gültig. Jetzt löscht diese Route
// GENAU diesen Token aus recorder_tokens (andere Browser/Personen bleiben verbunden).
//
// AUTH: der Token selbst (wer ihn hat, darf ihn widerrufen) — wie die anderen POST-Routen der
// Erweiterung ohne Cookies. Antwort immer 200 { ok, removed }: Ein unbekannter/schon gelöschter
// Token ist kein Fehler (das Panel trennt lokal ohnehin). CORS: RECORDER_CORS (lib/recorder.ts).

export async function OPTIONS() {
  return recorderPreflight();
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  let removed = false;
  try {
    removed = await revokeRecorderToken(body?.token);
  } catch (e) {
    console.error("[recorder/disconnect]", e instanceof Error ? e.message : e);
  }
  return recorderJson({ ok: true, removed });
}
