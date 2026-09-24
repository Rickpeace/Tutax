"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";
import { Check, ExternalLink, ImagePlus, Loader2, Monitor, Smartphone, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandPreview } from "@/components/app/brand-preview";
import { AutoCi } from "@/components/app/auto-ci";
import { AiLogoUpload } from "@/components/app/ai-logo-upload";
import { BusinessPill, FieldLabel, ProPill } from "@/components/app/settings-ui";
import { saveBranding, setThemeMode } from "@/app/app/settings/branding/actions";
import { googleFontsHref, weakTextContrast, type BrandColors } from "@/lib/theme";
import { unwrap, errorText } from "@/lib/action-error";

type Mode = "manual" | "ai" | "extreme";

const NAMES: Record<Mode, string> = {
  manual: "Steply-Standard",
  ai: "Von Ihrer Website",
  extreme: "Nachgebaut",
};

const COLOR_FIELDS: { key: keyof BrandColors; label: string; hint: string }[] = [
  { key: "primary", label: "Akzent", hint: "Knöpfe, Links" },
  { key: "background", label: "Hintergrund", hint: "Seitenfläche" },
  { key: "surface", label: "Flächen", hint: "Karten, Kopf" },
  { key: "text", label: "Text", hint: "Schrift" },
];

/** <input type="color"> kennt nur #rrggbb — #rgb aufblasen, Unbekanntes unverändert lassen. */
function toHex6(v: string): string {
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v.trim());
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : v;
}

/**
 * Einstellungen → Aussehen (Neuaufbau 24.09.2026, „Entwurf A“ von Richard gewählt):
 * links die Grundlage (Steply-Standard · Von Ihrer Website · Nachgebaut) und DARUNTER genau die
 * Einstellungen dieser Grundlage; rechts eine feste Vorschau, die beim Einstellen sichtbar
 * bleibt (Desktop/Handy). Unten ein Balken: Speichern bzw. „… auf Hilfe-Seite verwenden“.
 * Vorher: vier Kästen untereinander, Logo/Farben getrennt vom Stil, für den sie gelten,
 * Vorschau ganz unten.
 *
 * Tarife: Logo/Farben ab Pro, KI-Designs ab Business (serverseitig gesperrt, hier erklärt).
 */
export function AppearanceEditor({
  accountId,
  accountName,
  accountSlug,
  activeMode,
  pro,
  business,
  manualTokens,
  initialColors,
  initialLogoUrl,
  aiTokens,
  aiLogoUrl,
  extremeTokens,
  extremeLogoUrl,
  sourceUrl,
}: {
  /** Organisation, die diese Seite zeigt (Schutz gegen Org-Wechsel in einem anderen Tab). */
  accountId: string;
  accountName: string;
  accountSlug: string;
  /** Was auf der Hilfe-Seite gerade gilt (nach Tarif, wie brandedTheme). */
  activeMode: Mode;
  pro: boolean;
  business: boolean;
  manualTokens: unknown;
  /** Farben des Steply-Standards (fehlende = Standard-Farben der echten Hilfe-Seite). */
  initialColors: BrandColors;
  initialLogoUrl: string | null;
  aiTokens: unknown;
  aiLogoUrl: string | null;
  extremeTokens: unknown;
  extremeLogoUrl: string | null;
  sourceUrl: string;
}) {
  const router = useRouter();
  const [base, setBase] = useState<Mode>(activeMode);
  const [active, setActive] = useState<Mode>(activeMode);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [saved, setSaved] = useState<BrandColors>(initialColors);
  const [colors, setColors] = useState<BrandColors>(initialColors);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const [saving, startSave] = useTransition();
  const [activating, startActivate] = useTransition();

  const hasAi = !!aiTokens;
  const hasExtreme = !!extremeTokens;
  const changed = useMemo(
    () => COLOR_FIELDS.filter((f) => colors[f.key].toLowerCase() !== saved[f.key].toLowerCase()).map((f) => f.key),
    [colors, saved],
  );
  const dirty = changed.length > 0;
  const weak = weakTextContrast(colors);

  // Kunden-Schriften der Designs für die Vorschau laden (wie bisher).
  useEffect(() => {
    const hrefs = [googleFontsHref(manualTokens), googleFontsHref(aiTokens), googleFontsHref(extremeTokens)].filter(
      Boolean,
    ) as string[];
    const links = hrefs.map((href) => {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
      return l;
    });
    return () => links.forEach((l) => l.remove());
  }, [manualTokens, aiTokens, extremeTokens]);

  // Ungespeicherte Farben: beim Verlassen warnen (wie der bisherige Speichern-Balken).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const available = (m: Mode) => m === "manual" || (m === "ai" ? hasAi : hasExtreme);
  const allowed = (m: Mode) => m === "manual" || business;

  // Vorschau: genau die Grundlage, die links gewählt ist — beim Standard mit den ungespeicherten
  // Farben und dem aktuellen Logo (Gratis: reine Steply-Standardgestaltung, wie live).
  const preview = useMemo(() => {
    if (base === "ai" && hasAi) return { tokens: aiTokens, logo: aiLogoUrl ?? logoUrl };
    if (base === "extreme" && hasExtreme) return { tokens: extremeTokens, logo: extremeLogoUrl ?? logoUrl };
    if (!pro) return { tokens: null, logo: null };
    return { tokens: { ...((manualTokens as object | null) ?? {}), colors }, logo: logoUrl };
  }, [base, hasAi, hasExtreme, aiTokens, aiLogoUrl, extremeTokens, extremeLogoUrl, pro, manualTokens, colors, logoUrl]);

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Bitte ein Bild auswählen (PNG, JPG, WebP oder SVG).");
      return;
    }
    setLogoBusy(true);
    try {
      // Kaputte/umbenannte Datei: klare Meldung statt „konnte nicht gespeichert werden“ (Runde 4).
      const webp = await imageCompression(file, {
        maxWidthOrHeight: 480,
        maxSizeMB: 0.3,
        fileType: "image/webp",
        useWebWorker: true,
      }).catch(() => {
        throw new Error("Das ist keine gültige Bilddatei. Bitte ein PNG-, JPG-, WebP- oder SVG-Logo wählen.");
      });
      const fd = new FormData();
      fd.append("file", webp, "logo.webp");
      const res = await fetch("/api/branding/logo", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Das Logo konnte nicht gespeichert werden.");
      setLogoUrl(`${data.url}?t=${Date.now()}`);
      toast.success("Logo gespeichert – auf der Hilfe-Seite sofort sichtbar");
      router.refresh();
    } catch (err) {
      toast.error(errorText(err, "Das Logo konnte nicht gespeichert werden."));
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    try {
      const res = await fetch("/api/branding/logo", { method: "DELETE" });
      if (!res.ok) throw new Error("Das Logo konnte nicht entfernt werden.");
      setLogoUrl(null);
      toast.success("Logo entfernt");
      router.refresh();
    } catch (err) {
      toast.error(errorText(err, "Das Logo konnte nicht entfernt werden."));
    } finally {
      setLogoBusy(false);
    }
  }

  function saveColors() {
    const patch: Partial<BrandColors> = {};
    for (const k of changed) patch[k] = colors[k];
    startSave(async () => {
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

  function activate(m: Mode) {
    startActivate(async () => {
      try {
        unwrap(await setThemeMode(accountId, m));
        setActive(m);
        toast.success(`„${NAMES[m]}“ ist jetzt auf Ihrer Hilfe-Seite aktiv`);
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  }

  const DESC: Record<Mode, string> = {
    manual: pro
      ? "Warm und ruhig – mit Ihrem Logo und Ihren Farben."
      : "Warm und ruhig, in den Steply-Farben. Eigenes Logo und Farben ab Pro.",
    ai: "Die KI übernimmt Farben, Schrift und Logo Ihrer Website.",
    extreme: "Baut auch Formen, Ecken und Abstände Ihrer Website nach.",
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)]">
      {/* ── Links: Grundlage + ihre Einstellungen + Balken ─────────────────────── */}
      <div className="grid gap-4">
        <section className="rounded-card border-2 border-line bg-card p-4">
          <h2 className="mb-2.5 text-[13px] font-black text-ink">Grundlage</h2>
          <div role="group" aria-label="Design-Grundlage" className="grid gap-2">
            {(["manual", "ai", "extreme"] as Mode[]).map((m) => {
              const selected = base === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-mode={m}
                  data-active={active === m ? "true" : undefined}
                  onClick={() => setBase(m)}
                  className={`grid gap-0.5 rounded-[14px] border-2 bg-white px-3 py-2.5 text-left transition-shadow ${
                    selected ? "border-primary shadow-[0_0_0_3px_var(--accent)]" : "border-line hover:border-[#e3d7c2]"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-black text-ink">
                    <span
                      aria-hidden
                      className={`size-4 shrink-0 rounded-full border-2 ${selected ? "border-[5px] border-primary" : "border-line"}`}
                    />
                    {NAMES[m]}
                    {active === m && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-px text-[11px] font-black text-teal-text">
                        <Check className="size-3" strokeWidth={3} /> Aktiv
                      </span>
                    )}
                    {m !== "manual" && !business && (
                      <span className="ml-auto">
                        <BusinessPill />
                      </span>
                    )}
                  </span>
                  <span className="pl-6 text-[12.5px] font-semibold text-muted-foreground">{DESC[m]}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 rounded-card border-2 border-line bg-card p-4" data-testid="appearance-settings">
          <h2 className="text-[13px] font-black text-ink">{base === "manual" ? "Logo und Farben" : NAMES[base]}</h2>

          {base === "manual" && !pro && (
            <p className="text-sm font-semibold text-ink-2">
              Im kostenlosen Tarif zeigt Ihre Hilfe-Seite die Steply-Standardgestaltung. Mit <ProPill /> erscheint sie
              mit Ihrem Logo und Ihren Farben – und ohne den Hinweis „Erstellt mit Steply“.{" "}
              <a href="/app/settings/tarif" className="font-extrabold text-primary underline underline-offset-2">
                Tarife ansehen
              </a>
            </p>
          )}

          {base === "manual" && pro && (
            <>
              <div className="grid gap-1.5">
                <FieldLabel>Logo</FieldLabel>
                <input ref={logoInput} type="file" accept="image/*" hidden onChange={onLogo} />
                <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-line bg-background p-3">
                  <div className="flex h-12 min-w-12 max-w-[160px] items-center justify-center overflow-hidden rounded-xl border-2 border-line bg-white px-1.5">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="Ihr Logo" className="max-h-9 w-auto max-w-full object-contain" />
                    ) : (
                      <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-[140px] flex-1 text-xs font-semibold text-muted-foreground">
                    PNG, JPG, WebP oder SVG – breite Logos werden in voller Breite gezeigt. Wirkt sofort.
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" disabled={logoBusy} onClick={() => logoInput.current?.click()}>
                      {logoBusy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                      {logoUrl ? "Ersetzen" : "Logo hochladen"}
                    </Button>
                    {logoUrl && (
                      <Button variant="ghost" size="sm" disabled={logoBusy} onClick={removeLogo} aria-label="Logo entfernen">
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-1.5">
                <FieldLabel>Farben</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  {COLOR_FIELDS.map((f) => (
                    <label
                      key={f.key}
                      className="relative flex cursor-pointer items-center gap-2 rounded-xl border-2 border-line bg-white px-[9px] py-[7px] text-xs font-extrabold text-ink transition-colors hover:border-[#e3d7c2] focus-within:border-primary/60"
                    >
                      <span
                        className="size-[26px] shrink-0 rounded-[8px] border-[1.5px] border-black/10"
                        style={{ background: colors[f.key] }}
                      />
                      <span className="min-w-0">
                        {f.label}
                        <small className="block truncate font-bold text-muted-foreground">
                          <span className="uppercase">{colors[f.key]}</span> · {f.hint}
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
                {weak != null ? (
                  <p
                    role="status"
                    data-testid="brand-contrast-hint"
                    className="flex items-start gap-1.5 rounded-lg bg-accent px-2.5 py-2 text-xs font-bold text-coral-text"
                  >
                    <TriangleAlert className="mt-px size-3.5 shrink-0" />
                    Schwer lesbar (Kontrast {weak.toFixed(1).replace(".", ",")} : 1, empfohlen mindestens 4,5 : 1) –
                    wählen Sie eine dunklere Text- oder hellere Hintergrundfarbe.
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 rounded-lg bg-teal-soft px-2.5 py-2 text-xs font-bold text-teal-text">
                    <Check className="size-3.5" strokeWidth={3} /> Gut lesbar
                  </p>
                )}
              </div>
            </>
          )}

          {base !== "manual" && !business && (
            <p className="text-sm font-semibold text-ink-2">
              Im Business-Tarif erstellt die KI aus Ihrer Website automatisch ein passendes Design.{" "}
              <a href="/app/settings/tarif" className="font-extrabold text-primary underline underline-offset-2">
                Tarife ansehen
              </a>
            </p>
          )}

          {base !== "manual" && business && (
            <div className="grid gap-2.5">
              <div className="grid gap-1.5">
                <FieldLabel>Ihre Website</FieldLabel>
                <AutoCi
                  key={base}
                  initialUrl={sourceUrl}
                  compact
                  endpoint={base === "extreme" ? "/api/theme/extreme" : "/api/theme/analyze"}
                  inputLabel={
                    base === "extreme" ? "Adresse Ihrer Website für den Nachbau" : "Adresse Ihrer Website für das KI-Design"
                  }
                  successMsg={`„${NAMES[base]}“ erstellt – rechts in der Vorschau.`}
                  // Kein Neuladen: sonst sprang die Auswahl auf die aktive Grundlage zurück und das
                  // neue Design war nicht zu sehen (Runde 4). refresh() liefert die neuen Tokens.
                  onDone={() => router.refresh()}
                />
                <p className="text-xs font-semibold text-muted-foreground">
                  {base === "extreme"
                    ? "Die KI baut zusätzlich Formen und Abstände nach. Dauert etwa 15 Sekunden."
                    : "Die KI liest Farben, Schrift und Logo aus. Dauert etwa 10 Sekunden."}
                </p>
              </div>
              {available(base) ? (
                <p className="flex items-center gap-1.5 rounded-lg bg-teal-soft px-2.5 py-2 text-xs font-bold text-teal-text">
                  <Check className="size-3.5" strokeWidth={3} /> Erstellt – rechts in der Vorschau.
                  {" "}Mit „Analysieren“ neu erzeugen, falls sich Ihre Website geändert hat.
                </p>
              ) : (
                <p className="rounded-lg bg-line-2 px-2.5 py-2 text-xs font-bold text-ink-2">
                  Noch nicht erstellt – Website eingeben und „Analysieren“ klicken.
                </p>
              )}
              {base === "ai" && <AiLogoUpload logoUrl={aiLogoUrl} />}
            </div>
          )}
        </section>

        {/* Balken: ungespeicherte Farben ODER „verwenden“. */}
        <div
          {...(dirty ? { role: "region", "aria-label": "Ungespeicherte Änderungen" } : {})}
          className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-ink py-2.5 pl-4 pr-2.5 text-sm font-extrabold text-white"
        >
          <span>
            {dirty
              ? "Ungespeicherte Änderungen"
              : active === base
                ? "Aktiv auf Ihrer Hilfe-Seite"
                : available(base)
                  ? "Diese Grundlage ist noch nicht aktiv"
                  : "Noch nicht erstellt"}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            {dirty && (
              <>
                <button
                  type="button"
                  onClick={() => setColors(saved)}
                  disabled={saving}
                  className="rounded-full px-2.5 py-1.5 text-sm text-[#e9dfcf] transition-colors hover:text-white disabled:opacity-50"
                >
                  Verwerfen
                </button>
                <button
                  type="button"
                  onClick={saveColors}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-[7px] text-sm font-black text-white shadow-[0_3px_0_var(--primary-pressed)] transition-transform active:translate-y-px disabled:opacity-70"
                >
                  {saving && <Loader2 className="size-4 animate-spin" />} Speichern
                </button>
              </>
            )}
            {!dirty && active !== base && available(base) && allowed(base) && (
              <button
                type="button"
                onClick={() => activate(base)}
                disabled={activating}
                className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-[7px] text-sm font-black text-white shadow-[0_3px_0_var(--primary-pressed)] transition-transform active:translate-y-px disabled:opacity-70"
              >
                {activating && <Loader2 className="size-4 animate-spin" />}
                Auf Hilfe-Seite verwenden
              </button>
            )}
            {!dirty && active === base && <Check className="size-4 text-[#9ee6da]" strokeWidth={3} aria-hidden />}
          </span>
        </div>
      </div>

      {/* ── Rechts: feste Vorschau ──────────────────────────────────────────────── */}
      <section className="rounded-card border-2 border-line bg-card p-4 lg:sticky lg:top-20">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[13px] font-black text-ink">
            Vorschau
            <span className="rounded-full bg-line-2 px-2 py-px text-[11px] font-black text-muted-foreground">
              {NAMES[base]}
            </span>
          </h2>
          <div role="group" aria-label="Gerät der Vorschau" className="inline-flex rounded-full border-2 border-line bg-white p-0.5">
            {(
              [
                ["desktop", "Desktop", Monitor],
                ["phone", "Handy", Smartphone],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                aria-pressed={device === key}
                onClick={() => setDevice(key)}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold transition-colors ${
                  device === key ? "bg-ink text-white" : "text-ink-2 hover:text-ink"
                }`}
              >
                <Icon className="size-3.5" aria-hidden /> {label}
              </button>
            ))}
          </div>
        </div>
        <div className={device === "phone" ? "mx-auto max-w-[320px] rounded-[26px] border-[6px] border-ink" : ""}>
          <BrandPreview
            tokens={preview.tokens}
            logoUrl={preview.logo}
            accountName={accountName || "Organisation"}
            testId="brand-live-preview"
          />
        </div>
        {!available(base) && base !== "manual" && (
          <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">
            Noch nicht erstellt – die Vorschau zeigt so lange „Steply-Standard“.
          </p>
        )}
        <p className="mt-3 text-center">
          <a
            href={base === active ? `/h/${accountSlug}` : `/h/${accountSlug}?preview=${base}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-black text-primary underline underline-offset-2"
          >
            {base === active ? "Echte Hilfe-Seite öffnen" : "Mit echten Inhalten ansehen"}{" "}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </p>
      </section>
    </div>
  );
}
