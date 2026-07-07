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
import { RecordIntoDialog, type RecordTarget } from "@/components/builder/record-into";
import { buildRenderTree } from "@/lib/builder/tree";
import type { RenderNode } from "@/lib/builder/tree";
import type { Step, StepBranch, Highlight, StepCondition } from "@/lib/types";

/** Schritt-IDs in tatsächlicher FLUSS-Reihenfolge (Tree-DFS) – für Vor/Zurück im Editor. */
function flattenFlow(node: RenderNode): string[] {
  if (node.type === "merge") return [];
  const ids: string[] = [node.step.id];
  for (const b of node.branches ?? []) ids.push(...flattenFlow(b.child));
  if (node.after) ids.push(...flattenFlow(node.after));
  if (node.next) ids.push(...flattenFlow(node.next));
  return ids;
}
import {
  addStep,
  updateStep,
  setDecision,
  addBranch,
  updateBranch,
  deleteBranch,
  deleteStep,
  setRootStep,
  setStepCondition,
} from "@/app/app/tutorials/[id]/actions";
import { YES, NO } from "@/lib/builder/constants";

function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
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
    page_url: null,
    selector: null,
    condition: null,
    position,
    is_decision: false,
    video_time: null,
    audio_path: null,
    audio_hash: null,
    created_at: new Date().toISOString(),
  };
}

export function Builder({
  tutorialId,
  steps: initialSteps,
  branches: initialBranches,
  rootStepId: initialRoot,
  hasSourceVideo = false,
}: {
  tutorialId: string;
  steps: Step[];
  branches: StepBranch[];
  rootStepId: string | null;
  /** Tutorial hat ein Quell-Video -> „Bild aus Video wählen" in jedem Schritt anbieten. */
  hasSourceVideo?: boolean;
}) {
  const router = useRouter();
  const mobile = useMedia("(max-width: 767px)");
  const wide = useMedia("(min-width: 1024px)"); // ab hier zweispaltig (Editor angedockt)

  const [steps, setSteps] = useState(initialSteps);
  const [branches, setBranches] = useState(initialBranches);
  const [rootId, setRootId] = useState(initialRoot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // "Bild ersetzen" nutzt einen DETERMINISTISCHEN Pfad (image_path bleibt gleich) -> ohne
  // Bust-Zähler bliebe das Flow-Thumbnail (an image_path gebunden) auf dem alten Bild.
  const [imgBust, setImgBust] = useState<Record<string, number>>({});
  // „Ab hier mit Extension aufnehmen" (Welle 27): offener Aufnahme-Ziel-Dialog (oder null).
  const [recordTarget, setRecordTarget] = useState<RecordTarget | null>(null);

  // Zahl der noch nicht bestätigten Schreibvorgänge. Verhindert, dass ein FREMDER
  // Server-Reload (z. B. DriftCheck-Button) laufende optimistische Änderungen zurücksetzt.
  const pending = useRef(0);

  // Nur resynchronisieren, wenn KEIN Write in-flight ist (sonst gingen Branch/Highlight-
  // Optimistik im Fenster bis zum Persist verloren). Nach Abschluss liefert der nächste
  // echte Reload wieder den Server-Stand.
  useEffect(() => {
    if (pending.current > 0) return;
    setSteps(initialSteps);
    setBranches(initialBranches);
    setRootId(initialRoot);
  }, [initialSteps, initialBranches, initialRoot]);

  const persist = useCallback(
    (fn: () => Promise<unknown>) => {
      pending.current += 1;
      const p = Promise.resolve().then(fn);
      p.catch(() => {
        toast.error("Speichern fehlgeschlagen – lade neu …");
        router.refresh();
      }).finally(() => {
        pending.current -= 1;
      });
      return p; // Promise für Aufrufer, die auf den Erfolg warten wollen (saveStep)
    },
    [router],
  );

  // Explizites Speichern (Titel/Text) – kein Auto-Save mehr bei jedem Tastendruck.
  const dirtyRef = useRef(false);
  const saveStep = useCallback(
    async (id: string, patch: { title: string; body: unknown }) => {
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      // await -> wirft bei Fehler, damit der Aufrufer KEINEN Erfolg meldet (Toast/Nav).
      await persist(() => updateStep(id, patch));
    },
    [persist],
  );

  const handleAddStep = useCallback(() => {
    const id = crypto.randomUUID();
    const maxPos = steps.reduce((m, s) => Math.max(m, s.position), 0);
    const position = maxPos + 1;
    const newStep = mkStep(id, tutorialId, position);
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
    persist(() => addStep(tutorialId, { id, title: newStep.title ?? "Neuer Schritt", position }, setRoot, wire));
    setSelectedId(id);
  }, [steps, branches, tutorialId, persist]);

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

  // ── Schritt-Umordnen (Hoch/Runter) ──────────────────────────────────────────
  // Reines Branch-Rewiring: Positionen werden NICHT umgeschrieben (die Fluss-
  // Reihenfolge kommt aus dem Tree). Getauscht wird nur mit dem LINEAREN Nachbarn,
  // und nur wenn der Tausch eindeutig ist (siehe canMove).
  const outgoingOf = useCallback(
    (id: string) => branches.filter((b) => b.step_id === id),
    [branches],
  );
  // Predecessor-Kanten: Branches, deren Ziel dieser Schritt ist.
  const incomingOf = useCallback(
    (id: string) => branches.filter((b) => b.target_step_id === id),
    [branches],
  );

  /**
   * Liefert das eindeutige lineare Paar (A→B) für einen Tausch, oder null wenn
   * nicht eindeutig. Für Richtung "down" ist A=stepId; für "up" wird der eindeutige
   * Vorgänger P gesucht und (A=P, B=stepId) getauscht. Bedingungen (beide Richtungen):
   * weder A noch B ist Entscheidung, beide haben ≤1 ausgehende Kante, und A→B ist
   * die einzige verbindende Nicht-Entscheidungs-Kante.
   */
  const swapPair = useCallback(
    (stepId: string, dir: "up" | "down"): { a: Step; b: Step } | null => {
      const stepById = new Map(steps.map((s) => [s.id, s]));
      const self = stepById.get(stepId);
      if (!self) return null;

      let a: Step | undefined;
      let b: Step | undefined;
      if (dir === "down") {
        a = self;
        const outA = outgoingOf(a.id);
        if (outA.length !== 1 || !outA[0].target_step_id) return null;
        b = stepById.get(outA[0].target_step_id);
      } else {
        b = self;
        // Eindeutiger Vorgänger: genau eine eingehende Kante.
        const inB = incomingOf(b.id);
        if (inB.length !== 1) return null;
        a = stepById.get(inB[0].step_id);
      }
      if (!a || !b || a.id === b.id) return null;

      // Beide dürfen keine Entscheidung sein und höchstens eine ausgehende Kante haben.
      if (a.is_decision || b.is_decision) return null;
      if (outgoingOf(a.id).length > 1 || outgoingOf(b.id).length > 1) return null;
      // A muss über GENAU eine Kante auf B zeigen (die verbindende Kante).
      const aToB = outgoingOf(a.id).filter((br) => br.target_step_id === b.id);
      if (aToB.length !== 1) return null;
      return { a, b };
    },
    [steps, outgoingOf, incomingOf],
  );

  const canMove = useCallback(
    (stepId: string, dir: "up" | "down") => swapPair(stepId, dir) !== null,
    [swapPair],
  );

  const handleMoveStep = useCallback(
    (stepId: string, dir: "up" | "down") => {
      const pair = swapPair(stepId, dir);
      if (!pair) return;
      const { a, b } = pair; // Fluss: Vorgänger → A → B → Nachfolger
      const outA = outgoingOf(a.id).find((br) => br.target_step_id === b.id)!; // A→B
      const outB = outgoingOf(b.id)[0] ?? null; // B→Nachfolger (oder Blatt)
      const succ = outB?.target_step_id ?? null;
      const aIsRoot = rootId === a.id;
      // Vorgänger-Kanten (nur wenn A nicht Wurzel): Kanten, die auf A zeigen → B.
      const preds = aIsRoot ? [] : incomingOf(a.id);
      // Nur relevant, wenn B ein Blatt ist (keine ausgehende Kante) → neue Kante B→A.
      const newBranchId = crypto.randomUUID();

      // ── Optimistischer State ──
      setBranches((prev) => {
        let next = prev;
        // 1) Vorgänger → B statt A.
        if (preds.length) {
          const predIds = new Set(preds.map((p) => p.id));
          next = next.map((br) =>
            predIds.has(br.id) ? { ...br, target_step_id: b.id } : br,
          );
        }
        // 2) A→B wird A→Nachfolger.
        next = next.map((br) =>
          br.id === outA.id ? { ...br, target_step_id: succ } : br,
        );
        // 3) B→Nachfolger wird B→A; falls B Blatt war, neue Kante B→A anlegen.
        if (outB) {
          next = next.map((br) =>
            br.id === outB.id ? { ...br, target_step_id: a.id } : br,
          );
        } else {
          next = [
            ...next,
            {
              id: newBranchId,
              step_id: b.id,
              label: null,
              color: null,
              target_step_id: a.id,
              position: 0,
              created_at: "",
            },
          ];
        }
        return next;
      });
      if (aIsRoot) setRootId(b.id);
      // Auswahl bleibt auf demselben Schritt (stepId), Flow spiegelt die neue Reihenfolge.

      // ── Persist (dieselbe Reihenfolge; existierende Actions) ──
      persist(async () => {
        if (preds.length) {
          for (const p of preds) await updateBranch(p.id, { target_step_id: b.id });
        }
        await updateBranch(outA.id, { target_step_id: succ });
        if (outB) {
          await updateBranch(outB.id, { target_step_id: a.id });
        } else {
          await addBranch({
            id: newBranchId,
            step_id: b.id,
            label: null,
            color: null,
            target_step_id: a.id,
            position: 0,
          });
        }
        if (aIsRoot) await setRootStep(tutorialId, b.id);
      });
    },
    [swapPair, outgoingOf, incomingOf, rootId, tutorialId, persist],
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
      // Thumbnail neu laden lassen, auch wenn der Pfad identisch bleibt.
      setImgBust((m) => ({ ...m, [stepId]: (m[stepId] ?? 0) + 1 }));
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

  // Bedingte Schritte (Welle 42): Ausführ-Bedingung optimistisch setzen + still persistieren.
  const handleSetCondition = useCallback(
    (stepId: string, condition: StepCondition | null) => {
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, condition } : s)),
      );
      persist(() => setStepCondition(stepId, condition));
    },
    [persist],
  );

  const tree = useMemo(
    () => buildRenderTree(steps, branches, rootId),
    [steps, branches, rootId],
  );
  const selectedStep = steps.find((s) => s.id === selectedId) ?? null;
  const selectedBranches = branches.filter((b) => b.step_id === selectedId);

  // Reihenfolge für Vor/Zurück = tatsächliche FLUSS-Reihenfolge (Tree-DFS), nicht die
  // Anlege-Position. Unerreichbare Schritte hängen wir (nach Position) hinten an, damit
  // sie per Navigation trotzdem erreichbar bleiben.
  const ordered = useMemo(() => {
    const flowIds = tree ? flattenFlow(tree) : [];
    const seen = new Set(flowIds);
    const byId = new Map(steps.map((s) => [s.id, s]));
    const inFlow = flowIds.map((id) => byId.get(id)).filter((s): s is Step => !!s);
    const rest = steps.filter((s) => !seen.has(s.id)).sort((a, b) => a.position - b.position);
    return [...inFlow, ...rest];
  }, [tree, steps]);
  const selIndex = selectedId ? ordered.findIndex((s) => s.id === selectedId) : -1;

  // ── „Ab hier mit Extension aufnehmen" (Welle 27) ─────────────────────────────
  // Einen Einfügepunkt in ein Aufnahme-Ziel übersetzen (Anker + menschlich lesbare
  // Beschriftung) und den Aufnahme-Dialog öffnen. Anker-Semantik = exakt das Server-
  // Einfügen: afterStepId hängt eine lineare Kette an, branchId füllt/verlängert einen Ast.
  const recordAfter = useCallback(
    (stepId: string) => {
      const idx = ordered.findIndex((s) => s.id === stepId);
      const step = steps.find((s) => s.id === stepId);
      const n = idx >= 0 ? idx + 1 : step?.position;
      const title = step?.title?.trim();
      const label = title ? `nach Schritt ${n} („${title}“)` : `nach Schritt ${n}`;
      setRecordTarget({ anchor: { afterStepId: stepId }, label });
    },
    [ordered, steps],
  );
  const recordIntoBranch = useCallback(
    (branchId: string) => {
      const branch = branches.find((b) => b.id === branchId);
      const question = branch ? steps.find((s) => s.id === branch.step_id) : null;
      const astLabel = branch?.label?.trim() || "Weiter";
      const qTitle = question?.title?.trim() || "Frage";
      setRecordTarget({ anchor: { branchId }, label: `Ast „${astLabel}“ in „${qTitle}“` });
    },
    [branches, steps],
  );

  const goPrev = useCallback(() => {
    if (selIndex > 0) setSelectedId(ordered[selIndex - 1].id);
  }, [selIndex, ordered]);
  const goNext = useCallback(() => {
    if (selIndex >= 0 && selIndex < ordered.length - 1) setSelectedId(ordered[selIndex + 1].id);
    else handleAddStep(); // am Ende: neuen Schritt anlegen + auswählen
  }, [selIndex, ordered, handleAddStep]);

  const closeEditor = useCallback(() => {
    if (dirtyRef.current && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
    dirtyRef.current = false;
    setSelectedId(null);
  }, []);

  const renderPanel = (withClose = false) =>
    selectedStep ? (
      <StepPanel
        key={selectedStep.id}
        step={selectedStep}
        tutorialId={tutorialId}
        allSteps={steps}
        branches={selectedBranches}
        index={selIndex}
        total={ordered.length}
        hasPrev={selIndex > 0}
        hasNext={selIndex >= 0 && selIndex < ordered.length - 1}
        onPrev={goPrev}
        onNext={goNext}
        canMoveUp={!!selectedStep && canMove(selectedStep.id, "up")}
        canMoveDown={!!selectedStep && canMove(selectedStep.id, "down")}
        onMove={handleMoveStep}
        onSaveStep={saveStep}
        onDirtyChange={(d) => {
          dirtyRef.current = d;
        }}
        hasSourceVideo={hasSourceVideo}
        onSetImage={setStepImage}
        onSetHighlights={setStepHighlights}
        onSetDecision={handleSetDecision}
        onSetCondition={handleSetCondition}
        onAddBranch={handleAddBranch}
        onUpdateBranch={handleUpdateBranch}
        onDeleteBranch={handleDeleteBranch}
        onDeleteStep={handleDeleteStep}
        onOpenStep={(id) => setSelectedId(id)}
        onInsertIntoBranch={insertIntoBranch}
        onClose={withClose ? closeEditor : undefined}
      />
    ) : null;

  const flowArea = tree ? (
    <div className="rounded-2xl border border-border bg-card/40 p-4 sm:p-5">
      <Flow
        tree={tree}
        imgBust={imgBust}
        selectedId={selectedId}
        onSelect={(id) => {
          if (dirtyRef.current && id !== selectedId && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
          dirtyRef.current = false;
          setSelectedId(id);
        }}
        onInsertAfter={insertAfter}
        onInsertIntoBranch={insertIntoBranch}
        onRecordAfter={recordAfter}
        onRecordIntoBranch={recordIntoBranch}
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
  );

  return (
    <>
      {/* Aufnahme-Ziel-Dialog (Welle 27): immer gemountet, damit die Extension-Erkennung
          fertig ist, bevor ein Einfügepunkt geöffnet wird. open = recordTarget != null. */}
      <RecordIntoDialog
        tutorialId={tutorialId}
        target={recordTarget}
        onOpenChange={(o) => {
          if (!o) setRecordTarget(null);
        }}
      />

      <p className="mb-2 text-sm text-muted-foreground">
        {steps.length} Schritt{steps.length === 1 ? "" : "e"}
      </p>

      <div className={wide ? "flex items-start gap-6" : ""}>
        <div className={wide ? "min-w-0 flex-1" : ""}>
          <div className="mx-auto w-full max-w-3xl">{flowArea}</div>
        </div>

        {wide && selectedStep && (
          // top-[4.5rem] = unter dem 56px hohen, stickyen App-Header (sonst verschwindet der Panel-Kopf dahinter).
          <aside className="sticky top-[4.5rem] flex max-h-[calc(100vh-5.5rem)] w-[440px] shrink-0 flex-col self-start overflow-hidden rounded-2xl border border-border bg-card shadow-sm xl:w-[520px]">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              {renderPanel(true)}
            </div>
          </aside>
        )}
      </div>

      {!wide && (
        <Sheet open={!!selectedStep} onOpenChange={(o) => { if (!o) closeEditor(); }}>
          <SheetContent
            side={mobile ? "bottom" : "right"}
            className={
              mobile
                ? "max-h-[85vh] w-full overflow-y-auto"
                : "w-full overflow-y-auto sm:max-w-2xl"
            }
          >
            <SheetHeader>
              <SheetTitle>Schritt bearbeiten</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-8">{renderPanel()}</div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
