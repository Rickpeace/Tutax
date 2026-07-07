import { type NextRequest } from "next/server";
import {
  accountForRecorderToken,
  recorderJson,
  recorderPreflight,
} from "@/lib/recorder";
import { createAdminClient } from "@/lib/supabase/admin";

// Automationen-Ausführung (Welle 36), Kontrakt 3: POST /api/recorder/automation-runs.
//
// Lauf-Telemetrie der Extension. AUTH: Token im Body ({ token, … }) wie guide-complete
// (accountForRecorderToken, Admin-Client, cross-origin ohne Session). CORS: RECORDER_CORS
// (POST/OPTIONS + Content-Type). Zwei Ereignisse:
//   • { automationId, event: "start", mode }  → legt einen running-Lauf an → { runId }
//   • { runId, event: "finish", status, currentStep?, detail? } → schließt ihn ab
// Eigentum wird bei BEIDEN geprüft (Automation bzw. Lauf gehört dem Token-Konto).
//
// WICHTIG: Hier landen NIE Parameter-WERTE oder Secrets — nur Status/Modus/Schritt-Index
// und eine kurze, gekappte Fehlerbeschreibung (≤300 Zeichen). Werte bleiben im Browser.

const MODES = new Set(["semi", "auto"]);
const FINISH_STATUS = new Set(["success", "aborted", "failed"]);
// Auslöser eines Laufs (Welle 41): „manual" (Nutzer im Panel) | „scheduled" (Wecker/Runner).
const TRIGGERS = new Set(["manual", "scheduled"]);
const DETAIL_MAX = 300;

export async function OPTIONS() {
  return recorderPreflight();
}

function asInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: unknown;
    event?: unknown;
    automationId?: unknown;
    runId?: unknown;
    mode?: unknown;
    trigger?: unknown;
    status?: unknown;
    currentStep?: unknown;
    detail?: unknown;
  };

  const account = await accountForRecorderToken(body?.token);
  if (!account) {
    return recorderJson({ error: "Ungültiger oder unbekannter Verbindungs-Token." }, 401);
  }

  const event = typeof body?.event === "string" ? body.event : "";
  const admin = createAdminClient();

  // ── start: neuen running-Lauf anlegen ──────────────────────────────────────────
  if (event === "start") {
    const automationId = typeof body?.automationId === "string" ? body.automationId : "";
    if (!automationId) {
      return recorderJson({ error: "Es fehlt die Automation für den Lauf." }, 400);
    }
    const mode = typeof body?.mode === "string" && MODES.has(body.mode) ? body.mode : "semi";
    // Auslöser (Welle 41): „scheduled" nur, wenn der Wecker/Runner es explizit meldet; sonst manual.
    const trigger =
      typeof body?.trigger === "string" && TRIGGERS.has(body.trigger) ? body.trigger : "manual";

    // Eigentum: Automation muss dem Token-Konto gehören (404, sonst Existenz-Orakel).
    const { data: auto } = await admin
      .from("automations")
      .select("id, account_id")
      .eq("id", automationId)
      .maybeSingle<{ id: string; account_id: string | null }>();
    if (!auto || auto.account_id !== account.id) {
      return recorderJson({ error: "Automation nicht gefunden." }, 404);
    }

    const { data: run, error } = await admin
      .from("automation_runs")
      .insert({
        automation_id: automationId,
        account_id: account.id,
        status: "running",
        mode,
        trigger,
        current_step: asInt(body?.currentStep),
      })
      .select("id")
      .single();
    if (error || !run) {
      return recorderJson({ error: "Der Lauf konnte nicht angelegt werden." }, 500);
    }
    return recorderJson({ runId: run.id });
  }

  // ── finish: laufenden Lauf abschließen ──────────────────────────────────────────
  if (event === "finish") {
    const runId = typeof body?.runId === "string" ? body.runId : "";
    if (!runId) {
      return recorderJson({ error: "Es fehlt der Lauf, der abgeschlossen werden soll." }, 400);
    }
    const status = typeof body?.status === "string" && FINISH_STATUS.has(body.status)
      ? body.status
      : "";
    if (!status) {
      return recorderJson({ error: "Ungültiger Abschluss-Status." }, 400);
    }

    // Eigentum: Lauf muss dem Token-Konto gehören.
    const { data: run } = await admin
      .from("automation_runs")
      .select("id, account_id")
      .eq("id", runId)
      .maybeSingle<{ id: string; account_id: string | null }>();
    if (!run || run.account_id !== account.id) {
      return recorderJson({ error: "Lauf nicht gefunden." }, 404);
    }

    const detail =
      typeof body?.detail === "string" ? body.detail.slice(0, DETAIL_MAX) : null;
    const curStep = asInt(body?.currentStep);
    const { error } = await admin
      .from("automation_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        detail,
        // current_step nur überschreiben, wenn mitgeschickt (sonst Start-Wert behalten).
        ...(curStep != null ? { current_step: curStep } : {}),
      })
      .eq("id", runId);
    if (error) {
      return recorderJson({ error: "Der Lauf konnte nicht abgeschlossen werden." }, 500);
    }
    return recorderJson({ ok: true, status });
  }

  return recorderJson({ error: "Unbekanntes Ereignis." }, 400);
}
