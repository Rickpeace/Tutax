import { type NextRequest, NextResponse } from "next/server";
import {
  accountForRecorderToken,
  bearerToken,
  RECORDER_ME_CORS,
} from "@/lib/recorder";
import { createAdminClient } from "@/lib/supabase/admin";
import { readSchedule } from "@/lib/automations";

// Automationen-Ausführung (Welle 36), Kontrakt 2: GET /api/recorder/automations/[id].
//
// Liefert ALLES, was die Extension zum Ausführen EINES Ablaufs braucht: die Parameter-
// DEFINITIONEN (ohne Werte!) und die Schritte (Aktion, Selektor, Seiten-URL, welcher
// Parameter den Wert liefert, optional signierter Referenz-Screenshot). AUTH wie
// /api/recorder/me (Bearer-Token, Admin-Client). 404, wenn die Automation nicht dem
// Token-Konto gehört (kein Existenz-Orakel). Bilder liegen im PRIVATEN Bucket → signierte
// URLs (1 h), parallel signiert. CORS: RECORDER_ME_CORS.

const IMAGE_BUCKET = "tutorial-images";
const SIGNED_URL_TTL = 3600; // 1 h

type AutomationRow = {
  id: string;
  account_id: string | null;
  title: string | null;
  site_domains: string[] | null;
  params: unknown;
  schedule: unknown;
};

type StepRow = {
  id: string;
  position: number;
  title: string | null;
  action: string;
  selector: unknown;
  page_url: string | null;
  param_key: string | null;
  image_path: string | null;
  highlights: unknown;
  // Datei-Brücke (Welle 39): {role:download,key} liefert / {role:upload,source} verbraucht.
  file_meta: unknown;
  // Bedingte Schritte (Welle 42): Ausführ-Bedingung {kind:element|url, …} | null.
  condition: unknown;
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: RECORDER_ME_CORS });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = bearerToken(req.headers.get("authorization"));
  const account = await accountForRecorderToken(token);
  if (!account) {
    return NextResponse.json(
      { error: "Ungültiger oder unbekannter Verbindungs-Token." },
      { status: 401, headers: RECORDER_ME_CORS },
    );
  }

  const admin = createAdminClient();

  const { data: automation } = await admin
    .from("automations")
    .select("id, account_id, title, site_domains, params, schedule")
    .eq("id", id)
    .maybeSingle<AutomationRow>();
  // 404 auch bei fremdem Konto (kein Existenz-Orakel für fremde Automationen).
  if (!automation || automation.account_id !== account.id) {
    return NextResponse.json(
      { error: "Automation nicht gefunden." },
      { status: 404, headers: RECORDER_ME_CORS },
    );
  }

  const { data: stepsData } = await admin
    .from("automation_steps")
    .select("id, position, title, action, selector, page_url, param_key, image_path, highlights, file_meta, condition")
    .eq("automation_id", id)
    .order("position", { ascending: true })
    .returns<StepRow[]>();
  const steps = stepsData ?? [];

  // Referenz-Screenshots liegen im PRIVATEN Bucket → signierte URLs (1 h), parallel.
  const withImage = steps.filter((s) => s.image_path);
  const signed = await Promise.all(
    withImage.map((s) =>
      admin.storage.from(IMAGE_BUCKET).createSignedUrl(s.image_path as string, SIGNED_URL_TTL),
    ),
  );
  const urlByStep = new Map<string, string>();
  withImage.forEach((s, i) => {
    const u = signed[i].data?.signedUrl;
    if (u) urlByStep.set(s.id, u);
  });

  // Parameter-DEFINITIONEN reduziert auf {key,label,type,required} — WERTE gibt es nie.
  const rawParams = Array.isArray(automation.params) ? automation.params : [];
  const paramDefs = rawParams
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      key: typeof p.key === "string" ? p.key : "",
      label: typeof p.label === "string" ? p.label : "",
      type: p.type === "secret" ? "secret" : "text",
      required: p.required !== false,
    }));

  return NextResponse.json(
    {
      automation: {
        id: automation.id,
        title: automation.title ?? "",
        site_domains: Array.isArray(automation.site_domains) ? automation.site_domains : [],
        params: paramDefs,
        // Zeitplan (Welle 41): normalisiert | null. Der Runner/das Panel braucht ihn nicht zum
        // Ausführen, aber die Extension zeigt/prüft ihn (Konsistenz mit der Liste).
        schedule: readSchedule(automation.schedule),
      },
      steps: steps.map((s) => ({
        id: s.id,
        position: s.position,
        title: s.title ?? "",
        action: s.action,
        selector: s.selector ?? null,
        page_url: s.page_url ?? null,
        param_key: s.param_key ?? null,
        imageUrl: urlByStep.get(s.id) ?? null,
        // Markierungen fürs Referenzbild (Welle 37). Bestands-Automationen: highlights=null → [].
        highlights: Array.isArray(s.highlights) ? s.highlights : [],
        // Datei-Brücke (Welle 39): {role:download,key} | {role:upload,source} | null. NUR die
        // Verknüpfung — NIE Datei-Bytes. Bestands-Automationen: file_meta=null.
        file_meta:
          s.file_meta && typeof s.file_meta === "object" && !Array.isArray(s.file_meta)
            ? s.file_meta
            : null,
        // Bedingte Schritte (Welle 42): {kind:element|url, …} | null. Die Extension wertet sie
        // zur Laufzeit aus (SteplyExecPlan.shouldRunStep/evalUrlCondition + content.js).
        condition:
          s.condition && typeof s.condition === "object" && !Array.isArray(s.condition)
            ? s.condition
            : null,
      })),
    },
    { status: 200, headers: RECORDER_ME_CORS },
  );
}
