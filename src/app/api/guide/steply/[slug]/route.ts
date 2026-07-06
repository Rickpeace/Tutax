import { type NextRequest, NextResponse } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { tutTag } from "@/lib/cache-tags";
import {
  buildGuidePayload,
  GUIDE_PUBLIC_CORS,
  type GuideTutorialRow,
  type GuideStepRow,
  type GuideBranchRow,
} from "@/lib/guide-payload";
import { publicImageUrl } from "@/lib/public-image";
import { createAdminClient } from "@/lib/supabase/admin";

// „Steply lernen" (Welle 35), Teil A/1b: GET /api/guide/steply/[slug].
//
// Detail EINER Steply-Doku-Tour für den Führungs-Durchlauf — dieselbe Payload-FORM wie
// /api/recorder/tutorials/[id] (tutorial/steps/branches; body = Whitelist-HTML via geteiltem
// lib/guide-payload.ts), ABER die Bilder liegen im ÖFFENTLICHEN Bucket -> imageUrl =
// publicImageUrl (KEINE signierten URLs). KEIN Auth.
//
// SICHERHEIT: hart auf das Steply-Doku-Konto (slug „steply") verdrahtet; nur status='published'
// UND visibility='public'. 404 bei unbekanntem Slug/Entwurf/fremdem Konto (kein Existenz-Orakel).
//
// CORS: GUIDE_PUBLIC_CORS. Cache: 'use cache' mit Tag tut-steply/<slug> + cacheLife('hours').

const STEPLY_DOC_SLUG = "steply";

async function loadSteplyDetail(slug: string) {
  "use cache";
  cacheTag(tutTag(STEPLY_DOC_SLUG, slug));
  cacheLife("hours");

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id")
    .eq("slug", STEPLY_DOC_SLUG)
    .maybeSingle<{ id: string }>();
  if (!account) return null;

  const { data: tutorial } = await admin
    .from("tutorials")
    .select("id, title, slug, status, visibility, root_step_id")
    .eq("account_id", account.id)
    .eq("slug", slug)
    .eq("status", "published")
    .eq("visibility", "public")
    .maybeSingle<GuideTutorialRow>();
  if (!tutorial) return null;

  const { data: stepsData } = await admin
    .from("steps")
    .select(
      "id, title, body, image_path, image_width, image_height, highlights, selector, page_url, is_decision, position",
    )
    .eq("tutorial_id", tutorial.id)
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

  // Bilder liegen nach dem Publish im ÖFFENTLICHEN Bucket -> öffentliche CDN-URL (kein Signieren).
  const urlByStep = new Map<string, string>();
  for (const s of steps) {
    if (s.image_path) urlByStep.set(s.id, publicImageUrl(s.image_path));
  }

  return buildGuidePayload(tutorial, steps, branches, urlByStep);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: GUIDE_PUBLIC_CORS });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const payload = await loadSteplyDetail(slug);
  if (!payload) {
    return NextResponse.json(
      { error: "Anleitung nicht gefunden." },
      { status: 404, headers: GUIDE_PUBLIC_CORS },
    );
  }
  return NextResponse.json(payload, { status: 200, headers: GUIDE_PUBLIC_CORS });
}
