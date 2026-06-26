"use client";

import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Manuelles Logo fürs KI-Design (setzt themes.ai_logo_path). */
export function AiLogoUpload({ logoUrl }: { logoUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const webp = await imageCompression(file, {
        maxWidthOrHeight: 512,
        maxSizeMB: 0.3,
        fileType: "image/webp",
        useWebWorker: true,
      });
      const fd = new FormData();
      fd.append("file", webp);
      fd.append("target", "ai");
      const res = await fetch("/api/branding/logo", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Upload fehlgeschlagen");
      toast.success("Logo gesetzt");
      location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await fetch("/api/branding/logo?target=ai", { method: "DELETE" });
      toast.success("Logo entfernt");
      location.reload();
    } catch {
      toast.error("Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onFile} />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()} className="flex-1">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        {logoUrl ? "Logo ersetzen" : "Logo manuell hochladen"}
      </Button>
      {logoUrl && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={remove} aria-label="Logo entfernen">
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}
