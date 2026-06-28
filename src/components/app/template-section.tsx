"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PencilLine, Eye, Undo2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpToggle } from "@/components/app/help-toggle";
import {
  setTemplateEnabled,
  forkTemplate,
  resetTemplate,
} from "@/app/app/template-actions";

export type TemplateItem = {
  templateId: string;
  title: string;
  kind: "standard" | "fork";
  enabled: boolean;
  renderId: string;
  slug: string | null;
  categoryName: string;
};

export function TemplateSection({ items }: { items: TemplateItem[] }) {
  const [pending, start] = useTransition();
  // Optimistischer Schalter-Zustand; synct mit Server-Daten nach Fork/Reset.
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.templateId, i.enabled])),
  );
  useEffect(() => {
    setEnabledMap(Object.fromEntries(items.map((i) => [i.templateId, i.enabled])));
  }, [items]);

  if (!items.length) return null;

  const run = (fn: () => Promise<unknown>, msg?: string) =>
    start(async () => {
      try {
        await fn();
        if (msg) toast.success(msg);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
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
      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4"
    >
      <span
              className={
                it.kind === "fork"
                  ? "rounded-md bg-accent px-2 py-0.5 text-xs font-bold text-primary"
                  : "rounded-md bg-line-2 px-2 py-0.5 text-xs font-bold text-muted-foreground"
              }
            >
              {it.kind === "fork" ? "Angepasst" : "Standard"}
            </span>
            <span className="font-bold text-ink">{it.title}</span>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <HelpToggle on={!!enabledMap[it.templateId]} onToggle={() => toggle(it.templateId)} />

              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={`/app/preview/${it.renderId}`} target="_blank" />}
              >
                <Eye className="size-4" /> Ansehen
              </Button>

              {it.kind === "fork" ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/app/tutorials/${it.renderId}`} />}
                  >
                    <PencilLine className="size-4" /> Bearbeiten
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      if (confirm("Eigene Anpassungen verwerfen und auf den Standard zurücksetzen?"))
                        run(() => resetTemplate(it.templateId), "Auf Standard zurückgesetzt");
                    }}
                  >
                    <Undo2 className="size-4" /> Zurücksetzen
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => forkTemplate(it.templateId))}
                >
                  <PencilLine className="size-4" /> Anpassen
                </Button>
              )}
            </div>
          </div>
  );

  return (
    <section>
      <div className="mb-3 flex items-center gap-2 border-b border-line-2 pb-1.5">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Standard-Anleitungen von Steply
        </h2>
      </div>
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.name}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground/80">
              {g.name}
            </h3>
            <div className="space-y-2">{g.rows.map(renderRow)}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        „Standard" wird zentral von Steply gepflegt – Updates erscheinen automatisch.
        Beim Anpassen entsteht Ihre eigene Kopie („Angepasst").
      </p>
    </section>
  );
}
