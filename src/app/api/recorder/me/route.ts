import { type NextRequest, NextResponse } from "next/server";
import {
  accountForRecorderToken,
  bearerToken,
  RECORDER_ME_CORS,
} from "@/lib/recorder";
import { FREE_TUTORIAL_LIMIT, isPro, videoAllowed } from "@/lib/plan";
import { tutorialQuotaReachedFor } from "@/lib/tutorial-quota";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Wie viele NEUE Anleitungen darf das Konto noch anlegen? null = unbegrenzt (Pro/Business),
 * undefined = unbekannt (Fehler → Feld fehlt). Maßgeblich für „0“ ist tutorialQuotaReachedFor
 * (dieselbe Prüfung wie beim Hochladen); die Restzahl darüber zählt genauso (eigene Anleitungen
 * ohne Vorlagen-Kopien) und ist nur Anzeige.
 */
async function tutorialsLeftFor(accountId: string, plan: string | null): Promise<number | null | undefined> {
  if (isPro({ plan })) return null;
  try {
    const admin = createAdminClient();
    if (await tutorialQuotaReachedFor(admin, accountId)) return 0;
    const [{ count: total }, { count: forks }] = await Promise.all([
      admin.from("tutorials").select("id", { count: "exact", head: true }).eq("account_id", accountId),
      admin
        .from("account_templates")
        .select("template_id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .not("forked_tutorial_id", "is", null),
    ]);
    return Math.max(1, FREE_TUTORIAL_LIMIT - ((total ?? 0) - (forks ?? 0)));
  } catch {
    return undefined;
  }
}

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
//   200 { account: <Kontoname>, slug, videoAllowed, tutorialsLeft }   |   401 (kein/ungueltiger Token).
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
  // tutorialsLeft (Audit 24.09.): Gratis am Limit → die Erweiterung warnt schon auf dem Start-
  // Bildschirm (vorher erst nach der ganzen Aufnahme beim Hochladen). null = unbegrenzt.
  const tutorialsLeft = await tutorialsLeftFor(account.id, account.plan);
  return NextResponse.json(
    // videoAllowed: „Video mit Ton“ (KI) ist ab Pro — die Erweiterung sagt das VOR der Aufnahme
    // statt erst nach dem Hochladen (Audit 23.09.: Sackgasse im Gratis-Tarif).
    {
      account: account.name,
      slug: account.slug,
      videoAllowed: videoAllowed(account),
      ...(tutorialsLeft !== undefined ? { tutorialsLeft } : {}),
    },
    { status: 200, headers: RECORDER_ME_CORS },
  );
}
