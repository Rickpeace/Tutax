"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyStepTexts,
  suggestStepTextImprovements,
  type StepTextSuggestion,
} from "@/app/app/tutorials/[id]/actions";
import type { Step } from "@/lib/types";

/** Ereignis, mit dem der Editor-Kopf („…“-Menü) den Dialog im Ablauf öffnet. */
export const IMPROVE_TEXTS_EVENT = "steply:improve-texts";

/** Tiptap-Dokument aus einem Absatz (wie mkBody auf dem Server). */
function docOf(text: string) {
  const t = text.trim();
  return { type: "doc", content: [{ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] }] };
}

type Phase = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: StepTextSuggestion[]; capped: boolean };

/**
 * „Texte mit KI verbessern“ (09/2026): holt Vorschläge (nichts wird gespeichert), zeigt je Schritt
 * alt → neu mit Häkchen (Standard: alle an); „Übernehmen“ speichert, der Toast bietet „Rückgängig“
 * (stellt die alten Titel/Texte samt Formatierung wieder her).
 */
export function ImproveTextsDialog({
  tutorialId,
  open,
  onOpenChange,
  steps,
  onApplied,
}: {
  tutorialId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: Step[];
  /** Lokalen Stand übernehmen (optimistisch): je Schritt neuer Titel + ggf. neuer Body. */
  onApplied: (patches: { stepId: string; title: string; body?: unknown }[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const run = useRef(0);
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  // Schließen setzt den Dialog auf „lädt“ zurück — beim nächsten Öffnen startet ein frischer Lauf.
  const close = () => {
    run.current += 1; // späte Antworten eines alten Laufs verwerfen
    setPhase({ kind: "loading" });
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;
    const my = ++run.current;
    suggestStepTextImprovements(tutorialId).then(
      (res) => {
        if (my !== run.current) return;
        if (!res.ok) return setPhase({ kind: "error", message: res.error });
        setChecked(Object.fromEntries(res.items.map((it) => [it.stepId, true])));
        setPhase({ kind: "ready", items: res.items, capped: res.capped });
      },
      () => {
        if (my !== run.current) return;
        setPhase({ kind: "error", message: "Die Vorschläge konnten nicht geladen werden. Es wurde nichts geändert." });
      },
    );
  }, [open, tutorialId]);

  const items = phase.kind === "ready" ? phase.items : [];
  const selected = items.filter((it) => checked[it.stepId]);

  async function apply() {
    if (!selected.length) return;
    // Alte Stände VOR dem Speichern sichern (für „Rückgängig“, inkl. formatiertem Text).
    const byId = new Map(stepsRef.current.map((s) => [s.id, s]));
    const undo = selected.map((it) => {
      const s = byId.get(it.stepId);
      return { stepId: it.stepId, title: s?.title ?? it.oldTitle, body: s ? (s.body ?? null) : docOf(it.oldBody) };
    });
    const patches = selected.map((it) =>
      it.newBody === null
        ? { stepId: it.stepId, title: it.newTitle }
        : { stepId: it.stepId, title: it.newTitle, body: it.newBody },
    );
    setSaving(true);
    try {
      const res = await applyStepTexts(tutorialId, patches);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onApplied(patches.map((p) => ("body" in p ? { ...p, body: docOf(p.body as string) } : p)));
      close();
      toast.success(`${res.count} ${res.count === 1 ? "Schritt" : "Schritte"} verbessert`, {
        duration: 10_000,
        action: {
          label: "Rückgängig",
          onClick: async () => {
            const back = await applyStepTexts(tutorialId, undo).catch(() => null);
            if (!back || !back.ok) {
              toast.error(back?.error ?? "Rückgängig ist fehlgeschlagen. Bitte erneut versuchen.");
              return;
            }
            onApplied(undo);
            toast.success("Alte Texte wiederhergestellt");
          },
        },
      });
    } catch {
      toast.error("Nicht gespeichert. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) close(); }}>
      <DialogContent className="sm:max-w-2xl" data-testid="improve-texts-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Texte mit KI verbessern
          </DialogTitle>
          <DialogDescription>
            Die KI formuliert Titel und Texte natürlicher. Beschriftungen von Knöpfen bleiben
            wörtlich, eingegebene Werte werden nicht an die KI gesendet. Wählen Sie, was Sie übernehmen möchten.
          </DialogDescription>
        </DialogHeader>

        {phase.kind === "loading" && (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" data-testid="improve-texts-loading">
            <Loader2 className="size-4 animate-spin" /> Die KI formuliert die Texte …
          </p>
        )}

        {phase.kind === "error" && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="improve-texts-error">
            {phase.message}
          </p>
        )}

        {phase.kind === "ready" && items.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground" data-testid="improve-texts-empty">
            Die Texte sind schon gut – die KI hat keine Verbesserungen gefunden.
          </p>
        )}

        {phase.kind === "ready" && items.length > 0 && (
          <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1" data-testid="improve-texts-list">
            {items.map((it) => (
              <li key={it.stepId}>
                <label className="flex cursor-pointer gap-3 rounded-lg border-2 border-line bg-card p-3 has-checked:border-primary/40">
                  <input
                    type="checkbox"
                    checked={!!checked[it.stepId]}
                    onChange={(e) => setChecked((c) => ({ ...c, [it.stepId]: e.target.checked }))}
                    className="mt-1 size-4 shrink-0 accent-primary"
                    aria-label={`Vorschlag für „${it.newTitle}“ übernehmen`}
                  />
                  <span className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
                    <span className="min-w-0 text-muted-foreground">
                      <span className="block break-words font-semibold">{it.oldTitle || "Ohne Titel"}</span>
                      {it.oldBody && <span className="block break-words text-xs">{it.oldBody}</span>}
                    </span>
                    <ArrowRight className="hidden size-4 text-muted-foreground sm:mt-0.5 sm:block" aria-hidden />
                    <span className="min-w-0 text-ink">
                      <span className="block break-words font-semibold">{it.newTitle}</span>
                      {it.newBody !== null ? (
                        it.newBody && <span className="block break-words text-xs text-ink-2">{it.newBody}</span>
                      ) : (
                        it.oldBody && <span className="block break-words text-xs text-ink-2">Text bleibt unverändert</span>
                      )}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {phase.kind === "ready" && phase.capped && (
          <p className="text-xs text-muted-foreground">Es werden nur die ersten 40 Schritte berücksichtigt.</p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close} disabled={saving}>
            {phase.kind === "ready" && items.length > 0 ? "Abbrechen" : "Schließen"}
          </Button>
          {phase.kind === "ready" && items.length > 0 && (
            <Button onClick={apply} disabled={saving || selected.length === 0} data-testid="improve-texts-apply">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {selected.length === items.length ? "Übernehmen" : `${selected.length} übernehmen`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
