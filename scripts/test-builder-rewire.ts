// Regressions-Check der Builder-Umverdrahtung (ohne DB/React):
//   npx tsx scripts/test-builder-rewire.ts
// Simuliert die optimistischen Schritte aus builder.tsx mit den reinen Regeln aus
// lib/builder/rewire.ts und prüft, was Flow/Player (erster Branch) danach zeigen.
import assert from "node:assert/strict";
import { buildRenderTree, flattenFlow } from "../src/lib/builder/tree.ts";
import { appendAnchor, deleteRewireTarget, swapPair } from "../src/lib/builder/rewire.ts";
import type { Step, StepBranch } from "../src/lib/types.ts";

let pos = 0;
const S = (id: string, is_decision = false): Step =>
  ({ id, tutorial_id: "t", title: id, position: ++pos, is_decision, highlights: [] }) as unknown as Step;
let bc = 0;
const B = (step_id: string, target: string | null, label: string | null = null): StepBranch => ({
  id: `b${bc++}`,
  step_id,
  label,
  color: null,
  target_step_id: target,
  position: bc,
  created_at: "",
});

const flow = (steps: Step[], branches: StepBranch[], root: string | null) => {
  const t = buildRenderTree(steps, branches, root);
  return t ? flattenFlow(t) : [];
};

// builder.handleDeleteStep (optimistisch)
function del(steps: Step[], branches: StepBranch[], root: string | null, id: string) {
  const next = deleteRewireTarget(steps, branches, id);
  return {
    steps: steps.filter((s) => s.id !== id),
    branches: branches
      .filter((b) => b.step_id !== id)
      .map((b) => (b.target_step_id === id ? { ...b, target_step_id: next } : b)),
    root: root === id ? next : root,
  };
}

// builder.handleAddStep (optimistisch, nicht der allererste Schritt)
function add(steps: Step[], branches: StepBranch[], root: string | null, id: string) {
  const a = appendAnchor(steps, branches, root);
  assert.ok(a, "Anker gefunden");
  const out = [...steps, S(id)];
  if (a.reuseBranchId) {
    return { steps: out, branches: branches.map((b) => (b.id === a.reuseBranchId ? { ...b, target_step_id: id } : b)) };
  }
  return { steps: out, branches: [...branches, { ...B(a.fromStepId, id), position: 0 }] };
}

let ok = 0;
function check(name: string, fn: () => void) {
  fn();
  ok++;
  console.log(`✓ ${name}`);
}

check("1: neuer Schritt nach Löschen des letzten ist sichtbar (A→B→C, C löschen, + D)", () => {
  const steps = [S("A"), S("B"), S("C")];
  const branches = [B("A", "B"), B("B", "C")];
  const d = del(steps, branches, "A", "C");
  assert.equal(d.branches.find((b) => b.step_id === "B")?.target_step_id, null); // B → Ende
  const a = add(d.steps, d.branches, d.root, "D");
  assert.equal(a.branches.filter((b) => b.step_id === "B").length, 1, "kein zweiter Branch an B");
  assert.deepEqual(flow(a.steps, a.branches, "A"), ["A", "B", "D"]);
});

check("1b: nach „Frage ausschalten“ (erste Antwort → Ende) hängt + am Ablauf, nicht am verwaisten Ast", () => {
  const steps = [S("P"), S("Q", true), S("X")];
  // Nach dem Ausschalten: Q linear, nur der erste (Ende-)Branch bleibt; X ist verwaist.
  const qEnd = B("Q", null);
  const branches = [B("P", "Q"), qEnd];
  const a = add(steps.map((s) => (s.id === "Q" ? { ...s, is_decision: false } : s)), branches, "P", "D");
  assert.deepEqual(flow(a.steps, a.branches, "P"), ["P", "Q", "D"]);
});

check("2: „nach unten“ schiebt keinen Ast-Schritt hinter den Zusammenführungs-Punkt", () => {
  const steps = [S("Q", true), S("N"), S("J"), S("S2")];
  const branches = [B("Q", "N", "Ja"), B("Q", "J", "Nein"), B("N", "J"), B("J", "S2")];
  assert.equal(swapPair(steps, branches, "N", "down"), null);
  assert.equal(swapPair(steps, branches, "J", "up"), null);
  // Linearer Tausch bleibt möglich.
  const pair = swapPair(steps, branches, "J", "down");
  assert.equal(pair?.a.id, "J");
  assert.equal(pair?.b.id, "S2");
});

check("3: Frage mitten im Ablauf löschen → Ablauf geht beim Zusammenführungs-Punkt weiter", () => {
  const steps = [S("P"), S("Q", true), S("X"), S("J"), S("S2")];
  const branches = [B("P", "Q"), B("Q", "X", "Ja"), B("Q", "J", "Nein"), B("X", "J"), B("J", "S2")];
  assert.equal(deleteRewireTarget(steps, branches, "Q"), "J");
  const d = del(steps, branches, "P", "Q");
  assert.deepEqual(flow(d.steps, d.branches, d.root), ["P", "J", "S2"]);
});

check("3b: Frage ohne Zusammenführung → Ziel der ersten Antwort; Wurzel-Frage → neue Wurzel", () => {
  const steps = [S("Q", true), S("X"), S("Y")];
  const branches = [B("Q", "X", "Ja"), B("Q", "Y", "Nein")];
  assert.equal(deleteRewireTarget(steps, branches, "Q"), "X");
  const d = del(steps, branches, "Q", "Q");
  assert.equal(d.root, "X");
});

check("3c: linearer Schritt → Folgeschritt; Selbst-Schleife → Ende", () => {
  const steps = [S("A"), S("B"), S("C")];
  assert.equal(deleteRewireTarget(steps, [B("A", "B"), B("B", "C")], "B"), "C");
  assert.equal(deleteRewireTarget(steps, [B("B", "B")], "B"), null);
});

console.log(`\n${ok} Prüfungen grün`);
