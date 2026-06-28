"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Layers, ImagePlus, Loader2, Trash2 } from "lucide-react";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBranding } from "@/app/app/settings/branding/actions";
import { slugify } from "@/lib/slug";

type Colors = { primary: string; background: string; surface: string; text: string };

export function BrandingForm({
  initialName,
  initialSlug,
  initialLogoUrl,
  initialColors,
  appUrl,
}: {
  initialName: string;
  initialSlug: string;
  initialLogoUrl: string | null;
  initialColors: Colors;
  appUrl: string;
}) {
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [colors, setColors] = useState<Colors>(initialColors);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Bitte ein Bild auswählen");
      return;
    }
    setLogoBusy(true);
    try {
      const webp = await imageCompression(file, {
        maxWidthOrHeight: 480,
        maxSizeMB: 0.3,
        fileType: "image/webp",
        useWebWorker: true,
      });
      const fd = new FormData();
      fd.append("file", webp, "logo.webp");
      const res = await fetch("/api/branding/logo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload fehlgeschlagen");
      setLogoUrl(`${data.url}?t=${Date.now()}`);
      toast.success("Logo gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    try {
      await fetch("/api/branding/logo", { method: "DELETE" });
      setLogoUrl(null);
    } catch {
      toast.error("Fehler");
    } finally {
      setLogoBusy(false);
    }
  }

  const previewSlug = slugify(slug || name);

  function save() {
    startTransition(async () => {
      const res = await saveBranding({ name, slug, colors });
      if (res.ok) {
        setSlug(res.slug);
        toast.success("Gespeichert");
      } else {
        toast.error(res.error);
      }
    });
  }

  const fields: { key: keyof Colors; label: string }[] = [
    { key: "primary", label: "Akzent" },
    { key: "background", label: "Hintergrund" },
    { key: "surface", label: "Flächen" },
    { key: "text", label: "Text" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="b-name">Name der Organisation</Label>
        <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="b-slug">Adresse der Hilfe-Seite</Label>
        <Input
          id="b-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="muster-gmbh"
        />
        <p className="break-all text-xs text-muted-foreground">
          {appUrl}/h/<b className="text-ink-2">{previewSlug}</b>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Logo</Label>
        <input ref={logoInput} type="file" accept="image/*" hidden onChange={onLogo} />
        {logoUrl ? (
          <div className="flex items-center gap-3">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={logoBusy}
              onClick={() => logoInput.current?.click()}
            >
              {logoBusy ? <Loader2 className="size-4 animate-spin" /> : "Ersetzen"}
            </Button>
            <Button variant="ghost" size="sm" disabled={logoBusy} onClick={removeLogo}>
              <Trash2 className="size-4" /> Entfernen
            </Button>
          </div>
        ) : (
          <button
            type="button"
            disabled={logoBusy}
            onClick={() => logoInput.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card py-5 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            {logoBusy ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ImagePlus className="size-5" />
            )}
            Logo hochladen
          </button>
        )}
      </div>

      <div className="space-y-2">
        <Label>Farben (CI)</Label>
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f.key} className="flex items-center gap-2 rounded-lg border border-border p-2">
              <input
                type="color"
                value={colors[f.key]}
                onChange={(e) => setColors((c) => ({ ...c, [f.key]: e.target.value }))}
                className="size-8 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label={f.label}
              />
              <div className="min-w-0">
                <div className="text-xs font-medium text-ink">{f.label}</div>
                <div className="truncate text-[11px] text-muted-foreground">{colors[f.key]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live-Vorschau */}
      <div className="space-y-1.5">
        <Label>Vorschau (so sieht es der Kunde)</Label>
        <div className="rounded-xl border border-border p-4" style={{ background: colors.background }}>
          <div className="flex items-center gap-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="size-9 rounded-lg border border-black/5 bg-white object-contain p-0.5"
              />
            ) : (
              <div
                className="flex size-9 items-center justify-center rounded-lg font-extrabold text-white"
                style={{ background: colors.primary }}
              >
                {(name.trim()[0] ?? "?").toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-bold" style={{ color: colors.text }}>
                {name || "Organisation"}
              </div>
              <div className="text-xs" style={{ color: colors.text, opacity: 0.6 }}>
                Hilfe &amp; Anleitungen
              </div>
            </div>
          </div>
          <div
            className="mt-3 flex items-center gap-2 rounded-lg border border-black/10 bg-white p-3"
            style={{ background: colors.surface }}
          >
            <Layers className="size-5" style={{ color: colors.primary }} />
            <span className="text-sm font-semibold" style={{ color: colors.text }}>
              SmartLogin einrichten
            </span>
          </div>
        </div>
      </div>

      <Button onClick={save} disabled={pending}>
        {pending ? "Speichert …" : "Speichern"}
      </Button>
    </div>
  );
}
