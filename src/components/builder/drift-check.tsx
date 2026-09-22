"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DriftIssues } from "@/components/app/drift-issues";

type Issue = { step?: string; problem?: string; suggestion?: string };
type Found = { issues: Issue[]; alertId: string | null };

/**
 * „Aktualität prüfen“ (Editor-Kopf, „…“-Menü): kurzer Ergebnis-Toast (eine Zeile) — bei
 * Abweichungen mit „Details ansehen“, das die Befunde in einem Dialog zeigt (dort lassen
 * sich Vorschläge direkt übernehmen). `dialog` einmal rendern.
 */
export function useDriftCheck(tutorialId: string) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [found, setFound] = useState<Found | null>(null);
  const [open, setOpen] = useState(false);

  function run() {
    start(async () => {
      try {
        const res = await fetch(`/api/tutorials/${tutorialId}/check`, { method: "POST" });
        const data = await res.json();
        if (data.configured === false) {
          toast.message(data.message);
          return;
        }
        // Cooldown (429): keine echte Fehlermeldung, nur ein Hinweis.
        if (res.status === 429 || data.cooldown) {
          toast.message(data.error ?? "Zuletzt kürzlich geprüft – bitte warten.");
          return;
        }
        if (data.error) {
          toast.error(data.error);
          return;
        }
        if (data.compared === 0) {
          toast.message("Keine Screenshots zum Vergleichen");
          return;
        }
        const issues: Issue[] = Array.isArray(data.issues) ? data.issues : [];
        if (data.is_stale && issues.length > 0) {
          setFound({ issues, alertId: typeof data.alert_id === "string" ? data.alert_id : null });
          toast(
            issues.length === 1
              ? "1 mögliche Abweichung gefunden"
              : `${issues.length} mögliche Abweichungen gefunden`,
            {
              id: "drift-result",
              duration: 12_000,
              action: { label: "Details ansehen", onClick: () => setOpen(true) },
            },
          );
        } else {
          setFound(null);
          toast.success("Sieht aktuell aus", { id: "drift-result" });
        }
        router.refresh(); // Glocke/Status aktualisieren
      } catch {
        toast.error("Prüfung fehlgeschlagen");
      }
    });
  }

  const closeDialog = () => {
    setOpen(false);
    router.refresh(); // übernommene Vorschläge im Ablauf zeigen
  };

  const dialog = (
    <Dialog
      open={open && found !== null}
      onOpenChange={(o) => {
        if (!o) closeDialog();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" data-testid="drift-details">
        <DialogHeader>
          <DialogTitle>Mögliche Abweichungen</DialogTitle>
          <DialogDescription>
            Die KI hat Titel und Erklärtext jedes Schritts mit seinem Screenshot verglichen.
            Bitte kurz prüfen – nicht jeder Hinweis muss zutreffen.
          </DialogDescription>
        </DialogHeader>
        {found?.alertId ? (
          <DriftIssues alertId={found.alertId} issues={found.issues} />
        ) : (
          <ul className="space-y-2">
            {found?.issues.map((it, i) => (
              <li key={i} className="rounded-xl border-2 border-line-2 bg-line-2/40 p-2.5 text-sm">
                {it.step && (
                  <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{it.step}</div>
                )}
                {it.problem && <div className="text-ink-2">{it.problem}</div>}
                {it.suggestion && (
                  <div className="text-ink-2">
                    <span className="font-semibold text-yes">Vorschlag:</span> {it.suggestion}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <Button variant="ghost" onClick={closeDialog}>
            Schließen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { pending, run, dialog };
}
