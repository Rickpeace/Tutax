// ============================================================
// Tree-Derivation: flache (steps + step_branches) -> verschachtelte
// Render-Struktur für den Karten-Flow-Builder (§7.2).
//
// Entspricht der Semantik des bestätigten Prototyps (prototyp-v4.jsx):
//   - linearer Schritt  -> "next" (Connector + Folgeschritt)
//   - Entscheidung      -> "branches" (farbig umrandete Ast-Blöcke)
//   - Zusammenführung    -> "after" (gemeinsamer Weiterlauf nach den Ästen)
//   - bereits platzierter/erneut erreichter Knoten -> Merge-Zeile
//     ("↳ weiter mit: <Titel>")  — auch der Zyklus-Schutz.
//
// Der Join-Punkt (immediate post-dominator) wird pragmatisch über
// Vorwärts-Erreichbarkeit bestimmt: der gemeinsame, früheste Knoten,
// in dem alle Äste einer Entscheidung wieder zusammenlaufen.
// ============================================================

import type { Step, StepBranch } from "@/lib/types";

export type RenderBranch = {
  branchId: string;
  label: string;
  color: string | null;
  child: RenderNode;
};

export type RenderStep = {
  type: "step";
  step: Step;
  depth: number;
  branches: RenderBranch[] | null; // gesetzt bei Entscheidungs-Schritt
  next: RenderNode | null; // linearer Folgeschritt
  after: RenderNode | null; // gemeinsamer Weiterlauf nach Verzweigung
};

export type RenderMerge = {
  type: "merge";
  label: string; // Titel des Zielschritts ("weiter mit: …") oder "Ende"
  isEnd?: boolean;
};

export type RenderNode = RenderStep | RenderMerge;

export function buildRenderTree(
  steps: Step[],
  branches: StepBranch[],
  rootStepId: string | null,
): RenderNode | null {
  if (!steps.length) return null;

  const stepById = new Map<string, Step>(steps.map((s) => [s.id, s]));
  const branchesByStep = new Map<string, StepBranch[]>();
  for (const b of branches) {
    const list = branchesByStep.get(b.step_id) ?? [];
    list.push(b);
    branchesByStep.set(b.step_id, list);
  }
  for (const list of branchesByStep.values()) {
    list.sort((a, b) => a.position - b.position);
  }

  // Wurzel: explizit gesetzt, sonst der Schritt mit Eingangsgrad 0,
  // sonst der erste nach position.
  const root =
    (rootStepId && stepById.has(rootStepId) && rootStepId) ||
    inferRoot(steps, branches) ||
    [...steps].sort((a, b) => a.position - b.position)[0].id;

  const title = (id: string) => stepById.get(id)?.title?.trim() || "Schritt";

  const forwardTargets = (id: string): string[] =>
    (branchesByStep.get(id) ?? [])
      .map((b) => b.target_step_id)
      .filter((t): t is string => !!t);

  // Vorwärts erreichbare Knoten ab `start` (inkl. start), zyklensicher.
  const reachable = (start: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const t of forwardTargets(id)) stack.push(t);
    }
    return seen;
  };

  // Join-Punkt einer Entscheidung: frühester gemeinsamer Knoten aller Äste.
  const joinPoint = (decisionId: string): string | null => {
    const targets = [...new Set(forwardTargets(decisionId))];
    if (targets.length < 2) return null;
    const sets = targets.map(reachable);
    let common = [...sets[0]];
    for (let i = 1; i < sets.length; i++) {
      common = common.filter((id) => sets[i].has(id));
    }
    common = common.filter((id) => id !== decisionId);
    if (!common.length) return null;
    // "frühester" Join = der mit der größten Vorwärts-Erreichbarkeit
    // (von ihm aus ist der Rest erreichbar -> er kommt zuerst).
    common.sort((a, b) => reachable(b).size - reachable(a).size);
    return common[0];
  };

  // Rekursiver Aufbau. `stopAt` = Knoten, an dem dieser Zweig endet
  // (der gemeinsame Join wird außerhalb gerendert).
  const placed = new Set<string>();

  const build = (
    id: string,
    onPath: Set<string>,
    stopAt: string | null,
    depth: number,
  ): RenderNode => {
    if (stopAt && id === stopAt) return { type: "merge", label: title(id) };
    if (placed.has(id) || onPath.has(id))
      return { type: "merge", label: title(id) };

    const step = stepById.get(id);
    if (!step) return { type: "merge", label: "Ende", isEnd: true };

    placed.add(id);
    const path2 = new Set(onPath).add(id);
    const bs = branchesByStep.get(id) ?? [];

    if (!step.is_decision) {
      // Linearer Schritt: höchstens ein "Weiter"-Branch.
      const target = bs[0]?.target_step_id ?? null;
      const next =
        target !== null ? build(target, path2, stopAt, depth) : null;
      return { type: "step", step, depth, branches: null, next, after: null };
    }

    // Entscheidungs-Schritt.
    const join = joinPoint(id);
    const childStop = join ?? stopAt;
    const renderBranches: RenderBranch[] = bs.map((b) => ({
      branchId: b.id,
      label: b.label?.trim() || "Weiter",
      color: b.color,
      child: b.target_step_id
        ? build(b.target_step_id, path2, childStop, depth + 1)
        : ({ type: "merge", label: "Ende", isEnd: true } as RenderMerge),
    }));

    let after: RenderNode | null = null;
    if (join && join !== stopAt) {
      after = build(join, path2, stopAt, depth);
    }

    return { type: "step", step, depth, branches: renderBranches, next: null, after };
  };

  return build(root, new Set(), null, 0);
}

/** Schritt mit Eingangsgrad 0 (kein Branch zeigt auf ihn) = Wurzelkandidat. */
function inferRoot(steps: Step[], branches: StepBranch[]): string | null {
  const targeted = new Set(
    branches.map((b) => b.target_step_id).filter(Boolean) as string[],
  );
  const roots = steps.filter((s) => !targeted.has(s.id));
  if (!roots.length) return null;
  roots.sort((a, b) => a.position - b.position);
  return roots[0].id;
}
