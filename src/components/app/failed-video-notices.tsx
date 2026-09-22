"use client";

import { AlertCircle, X } from "lucide-react";
import { dismissVideoJob, useDismissedVideoJobs } from "@/lib/dismissed-video-jobs";
import type { FailedVideoJob } from "@/lib/video-failure";

export type FailedVideoNotice = FailedVideoJob & {
  /** Vorformatiert auf dem Server (z. B. „vor 2 Stunden“) — keine Hydration-Abweichung. */
  when: string;
};

/**
 * Hinweiskarten für gescheiterte Video-Aufträge der letzten 7 Tage (Welle 51) — oben in der
 * Bibliothek. Vorher verschwand die „wird erstellt …“-Karte bei einem Fehlschlag still.
 * „Ausblenden“ merkt sich der Browser (siehe lib/dismissed-video-jobs.ts).
 */
export function FailedVideoNotices({ jobs }: { jobs: FailedVideoNotice[] }) {
  const dismissed = useDismissedVideoJobs();
  // Solange unbekannt ist, was ausgeblendet wurde (Server/erster Render): nichts zeigen.
  if (!dismissed) return null;
  const visible = jobs.filter((j) => !dismissed.includes(j.id));
  if (!visible.length) return null;
  return (
    <div className="mb-4 space-y-2" data-testid="failed-video-notices">
      {visible.map((j) => (
        <div
          key={j.id}
          role="status"
          data-testid="failed-video-notice"
          className="flex items-start gap-3 rounded-card border-2 border-amber/40 bg-amber-soft px-4 py-3"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-text" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-ink">
              Video „{j.title}“ konnte nicht verarbeitet werden – {j.reason}. Bitte erneut aufnehmen.
            </p>
            <p className="text-xs font-semibold text-muted-foreground">{j.when}</p>
          </div>
          <button
            type="button"
            onClick={() => dismissVideoJob(j.id)}
            className="-my-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-extrabold text-ink-2 transition-colors hover:bg-card"
          >
            <X className="size-3.5" aria-hidden />
            Ausblenden
          </button>
        </div>
      ))}
    </div>
  );
}
