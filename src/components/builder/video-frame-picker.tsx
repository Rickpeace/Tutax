"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { compressAndUpload } from "@/lib/upload";

/**
 * Frame-Picker: aus dem Quell-Video einen anderen Moment als Schritt-Bild wählen.
 * Zeitleiste (0..duration, startet bei video_time), Live-Vorschau, dann Canvas-Capture
 * des aktuellen Frames -> WebP -> Upload -> onSetImage + video_time mitspeichern.
 * CORS: `crossOrigin="anonymous"` + signierte URL, sonst wäre die Canvas „tainted".
 */
export function VideoFramePicker({
  open,
  onOpenChange,
  videoUrl,
  tutorialId,
  stepId,
  startTime,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  videoUrl: string;
  tutorialId: string;
  stepId: string;
  startTime: number | null;
  onApply: (result: {
    image_path: string;
    image_width: number;
    image_height: number;
    video_time: number;
  }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(startTime ?? 0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // Beim Öffnen: Startzeit übernehmen und Ladezustand zurücksetzen.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: Dialog-Zustand beim Öffnen einmalig zurücksetzen (Startzeit/Ladezustand), kein Cascade
    setReady(false);
    setBusy(false);
    setTime(startTime ?? 0);
  }, [open, startTime]);

  function onLoadedMeta() {
    const v = videoRef.current;
    if (!v) return;
    const d = isFinite(v.duration) ? v.duration : 0;
    setDuration(d);
    const t = Math.min(Math.max(startTime ?? 0, 0), d || 0);
    v.currentTime = t;
    setTime(t);
    setReady(true);
  }

  function onScrub(next: number) {
    setTime(next);
    const v = videoRef.current;
    if (v) v.currentTime = next;
  }

  async function apply() {
    const v = videoRef.current;
    if (!v) return;
    setBusy(true);
    try {
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!w || !h) throw new Error("Video-Bild noch nicht bereit. Kurz warten und erneut versuchen.");
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Zeichnen nicht möglich.");
      ctx.drawImage(v, 0, 0, w, h);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/webp", 0.9));
      if (!blob) throw new Error("Bild konnte nicht erzeugt werden.");
      const file = new File([blob], "frame.webp", { type: "image/webp" });
      const { path, width, height } = await compressAndUpload(file, tutorialId, stepId);
      onApply({ image_path: path, image_width: width, image_height: height, video_time: v.currentTime });
      toast.success("Bild aus Video übernommen");
      onOpenChange(false);
    } catch (err) {
      // Häufigster Fall: getaintete Canvas (CORS) oder Netzfehler beim Upload.
      const msg = err instanceof Error ? err.message : "Frame konnte nicht übernommen werden.";
      toast.error(
        /taint|secur|cross-origin/i.test(msg)
          ? "Das Video-Bild ließ sich nicht auslesen (Sicherheitssperre). Bitte später erneut versuchen."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  const mmss = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bild aus Video wählen</DialogTitle>
          <DialogDescription>
            Ziehen Sie die Zeitleiste zum gewünschten Moment und übernehmen Sie das Bild.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-border bg-black">
            <video
              ref={videoRef}
              src={videoUrl}
              crossOrigin="anonymous"
              preload="auto"
              playsInline
              muted
              onLoadedMetadata={onLoadedMeta}
              className="mx-auto max-h-[50vh] w-full object-contain"
            />
          </div>

          {ready ? (
            <div className="space-y-1.5">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.05}
                value={time}
                onChange={(e) => onScrub(Number(e.target.value))}
                className="w-full accent-primary"
                aria-label="Zeitpunkt im Video"
              />
              <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
                <span>{mmss(time)}</span>
                <span>{mmss(duration)}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Video wird geladen …
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Abbrechen
            </Button>
            <Button onClick={apply} disabled={!ready || busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Dieses Bild übernehmen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
