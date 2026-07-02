"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";
import { isBusiness, BUSINESS_REQUIRED } from "@/lib/plan";
import type { Tutorial } from "@/lib/types";

// Video-Export (Welle 18): aus einem veröffentlichten Tutorial ein MP4 rendern.
// Reiht einen video_jobs-Eintrag (kind='render') ein; der Hetzner-Worker baut das MP4.

export type RenderStyle = "classic" | "screencast";

const VIDEO_BUCKET = "tutorial-videos";

/**
 * Render-Job anlegen. Gates (serverseitig, wie bei allen Business-Features):
 *  - requireAccount + Tutorial gehört zum aktiven Konto
 *  - status=published + visibility=public (nur öffentliche Tutorials exportieren)
 *  - isBusiness (Video-Export ist ein Business-Feature)
 *  - kein bereits laufender render-Job (queued/processing) fürs selbe Tutorial + Stil
 */
export async function createRenderJob(tutorialId: string, style: RenderStyle) {
  if (style !== "classic" && style !== "screencast") throw new Error("Ungültiger Stil.");
  const { account } = await requireAccount();
  if (!isBusiness(account)) throw new Error(BUSINESS_REQUIRED);
  const supabase = await createClient();

  const { data: tutorial, error } = await supabase
    .from("tutorials")
    .select("id, account_id, title, status, visibility")
    .eq("id", tutorialId)
    .single<Pick<Tutorial, "id" | "account_id" | "title" | "status" | "visibility">>();
  if (error || !tutorial) throw new Error(error?.message ?? "Tutorial nicht gefunden.");
  if (tutorial.account_id !== account.id) throw new Error("Kein Zugriff auf dieses Tutorial.");
  if (tutorial.status !== "published" || tutorial.visibility !== "public")
    throw new Error("Bitte das Tutorial zuerst öffentlich veröffentlichen.");

  // Kein doppelter laufender Job (gleiches Tutorial + Stil).
  const { data: running } = await supabase
    .from("video_jobs")
    .select("id")
    .eq("kind", "render")
    .eq("tutorial_id", tutorialId)
    .eq("render_style", style)
    .in("status", ["queued", "processing"])
    .limit(1);
  if (running && running.length) throw new Error("Für dieses Tutorial läuft bereits ein Export in diesem Stil.");

  const { data: job, error: jErr } = await supabase
    .from("video_jobs")
    .insert({
      account_id: account.id,
      kind: "render",
      render_style: style,
      tutorial_id: tutorialId,
      title: tutorial.title,
      status: "queued",
    })
    .select("id")
    .single();
  if (jErr) throw new Error(jErr.message);
  return { jobId: job.id as string };
}

/**
 * Signierte Download-URL (1 h) auf das fertige Render-MP4 eines eigenen Konto-Jobs.
 * Gibt null zurück, solange kein output_path existiert (Job noch nicht fertig).
 */
export async function getRenderDownloadUrl(jobId: string): Promise<string | null> {
  const { account } = await requireAccount();
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("video_jobs")
    .select("output_path, account_id")
    .eq("id", jobId)
    .eq("kind", "render")
    .maybeSingle();
  if (!job || job.account_id !== account.id || !job.output_path) return null;

  const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(job.output_path, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
