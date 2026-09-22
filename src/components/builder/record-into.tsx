"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, CheckCircle2, ArrowRight, Crosshair } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRecorderExtension } from "@/lib/use-recorder-extension";

// „Ab hier mit Extension aufnehmen" (Welle 27): der Builder öffnet diesen Dialog an einem
// Einfügepunkt (+ zwischen Schritten / Ast einer Verzweigung). Bei installierter Extension
// öffnet ein Klick die Aufnahme-Seitenleiste UND übergibt Kontext (Tutorial + Stelle) per
// window.postMessage — content.js reicht es (origin-gebunden) an die Extension weiter, die
// die Aufnahme beim Fertigstellen an GENAU dieser Stelle einhängt. Nicht installiert →
// Link auf die Einrichtungs-Seite in der App (Einstellungen → Steply-Erweiterung, gleicher Tab).
// Muster: components/app/new-tutorial-button.tsx (Sofort-Anleitung-Karte).

/** Ziel-Anker im Ziel-Tutorial (genau EIN Feld gesetzt). */
export type RecordAnchor = { afterStepId: string } | { branchId: string };
/** Was der Builder an den Dialog übergibt: Anker + menschlich lesbare Beschriftung. */
export type RecordTarget = { anchor: RecordAnchor; label: string };

export function RecordIntoDialog({
  tutorialId,
  target,
  onOpenChange,
}: {
  tutorialId: string;
  /** Gesetzt = Dialog offen; null = geschlossen. */
  target: RecordTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { installed, version } = useRecorderExtension();
  // Nach dem Klick kurz den „Seitenleiste geöffnet"-Hinweis zeigen (analog zur
  // Sofort-Anleitung-Karte). Reset beim Schließen — der Dialog ist modal, ein anderer
  // Einfügepunkt kann erst nach dem Schließen gewählt werden (kein stale Hinweis).
  const [requested, setRequested] = useState(false);

  const isInstalled = installed === true;

  const startRecording = () => {
    if (!target) return;
    // Klick-Geste der Seite → content.js → background.js → sidePanel.open() + pendingTarget.
    // Muss im selben Klick passieren (origin-gebunden wie das Pairing / Panel-Öffnen).
    window.postMessage(
      {
        __steply: true,
        type: "steply-record-into",
        target: { tutorialId, anchor: target.anchor },
        label: target.label,
      },
      window.location.origin,
    );
    setRequested(true);
  };

  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o) {
          setRequested(false);
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-primary">
              <Crosshair className="size-4" />
            </span>
            Ab hier aufnehmen
          </DialogTitle>
        </DialogHeader>

        {target && (
          <p className="text-sm text-ink-2">
            Die Aufnahme wird eingefügt:{" "}
            <strong className="font-bold text-ink">{target.label}</strong>.
          </p>
        )}

        {isInstalled ? (
          <button
            type="button"
            onClick={startRecording}
            className="mt-1 block w-full rounded-xl border-2 border-primary/25 bg-accent/40 p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent/60"
          >
            <span className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Zap className="size-5" />
              </span>
              <span className="font-bold text-ink">Seitenleiste öffnen &amp; aufnehmen</span>
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-line-2 px-2 py-0.5 text-xs font-bold text-ink">
                <CheckCircle2 className="size-3 text-primary" /> Installiert
                {version ? " (v" + version + ")" : ""}
              </span>
            </span>
            <span className="mt-2 block text-xs text-ink-2">
              {requested
                ? "Seitenleiste geöffnet — rufen Sie jetzt die Zielseite auf und klicken Sie Ihren " +
                  "Ablauf durch. Beim Fertigstellen landen die Schritte an dieser Stelle. (Nichts " +
                  "passiert? Klicken Sie oben rechts auf das Steply-Symbol oder aktualisieren Sie die " +
                  "Steply-Erweiterung.)"
                : "Klicken, um die Aufnahme-Seitenleiste zu öffnen — dann Zielseite aufrufen und " +
                  "losklicken; die Schritte werden an dieser Stelle eingefügt."}
            </span>
          </button>
        ) : installed === false ? (
          <Link
            href="/app/settings/erweiterung"
            onClick={() => onOpenChange(false)}
            className="mt-1 flex items-center gap-3 rounded-xl border-2 border-dashed border-primary/30 bg-card p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent/30"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
              <Zap className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block font-bold text-ink">Steply-Erweiterung nötig</span>
              <span className="block text-xs text-muted-foreground">
                Zum Aufnehmen in diese Anleitung installieren Sie die Steply-Erweiterung.
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-primary" />
          </Link>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Steply-Erweiterung wird erkannt …</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
