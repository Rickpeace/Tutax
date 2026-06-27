"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Sparkles, Palette, ArrowDown, Zap, Eye } from "lucide-react";
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
import { setThemeMode } from "@/app/app/settings/branding/actions";
import { googleFontsHref } from "@/lib/theme";

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
}: {
  accountName: string;
  accountSlug: string;
  mode: "manual" | "ai" | "extreme";
  manualTokens: unknown;
  manualLogoUrl: string | null;
  aiTokens: unknown;
  aiLogoUrl: string | null;
  extremeTokens: unknown;
  extremeLogoUrl: string | null;
  sourceUrl: string;
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

  const activate = (m: "manual" | "ai" | "extreme") =>
    start(async () => {
      try {
        await setThemeMode(m);
        toast.success(
          m === "extreme" ? "Extrem-Design ist aktiv" : m === "ai" ? "KI-Design ist aktiv" : "Standard-CI ist aktiv",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });

  const card = (active: boolean) =>
    `flex flex-col rounded-2xl border bg-card p-4 transition-shadow ${
      active ? "border-primary ring-2 ring-primary/30 shadow-sm" : "border-border"
    }`;

  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-3">
      {/* Standard-CI */}
      <div className={card(mode === "manual")}>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-primary">
            <Palette className="size-4" />
          </span>
          <span className="font-bold text-ink">Standard-CI</span>
          {mode === "manual" && (
            <span className="ml-auto flex items-center gap-1 rounded-full bg-yes-soft px-2 py-0.5 text-xs font-bold text-yes">
              <Check className="size-3" /> Aktiv
            </span>
          )}
        </div>

        <BrandPreview tokens={manualTokens} logoUrl={manualLogoUrl} accountName={accountName} />

        <div className="mt-auto pt-4">
          <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowDown className="size-3" /> Farben &amp; Logo unten anpassen
          </p>
          <div className="space-y-2">
            <PreviewDialog slug={accountSlug} mode="manual" label="Standard-CI" />
            {mode === "manual" ? (
              <Button variant="outline" size="sm" disabled className="w-full">
                <Check className="size-4" /> Aktiv
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="w-full" disabled={pending} onClick={() => activate("manual")}>
                Standard-CI aktivieren
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* KI-Design */}
      <div className={card(mode === "ai")}>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-primary">
            <Sparkles className="size-4" />
          </span>
          <span className="font-bold text-ink">KI-Design</span>
          {mode === "ai" && (
            <span className="ml-auto flex items-center gap-1 rounded-full bg-yes-soft px-2 py-0.5 text-xs font-bold text-yes">
              <Check className="size-3" /> Aktiv
            </span>
          )}
        </div>

        {hasAi ? (
          <BrandPreview tokens={aiTokens} logoUrl={aiLogoUrl} accountName={accountName} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
            <Sparkles className="size-6 text-primary" />
            <p className="mt-2 max-w-[15rem] text-xs text-muted-foreground">
              Noch kein KI-Design – analysieren Sie Ihre Website unten.
            </p>
          </div>
        )}

        <div className="mt-auto space-y-2 pt-4">
          <p className="mb-1 text-xs text-muted-foreground">
            Website analysieren (Logo, Farben, Schrift, Form):
          </p>
          <AutoCi initialUrl={sourceUrl} compact />
          <AiLogoUpload logoUrl={aiLogoUrl} />
          {hasAi && <PreviewDialog slug={accountSlug} mode="ai" label="KI-Design" />}
          {hasAi &&
            (mode === "ai" ? (
              <Button variant="outline" size="sm" disabled className="w-full">
                <Check className="size-4" /> Aktiv
              </Button>
            ) : (
              <Button size="sm" className="w-full" disabled={pending} onClick={() => activate("ai")}>
                KI-Design aktivieren
              </Button>
            ))}
        </div>
      </div>

      {/* Extrem-Design */}
      <div className={card(mode === "extreme")}>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-primary">
            <Zap className="size-4" />
          </span>
          <span className="font-bold text-ink">Extrem-Design</span>
          {mode === "extreme" && (
            <span className="ml-auto flex items-center gap-1 rounded-full bg-yes-soft px-2 py-0.5 text-xs font-bold text-yes">
              <Check className="size-3" /> Aktiv
            </span>
          )}
        </div>

        {hasExtreme ? (
          <BrandPreview tokens={extremeTokens} logoUrl={extremeLogoUrl} accountName={accountName} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
            <Zap className="size-6 text-primary" />
            <p className="mt-2 max-w-[15rem] text-xs text-muted-foreground">
              Baut Layout &amp; Styling neu nach Ihrer Website – nicht nur Farben.
            </p>
          </div>
        )}

        <div className="mt-auto space-y-2 pt-4">
          <p className="mb-1 text-xs text-muted-foreground">
            Website tief nachbauen (Typo, Buttons, Karten, Deko):
          </p>
          <AutoCi
            initialUrl={sourceUrl}
            compact
            endpoint="/api/theme/extreme"
            successMsg="Extrem-Design erstellt! Aktivieren, um es live zu sehen."
          />
          {hasExtreme && <PreviewDialog slug={accountSlug} mode="extreme" label="Extrem-Design" />}
          {hasExtreme &&
            (mode === "extreme" ? (
              <Button variant="outline" size="sm" disabled className="w-full">
                <Check className="size-4" /> Aktiv
              </Button>
            ) : (
              <Button size="sm" className="w-full" disabled={pending} onClick={() => activate("extreme")}>
                Extrem-Design aktivieren
              </Button>
            ))}
        </div>
      </div>
    </div>
  );
}

/** Live-Vorschau eines Designs in einem iframe – ohne es zu aktivieren. */
function PreviewDialog({ slug, mode, label }: { slug: string; mode: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="w-full">
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
