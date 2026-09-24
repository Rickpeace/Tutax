"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PencilLine, Eye, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { HelpToggle } from "@/components/app/help-toggle";
import { PageHeader } from "@/components/app/page-header";
import { categoryColor } from "@/lib/category-colors";
import {
  setTemplateEnabled,
  forkTemplate,
  resetTemplate,
} from "@/app/app/template-actions";
import { errorText, isNavigationError, unwrap } from "@/lib/action-error";

export type TemplateItem = {
  templateId: string;
  title: string;
  kind: "standard" | "fork";
  enabled: boolean;
  renderId: string;
  slug: string | null;
  categoryName: string;
  /** Angepasste Kopie einer Vorlage, die Steply zurückgezogen hat (nicht auf der Hilfe-Seite). */
  withdrawn?: boolean;
};

/**
 * Standard-Anleitungen von Steply (Welle 50d): derselbe Zeilenstil wie die Listenansicht der
 * Anleitungen (Kategorie-Band, 2px-Linien, Spaltenkopf ab md) und derselbe Schalter wie die
 * Karten — hier mit der Beschriftung „Auf der Hilfe-Seite". Funktionen unverändert:
 * einblenden (setTemplateEnabled), anpassen (forkTemplate), zurücksetzen (resetTemplate).
 */
export function TemplateSection({ items }: { items: TemplateItem[] }) {
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  // Optimistischer Schalter-Zustand; synct mit Server-Daten nach Fork/Reset.
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.templateId, i.enabled])),
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: optimistischen Schalter-Zustand mit neuen Server-Daten resyncen (nach Fork/Reset), kein Cascade
    setEnabledMap(Object.fromEntries(items.map((i) => [i.templateId, i.enabled])));
  }, [items]);

  if (!items.length) return null;

  const run = (fn: () => Promise<unknown>, msg?: string) =>
    start(async () => {
      try {
        await fn();
        if (msg) toast.success(msg);
      } catch (e) {
        // „Anpassen“ leitet per redirect() in die Kopie — das ist kein Fehler (Runde 4).
        if (isNavigationError(e)) return;
        toast.error(errorText(e));
      }
    });

  // Sofort umschalten, im Hintergrund speichern, bei Fehler zurückrollen.
  const toggle = (templateId: string) => {
    const next = !enabledMap[templateId];
    setEnabledMap((m) => ({ ...m, [templateId]: next }));
    setTemplateEnabled(templateId, next).catch(() => {
      setEnabledMap((m) => ({ ...m, [templateId]: !next }));
      toast.error("Konnte nicht speichern");
    });
  };

  // Nach Kategorie gruppieren (Reihenfolge der ersten Vorkommen erhalten)
  const groups: { name: string; rows: TemplateItem[] }[] = [];
  for (const it of items) {
    let g = groups.find((x) => x.name === it.categoryName);
    if (!g) {
      g = { name: it.categoryName, rows: [] };
      groups.push(g);
    }
    g.rows.push(it);
  }

  const renderRow = (it: TemplateItem) => (
    <div
      key={it.templateId}
      className="flex flex-col gap-1.5 border-t-2 border-line-2 px-4 py-2.5 transition-colors hover:bg-[#fffcf7] md:grid md:grid-cols-[minmax(0,1fr)_100px_170px_310px] md:items-center md:gap-4"
      data-testid="template-row"
    >
      {/* Mobil: Titel ganze Breite (umbrechend), darunter Schalter + Aktionen. */}
      <div className="flex min-w-0 items-start gap-2 md:items-center">
        <span
          className="line-clamp-2 min-w-0 text-sm font-extrabold text-ink md:truncate"
          title={it.title}
        >
          {it.title}
        </span>
        <KindChip kind={it.kind} className="mt-px md:hidden" />
      </div>
      <span className="hidden md:block">
        <KindChip kind={it.kind} />
      </span>
      {/* md:contents — ab md werden Schalter und Aktionen eigene Spalten des Rasters. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 md:contents">
        {it.withdrawn ? (
          <span className="text-xs font-semibold text-muted-foreground" data-testid="template-withdrawn">
            Vorlage zurückgezogen – nicht auf der Hilfe-Seite
          </span>
        ) : (
          <HelpToggle on={!!enabledMap[it.templateId]} onToggle={() => toggle(it.templateId)} />
        )}

        <div className="-mr-2 flex flex-wrap items-center gap-0.5 md:mr-0 md:justify-end md:gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={`/app/preview/${it.renderId}`} target="_blank" />}
          >
            <Eye className="size-4" /> Ansehen
          </Button>

          {it.kind === "fork" ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href={`/app/tutorials/${it.renderId}`} />}
              >
                <PencilLine className="size-4" /> Bearbeiten
              </Button>
              {!it.withdrawn && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Auf den Standard zurücksetzen?",
                    description:
                      "Ihre eigenen Anpassungen an dieser Anleitung werden verworfen. Danach sehen Ihre Kunden wieder die zentral gepflegte Standard-Version.",
                    confirmLabel: "Zurücksetzen",
                    destructive: true,
                  });
                  if (ok) run(() => resetTemplate(it.templateId), "Auf Standard zurückgesetzt");
                }}
              >
                <Undo2 className="size-4" /> Zurücksetzen
              </Button>
              )}
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(async () => unwrap(await forkTemplate(it.templateId)))}
            >
              <PencilLine className="size-4" /> Anpassen
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <section data-testid="template-section">
      <PageHeader
        sub
        title="Standard-Anleitungen von Steply"
        meta={`${items.length} ${items.length === 1 ? "Anleitung" : "Anleitungen"}`}
        description={
          <>
            „Standard“ pflegt Steply zentral – Updates erscheinen automatisch. Beim Anpassen
            entsteht Ihre eigene Kopie („Angepasst“).
          </>
        }
      />
      <div className="overflow-hidden rounded-card border-2 border-line bg-card">
        <div className="hidden grid-cols-[minmax(0,1fr)_100px_170px_310px] gap-4 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-faint md:grid">
          <span>Anleitung</span>
          <span>Art</span>
          <span>Hilfe-Seite</span>
          <span />
        </div>
        {groups.map((g) => (
          <div key={g.name}>
            <div className="flex items-center gap-2 border-t-2 border-line bg-line-2 px-4 py-2 text-[11.5px] font-black uppercase tracking-[0.06em] text-ink-2 first:border-t-0 md:first:border-t-2">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: categoryColor(g.name).solid }}
              />
              {g.name}
              <span className="text-faint">{g.rows.length}</span>
            </div>
            {g.rows.map(renderRow)}
          </div>
        ))}
      </div>
      {confirmDialog}
    </section>
  );
}

function KindChip({ kind, className = "" }: { kind: "standard" | "fork"; className?: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-[2px] text-[11px] font-black ${
        kind === "fork" ? "bg-accent text-accent-foreground" : "bg-line-2 text-muted-foreground"
      } ${className}`}
    >
      {kind === "fork" ? "Angepasst" : "Standard"}
    </span>
  );
}
