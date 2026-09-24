"use client";

import type { Step, StepBranch } from "@/lib/types";
import { Wizard } from "@/components/viewer/wizard";
import { toast } from "sonner";
import { markCompleted, unmarkCompleted } from "@/app/app/lernen/actions";
import { errorText, unwrap } from "@/lib/action-error";

/**
 * Client-Wrapper: bindet die Schulungsnachweis-Actions an die konkrete Tutorial-ID
 * und rendert den vorhandenen Wizard im internen Modus (kein öffentliches Feedback).
 */
export function LernenViewer({
  tutorialId,
  rootId,
  steps,
  branches,
  imageUrls,
  completion,
}: {
  tutorialId: string;
  rootId: string | null;
  steps: Step[];
  branches: StepBranch[];
  imageUrls: Record<string, string>;
  completion: { completed: boolean; completedAt: string | null };
}) {
  return (
    <Wizard
      rootId={rootId}
      steps={steps}
      branches={branches}
      imageUrls={imageUrls}
      internalMode
      completion={completion}
      onComplete={async () => {
        try {
          unwrap(await markCompleted(tutorialId));
        } catch (e) {
          // Vorher sprang der Haken stumm zurück (Runde 5) — jetzt mit Grund.
          toast.error(errorText(e, "Nicht gespeichert – bitte versuchen Sie es erneut."));
          throw e;
        }
      }}
      onUncomplete={async () => {
        try {
          await unmarkCompleted(tutorialId);
        } catch (e) {
          toast.error(errorText(e, "Nicht gespeichert – bitte versuchen Sie es erneut."));
          throw e;
        }
      }}
    />
  );
}
