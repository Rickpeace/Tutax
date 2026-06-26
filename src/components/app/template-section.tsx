"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PencilLine, Eye, Undo2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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
};

export function TemplateSection({
  items,
  accountSlug,
}: {
  items: TemplateItem[];
  accountSlug: string;
}) {
  const [pending, start] = useTransition();
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

  return (
    <section>
      <div className="mb-3 flex items-center gap-2 border-b border-line-2 pb-1.5">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Standard-Anleitungen von Tutax
        </h2>
      </div>
      <div className="space-y-2">
        {items.map((it) => (
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
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => setTemplateEnabled(it.templateId, !it.enabled))}
                className="flex items-center gap-2 text-xs font-medium text-ink-2"
                title="Auf der Hilfe-Seite zeigen"
              >
                <Switch on={it.enabled} />
                <span className="hidden sm:inline">Auf Hilfe-Seite</span>
              </button>

              {it.enabled && it.slug && (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/h/${accountSlug}/${it.slug}`} target="_blank" />}
                >
                  <Eye className="size-4" /> Ansehen
                </Button>
              )}

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
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        „Standard" wird zentral von Tutax gepflegt – Updates erscheinen automatisch.
        Beim Anpassen entsteht Ihre eigene Kopie („Angepasst").
      </p>
    </section>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-line"}`}>
      <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </span>
  );
}
