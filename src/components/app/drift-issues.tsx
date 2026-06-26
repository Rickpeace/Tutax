"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyDriftSuggestion } from "@/app/app/alerts/actions";

type Issue = { step?: string; problem?: string; suggestion?: string; applied?: boolean };

export function DriftIssues({ alertId, issues }: { alertId: string; issues: Issue[] }) {
  const [applied, setApplied] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(issues.map((it, i) => [i, !!it.applied])),
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [, start] = useTransition();

  const apply = (i: number) => {
    setBusy(i);
    start(async () => {
      try {
        const r = await applyDriftSuggestion(alertId, i);
        setApplied((p) => ({ ...p, [i]: true }));
        toast.success(`Übernommen – „${r?.stepTitle ?? "Schritt"}" aktualisiert`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <ul className="mt-3 space-y-2">
      {issues.map((it, i) => (
        <li key={i} className="rounded-lg border border-line-2 bg-muted/40 p-2.5 text-sm">
          {it.step && (
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{it.step}</div>
          )}
          {it.problem && (
            <div className="mt-0.5 text-ink-2">
              <span className="font-semibold text-no">Problem:</span> {it.problem}
            </div>
          )}
          {it.suggestion && (
            <div className="mt-0.5 text-ink-2">
              <span className="font-semibold text-yes">Vorschlag:</span> {it.suggestion}
            </div>
          )}
          <div className="mt-2">
            {applied[i] ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-yes">
                <Check className="size-3.5" /> Übernommen
              </span>
            ) : (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => apply(i)}>
                {busy === i ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                Änderung übernehmen
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
