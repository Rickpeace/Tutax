"use client";

import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Check, Sparkles, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandPreview } from "./brand-preview";
import { AutoCi } from "./auto-ci";
import { setThemeMode } from "@/app/app/settings/branding/actions";
import { googleFontsHref } from "@/lib/theme";

export function DesignModeSwitcher({
  accountName,
  mode,
  manualTokens,
  manualLogoUrl,
  aiTokens,
  aiLogoUrl,
  sourceUrl,
}: {
  accountName: string;
  mode: "manual" | "ai";
  manualTokens: unknown;
  manualLogoUrl: string | null;
  aiTokens: unknown;
  aiLogoUrl: string | null;
  sourceUrl: string;
}) {
  const [pending, start] = useTransition();
  const hasAi = !!aiTokens;

  // Schriften für die Vorschauen laden.
  useEffect(() => {
    const hrefs = [googleFontsHref(manualTokens), googleFontsHref(aiTokens)].filter(Boolean) as string[];
    const links = hrefs.map((href) => {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
      return l;
    });
    return () => links.forEach((l) => l.remove());
  }, [manualTokens, aiTokens]);

  const activate = (m: "manual" | "ai") =>
    start(async () => {
      try {
        await setThemeMode(m);
        toast.success(m === "ai" ? "KI-Design ist jetzt aktiv" : "Standard-CI ist jetzt aktiv");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });

  const cardCls = (active: boolean) =>
    `flex flex-col gap-3 rounded-2xl border-2 bg-card p-4 transition-colors ${
      active ? "border-primary" : "border-border"
    }`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Standard-CI */}
      <div className={cardCls(mode === "manual")}>
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-primary" />
          <span className="text-sm font-bold text-ink">Standard-CI</span>
          {mode === "manual" && (
            <span className="ml-auto flex items-center gap-1 rounded-md bg-yes-soft px-2 py-0.5 text-xs font-bold text-yes">
              <Check className="size-3" /> Aktiv
            </span>
          )}
        </div>
        <BrandPreview tokens={manualTokens} logoUrl={manualLogoUrl} accountName={accountName} />
        <p className="text-xs text-muted-foreground">Ihre manuell gepflegten Farben (unten anpassbar).</p>
        {mode !== "manual" && (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => activate("manual")}>
            Standard-CI aktivieren
          </Button>
        )}
      </div>

      {/* KI-Design */}
      <div className={cardCls(mode === "ai")}>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span className="text-sm font-bold text-ink">KI-Design</span>
          {mode === "ai" && (
            <span className="ml-auto flex items-center gap-1 rounded-md bg-yes-soft px-2 py-0.5 text-xs font-bold text-yes">
              <Check className="size-3" /> Aktiv
            </span>
          )}
        </div>

        {hasAi ? (
          <>
            <BrandPreview tokens={aiTokens} logoUrl={aiLogoUrl} accountName={accountName} />
            <p className="text-xs text-muted-foreground">
              Von der KI aus Ihrer Website abgeleitet (Logo, Farben, Schrift, Form).
            </p>
            {mode !== "ai" && (
              <Button size="sm" disabled={pending} onClick={() => activate("ai")}>
                KI-Design aktivieren
              </Button>
            )}
            <AutoCi initialUrl={sourceUrl} compact />
          </>
        ) : (
          <>
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-6 text-center">
              <Sparkles className="size-6 text-primary" />
              <p className="mt-2 max-w-[16rem] text-xs text-muted-foreground">
                Noch kein KI-Design. Analysieren Sie Ihre Website – die KI baut daraus ein
                passendes Design.
              </p>
            </div>
            <AutoCi initialUrl={sourceUrl} compact />
          </>
        )}
      </div>
    </div>
  );
}
