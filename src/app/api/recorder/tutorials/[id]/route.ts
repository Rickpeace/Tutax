import { type NextRequest, NextResponse } from "next/server";
import {
  accountForRecorderToken,
  bearerToken,
  RECORDER_ME_CORS,
} from "@/lib/recorder";
import {
  buildGuidePayload,
  type GuideTutorialRow,
  type GuideStepRow,
  type GuideBranchRow,
} from "@/lib/guide-payload";
import { createAdminClient } from "@/lib/supabase/admin";

// Live-Führung (Welle 31), Schritt 1b: GET /api/recorder/tutorials/[id].
//
// Liefert ALLES, was die Extension für den Durchlauf EINES Tutorials braucht: Schritte
// (mit Rich-Text als HTML, signierter Screenshot-URL, Highlights, Selektor, Seiten-URL,
// Entscheidungs-Flag/Frage) und den Verzweigungs-Graph (Kanten mit Label = Antwort bzw.
// null = linear). AUTH wie /api/recorder/me (Bearer-Token, Admin-Client). 404, wenn das
// Tutorial nicht dem Token-Konto gehört. Bilder liegen im PRIVATEN Bucket -> signierte
// URLs (1 h) via Admin-Client, parallel signiert (kein Wasserfall). CORS: RECORDER_ME_CORS.
//
// Die Payload-FORM (inkl. Tiptap→HTML-Whitelist) lebt geteilt in lib/guide-payload.ts —
// dieselbe Form nutzt die öffentliche Doku-Route /api/guide/steply/[slug] (Welle 35).

const IMAGE_BUCKET = "tutorial-images";
const SIGNED_URL_TTL = 3600; // 1 h

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

  const { data: tutorial } = await admin
    .from("tutorials")
    .select("id, account_id, title, slug, status, visibility, root_step_id")
    .eq("id", id)
    .maybeSingle<GuideTutorialRow & { account_id: string | null }>();
  // 404 auch bei fremdem Konto (kein Existenz-Orakel für fremde Tutorials).
  if (!tutorial || tutorial.account_id !== account.id) {
    return NextResponse.json(
      { error: "Tutorial nicht gefunden." },
      { status: 404, headers: RECORDER_ME_CORS },
    );
  }

  const { data: stepsData } = await admin
    .from("steps")
    .select(
      "id, title, body, image_path, image_width, image_height, highlights, selector, page_url, is_decision, position",
    )
    .eq("tutorial_id", id)
    .order("position", { ascending: true })
    .returns<GuideStepRow[]>();
  const steps = stepsData ?? [];
  const stepIds = steps.map((s) => s.id);

  const { data: branchesData } = stepIds.length
    ? await admin
        .from("step_branches")
        .select("id, step_id, label, target_step_id, position")
        .in("step_id", stepIds)
        .returns<GuideBranchRow[]>()
    : { data: [] as GuideBranchRow[] };
  const branches = branchesData ?? [];

  // Screenshots liegen im PRIVATEN Bucket -> signierte URLs (1 h), parallel (kein Wasserfall).
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

  const payload = buildGuidePayload(tutorial, steps, branches, urlByStep);
  return NextResponse.json(payload, { status: 200, headers: RECORDER_ME_CORS });
}
