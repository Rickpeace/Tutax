"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  hasSourceVideo = false,
  onSetImage,
  onSetHighlights,
}: {
  tutorialId: string;
  stepId: string;
  imagePath: string | null;
  highlights: Highlight[];
  videoTime?: number | null;
  /** Tutorial hat ein Quell-Video -> Frame-Picker auch ohne vorhandenes Bild anbieten. */
  hasSourceVideo?: boolean;
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
  // Drag&Drop: Counter-Pattern gegen Flackern durch Kind-Elemente (dragenter/leave
  // feuern auch beim Überfahren von Kindknoten). >0 = Datei schwebt über der Fläche.
  const [dragDepth, setDragDepth] = useState(0);
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

  // Gemeinsamer Weg für Datei-Auswahl, Drop und Einfügen: Typ-Check -> Crop-Dialog
  // (danach Upload + ggf. Highlights-Nachfrage beim Ersetzen). Nicht duplizieren.
  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Bitte ein Bild auswählen");
      return;
    }
    setPendingFile(file); // -> Crop-Dialog
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    handleFile(file);
  }

  // Drag&Drop: erste Bild-Datei aus dataTransfer nehmen. Enthält der Drop nur
  // Nicht-Bild-Dateien -> freundlicher Hinweis, kein Crash.
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragDepth(0);
    if (busy) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const img = files.find((f) => f.type.startsWith("image/"));
    if (!img) {
      toast.error("Bitte ein Bild ablegen");
      return;
    }
    handleFile(img);
  }

  function onDragOver(e: React.DragEvent) {
    // preventDefault ist Pflicht, damit ein Drop überhaupt zugelassen wird.
    e.preventDefault();
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    if (busy) return;
    setDragDepth((d) => d + 1);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragDepth((d) => Math.max(0, d - 1));
  }

  // Einfügen (Strg+V): erste Bild-Datei aus der Zwischenablage -> gleicher Weg.
  function onPaste(e: React.ClipboardEvent) {
    if (busy) return;
    const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (!img) return;
    e.preventDefault();
    handleFile(img);
  }

  const dragActive = dragDepth > 0;

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
        <div
          className={`relative space-y-2 rounded-lg transition-shadow ${
            dragActive ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
          }`}
          tabIndex={0}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onPaste={onPaste}
        >
          {dragActive && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80 text-sm font-medium text-primary">
              Bild hier ablegen
            </div>
          )}
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
            {hasSourceVideo && (
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
            )}
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

          {big &&
            // PORTAL auf document.body: der Editor liegt sonst tief in der Seitenspalte —
            // ein Vorfahr-Stacking-Kontext ließ die Navbar ÜBER dem Overlay erscheinen.
            createPortal(
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
                      stickyToolbar
                    />
                  </div>
                </div>
              </div>,
              document.body,
            )}
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onPaste={onPaste}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-sm transition-colors ${
            dragActive
              ? "border-primary bg-muted text-primary"
              : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted"
          }`}
        >
          {busy ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <ImagePlus className="size-6" />
          )}
          {busy
            ? "Wird hochgeladen …"
            : dragActive
            ? "Bild hier ablegen"
            : "Screenshot hochladen / Foto aufnehmen"}
          {!busy && !dragActive && (
            <span className="text-xs text-muted-foreground/80">
              Klicken, ablegen oder einfügen (Strg+V)
            </span>
          )}
        </button>
      )}

      {/* Auch ohne Bild anbieten: manuell angelegte Schritte in Video-Tutorials
          sollen genauso einen Frame aus dem Quell-Video ziehen können. */}
      {!imagePath && hasSourceVideo && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
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
