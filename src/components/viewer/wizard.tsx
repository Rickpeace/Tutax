"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Check } from "lucide-react";
import type { Step, StepBranch } from "@/lib/types";
import { ViewerImage } from "@/components/viewer/viewer-image";
import { RichTextView } from "@/components/viewer/rich-text-view";

export function Wizard({
  rootId,
  steps,
  branches,
  imageUrls,
}: {
  rootId: string | null;
  steps: Step[];
  branches: StepBranch[];
  imageUrls: Record<string, string>;
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

  return (
    <div className="w-full max-w-md rounded-2xl border border-black/5 bg-white p-4 shadow-[0_10px_40px_rgba(16,21,36,0.08)] sm:p-5">
      {step ? (
        <>
          {imageUrls[step.id] && (
            <div className="mb-4">
              <ViewerImage url={imageUrls[step.id]} highlights={step.highlights ?? []} />
            </div>
          )}
          {step.title && (
            <h2 className="text-lg font-bold text-[var(--brand-ink)]">{step.title}</h2>
          )}
          <div className="mt-1.5 text-sm text-ink-2">
            <RichTextView doc={step.body} />
          </div>

          <div className="mt-5">
            {step.is_decision ? (
              <div className="flex flex-col gap-2">
                {(branchesByStep.get(step.id) ?? []).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => go(b.target_step_id)}
                    className="w-full rounded-xl border-2 bg-white px-4 py-3 text-base font-bold transition-transform active:translate-y-px"
                    style={{ borderColor: b.color ?? "var(--brand-accent)", color: b.color ?? "var(--brand-accent)" }}
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
            className="flex size-14 items-center justify-center rounded-full text-white"
            style={{ background: "var(--brand-accent)" }}
          >
            <Check className="size-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-[var(--brand-ink)]">Fertig!</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sie haben die Anleitung abgeschlossen.
          </p>
          <button
            onClick={restart}
            className="mt-5 flex items-center gap-1.5 rounded-xl px-5 py-3 text-base font-semibold text-white"
            style={{ background: "var(--brand-accent)" }}
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
      onClick={() => onNext(target)}
      className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold text-white transition-transform active:translate-y-px"
      style={{ background: "var(--brand-accent)" }}
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
