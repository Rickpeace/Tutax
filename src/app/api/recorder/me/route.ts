import { type NextRequest, NextResponse } from "next/server";
import {
  accountForRecorderToken,
  bearerToken,
  RECORDER_ME_CORS,
} from "@/lib/recorder";

// Steply-Recorder, Ein-Klick-Pairing (Welle 25): GET /api/recorder/me.
//
// Die EINZIGE neue Recorder-Route. Sie beantwortet genau eine Frage: „Zu welchem Konto
// gehoert dieser Verbindungs-Token?" Aufgerufen wird sie
//   1) von background.js der Extension, um einen frisch empfangenen Token GEGEN die
//      Ziel-App zu validieren, BEVOR er gespeichert wird (Pairing-Sicherheit), und
//   2) vom Panel + der Einbetten-Seite, um „Verbunden mit X" anzuzeigen.
//
// AUTH: „Authorization: Bearer <recorder_token>" — dieselbe Token-Pruefung wie die
// bestehenden Recorder-Routen (accountForRecorderToken, Admin-Client/RLS-Bypass, weil
// die Extension cross-origin ohne Session aufruft). Keine Cookies. Antwort minimal:
//   200 { account: <Kontoname>, slug }   |   401 (kein/ungueltiger Token).
// KEINE weiteren Kontodaten — die Route ist bewusst mager. CORS: siehe lib/recorder.ts.

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: RECORDER_ME_CORS });
}

export async function GET(req: NextRequest) {
  const token = bearerToken(req.headers.get("authorization"));
  const account = await accountForRecorderToken(token);
  if (!account) {
    return NextResponse.json(
      { error: "Ungültiger oder unbekannter Verbindungs-Token." },
      { status: 401, headers: RECORDER_ME_CORS },
    );
  }
  return NextResponse.json(
    { account: account.name, slug: account.slug },
    { status: 200, headers: RECORDER_ME_CORS },
  );
}
