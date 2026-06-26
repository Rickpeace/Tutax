"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Flow } from "@/components/builder/flow";
import { StepPanel } from "@/components/builder/step-panel";
import { buildRenderTree } from "@/lib/builder/tree";
import type { Step, StepBranch, Highlight } from "@/lib/types";
import {
  addStep,
  updateStep,
  setDecision,
  addBranch,
  updateBranch,
  deleteBranch,
  deleteStep,
} from "@/app/app/tutorials/[id]/actions";
import { YES, NO } from "@/lib/builder/constants";

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

function mkStep(id: string, tutorialId: string, position: number): Step {
  return {
    id,
    tutorial_id: tutorialId,
    chapter_id: null,
    title: "Neuer Schritt",
    body: null,
    image_path: null,
    image_width: null,
    image_height: null,
    highlights: [],
    position,
    is_decision: false,
    created_at: new Date().toISOString(),
  };
}

export function Builder({
  tutorialId,
  steps: initialSteps,
  branches: initialBranches,
  rootStepId: initialRoot,
}: {
  tutorialId: string;
  steps: Step[];
  branches: StepBranch[];
  rootStepId: string | null;
}) {
  const router = useRouter();
  const mobile = useIsMobile();

  const [steps, setSteps] = useState(initialSteps);
  const [branches, setBranches] = useState(initialBranches);
  const [rootId, setRootId] = useState(initialRoot);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Nur bei echtem Server-Reload (router.refresh / Navigation) resynchronisieren.
  useEffect(() => {
    setSteps(initialSteps);
    setBranches(initialBranches);
    setRootId(initialRoot);
  }, [initialSteps, initialBranches, initialRoot]);

  const persist = useCallback(
    (fn: () => Promise<unknown>) => {
      Promise.resolve()
        .then(fn)
        .catch(() => {
          toast.error("Speichern fehlgeschlagen – lade neu …");
          router.refresh();
        });
    },
    [router],
  );

  // Explizites Speichern (Titel/Text) – kein Auto-Save mehr bei jedem Tastendruck.
  const dirtyRef = useRef(false);
  const saveStep = useCallback(
    (id: string, patch: { title: string; body: unknown }) => {
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      persist(() => updateStep(id, patch));
    },
    [persist],
  );

  const handleAddStep = useCallback(() => {
    const id = crypto.randomUUID();
    const maxPos = steps.reduce((m, s) => Math.max(m, s.position), 0);
    const position = maxPos + 1;
    const title = "Neuer Schritt";
    const newStep: Step = {
      id,
      tutorial_id: tutorialId,
      chapter_id: null,
      title,
      body: null,
      image_path: null,
      image_width: null,
      image_height: null,
      highlights: [],
      position,
      is_decision: false,
      created_at: new Date().toISOString(),
    };
    // Nur der ALLERERSTE Schritt wird root. Sonst NIE einen zweiten root setzen
    // (verhinderte den Bug: verwaiste Schritte, wenn rootId kurz null war).
    const setRoot = steps.length === 0;
    setSteps((prev) => [...prev, newStep]);

    let wire: { branchId: string; fromStepId: string } | null = null;
    if (setRoot) {
      setRootId(id);
    } else {
      // Immer an einen vorhandenen Schritt anhängen: bevorzugt ein Blatt,
      // sonst den mit höchster Position -> neuer Schritt verwaist nie.
      const hasOut = new Set(branches.map((b) => b.step_id));
      const fromStep =
        steps.filter((s) => !hasOut.has(s.id)).sort((a, b) => b.position - a.position)[0] ??
        [...steps].sort((a, b) => b.position - a.position)[0];
      if (fromStep) {
        const branchId = crypto.randomUUID();
        wire = { branchId, fromStepId: fromStep.id };
        setBranches((prev) => [
          ...prev,
          {
            id: branchId,
            step_id: fromStep.id,
            label: null,
            color: null,
            target_step_id: id,
            position: 0,
            created_at: "",
          },
        ]);
      }
    }
    persist(() => addStep(tutorialId, { id, title, position }, setRoot, wire));
    setSelectedId(id);
  }, [steps, branches, rootId, tutorialId, persist]);

  // §7.4: Schritt gezielt in einen Ast einfügen (B → N → altes Ziel).
  function insertIntoBranch(branchId: string) {
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) return;
    const id = crypto.randomUUID();
    const weiterId = crypto.randomUUID();
    const position = steps.reduce((m, s) => Math.max(m, s.position), 0) + 1;
    const oldTarget = branch.target_step_id;
    setSteps((prev) => [...prev, mkStep(id, tutorialId, position)]);
    setBranches((prev) =>
      prev
        .map((b) => (b.id === branchId ? { ...b, target_step_id: id } : b))
        .concat({
          id: weiterId,
          step_id: id,
          label: null,
          color: null,
          target_step_id: oldTarget,
          position: 0,
          created_at: "",
        }),
    );
    persist(async () => {
      await addStep(tutorialId, { id, title: "Neuer Schritt", position }, false, null);
      await updateBranch(branchId, { target_step_id: id });
      await addBranch({
        id: weiterId,
        step_id: id,
        label: null,
        color: null,
        target_step_id: oldTarget,
        position: 0,
      });
    });
    setSelectedId(id);
  }

  // §7.4: Schritt nach einer Karte einfügen. Linear -> dazwischen; Blatt -> anhängen.
  function insertAfter(stepId: string) {
    const own = branches
      .filter((b) => b.step_id === stepId)
      .sort((a, b) => a.position - b.position);
    if (own.length) {
      insertIntoBranch(own[0].id);
      return;
    }
    const id = crypto.randomUUID();
    const weiterId = crypto.randomUUID();
    const position = steps.reduce((m, s) => Math.max(m, s.position), 0) + 1;
    setSteps((prev) => [...prev, mkStep(id, tutorialId, position)]);
    setBranches((prev) => [
      ...prev,
      {
        id: weiterId,
        step_id: stepId,
        label: null,
        color: null,
        target_step_id: id,
        position: 0,
        created_at: "",
      },
    ]);
    persist(() =>
      addStep(
        tutorialId,
        { id, title: "Neuer Schritt", position },
        false,
        { branchId: weiterId, fromStepId: stepId },
      ),
    );
    setSelectedId(id);
  }

  const handleSetDecision = useCallback(
    (stepId: string, isDecision: boolean) => {
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, is_decision: isDecision } : s)),
      );
      setBranches((prev) => {
        const own = prev
          .filter((b) => b.step_id === stepId)
          .sort((a, b) => a.position - b.position);
        if (!own.length) return prev;
        const firstId = own[0].id;
        if (isDecision) {
          return prev.map((b) =>
            b.id === firstId ? { ...b, label: "Ja", color: YES } : b,
          );
        }
        const restIds = new Set(own.slice(1).map((b) => b.id));
        return prev
          .filter((b) => !restIds.has(b.id))
          .map((b) => (b.id === firstId ? { ...b, label: null, color: null } : b));
      });
      persist(() => setDecision(stepId, isDecision));
    },
    [persist],
  );

  const handleAddBranch = useCallback(
    (stepId: string) => {
      const id = crypto.randomUUID();
      const own = branches.filter((b) => b.step_id === stepId);
      const count = own.length;
      const label = count === 0 ? "Ja" : count === 1 ? "Nein" : "Antwort";
      const color = count === 0 ? YES : count === 1 ? NO : null;
      const position = own.reduce((m, b) => Math.max(m, b.position), -1) + 1;
      setBranches((prev) => [
        ...prev,
        { id, step_id: stepId, label, color, target_step_id: null, position, created_at: "" },
      ]);
      persist(() =>
        addBranch({ id, step_id: stepId, label, color, target_step_id: null, position }),
      );
    },
    [branches, persist],
  );

  const handleUpdateBranch = useCallback(
    (
      branchId: string,
      patch: { label?: string; target_step_id?: string | null; color?: string | null },
    ) => {
      setBranches((prev) =>
        prev.map((b) => (b.id === branchId ? { ...b, ...patch } : b)),
      );
      persist(() => updateBranch(branchId, patch));
    },
    [persist],
  );

  const handleDeleteBranch = useCallback(
    (branchId: string) => {
      setBranches((prev) => prev.filter((b) => b.id !== branchId));
      persist(() => deleteBranch(branchId));
    },
    [persist],
  );

  const handleDeleteStep = useCallback(
    (stepId: string) => {
      const step = steps.find((s) => s.id === stepId);
      const wasRoot = rootId === stepId;
      let nextTarget: string | null = null;
      if (step && !step.is_decision) {
        const out = branches
          .filter((b) => b.step_id === stepId)
          .sort((a, b) => a.position - b.position)[0];
        nextTarget = out?.target_step_id ?? null;
      }
      setBranches((prev) =>
        prev
          .filter((b) => b.step_id !== stepId)
          .map((b) =>
            b.target_step_id === stepId ? { ...b, target_step_id: nextTarget } : b,
          ),
      );
      setSteps((prev) => prev.filter((s) => s.id !== stepId));
      if (wasRoot) setRootId(nextTarget);
      setSelectedId(null);
      persist(() => deleteStep(tutorialId, stepId, nextTarget, wasRoot));
    },
    [steps, branches, rootId, tutorialId, persist],
  );

  const setStepImage = useCallback(
    (
      stepId: string,
      img: {
        image_path: string | null;
        image_width: number | null;
        image_height: number | null;
      },
    ) => {
      setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...img } : s)));
      persist(() => updateStep(stepId, img));
    },
    [persist],
  );

  const setStepHighlights = useCallback(
    (stepId: string, highlights: Highlight[]) => {
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, highlights } : s)),
      );
      persist(() => updateStep(stepId, { highlights }));
    },
    [persist],
  );

  const tree = useMemo(
    () => buildRenderTree(steps, branches, rootId),
    [steps, branches, rootId],
  );
  const selectedStep = steps.find((s) => s.id === selectedId) ?? null;
  const selectedBranches = branches.filter((b) => b.step_id === selectedId);

  return (
    <>
      <p className="mb-2 text-sm text-muted-foreground">
        {steps.length} Schritt{steps.length === 1 ? "" : "e"}
      </p>

      {tree ? (
        <div className="rounded-2xl border border-border bg-card/40 p-4 sm:p-5">
          <Flow
            tree={tree}
            selectedId={selectedId}
            onSelect={(id) => {
              if (dirtyRef.current && id !== selectedId && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
              dirtyRef.current = false;
              setSelectedId(id);
            }}
            onInsertAfter={insertAfter}
            onInsertIntoBranch={insertIntoBranch}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            Noch keine Schritte. Legen Sie den ersten Schritt an – er wird zum
            Startpunkt der Anleitung.
          </p>
          <Button className="mt-4" onClick={handleAddStep}>
            <Plus className="size-4" /> Ersten Schritt anlegen
          </Button>
        </div>
      )}

      <Sheet
        open={!!selectedStep}
        onOpenChange={(o) => {
          if (!o) {
            if (dirtyRef.current && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
            dirtyRef.current = false;
            setSelectedId(null);
          }
        }}
      >
        <SheetContent
          side={mobile ? "bottom" : "right"}
          className={
            mobile
              ? "max-h-[85vh] w-full overflow-y-auto"
              : "w-full overflow-y-auto sm:max-w-md"
          }
        >
          <SheetHeader>
            <SheetTitle>Schritt bearbeiten</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-8">
            {selectedStep && (
              <StepPanel
                key={selectedStep.id}
                step={selectedStep}
                tutorialId={tutorialId}
                allSteps={steps}
                branches={selectedBranches}
                onSaveStep={saveStep}
                onDirtyChange={(d) => {
                  dirtyRef.current = d;
                }}
                onSetImage={setStepImage}
                onSetHighlights={setStepHighlights}
                onSetDecision={handleSetDecision}
                onAddBranch={handleAddBranch}
                onUpdateBranch={handleUpdateBranch}
                onDeleteBranch={handleDeleteBranch}
                onDeleteStep={handleDeleteStep}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
