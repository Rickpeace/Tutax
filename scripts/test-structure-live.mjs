// Live-Test des Struktur-Passes (Welle 17): gesprochene Fallunterscheidung -> Verzweigung.
// Gegen echte DB + echten Mini-LLM-Call (gpt-5.4-mini, JSON-Mode) — genau wie der Worker.
//
// Prüft (Auftrag §Verifikation 2):
//   (a) Transkript MIT klarer Fallunterscheidung -> Frage-Schritt (is_decision), 2 Äste mit
//       sinnvollen Labels, Rejoin auf gemeinsamen Folgeschritt; DB-Verkabelung per Tree-Walk.
//   (b) Lineares Transkript OHNE Entscheidungssprache -> bleibt strikt linear (wichtigster Test:
//       keine false-positive-Verzweigung).
//   (c) „Drei Möglichkeiten" -> 1 Frage, 3 Äste.
//   (d) Kaputte/erzwungene LLM-Antwort -> Fallback linear, kein Crash.
// Alle Testdaten werden am Ende gelöscht.
//
// Nutzung:  node --env-file=.env.local scripts/test-structure-live.mjs
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { analyzeStructure, planWiring } from "../video-worker/structure.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const uuid = () => crypto.randomUUID();
const mkBody = (t) => ({ type: "doc", content: [{ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] }] });

// Der EXAKTE Mini-LLM-Call des Workers (JSON-Mode), damit der Test das echte Verhalten misst.
const callLLM = async (messages, max) => {
  const c = await openai.chat.completions.create({ model: "gpt-5.4-mini", messages, response_format: { type: "json_object" }, max_completion_tokens: max });
  try { return JSON.parse(c.choices[0].message.content || "{}"); } catch { return {}; }
};

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };

// --- Segmente je Szenario (index + narration). Nachbildung der Worker-Segmente. ---
// (a) Klare wenn/dann/ansonsten-Fallunterscheidung mit gemeinsamem Weiterlauf.
const SCENARIO_A = [
  { index: 0, narration: "Öffnen Sie zuerst die DATEV-Startseite in Ihrem Browser." },
  { index: 1, narration: "Wenn Sie schon ein DATEV-Konto haben, klicken Sie oben rechts auf Anmelden." },
  { index: 2, narration: "Falls Sie noch kein Konto haben, klicken Sie stattdessen auf Registrieren und legen Sie zuerst ein Konto an." },
  { index: 3, narration: "Danach öffnen beide Wege dasselbe Dashboard, wo Sie Ihre Belege sehen." },
];
// (b) Rein lineare Anleitung, KEINE Entscheidungssprache (darf NICHT verzweigen).
const SCENARIO_B = [
  { index: 0, narration: "Öffnen Sie die Einstellungen über das Zahnrad oben rechts." },
  { index: 1, narration: "Wählen Sie dann den Punkt Profil in der linken Leiste aus." },
  { index: 2, narration: "Tragen Sie Ihre neue E-Mail-Adresse in das Feld ein." },
  { index: 3, narration: "Klicken Sie zum Schluss auf Speichern, um die Änderung zu übernehmen." },
];
// (c) Drei Möglichkeiten -> 1 Frage, 3 Äste.
const SCENARIO_C = [
  { index: 0, narration: "Öffnen Sie die Zahlungsseite Ihres Kontos." },
  { index: 1, narration: "Für die Bezahlung gibt es drei Möglichkeiten, je nachdem was Sie bevorzugen." },
  { index: 2, narration: "Wenn Sie per Kreditkarte zahlen möchten, klicken Sie auf das Kreditkarten-Symbol." },
  { index: 3, narration: "Möchten Sie per PayPal zahlen, wählen Sie stattdessen den PayPal-Knopf." },
  { index: 4, narration: "Bei Überweisung klicken Sie auf Überweisung und notieren die Bankdaten." },
  { index: 5, narration: "Anschließend erhalten Sie in allen Fällen eine Bestätigungs-E-Mail." },
];

// Legt ein Tutorial mit rein linear verketteten Steps an (wie der Worker-Live-Aufbau) und
// gibt {tutId, rows} zurück. rows tragen segIndex (1:1 zu den Segmenten hier).
async function seedLinear(accountId, segs, title) {
  const tutId = uuid();
  await admin.from("tutorials").insert({ id: tutId, account_id: accountId, title, status: "draft" });
  const rows = segs.map((s, i) => ({ id: uuid(), segIndex: s.index, position: i + 1 }));
  await admin.from("steps").insert(rows.map((r, i) => ({
    id: r.id, tutorial_id: tutId, title: `Schritt ${i + 1}`, body: mkBody(segs[i].narration), position: r.position, is_decision: false,
  })));
  await admin.from("tutorials").update({ root_step_id: rows[0].id }).eq("id", tutId);
  const lin = [];
  for (let i = 0; i < rows.length - 1; i++) lin.push({ id: uuid(), step_id: rows[i].id, label: null, target_step_id: rows[i + 1].id, position: 0 });
  if (lin.length) await admin.from("step_branches").insert(lin);
  return { tutId, rows };
}

// Wendet einen Struktur-Plan wie der Worker (applyStructure) auf die DB an.
async function applyPlan(tutId, rows, plan) {
  const w = planWiring(rows.map((r) => ({ id: r.id, segIndex: r.segIndex })), plan);
  if (w.removeBranchesFromStepIds.length) await admin.from("step_branches").delete().in("step_id", w.removeBranchesFromStepIds);
  if (w.branches.length) await admin.from("step_branches").insert(w.branches.map((b) => ({ id: uuid(), step_id: b.step_id, label: b.label, color: b.color, target_step_id: b.target_step_id, position: b.position })));
  if (w.decisionStepIds.length) await admin.from("steps").update({ is_decision: true }).in("id", w.decisionStepIds);
  return w;
}

// Lädt Steps + Branches eines Tutorials frisch aus der DB (für den Tree-Walk).
async function loadGraph(tutId) {
  const { data: steps } = await admin.from("steps").select("id, title, is_decision, position").eq("tutorial_id", tutId);
  const ids = steps.map((s) => s.id);
  const { data: branches } = await admin.from("step_branches").select("id, step_id, label, target_step_id, position").in("step_id", ids);
  const { data: tut } = await admin.from("tutorials").select("root_step_id").eq("id", tutId).single();
  return { steps, branches: branches || [], root: tut.root_step_id };
}

// Vorwärts-erreichbare Step-IDs ab start (zyklensicher) — für die Merge-Prüfung.
function reachable(branches, start) {
  const out = new Set();
  const stack = [start];
  const byStep = new Map();
  for (const b of branches) { const l = byStep.get(b.step_id) || []; l.push(b); byStep.set(b.step_id, l); }
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    for (const b of byStep.get(id) || []) if (b.target_step_id) stack.push(b.target_step_id);
  }
  return out;
}

const created = []; // tutIds für Cleanup
let accountId, userId;
const email = `tutax-structure-${Date.now()}@example.com`;

try {
  const { data: u } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  userId = u.user.id;
  const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = mem[0].account_id;

  // ---------- (a) Fallunterscheidung -> Verzweigung ----------
  {
    const plan = await analyzeStructure(SCENARIO_A, callLLM, { log: (m) => console.log("   " + m) });
    ok(plan.mode === "branched" && plan.questions.length === 1, "(a) LLM erkennt genau 1 Verzweigung");
    if (plan.mode === "branched" && plan.questions[0]) {
      const q = plan.questions[0];
      ok(q.answers.length === 2, "(a) genau 2 Äste");
      ok(q.answers.every((x) => x.label && x.label.length <= 24), "(a) beide Labels sinnvoll (<=24 Zeichen): " + q.answers.map((x) => x.label).join(" / "));
      ok(q.rejoin != null, "(a) Rejoin gesetzt (gemeinsamer Folgeschritt)");
    }
    const { tutId, rows } = await seedLinear(accountId, SCENARIO_A, "Struktur A");
    created.push(tutId);
    await applyPlan(tutId, rows, plan);
    const g = await loadGraph(tutId);
    // Tree-Walk: root -> Frage (is_decision) -> beide Äste -> gemeinsamer Merge.
    const rootStep = g.steps.find((s) => s.id === g.root);
    const decision = g.steps.find((s) => s.is_decision);
    ok(!!decision, "(a) DB: es gibt einen is_decision-Schritt");
    if (decision) {
      const outs = g.branches.filter((b) => b.step_id === decision.id);
      ok(outs.length === 2, "(a) DB: Frage hat 2 ausgehende (gelabelte) Branches");
      ok(outs.every((b) => b.label && b.label.trim()), "(a) DB: beide Branch-Labels gesetzt");
      // beide Äste münden im selben Folgeschritt (Merge): Schnittmenge der Erreichbarkeit
      // beider Ast-Startpunkte enthält einen gemeinsamen Knoten != Frage.
      const [t1, t2] = outs.map((b) => b.target_step_id);
      const r1 = reachable(g.branches, t1), r2 = reachable(g.branches, t2);
      const common = [...r1].filter((id) => r2.has(id) && id !== decision.id);
      ok(common.length >= 1, "(a) DB: beide Äste laufen wieder zusammen (Merge)");
      // root erreicht die Frage:
      ok(reachable(g.branches, g.root).has(decision.id), "(a) DB: root erreicht die Frage");
      void rootStep;
    }
  }

  // ---------- (b) Linear bleibt linear (WICHTIGSTER TEST) ----------
  {
    const plan = await analyzeStructure(SCENARIO_B, callLLM, { log: (m) => console.log("   " + m) });
    ok(plan.mode === "linear", "(b) KEINE false-positive-Verzweigung bei linearem Transkript");
    const { tutId, rows } = await seedLinear(accountId, SCENARIO_B, "Struktur B");
    created.push(tutId);
    await applyPlan(tutId, rows, plan);
    const g = await loadGraph(tutId);
    ok(g.steps.every((s) => !s.is_decision), "(b) DB: kein Schritt ist Entscheidung");
    // Genau eine lineare Kette: jeder Nicht-Blatt-Schritt hat genau 1 ausgehende null-Branch.
    const byStep = new Map();
    for (const b of g.branches) { const l = byStep.get(b.step_id) || []; l.push(b); byStep.set(b.step_id, l); }
    const allLinear = [...byStep.values()].every((l) => l.length === 1 && l[0].label === null);
    ok(allLinear, "(b) DB: alle Branches sind linear (label=null, max. 1 pro Schritt)");
    ok(g.branches.length === SCENARIO_B.length - 1, "(b) DB: n-1 lineare Branches");
  }

  // ---------- (c) Drei Möglichkeiten -> 1 Frage, 3 Äste ----------
  {
    const plan = await analyzeStructure(SCENARIO_C, callLLM, { log: (m) => console.log("   " + m) });
    ok(plan.mode === "branched" && plan.questions.length === 1, "(c) genau 1 Frage");
    if (plan.questions?.[0]) ok(plan.questions[0].answers.length === 3, "(c) genau 3 Äste: " + plan.questions[0].answers.map((a) => a.label).join(" / "));
    const { tutId, rows } = await seedLinear(accountId, SCENARIO_C, "Struktur C");
    created.push(tutId);
    await applyPlan(tutId, rows, plan);
    const g = await loadGraph(tutId);
    const decision = g.steps.find((s) => s.is_decision);
    if (decision) {
      const outs = g.branches.filter((b) => b.step_id === decision.id);
      ok(outs.length === 3, "(c) DB: Frage hat 3 gelabelte Branches");
    } else ok(false, "(c) DB: is_decision-Schritt fehlt");
  }

  // ---------- (d) Kaputte LLM-Antwort -> Fallback linear, kein Crash ----------
  {
    const badLLM = async () => ({ questions: [{ ask: 1, answers: [{ label: "Ja", steps: [99] }], rejoin: 2 }] }); // ungültige Indizes
    const plan = await analyzeStructure(SCENARIO_A, badLLM);
    ok(plan.mode === "linear", "(d) inkonsistente LLM-Antwort -> linear (kein Crash)");
    const throwLLM = async () => { throw new Error("simulierter LLM-Ausfall"); };
    const plan2 = await analyzeStructure(SCENARIO_A, throwLLM);
    ok(plan2.mode === "linear", "(d) LLM-Exception -> linear (kein Crash)");
    // Anwenden eines linearen Plans lässt die lineare Kette unangetastet.
    const { tutId, rows } = await seedLinear(accountId, SCENARIO_A, "Struktur D");
    created.push(tutId);
    const w = await applyPlan(tutId, rows, plan);
    ok(w.branches.length === 0 && w.decisionStepIds.length === 0, "(d) linearer Plan -> keine DB-Mutation");
  }
} catch (e) {
  ok(false, "Unerwarteter Fehler: " + (e?.message || e));
} finally {
  // Cleanup: Branches + Steps + Tutorials + Account + User.
  for (const tutId of created) {
    try {
      const { data: st } = await admin.from("steps").select("id").eq("tutorial_id", tutId);
      const ids = (st || []).map((s) => s.id);
      if (ids.length) await admin.from("step_branches").delete().in("step_id", ids);
      await admin.from("steps").delete().eq("tutorial_id", tutId);
      await admin.from("tutorials").delete().eq("id", tutId);
    } catch {}
  }
  if (accountId) { try { await admin.from("accounts").delete().eq("id", accountId); } catch {} }
  if (userId) { try { await admin.auth.admin.deleteUser(userId); } catch {} }
}

console.log(failed ? "\n✗ Struktur-Live-Test fehlgeschlagen." : "\n✓ Struktur-Live-Test grün (Verzweigung, Linear-Schutz, 3 Äste, Fallback).");
process.exitCode = failed ? 1 : 0;
