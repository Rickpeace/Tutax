import { type NextRequest, NextResponse } from "next/server";
import {
  accountForRecorderToken,
  bearerToken,
  RECORDER_ME_CORS,
} from "@/lib/recorder";
import { createAdminClient } from "@/lib/supabase/admin";
import { readSchedule } from "@/lib/automations";

// Automationen-Ausführung (Welle 36), Kontrakt 1: GET /api/recorder/automations.
//
// Die Extension listet die ausführbaren Abläufe des verbundenen Kontos. AUTH wie
// /api/recorder/me: „Authorization: Bearer <recorder_token>“ (accountForRecorderToken,
// Admin-Client/RLS-Bypass, cross-origin ohne Session). KEINE Cookies. CORS: RECORDER_ME_CORS.
//
// Antwort: { automations: [{ id, title, site_domains, stepCount, paramCount, schedule, updated_at }] }
//   — NUR das Token-Konto, updated_at desc, max 100. stepCount kommt aus EINER Steps-Query
//   (kein N+1); paramCount = Länge des params-Arrays. schedule (Welle 41) = normalisierter
//   Wiederhol-Zeitplan | null — die Extension synct daraus ihre chrome.alarms.

type AutomationRow = {
  id: string;
  title: string | null;
  site_domains: string[] | null;
  params: unknown;
  schedule: unknown;
  updated_at: string;
};

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

  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("automations")
    .select("id, title, site_domains, params, schedule, updated_at")
    .eq("account_id", account.id)
    .order("updated_at", { ascending: false })
    .limit(100)
    .returns<AutomationRow[]>();

  const automations = rows ?? [];
  const ids = automations.map((a) => a.id);

  // Schrittzahl je Automation: EINE Query über alle Schritte (kein N+1), in JS aggregiert.
  const stepCounts = new Map<string, number>();
  if (ids.length) {
    const { data: steps } = await admin
      .from("automation_steps")
      .select("automation_id")
      .in("automation_id", ids)
      .returns<{ automation_id: string }[]>();
    for (const s of steps ?? []) {
      stepCounts.set(s.automation_id, (stepCounts.get(s.automation_id) ?? 0) + 1);
    }
  }

  const out = automations.map((a) => ({
    id: a.id,
    title: a.title ?? "",
    site_domains: Array.isArray(a.site_domains) ? a.site_domains : [],
    stepCount: stepCounts.get(a.id) ?? 0,
    paramCount: Array.isArray(a.params) ? a.params.length : 0,
    // Zeitplan (Welle 41): tolerant normalisiert | null. Die Extension legt daraus Wecker an.
    schedule: readSchedule(a.schedule),
    updated_at: a.updated_at,
  }));

  return NextResponse.json({ automations: out }, { status: 200, headers: RECORDER_ME_CORS });
}
