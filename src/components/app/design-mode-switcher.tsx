"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Eye, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BrandPreview } from "./brand-preview";
import { AutoCi } from "./auto-ci";
import { AiLogoUpload } from "./ai-logo-upload";
import { BusinessPill, SettingsCard } from "./settings-ui";
import { setThemeMode } from "@/app/app/settings/branding/actions";
import { googleFontsHref } from "@/lib/theme";
import { unwrap, errorText } from "@/lib/action-error";

type Mode = "manual" | "ai" | "extreme";

const MODE_LABEL: Record<Mode, string> = {
  manual: "Steply-Standard",
  ai: "Von Ihrer Website",
  extreme: "Nachgebaut",
};

/**
 * Design-Grundlage der Hilfe-Seite (Einstellungen → Aussehen, Entwurf §2):
 * drei Auswahlkarten (Steply-Standard · Von Ihrer Website (KI) · Nachgebaut (Extrem))
 * + darunter die Karte, mit der die KI-Designs aus der Website erzeugt werden.
 * Umschalten wirkt sofort (setThemeMode) — kein Speichern-Balken nötig.
 */
export function DesignModeSwitcher({
  accountName,
  accountSlug,
  mode,
  manualTokens,
  manualLogoUrl,
  aiTokens,
  aiLogoUrl,
  extremeTokens,
  extremeLogoUrl,
  sourceUrl,
  business,
}: {
  accountName: string;
  accountSlug: string;
  mode: Mode;
  manualTokens: unknown;
  manualLogoUrl: string | null;
  aiTokens: unknown;
  aiLogoUrl: string | null;
  extremeTokens: unknown;
  extremeLogoUrl: string | null;
  sourceUrl: string;
  business: boolean;
}) {
  const [pending, start] = useTransition();
  const hasAi = !!aiTokens;
  const hasExtreme = !!extremeTokens;

  useEffect(() => {
    const hrefs = [
      googleFontsHref(manualTokens),
      googleFontsHref(aiTokens),
      googleFontsHref(extremeTokens),
    ].filter(Boolean) as string[];
    const links = hrefs.map((href) => {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
      return l;
    });
    return () => links.forEach((l) => l.remove());
  }, [manualTokens, aiTokens, extremeTokens]);

  const activate = (m: Mode) =>
    start(async () => {
      try {
        unwrap(await setThemeMode(m));
        toast.success(`„${MODE_LABEL[m]}“ ist jetzt aktiv`);
      } catch (e) {
        toast.error(errorText(e));
      }
    });

  const options: {
    key: Mode;
    description: string;
    available: boolean;
    needsBusiness: boolean;
    preview: React.ReactNode;
    emptyHint: string;
  }[] = [
    {
      key: "manual",
      description: "Warm und ruhig, mit Ihrem Logo und Ihrer Akzentfarbe.",
      available: true,
      needsBusiness: false,
      preview: <BrandPreview compact tokens={manualTokens} logoUrl={manualLogoUrl} accountName={accountName} />,
      emptyHint: "",
    },
    {
      key: "ai",
      description: "Die KI übernimmt Farben und Schrift Ihrer Website.",
      available: hasAi,
      needsBusiness: true,
      preview: hasAi ? (
        <BrandPreview compact tokens={aiTokens} logoUrl={aiLogoUrl} accountName={accountName} />
      ) : null,
      emptyHint: "Noch nicht erstellt – unten Ihre Website angeben.",
    },
    {
      key: "extreme",
      description: "Baut auch Formen und Abstände Ihrer Website nach.",
      available: hasExtreme,
      needsBusiness: true,
      preview: hasExtreme ? (
        <BrandPreview compact tokens={extremeTokens} logoUrl={extremeLogoUrl} accountName={accountName} />
      ) : null,
      emptyHint: "Noch nicht erstellt – unten Ihre Website angeben.",
    },
  ];

  return (
    <div className="grid gap-[18px]">
      <div role="group" aria-label="Design-Grundlage" className="grid gap-3 md:grid-cols-3">
        {options.map((o) => {
          const active = mode === o.key;
          const locked = o.needsBusiness && !business;
          return (
            <div
              key={o.key}
              data-mode={o.key}
              data-active={active ? "true" : undefined}
              className={`flex flex-col gap-2 rounded-2xl border-2 bg-card p-3 transition-shadow ${
                active ? "border-primary shadow-[0_0_0_3px_var(--accent)]" : "border-line"
              }`}
            >
              <div className="flex items-center gap-2 font-black text-ink">
                {MODE_LABEL[o.key]}
                {active ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-px text-[11px] font-black text-teal-text">
                    <Check className="size-3" strokeWidth={3} /> Aktiv
                  </span>
                ) : locked ? (
                  <span className="ml-auto">
                    <BusinessPill />
                  </span>
                ) : null}
              </div>
              {o.preview ?? (
                <div className="flex min-h-[112px] items-center justify-center rounded-[10px] border-2 border-dashed border-line bg-background px-3 text-center text-xs font-bold text-muted-foreground">
                  {o.emptyHint}
                </div>
              )}
              <p className="text-[12.5px] text-muted-foreground">{o.description}</p>
              {!active && o.available && (
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending || locked}
                    onClick={() => activate(o.key)}
                  >
                    Verwenden
                  </Button>
                  <PreviewDialog slug={accountSlug} mode={o.key} label={MODE_LABEL[o.key]} />
                </div>
              )}
              {active && (
                <div className="mt-auto pt-1">
                  <PreviewDialog slug={accountSlug} mode={o.key} label={MODE_LABEL[o.key]} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <SettingsCard
        title="Design von Ihrer Website übernehmen"
        icon={Wand2}
        aside={!business ? <BusinessPill /> : undefined}
        description="Geben Sie die Adresse Ihrer Website an. Die KI erstellt daraus ein passendes Design – aktiv wird es erst, wenn Sie es oben auf „Verwenden“ stellen."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <span className="text-[12.5px] font-extrabold text-ink-2">
              Von Ihrer Website – Farben, Schrift, Logo
            </span>
            <AutoCi
              initialUrl={sourceUrl}
              compact
              inputLabel="Adresse Ihrer Website für das KI-Design"
              successMsg="Design erstellt! Jetzt oben „Verwenden“ wählen."
            />
            <AiLogoUpload logoUrl={aiLogoUrl} />
          </div>
          <div className="grid content-start gap-1.5">
            <span className="text-[12.5px] font-extrabold text-ink-2">
              Nachgebaut – auch Formen, Karten, Abstände
            </span>
            <AutoCi
              initialUrl={sourceUrl}
              compact
              endpoint="/api/theme/extreme"
              inputLabel="Adresse Ihrer Website für den Nachbau"
              successMsg="Nachbau erstellt! Jetzt oben „Verwenden“ wählen."
            />
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}

/** Live-Vorschau eines Designs in einem iframe – ohne es zu aktivieren. */
export function PreviewDialog({ slug, mode, label }: { slug: string; mode: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <Eye className="size-4" /> Live-Vorschau
          </Button>
        }
      />
      <DialogContent className="max-w-[min(95vw,820px)] p-0 sm:max-w-[min(95vw,820px)]">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-sm">Live-Vorschau · {label}</DialogTitle>
        </DialogHeader>
        {open && (
          <iframe
            title={`Vorschau ${label}`}
            src={`/h/${slug}?preview=${mode}`}
            className="h-[72vh] w-full rounded-b-lg bg-white"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
