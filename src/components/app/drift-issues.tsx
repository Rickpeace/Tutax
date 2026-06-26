"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyDriftSuggestions } from "@/app/app/alerts/actions";

type Issue = { step?: string; problem?: string; suggestion?: string; applied?: boolean };

export function DriftIssues({ alertId, issues }: { alertId: string; issues: Issue[] }) {
  // Positionen nach Schritt gruppieren (mehrere Korrekturen für denselben Schritt zusammen).
  const groups = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().replace(/^\s*\d+[.)]\s*/, "").trim();
    const list: { key: string; step?: string; items: { issue: Issue; index: number }[] }[] = [];
    issues.forEach((issue, index) => {
      const key = norm(issue.step ?? "") || `__${index}`;
      let g = list.find((x) => x.key === key);
      if (!g) {
        g = { key, step: issue.step, items: [] };
        list.push(g);
      }
      g.items.push({ issue, index });
    });
    return list;
  }, [issues]);

  const [applied, setApplied] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, g.items.every((i) => i.issue.applied)])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const apply = (g: { key: string; items: { index: number }[] }) => {
    setBusy(g.key);
    start(async () => {
      try {
        const r = await applyDriftSuggestions(alertId, g.items.map((i) => i.index));
        setApplied((p) => ({ ...p, [g.key]: true }));
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
      {groups.map((g) => (
        <li key={g.key} className="rounded-lg border border-line-2 bg-muted/40 p-2.5 text-sm">
          {g.step && (
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.step}</div>
          )}
          <div className="mt-0.5 space-y-1.5">
            {g.items.map(({ issue }, k) => (
              <div key={k}>
                {issue.problem && (
                  <div className="text-ink-2">
                    <span className="font-semibold text-no">Problem:</span> {issue.problem}
                  </div>
                )}
                {issue.suggestion && (
                  <div className="text-ink-2">
                    <span className="font-semibold text-yes">Vorschlag:</span> {issue.suggestion}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2">
            {applied[g.key] ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-yes">
                <Check className="size-3.5" /> Übernommen
              </span>
            ) : (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => apply(g)}>
                {busy === g.key ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                {g.items.length > 1 ? `Alle ${g.items.length} übernehmen` : "Änderung übernehmen"}
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
