import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  accountForRecorderToken,
  recorderJson,
  recorderPreflight,
} from "@/lib/recorder";

// Live-Führung (Welle 31), Schritt 1c: POST /api/recorder/guide-event.
//
// Telemetrie der Live-Führung: „Führung gestartet/abgeschlossen" und das Drift-Signal
// „Selektor tot" (selector_miss). Body: { token, tutorialSlug, kind, stepTitle? } mit
// kind ∈ selector_miss|started|completed. Insert via Admin-Client in events:
//   type='guide', tutorial_slug, status=kind, question=stepTitle (auf 200 Zeichen gekürzt).
//
// TELEMETRIE DARF NIE STÖREN: jeder Fehler (ungültiger Token, ungültiges kind, DB-Fehler)
// endet trotzdem in 200 { ok: true } — die Führung im Panel läuft ungestört weiter. CORS
// wie die POST-Recorder-Routen (RECORDER_CORS: POST/OPTIONS + Content-Type).

const KINDS = new Set(["selector_miss", "started", "completed"]);

export async function OPTIONS() {
  return recorderPreflight();
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: unknown;
      tutorialSlug?: unknown;
      kind?: unknown;
      stepTitle?: unknown;
    };

    const account = await accountForRecorderToken(body?.token);
    const kind = typeof body?.kind === "string" ? body.kind : "";
    // Ohne gültiges Konto oder unbekanntes kind: still schlucken (kein Fehler nach außen).
    if (account && KINDS.has(kind)) {
      const slug =
        typeof body?.tutorialSlug === "string" ? body.tutorialSlug.slice(0, 200) : null;
      const stepTitle =
        typeof body?.stepTitle === "string" ? body.stepTitle.slice(0, 200) : null;
      const admin = createAdminClient();
      await admin.from("events").insert({
        account_id: account.id,
        type: "guide",
        tutorial_slug: slug,
        status: kind,
        question: stepTitle,
      });
    }
  } catch {
    /* Telemetrie darf die Führung nie stören -> trotzdem 200 */
  }
  return recorderJson({ ok: true });
}
