"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, RefreshCw, Trash2, Maximize2, X, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { HighlightEditor } from "@/components/builder/highlight-editor";
import { CropDialog } from "@/components/builder/crop-dialog";
import { VideoFramePicker } from "@/components/builder/video-frame-picker";
import { compressAndUpload, signedImageUrl } from "@/lib/upload";
import { getTutorialVideoUrl, updateStep } from "@/app/app/tutorials/[id]/actions";
import type { Highlight } from "@/lib/types";

export function ImageField({
  tutorialId,
  stepId,
  imagePath,
  highlights,
  videoTime,
  onSetImage,
  onSetHighlights,
}: {
  tutorialId: string;
  stepId: string;
  imagePath: string | null;
  highlights: Highlight[];
  videoTime?: number | null;
  onSetImage: (
    stepId: string,
    img: {
      image_path: string | null;
      image_width: number | null;
      image_height: number | null;
    },
  ) => void;
  onSetHighlights: (stepId: string, highlights: Highlight[]) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [big, setBig] = useState(false);
  // Nach dem Ersetzen (Bild + vorhandene Markierungen): fragen, ob die Markierungen
  // behalten oder gelöscht werden sollen (sie sitzen sonst evtl. am falschen Ort).
  const [askHighlights, setAskHighlights] = useState(false);
  // Frame-Picker: URL wird lazy beim Klick geholt (null = kein Quell-Video).
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Beim Klick auf „Bild aus Video wählen": signierte URL lazy holen; null -> Hinweis.
  async function openFramePicker() {
    setLoadingVideo(true);
    try {
      const u = videoUrl ?? (await getTutorialVideoUrl(tutorialId));
      if (!u) {
        toast.error("Zu diesem Tutorial gibt es kein Quell-Video.");
        return;
      }
      setVideoUrl(u);
      setPickerOpen(true);
    } catch {
      toast.error("Quell-Video konnte nicht geladen werden.");
    } finally {
      setLoadingVideo(false);
    }
  }

  useEffect(() => {
    let active = true;
    if (imagePath) {
      signedImageUrl(imagePath).then((u) => {
        if (active) setUrl(u);
      });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: Teil eines async Signier-Effects (mit active-Flag/Cleanup); ohne Pfad kein Bild anzeigen, kein Cascade
      setUrl(null);
    }
    return () => {
      active = false;
    };
  }, [imagePath]);

  // Großmodus per Escape schließen.
  useEffect(() => {
    if (!big) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBig(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Bitte ein Bild auswählen");
      return;
    }
    setPendingFile(file); // -> Crop-Dialog
  }

  async function doUpload(file: File) {
    // War das ein ERSETZEN (Bild existierte schon) UND gibt es bereits Markierungen?
    const wasReplace = !!imagePath && highlights.length > 0;
    setBusy(true);
    try {
      const { path, width, height } = await compressAndUpload(file, tutorialId, stepId);
      onSetImage(stepId, { image_path: path, image_width: width, image_height: height });
      setUrl(await signedImageUrl(path));
      toast.success("Bild hochgeladen");
      if (wasReplace) setAskHighlights(true); // erst nach Erfolg fragen
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>Screenshot</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onFile}
      />
      {imagePath && url ? (
        <div className="space-y-2">
          {!big && (
            <HighlightEditor
              url={url}
              highlights={highlights}
              onChange={(h) => onSetHighlights(stepId, h)}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setBig(true)}>
              <Maximize2 className="size-4" /> Groß bearbeiten
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}{" "}
              Bild ersetzen
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || loadingVideo}
              onClick={openFramePicker}
            >
              {loadingVideo ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Film className="size-4" />
              )}{" "}
              Bild aus Video wählen
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                onSetImage(stepId, {
                  image_path: null,
                  image_width: null,
                  image_height: null,
                })
              }
            >
              <Trash2 className="size-4" /> Entfernen
            </Button>
          </div>

          {big && (
            <div
              className="fixed inset-0 z-[100] flex flex-col bg-black/60 p-3 sm:p-6"
              onClick={() => setBig(false)}
            >
              <div
                className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col overflow-hidden rounded-xl bg-popover p-4 shadow-2xl ring-1 ring-foreground/10"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">Screenshot bearbeiten</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => setBig(false)} aria-label="Schließen">
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <HighlightEditor
                    url={url}
                    highlights={highlights}
                    onChange={(h) => onSetHighlights(stepId, h)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card py-8 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted"
        >
          {busy ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <ImagePlus className="size-6" />
          )}
          {busy ? "Wird hochgeladen …" : "Screenshot hochladen / Foto aufnehmen"}
        </button>
      )}

      {pendingFile && (
        <CropDialog
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onConfirm={(f) => {
            setPendingFile(null);
            void doUpload(f);
          }}
        />
      )}

      {videoUrl && (
        <VideoFramePicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          videoUrl={videoUrl}
          tutorialId={tutorialId}
          stepId={stepId}
          startTime={videoTime ?? null}
          onApply={({ image_path, image_width, image_height, video_time }) => {
            // Bild optimistisch setzen (bestehender Pfad) + video_time separat persistieren,
            // damit der Picker beim nächsten Öffnen wieder an der richtigen Stelle startet.
            onSetImage(stepId, { image_path, image_width, image_height });
            void updateStep(stepId, { video_time }).catch(() => {});
          }}
        />
      )}

      <Dialog open={askHighlights} onOpenChange={(o) => { if (!o) setAskHighlights(false); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Markierungen behalten?</DialogTitle>
            <DialogDescription>
              Dieser Schritt hat Markierungen vom alten Bild. Sie sitzen auf dem neuen Bild
              womöglich an der falschen Stelle. Behalten oder löschen?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                onSetHighlights(stepId, []);
                setAskHighlights(false);
              }}
            >
              <Trash2 className="size-4" /> Löschen
            </Button>
            <Button onClick={() => setAskHighlights(false)}>Behalten</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
