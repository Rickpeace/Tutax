"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers, ImagePlus, Loader2, Trash2, Palette, Eye } from "lucide-react";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { saveBranding } from "@/app/app/settings/branding/actions";
import { SaveBar } from "@/components/app/save-bar";
import { FieldLabel, SettingsCard } from "@/components/app/settings-ui";
import type { BrandColors } from "@/lib/theme";
import { errorText } from "@/lib/action-error";

type ColorKey = keyof BrandColors;

const FIELDS: { key: ColorKey; label: string }[] = [
  { key: "primary", label: "Akzent" },
  { key: "background", label: "Hintergrund" },
  { key: "surface", label: "Flächen" },
  { key: "text", label: "Text" },
];

/** <input type="color"> kennt nur #rrggbb — #rgb aufblasen, Unbekanntes unverändert lassen. */
function toHex6(v: string): string {
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v.trim());
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : v;
}

/**
 * „Logo und Farben" des Steply-Standard-Designs + Vorschau (Einstellungen → Aussehen).
 * Startwerte kommen aus themes.tokens, fehlende Farben aus DEFAULT_BRAND_COLORS
 * (lib/theme.ts) — also genau das, was die echte Hilfe-Seite ohne Anpassung zeigt.
 * Gespeichert werden NUR geänderte Farben (saveBranding merged), damit ein bloßes
 * „Speichern" keine Standard-Werte festschreibt. Logo wirkt sofort (eigene API).
 */
export function BrandingForm({
  accountId,
  name,
  initialLogoUrl,
  initialColors,
  modeHint,
}: {
  /** Organisation, die diese Seite zeigt (Schutz gegen Org-Wechsel in einem anderen Tab). */
  accountId: string;
  name: string;
  initialLogoUrl: string | null;
  initialColors: BrandColors;
  /** Hinweis, wenn gerade ein anderes Design aktiv ist (Farben gelten dann nicht). */
  modeHint?: string | null;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<BrandColors>(initialColors);
  const [colors, setColors] = useState<BrandColors>(initialColors);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const changed = useMemo(
    () => FIELDS.filter((f) => colors[f.key].toLowerCase() !== saved[f.key].toLowerCase()).map((f) => f.key),
    [colors, saved],
  );
  const dirty = changed.length > 0;

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
      router.refresh();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    try {
      await fetch("/api/branding/logo", { method: "DELETE" });
      setLogoUrl(null);
      router.refresh();
    } catch {
      toast.error("Fehler");
    } finally {
      setLogoBusy(false);
    }
  }

  function save() {
    const patch: Partial<BrandColors> = {};
    for (const k of changed) patch[k] = colors[k];
    startTransition(async () => {
      const res = await saveBranding(accountId, { colors: patch });
      if (res.ok) {
        setSaved(colors);
        toast.success("Farben gespeichert");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <SettingsCard
        title="Logo und Farben"
        icon={Palette}
        description={
          modeHint ??
          "Gilt für „Steply-Standard“. Farben wirken nach dem Speichern auf Ihrer Hilfe-Seite, das Logo sofort."
        }
      >
        <div className="grid gap-1.5">
          <FieldLabel>Logo</FieldLabel>
          <input ref={logoInput} type="file" accept="image/*" hidden onChange={onLogo} />
          {logoUrl ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex size-14 items-center justify-center overflow-hidden rounded-xl border-2 border-line bg-white p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={logoBusy}
                onClick={() => logoInput.current?.click()}
              >
                {logoBusy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                Ersetzen
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
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-background py-4 text-sm font-extrabold text-ink-2 transition-colors hover:border-[#e3d7c2] hover:text-ink"
            >
              {logoBusy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
              Logo hochladen
            </button>
          )}
        </div>

        <div className="grid gap-1.5">
          <FieldLabel>Farben</FieldLabel>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {FIELDS.map((f) => (
              <label
                key={f.key}
                className="relative flex cursor-pointer items-center gap-2 rounded-xl border-2 border-line px-[9px] py-[7px] text-xs font-extrabold text-ink transition-colors hover:border-[#e3d7c2] focus-within:border-primary/60"
              >
                <span
                  className="size-[22px] shrink-0 rounded-[7px] border-[1.5px] border-black/10"
                  style={{ background: colors[f.key] }}
                />
                <span className="min-w-0">
                  {f.label}
                  <small className="block truncate font-bold uppercase text-muted-foreground">
                    {colors[f.key]}
                  </small>
                </span>
                <input
                  type="color"
                  name={`color-${f.key}`}
                  value={toHex6(colors[f.key])}
                  onChange={(e) => setColors((c) => ({ ...c, [f.key]: e.target.value }))}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label={`Farbe ${f.label}`}
                />
              </label>
            ))}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Vorschau"
        icon={Eye}
        description="So sieht „Steply-Standard“ mit diesen Farben für Ihre Kunden aus."
      >
        <div
          data-testid="brand-live-preview"
          className="rounded-xl border-2 border-line p-4"
          style={{ background: colors.background }}
        >
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="size-9 rounded-lg border border-black/5 bg-white object-contain p-0.5"
              />
            ) : (
              <div
                className="flex size-9 items-center justify-center rounded-lg font-black text-white"
                style={{ background: colors.primary }}
              >
                {(name.trim()[0] ?? "?").toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-black" style={{ color: colors.text }}>
                {name || "Organisation"}
              </div>
              <div className="text-xs" style={{ color: colors.text, opacity: 0.6 }}>
                Hilfe &amp; Anleitungen
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-black/10 bg-white p-3">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: colors.surface }}
            >
              <Layers className="size-4" style={{ color: colors.primary }} />
            </span>
            <span className="text-sm font-bold" style={{ color: colors.text }}>
              SmartLogin einrichten
            </span>
          </div>
          <div
            className="mt-3 inline-flex rounded-[12px] px-3 py-1.5 text-xs font-extrabold text-white"
            style={{ background: colors.primary }}
          >
            Weiter
          </div>
        </div>
      </SettingsCard>

      <SaveBar
        dirty={dirty}
        saving={pending}
        onSave={save}
        onDiscard={() => setColors(saved)}
      />
    </>
  );
}
