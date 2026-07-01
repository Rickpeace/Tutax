"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Check, Image as ImageIcon, X } from "lucide-react";
import type { Step, StepBranch } from "@/lib/types";
import { ViewerImage } from "@/components/viewer/viewer-image";
import { RichTextView } from "@/components/viewer/rich-text-view";

export function Wizard({
  rootId,
  steps,
  branches,
  imageUrls,
  placeholders = false,
}: {
  rootId: string | null;
  steps: Step[];
  branches: StepBranch[];
  imageUrls: Record<string, string>;
  placeholders?: boolean;
}) {
  const stepById = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);
  const branchesByStep = useMemo(() => {
    const m = new Map<string, StepBranch[]>();
    for (const b of branches) {
      const list = m.get(b.step_id) ?? [];
      list.push(b);
      m.set(b.step_id, list);
    }
    for (const l of m.values()) l.sort((a, b) => a.position - b.position);
    return m;
  }, [branches]);

  const [cur, setCur] = useState<string | null>(rootId);
  const [history, setHistory] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const titleRef = useRef<HTMLHeadingElement>(null);

  // Linear = keine Verzweigungen: kein Schritt ist eine Entscheidung UND kein
  // Schritt hat mehr als einen Ausgang. Nur dann ist „Schritt x von y" ehrlich.
  const linearTotal = useMemo(() => {
    const linear =
      !steps.some((s) => s.is_decision) &&
      [...branchesByStep.values()].every((b) => b.length <= 1);
    if (!linear) return null;
    // Länge des Pfades ab root entlang des einzigen Ausgangs zählen.
    let count = 0;
    let id: string | null = rootId;
    const seen = new Set<string>();
    while (id != null && stepById.has(id) && !seen.has(id)) {
      seen.add(id);
      count++;
      id = branchesByStep.get(id)?.[0]?.target_step_id ?? null;
    }
    return count > 0 ? count : null;
  }, [steps, branchesByStep, stepById, rootId]);

  const go = (target: string | null) => {
    setHistory((h) => (cur != null ? [...h, cur] : h));
    setCur(target);
  };
  const back = () =>
    setHistory((h) => {
      if (!h.length) return h;
      const n = [...h];
      setCur(n.pop() ?? rootId);
      return n;
    });
  const restart = () => {
    setCur(rootId);
    setHistory([]);
  };

  const step = cur != null ? stepById.get(cur) : null;

  // Nach Schrittwechsel Fokus auf den Schritt-Titel (A11y: Screenreader/Tastatur).
  useEffect(() => {
    if (step) titleRef.current?.focus();
  }, [cur, step]);

  // Lightbox per Escape schließen.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  return (
    <div
      data-tx="step"
      className="w-full border bg-white p-4 shadow-[0_10px_40px_rgba(16,21,36,0.08)] sm:p-5"
      style={{
        borderRadius: "var(--brand-radius, 16px)",
        borderColor: "var(--brand-card-border, rgba(16,21,36,0.06))",
        borderWidth: "var(--brand-card-bw, 1px)",
      }}
    >
      {step ? (
        <>
          {linearTotal != null && (
            <div
              data-tx="progress"
              className="mb-3 text-xs font-semibold text-muted-foreground"
            >
              Schritt {history.length + 1} von {linearTotal}
            </div>
          )}
          {imageUrls[step.id] ? (
            <button
              type="button"
              onClick={() => setLightbox(imageUrls[step.id])}
              aria-label="Bild vergrößern"
              className="mb-4 block w-full cursor-zoom-in"
            >
              <ViewerImage url={imageUrls[step.id]} highlights={step.highlights ?? []} />
            </button>
          ) : placeholders ? (
            <div className="mb-4">
              <StepPlaceholder title={step.title} />
            </div>
          ) : null}
          {step.title && (
            <h2
              ref={titleRef}
              tabIndex={-1}
              data-tx="step-title"
              className="text-lg font-bold outline-none sm:text-xl"
              style={{
                color: "var(--brand-title, var(--brand-ink))",
                fontFamily: "var(--brand-font-heading)",
                fontWeight: "var(--brand-heading-weight, 700)",
              }}
            >
              {step.title}
            </h2>
          )}
          <div data-tx="step-body" className="mt-1.5 text-sm text-ink-2">
            <RichTextView doc={step.body} />
          </div>

          <div className="mt-5">
            {step.is_decision ? (
              <div className="flex flex-col gap-2">
                {(branchesByStep.get(step.id) ?? []).map((b) => (
                  <button
                    key={b.id}
                    data-tx="btn"
                    onClick={() => go(b.target_step_id)}
                    className="w-full border-2 bg-white px-4 py-3 text-base font-bold transition-transform active:translate-y-px"
                    style={{
                      borderColor: b.color ?? "var(--brand-accent-strong, var(--brand-accent))",
                      color: b.color ?? "var(--brand-accent-strong, var(--brand-accent))",
                      borderRadius: "var(--brand-btn-radius, 12px)",
                    }}
                  >
                    {b.label || "Weiter"}
                  </button>
                ))}
              </div>
            ) : (
              <NextButton
                branches={branchesByStep.get(step.id) ?? []}
                onNext={(t) => go(t)}
              />
            )}

            {history.length > 0 && (
              <button
                onClick={back}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold text-muted-foreground"
              >
                <ChevronLeft className="size-4" /> Zurück
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center py-8 text-center">
          <div
            className="flex size-14 items-center justify-center rounded-full"
            style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg, #fff)" }}
          >
            <Check className="size-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-[var(--brand-ink)]">Fertig!</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sie haben die Anleitung abgeschlossen.
          </p>
          <button
            onClick={restart}
            className="mt-5 flex items-center gap-1.5 px-5 py-3 text-base font-semibold"
            style={{
              background: "var(--brand-accent)",
              color: "var(--brand-accent-fg, #fff)",
              borderRadius: "var(--brand-btn-radius, 12px)",
            }}
          >
            <RotateCcw className="size-4" /> Von vorne
          </button>
          {history.length > 0 && (
            <button
              onClick={back}
              className="mt-2 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-muted-foreground"
            >
              <ChevronLeft className="size-4" /> Zurück
            </button>
          )}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Bildvorschau"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-h-[95vh] max-w-[95vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Schließen"
            className="fixed right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-lg transition-transform hover:scale-105"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Platzhalter-Grafik für Standard-Templates ohne echten Screenshot. */
function StepPlaceholder({ title }: { title: string | null }) {
  return (
    <div
      className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 border border-dashed text-center"
      style={{
        borderColor: "color-mix(in srgb, var(--brand-accent) 35%, transparent)",
        background: "color-mix(in srgb, var(--brand-accent) 7%, white)",
        borderRadius: "var(--brand-radius, 12px)",
      }}
    >
      <ImageIcon className="size-8" style={{ color: "var(--brand-accent)" }} />
      <span className="max-w-[80%] text-xs font-medium text-muted-foreground">
        {title?.trim() || "Screenshot folgt"}
      </span>
    </div>
  );
}

function NextButton({
  branches,
  onNext,
}: {
  branches: StepBranch[];
  onNext: (target: string | null) => void;
}) {
  const target = branches[0]?.target_step_id ?? null;
  const hasNext = branches.length > 0 && target != null;
  return (
    <button
      data-tx="btn"
      onClick={() => onNext(target)}
      className="flex w-full items-center justify-center gap-2 px-4 py-3 text-base font-semibold transition-transform active:translate-y-px"
      style={{
        background: "var(--brand-accent)",
        color: "var(--brand-accent-fg, #fff)",
        borderRadius: "var(--brand-btn-radius, 12px)",
      }}
    >
      {hasNext ? (
        <>
          Weiter <ChevronRight className="size-5" />
        </>
      ) : (
        <>
          Fertig <Check className="size-5" />
        </>
      )}
    </button>
  );
}
