// ============================================================
// Reine Umverdrahtungs-Regeln des Builders (ohne React/DB), damit sie
// prüfbar sind (scripts/test-builder-rewire.ts):
//   - appendAnchor:       wo „+ Neuen Schritt anlegen“ anhängt
//   - swapPair:           ob/welches Paar „Schritt nach oben/unten“ tauscht
//   - deleteRewireTarget: wohin der Ablauf nach dem Löschen eines Schritts weiterläuft
// Semantik wie tree.ts: ein Branch mit target_step_id null = „Ende“; ein linearer
// Schritt folgt nur seinem ERSTEN Branch (nach position).
// ============================================================

import type { Step, StepBranch } from "@/lib/types";
import { buildRenderTree, findJoinPoint, flattenFlow } from "./tree";

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

/**
 * Anhänge-Punkt für einen neuen Schritt am Ende: bevorzugt ein Blatt (kein Branch MIT Ziel —
 * ein „Ende“-Branch zählt nicht) IM Ablauf, dann irgendein Blatt, sonst den Schritt mit
 * höchster Position (bei Gleichstand jeweils die höchste Position). Hat der Schritt schon einen „Ende“-Branch, wird DER
 * umgehängt (`reuseBranchId`) statt einen zweiten anzulegen — Flow und Player folgen nur dem
 * ersten Branch, ein zweiter bliebe unsichtbar.
 */
export function appendAnchor(
  steps: Step[],
  branches: StepBranch[],
  rootStepId: string | null,
): { fromStepId: string; reuseBranchId: string | null } | null {
  const hasTarget = new Set(branches.filter((b) => b.target_step_id).map((b) => b.step_id));
  const tree = buildRenderTree(steps, branches, rootStepId);
  const inFlow = new Set(tree ? flattenFlow(tree) : []);
  const byPosDesc = [...steps].sort((a, b) => b.position - a.position);
  const from =
    byPosDesc.find((s) => !hasTarget.has(s.id) && inFlow.has(s.id)) ??
    byPosDesc.find((s) => !hasTarget.has(s.id)) ??
    byPosDesc[0];
  if (!from) return null;
  const endBranch = branches
    .filter((b) => b.step_id === from.id && !b.target_step_id)
    .sort(byPosition)[0];
  return { fromStepId: from.id, reuseBranchId: endBranch?.id ?? null };
}

/**
 * Liefert das eindeutige lineare Paar (A→B) für einen Tausch, oder null wenn
 * nicht eindeutig. Für Richtung "down" ist A=stepId; für "up" wird der eindeutige
 * Vorgänger P gesucht und (A=P, B=stepId) getauscht. Bedingungen (beide Richtungen):
 * weder A noch B ist Entscheidung, beide haben ≤1 ausgehende Kante, A→B ist die einzige
 * verbindende Kante, und B hat GENAU eine eingehende Kante. Letzteres auch bei "down":
 * ist B ein Zusammenführungs-Punkt (mehrere Äste laufen dort zusammen), würde A hinter
 * den Join rutschen und dann in ALLEN Ästen laufen.
 */
export function swapPair(
  steps: Step[],
  branches: StepBranch[],
  stepId: string,
  dir: "up" | "down",
): { a: Step; b: Step } | null {
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const outgoingOf = (id: string) => branches.filter((b) => b.step_id === id);
  const incomingOf = (id: string) => branches.filter((b) => b.target_step_id === id);
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
  // B darf nur über A erreicht werden (bei "up" oben schon geprüft).
  if (incomingOf(b.id).length !== 1) return null;

  // Beide dürfen keine Entscheidung sein und höchstens eine ausgehende Kante haben.
  if (a.is_decision || b.is_decision) return null;
  if (outgoingOf(a.id).length > 1 || outgoingOf(b.id).length > 1) return null;
  // A muss über GENAU eine Kante auf B zeigen (die verbindende Kante).
  const bId = b.id;
  const aToB = outgoingOf(a.id).filter((br) => br.target_step_id === bId);
  if (aToB.length !== 1) return null;
  return { a, b };
}

/**
 * Wohin zeigen die Vorgänger, nachdem `stepId` gelöscht ist? Linearer Schritt → sein
 * Folgeschritt. Frage → der Zusammenführungs-Punkt ihrer Äste (dort geht der Ablauf
 * für alle Antworten weiter); ohne Zusammenführung das Ziel der ersten Antwort. Die
 * Schritte, die nur in den Ästen stehen, hängen danach nicht mehr am Ablauf. null = Ende.
 */
export function deleteRewireTarget(
  steps: Step[],
  branches: StepBranch[],
  stepId: string,
): string | null {
  const step = steps.find((s) => s.id === stepId);
  if (!step) return null;
  const first = branches.filter((b) => b.step_id === stepId).sort(byPosition)[0];
  const target = step.is_decision
    ? (findJoinPoint(steps, branches, stepId) ?? first?.target_step_id ?? null)
    : (first?.target_step_id ?? null);
  // Selbst-Schleife: der Schritt verschwindet gleich — dann endet der Ablauf hier.
  return target === stepId ? null : target;
}

/**
 * Ist der Tausch A↔B schon ausgeführt? („Erneut versuchen“ nach einem moveStep, der auf dem
 * Server durchlief, dessen Antwort aber verloren ging.) swapPlan ist NICHT idempotent — ein
 * zweiter Aufruf mit denselben Argumenten tauschte ein weiteres Mal (Schritt wanderte zwei
 * Plätze bzw. mit dem Nachbarn). Erledigt heißt: B zeigt über seine einzige Kante auf A, und A
 * wird nur von B erreicht. Liefert null (nicht erledigt) oder den noch zu setzenden
 * Startschritt: steht A noch als Start, obwohl B jetzt davor liegt (Abbruch vor dem letzten
 * Schreibschritt), muss B Start werden — sonst wäre B unerreichbar.
 */
export function swapAlreadyApplied(
  branches: StepBranch[],
  rootId: string | null,
  aId: string,
  bId: string,
): { newRoot: string | null } | null {
  const outB = branches.filter((br) => br.step_id === bId);
  const inA = branches.filter((br) => br.target_step_id === aId);
  const applied =
    outB.length === 1 && outB[0].target_step_id === aId && inA.length === 1 && inA[0].step_id === bId;
  if (!applied) return null;
  return { newRoot: rootId === aId ? bId : null };
}

/** Ergebnis eines Tauschs: welche Kanten wohin zeigen, ggf. neue Kante B→A, ggf. neuer Start. */
export type SwapPlan = {
  /** Das getauschte Paar (Fluss vorher A → B). */
  pair: { a: string; b: string };
  targets: { branchId: string; target: string | null }[];
  newBranch: { id: string; step_id: string; target_step_id: string } | null;
  newRoot: string | null;
};

/**
 * „Schritt nach oben/unten“ als EIN Plan — dieselbe Rechnung im Editor (optimistisch) und auf
 * dem Server (moveStep). Fluss vorher: Vorgänger → A → B → Nachfolger; nachher: Vorgänger →
 * B → A → Nachfolger. Ist B ein Blatt, entsteht die Kante B→A neu (`newBranchId`).
 * null = kein eindeutiger Tausch (siehe swapPair).
 */
export function swapPlan(
  steps: Step[],
  branches: StepBranch[],
  rootId: string | null,
  stepId: string,
  dir: "up" | "down",
  newBranchId: string,
): SwapPlan | null {
  const pair = swapPair(steps, branches, stepId, dir);
  if (!pair) return null;
  const { a, b } = pair;
  const outA = branches.find((br) => br.step_id === a.id && br.target_step_id === b.id);
  if (!outA) return null;
  const outB = branches.filter((br) => br.step_id === b.id).sort(byPosition)[0] ?? null;
  const succ = outB?.target_step_id ?? null;
  const aIsRoot = rootId === a.id;
  const preds = aIsRoot ? [] : branches.filter((br) => br.target_step_id === a.id);
  return {
    pair: { a: a.id, b: b.id },
    targets: [
      ...preds.map((p) => ({ branchId: p.id, target: b.id as string | null })),
      { branchId: outA.id, target: succ },
      ...(outB ? [{ branchId: outB.id, target: a.id as string | null }] : []),
    ],
    newBranch: outB ? null : { id: newBranchId, step_id: b.id, target_step_id: a.id },
    newRoot: aIsRoot ? b.id : null,
  };
}

/** Was der Server bei moveStep tun soll (siehe planMove). */
export type MoveDecision =
  | { kind: "apply"; plan: SwapPlan }
  | { kind: "done"; newRoot: string | null }
  | { kind: "stale" };

/**
 * Server-Entscheidung für „Schritt nach oben/unten“ aus dem aktuellen DB-Stand. `expect` ist das
 * Paar, das der Editor getauscht hat (optimistisch): Nur wenn der DB-Stand GENAU diesen Tausch
 * ergibt, wird er ausgeführt. Ist er schon ausgeführt (Wiederholung nach verlorener Antwort),
 * ist nichts mehr zu tun (ggf. nur noch den Startschritt setzen) — statt ein zweites Mal zu
 * tauschen. Sonst „stale“ (Seite neu laden). Ohne `expect` (ältere Editor-Stände): wie bisher.
 */
export function planMove(
  steps: Step[],
  branches: StepBranch[],
  rootId: string | null,
  stepId: string,
  dir: "up" | "down",
  newBranchId: string,
  expect?: { a: string; b: string } | null,
): MoveDecision {
  const plan = swapPlan(steps, branches, rootId, stepId, dir, newBranchId);
  if (plan && (!expect || (plan.pair.a === expect.a && plan.pair.b === expect.b))) {
    return { kind: "apply", plan };
  }
  if (expect) {
    const done = swapAlreadyApplied(branches, rootId, expect.a, expect.b);
    if (done) return { kind: "done", newRoot: done.newRoot };
  }
  return { kind: "stale" };
}
