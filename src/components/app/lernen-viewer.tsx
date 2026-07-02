"use client";

import type { Step, StepBranch } from "@/lib/types";
import { Wizard } from "@/components/viewer/wizard";
import { markCompleted, unmarkCompleted } from "@/app/app/lernen/actions";

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
      onComplete={() => markCompleted(tutorialId)}
      onUncomplete={() => unmarkCompleted(tutorialId)}
    />
  );
}
