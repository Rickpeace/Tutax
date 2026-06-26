"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { HighlightEditor } from "@/components/builder/highlight-editor";
import { CropDialog } from "@/components/builder/crop-dialog";
import { compressAndUpload, signedImageUrl } from "@/lib/upload";
import type { Highlight } from "@/lib/types";

export function ImageField({
  tutorialId,
  stepId,
  imagePath,
  highlights,
  onSetImage,
  onSetHighlights,
}: {
  tutorialId: string;
  stepId: string;
  imagePath: string | null;
  highlights: Highlight[];
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    if (imagePath) {
      signedImageUrl(imagePath).then((u) => {
        if (active) setUrl(u);
      });
    } else {
      setUrl(null);
    }
    return () => {
      active = false;
    };
  }, [imagePath]);

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
    setBusy(true);
    try {
      const { path, width, height } = await compressAndUpload(file, tutorialId, stepId);
      onSetImage(stepId, { image_path: path, image_width: width, image_height: height });
      setUrl(await signedImageUrl(path));
      toast.success("Bild hochgeladen");
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
          <HighlightEditor
            url={url}
            highlights={highlights}
            onChange={(h) => onSetHighlights(stepId, h)}
          />
          <div className="flex gap-2">
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
    </div>
  );
}
