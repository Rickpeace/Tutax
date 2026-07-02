"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Download, Clapperboard, MousePointerClick } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createRenderJob, getRenderDownloadUrl, type RenderStyle } from "@/app/app/actions-render";

type JobStatus = "queued" | "processing" | "done" | "failed";
type RenderJob = { id: string; render_style: RenderStyle; status: JobStatus; progress: string | null; error: string | null };

const STYLE_LABEL: Record<RenderStyle, string> = { classic: "Klassisch", screencast: "Screencast" };

// Video-Export (Welle 18): kleiner Dialog (Stil-Wahl) + dezente Status-/Download-Zeile.
// Polling-Muster wie video-upload.tsx, aber schlank. Der Öffnen-Zustand ist kontrolliert
// (die Karte rendert den Menü-Eintrag „Als Video exportieren" separat im Dropdown).
export function VideoExport({
  tutorialId,
  open,
  onOpenChange,
}: {
  tutorialId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [starting, setStarting] = useState<RenderStyle | null>(null);
  const [jobs, setJobs] = useState<Record<RenderStyle, RenderJob | null>>({ classic: null, screencast: null });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bestehende render-Jobs dieses Tutorials laden (nur die jeweils neueste je Stil).
  // Setzt state in einem async-Callback (kein synchroner Effect-setState -> kein Cascade).
  async function loadJobs() {
    const supabase = createClient();
    const { data } = await supabase
      .from("video_jobs")
      .select("id, render_style, status, progress, error")
      .eq("kind", "render")
      .eq("tutorial_id", tutorialId)
      .order("created_at", { ascending: false });
    const next: Record<RenderStyle, RenderJob | null> = { classic: null, screencast: null };
    for (const j of (data ?? []) as RenderJob[]) {
      if ((j.render_style === "classic" || j.render_style === "screencast") && !next[j.render_style]) {
        next[j.render_style] = j;
      }
    }
    setJobs(next);
    return next;
  }

  // Ein Effect: initial laden + solange ein Job läuft alle 5 s nachladen; das Intervall
  // stoppt sich selbst, sobald nichts mehr aktiv ist (Deps nur [tutorialId], damit es
  // nicht bei jedem Poll neu startet — Muster wie video-upload.tsx).
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const next = await loadJobs();
      const active = Object.values(next).some((j) => j && (j.status === "queued" || j.status === "processing"));
      if (active && !stopped && !pollRef.current) {
        pollRef.current = setInterval(tick, 5000);
      } else if (!active && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    tick();
    return () => {
      stopped = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialId]);

  async function start(style: RenderStyle) {
    setStarting(style);
    try {
      await createRenderJob(tutorialId, style);
      toast.success(`Export gestartet (${STYLE_LABEL[style]}) — das Video erscheint gleich hier.`);
      onOpenChange(false);
      // Nach dem Start neu laden + Polling ggf. wieder anwerfen.
      const next = await loadJobs();
      const active = Object.values(next).some((j) => j && (j.status === "queued" || j.status === "processing"));
      if (active && !pollRef.current) {
        pollRef.current = setInterval(async () => {
          const n = await loadJobs();
          if (!Object.values(n).some((j) => j && (j.status === "queued" || j.status === "processing")) && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 5000);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export konnte nicht gestartet werden.");
    } finally {
      setStarting(null);
    }
  }

  async function download(jobId: string) {
    try {
      const url = await getRenderDownloadUrl(jobId);
      if (!url) {
        toast.error("Download noch nicht verfügbar.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Download fehlgeschlagen.");
    }
  }

  const anyActive = Object.values(jobs).some((j) => j && (j.status === "queued" || j.status === "processing"));
  const doneJobs = (Object.keys(jobs) as RenderStyle[]).filter((s) => jobs[s]?.status === "done");
  const failed = (Object.keys(jobs) as RenderStyle[]).filter((s) => jobs[s]?.status === "failed");

  return (
    <>
      {/* Dezente Status-/Download-Zeile an der Karte (nur wenn es Jobs gibt). */}
      {(anyActive || doneJobs.length > 0 || failed.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line-2 pt-2 text-xs">
          {anyActive && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              {Object.values(jobs).find((j) => j && (j.status === "queued" || j.status === "processing"))?.progress ||
                "Video wird erstellt …"}
            </span>
          )}
          {doneJobs.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => download(jobs[style]!.id)}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-1 font-medium text-primary transition-colors hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="size-3.5" /> Video herunterladen ({STYLE_LABEL[style]})
            </button>
          ))}
          {failed.map((style) => (
            <span key={style} className="text-no" title={jobs[style]?.error ?? undefined}>
              Export ({STYLE_LABEL[style]}) fehlgeschlagen
            </span>
          ))}
        </div>
      )}

      {/* Stil-Wahl-Dialog. */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Als Video exportieren</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Aus dieser Anleitung wird ein MP4 (1080p) mit Intro, Vorlese-Ton, Untertiteln und QR-Code.
            Wählen Sie einen Stil — Sie können beide erzeugen und vergleichen.
          </p>
          <div className="grid gap-2">
            <button
              type="button"
              disabled={!!starting}
              onClick={() => start("classic")}
              className="flex items-start gap-3 rounded-lg border border-line-2 bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Clapperboard className="mt-0.5 size-5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  Klassisch
                  {starting === "classic" && <Loader2 className="size-3.5 animate-spin" />}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Sanfter Zoom über die Screenshots, die Markierung wird animiert eingeblendet.
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={!!starting}
              onClick={() => start("screencast")}
              className="flex items-start gap-3 rounded-lg border border-line-2 bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MousePointerClick className="mt-0.5 size-5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  Screencast
                  {starting === "screencast" && <Loader2 className="size-3.5 animate-spin" />}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Echte Video-Ausschnitte aus der Aufnahme mit Cursor-Animation (wo verfügbar), sonst wie Klassisch.
                </span>
              </span>
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={!!starting}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
