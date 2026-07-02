// Struktur-Pass (Welle 17): Aus dem GESPROCHENEN eines Screencasts echte
// Verzweigungen (Ja/Nein- oder freie Antwort-Äste) ableiten — statt nur linear.
//
// Zwei reine, testbare Bausteine (kein DB-/OpenAI-Import hier drin — die Aufrufer
// reichen eine `callLLM`-Funktion bzw. bereits eingefügte Step-Rows herein):
//   1) analyzeStructure(segments, callLLM, opts)  -> validierter Struktur-Plan
//   2) planWiring(rows, plan)                     -> DB-Mutationen (is_decision,
//                                                    Branch-Labels, Umverdrahtung, Rejoin)
//
// KONSERVATIV: Verzweigt nur bei EXPLIZIT gesprochener Fallunterscheidung. Jede
// Unklarheit / jeder Validierungsfehler => kompletter Fallback auf linear (der Plan
// ist dann schlicht "linear", planWiring gibt keine Umbauten zurück). Ein fälschlich
// linearer Ablauf ist harmlos; eine erfundene Verzweigung ist Datenmüll.

// ---- Konstanten (bewusst hier dupliziert, damit der Worker keine src/-Imports braucht) ----
export const YES_COLOR = "#0f9d72"; // --yes  (siehe src/lib/builder/constants.ts)
export const NO_COLOR = "#d6455d"; // --no
const MAX_ANSWERS = 4; // max. Antworten pro Frage
const MAX_LABEL = 24; // Branch-Label-Länge (Datenmodell: <= 24 Zeichen)
const MAX_DEPTH = 2; // max. Verschachtelungstiefe
const MAX_INPUT_CHARS = 20000; // Eingabe für den LLM-Call kappen

// System-Prompt für den Struktur-Pass. Bekommt die durchnummerierten Segmente
// (Index + gesprochener Text) und weist jedem Segment eine Rolle zu.
export const STRUCTURE_SYS = `Du analysierst die bereits in Schritte zerlegte Erzählung eines Klick-Tutorials und findest AUSGESPROCHENE Entscheidungslogik (Fallunterscheidungen), um daraus Verzweigungen zu machen. Du erzeugst KEINE neuen Schritte und änderst ihre Reihenfolge NICHT — du weist nur Rollen zu.

Eingabe: durchnummerierte Segmente [i] mit dem gesprochenen Text.

Gib NUR JSON:
{"questions":[{"ask": <Segment-Index, das zur Frage wird>, "title":"<kurzer Fragetitel>", "answers":[{"label":"<kurz, z.B. Ja/Nein>", "steps":[<Segment-Indizes dieses Astes, aufsteigend>]}], "rejoin": <Segment-Index ab dem es gemeinsam weitergeht, oder null>}]}
Gibt es keine echte Verzweigung: {"questions":[]}.

STRENGE REGELN — im Zweifel IMMER {"questions":[]} (linear ist harmlos, erfundene Verzweigung ist Datenmüll):
- Verzweige NUR bei EXPLIZIT gesprochener Fallunterscheidung: "wenn/falls/sofern … dann …", "ansonsten/andernfalls", "es gibt zwei/drei Möglichkeiten", "je nachdem", "entweder … oder". Kein solches Signal => keine Frage.
- "ask" ist das Segment, in dem die Bedingung genannt wird; sein Text wird zur Frage. "title" ist eine kurze Ja/Nein-Frage (z.B. "Haben Sie schon ein Konto?").
- "answers": 2–${MAX_ANSWERS} Äste. Labels KURZ (max. ${MAX_LABEL} Zeichen), "Ja"/"Nein" bevorzugen, sonst knappe freie Labels ("Zahlung", "Überweisung"). Jeder Ast listet die Segment-Indizes, die NUR zu diesem Ast gehören (aufsteigend, > ask).
- Ein Ast darf leer sein (steps:[]) — z.B. wenn ein Fall keinen eigenen Schritt braucht.
- "rejoin": der Segment-Index, ab dem beide/alle Äste wieder GEMEINSAM weiterlaufen ("danach", "in beiden Fällen", "anschließend"). Gibt es keinen gemeinsamen Weiterlauf: null.
- Jeder Segment-Index gehört zu HÖCHSTENS einer Frage-Struktur (als ask, als Ast-Schritt oder als rejoin). Keine Überschneidungen.
- Verschachtelung höchstens 2 tief. Im Zweifel flach halten.`;

/**
 * Struktur-Pass: ordnet den Segmenten Verzweigungs-Rollen zu.
 * @param {{index:number, narration:string}[]} segments - Segmente in Video-Reihenfolge.
 * @param {(messages:any[], max:number)=>Promise<any>} callLLM - JSON-Mode-Call (gibt geparstes Objekt oder {} zurück).
 * @param {{maxInputChars?:number, log?:(m:string)=>void}} [opts]
 * @returns {Promise<{mode:"linear"|"branched", questions:NormalizedQuestion[]}>}
 *   Bei jeder Unklarheit: {mode:"linear", questions:[]}.
 */
export async function analyzeStructure(segments, callLLM, opts = {}) {
  const log = opts.log || (() => {});
  const linear = { mode: "linear", questions: [] };
  if (!Array.isArray(segments) || segments.length < 3) return linear; // <3 Schritte: nie verzweigen

  // Eingabe bauen + kappen (~20k Zeichen). Segmente ohne Text mitzählen (Index-Treue),
  // aber leere Erzählung markieren.
  const maxChars = opts.maxInputChars ?? MAX_INPUT_CHARS;
  let body = segments
    .map((s) => `[${s.index}] ${(s.narration || "").replace(/\s+/g, " ").trim() || "(nichts gesagt)"}`)
    .join("\n");
  if (body.length > maxChars) body = body.slice(0, maxChars);

  let raw;
  try {
    raw = await callLLM(
      [
        { role: "system", content: STRUCTURE_SYS },
        { role: "user", content: `Segmente (0..${segments.length - 1}):\n${body}` },
      ],
      600,
    );
  } catch (e) {
    log(`Struktur-Pass LLM-Fehler -> linear: ${String(e?.message || e).slice(0, 160)}`);
    return linear;
  }

  const validIdx = new Set(segments.map((s) => s.index));
  const parsed = validateStructure(raw, validIdx, log);
  if (!parsed.length) return linear;
  return { mode: "branched", questions: parsed };
}

/**
 * @typedef {{ask:number, title:string, answers:{label:string, steps:number[]}[], rejoin:number|null}} NormalizedQuestion
 */

/**
 * Validiert die LLM-Antwort STRENG. Gibt eine (ggf. leere) Liste normalisierter Fragen
 * zurück; bei jeder Inkonsistenz die betroffene Frage verwerfen (nicht die ganze Antwort,
 * es sei denn nichts bleibt übrig). Garantien fürs Wiring:
 *  - alle Indizes existieren und sind eindeutig über ALLE Fragen (keine Überschneidung),
 *  - ask < alle Ast-Schritte, ask < rejoin,
 *  - 2..MAX_ANSWERS Äste, Labels getrimmt/gekappt/eindeutig je Frage,
 *  - Verschachtelungstiefe <= MAX_DEPTH.
 */
export function validateStructure(raw, validIdx, log = () => {}) {
  const out = [];
  const used = new Set(); // jeder Segment-Index gehört zu HÖCHSTENS einer Frage-Struktur
  if (!raw || typeof raw !== "object") return out;
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  if (!questions.length) return out;

  // Reihenfolge nach ask, damit "used"-Kollisionen deterministisch die spätere Frage treffen.
  const sorted = [...questions].filter((q) => q && Number.isInteger(q.ask)).sort((a, b) => a.ask - b.ask);

  for (const q of sorted) {
    const ask = q.ask;
    if (!validIdx.has(ask) || used.has(ask)) {
      log(`Struktur: Frage mit ungültigem/belegtem ask=${ask} verworfen.`);
      continue;
    }
    const answersRaw = Array.isArray(q.answers) ? q.answers : [];
    if (answersRaw.length < 2 || answersRaw.length > MAX_ANSWERS) {
      log(`Struktur: Frage ask=${ask} hat ${answersRaw.length} Äste (erlaubt 2..${MAX_ANSWERS}) -> verworfen.`);
      continue;
    }

    // Rejoin zuerst prüfen (er darf NICHT in einem Ast stehen und muss > ask sein).
    let rejoin = null;
    if (q.rejoin != null) {
      if (!Number.isInteger(q.rejoin) || !validIdx.has(q.rejoin) || used.has(q.rejoin) || q.rejoin <= ask) {
        log(`Struktur: Frage ask=${ask} hat ungültiges rejoin=${q.rejoin} -> Frage verworfen.`);
        continue;
      }
      rejoin = q.rejoin;
    }

    // Äste validieren. Schritte müssen existieren, > ask, != rejoin, eindeutig frei.
    const localUsed = new Set(); // innerhalb dieser Frage (inkl. ask)
    localUsed.add(ask);
    if (rejoin != null) localUsed.add(rejoin);
    const labels = new Set();
    const answers = [];
    let bad = false;
    for (const a of answersRaw) {
      const label = normalizeLabel(a?.label);
      if (!label || labels.has(label.toLowerCase())) {
        log(`Struktur: Frage ask=${ask} hat leeres/doppeltes Label "${a?.label}" -> verworfen.`);
        bad = true;
        break;
      }
      labels.add(label.toLowerCase());
      const stepsRaw = Array.isArray(a?.steps) ? a.steps : [];
      const steps = [];
      for (const si of stepsRaw) {
        if (
          !Number.isInteger(si) || !validIdx.has(si) || used.has(si) ||
          localUsed.has(si) || si <= ask || (rejoin != null && si >= rejoin)
        ) {
          log(`Struktur: Frage ask=${ask}, Ast "${label}" hat ungültigen Schritt ${si} -> Frage verworfen.`);
          bad = true;
          break;
        }
        localUsed.add(si);
        steps.push(si);
      }
      if (bad) break;
      steps.sort((x, y) => x - y);
      answers.push({ label, steps });
    }
    if (bad) continue;

    // KONTIGUITÄT (verhindert verwaiste Schritte beim Umbau): jeder Segment-Index STRIKT
    // zwischen ask und rejoin MUSS zu einem Ast dieser Frage gehören. Sonst bliebe zwischen
    // Frage und Wiedereinmündung ein linear verketteter, aber unerreichbarer Schritt hängen.
    // (Kein rejoin -> keine Lücken-Prüfung: dann laufen die Äste bis ans Ende der beteiligten
    //  Segmente, ein späterer freier Schritt wird zum gemeinsamen Folgeschritt.)
    const armSteps = new Set(answers.flatMap((a) => a.steps));
    if (rejoin != null) {
      let gap = false;
      for (let i = ask + 1; i < rejoin; i++) {
        if (validIdx.has(i) && !armSteps.has(i)) { gap = true; break; }
      }
      if (gap) {
        log(`Struktur: Frage ask=${ask} hat eine Lücke zwischen Ästen und rejoin=${rejoin} -> verworfen.`);
        continue;
      }
    }

    // Verschachtelungstiefe: Tiefe = wie viele bereits akzeptierte Fragen diese Frage
    // umschließen (in einem ihrer Äste steckt ask). Über MAX_DEPTH hinaus verwerfen.
    const depth = out.filter((prev) => enclosesIndex(prev, ask)).length + 1;
    if (depth > MAX_DEPTH) {
      log(`Struktur: Frage ask=${ask} überschreitet Tiefe ${MAX_DEPTH} -> verworfen.`);
      continue;
    }

    // Frage akzeptiert -> alle beteiligten Indizes global belegen.
    for (const i of localUsed) used.add(i);
    out.push({ ask, title: normalizeTitle(q.title), answers, rejoin });
  }
  return out;
}

// Umschließt Frage `q` den Segment-Index `i` (in einem ihrer Äste)? Für die Tiefen-Zählung.
function enclosesIndex(q, i) {
  return q.answers.some((a) => a.steps.includes(i));
}

function normalizeLabel(l) {
  if (typeof l !== "string") return null;
  const t = l.trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.slice(0, MAX_LABEL);
}

function normalizeTitle(t) {
  if (typeof t !== "string" || !t.trim()) return null;
  return t.trim().replace(/\s+/g, " ").slice(0, 120);
}

/**
 * Wiring-Planer: übersetzt einen validierten Struktur-Plan in konkrete DB-Mutationen
 * gegen die LINEAR bereits eingefügten Step-Rows (in Video-Reihenfolge).
 *
 * @param {{id:string, segIndex:number}[]} rows - eingefügte Steps in Reihenfolge; segIndex =
 *        der ursprüngliche Segment-Index (nicht jedes Segment ergibt zwingend eine Row!).
 * @param {{mode:string, questions:NormalizedQuestion[]}} plan
 * @returns {{
 *   decisionStepIds:string[],                                   // is_decision=true setzen
 *   removeBranchesFromStepIds:string[],                         // deren lineare Ausgangs-Branches löschen
 *   branches:{step_id:string,label:string|null,color:string|null,target_step_id:string,position:number}[], // neu anzulegen
 *   skipped:number                                              // übersprungene Fragen (Rows fehlten)
 * }}
 *
 * Semantik (siehe src/lib/builder/tree.ts + seed-steply-help.mjs):
 *  - Frage-Row: is_decision=true, alte lineare Weiter-Branch weg, je Ast eine gelabelte
 *    Branch auf den ERSTEN Schritt des Astes (leerer Ast -> direkt auf rejoin/Folgeschritt).
 *  - Ast-Schritte verketten sich linear (label=null) — das bleibt aus dem Live-Aufbau erhalten.
 *  - Der LETZTE Schritt jedes Astes zeigt per null-Label-Branch auf den rejoin-Schritt
 *    (Wiedereinmündung); seine bisherige lineare Branch wird dafür umgehängt.
 */
export function planWiring(rows, plan) {
  const empty = { decisionStepIds: [], removeBranchesFromStepIds: [], branches: [], skipped: 0 };
  if (!plan || plan.mode !== "branched" || !Array.isArray(plan.questions) || !plan.questions.length) return empty;

  // segIndex -> Row (nur eingefügte). Position in der Row-Reihenfolge für "Folgeschritt".
  const rowBySeg = new Map(rows.map((r) => [r.segIndex, r]));
  const orderIndex = new Map(rows.map((r, i) => [r.id, i]));
  const rowAt = (i) => rows[i] || null;

  const decisionStepIds = [];
  const removeBranchesFromStepIds = new Set();
  const branches = [];
  let skipped = 0;
  let pos = 0;
  const branch = (step_id, label, color, target_step_id) => {
    branches.push({ step_id, label, color, target_step_id, position: branches.length });
    void pos;
  };

  for (const q of plan.questions) {
    const askRow = rowBySeg.get(q.ask);
    if (!askRow) { skipped++; continue; } // Frage-Segment ergab keine Row (Frame kaputt) -> überspringen

    // Ast-Schritt-Rows sammeln (nur die tatsächlich eingefügten, in Row-Reihenfolge).
    const armRows = q.answers.map((a) =>
      a.steps.map((si) => rowBySeg.get(si)).filter(Boolean).sort((x, y) => orderIndex.get(x.id) - orderIndex.get(y.id)),
    );

    // Rejoin-Ziel bestimmen: die Row zum rejoin-Segment; fehlt sie/gibt es keins,
    // nimm den ersten Schritt NACH dem letzten beteiligten Segment (linearer Folgeschritt).
    let rejoinRow = q.rejoin != null ? rowBySeg.get(q.rejoin) || null : null;
    if (!rejoinRow) {
      const involved = [q.ask, ...q.answers.flatMap((a) => a.steps)];
      const lastSeg = Math.max(...involved);
      // Erste eingefügte Row mit segIndex > lastSeg:
      rejoinRow = rows.find((r) => r.segIndex > lastSeg) || null;
    }

    // Frage-Row wird Entscheidung; ihre lineare Weiter-Branch entfällt (durch Ast-Branches ersetzt).
    decisionStepIds.push(askRow.id);
    removeBranchesFromStepIds.add(askRow.id);

    q.answers.forEach((a, ai) => {
      const arm = armRows[ai];
      const color = a.label.toLowerCase() === "ja" ? YES_COLOR : a.label.toLowerCase() === "nein" ? NO_COLOR : null;
      if (arm.length) {
        // Frage -> erster Schritt des Astes (gelabelt).
        branch(askRow.id, a.label, color, arm[0].id);
        // Innere Verkettung der Ast-Schritte ist bereits linear vorhanden (aus dem Live-Aufbau)
        // — sofern die Ast-Schritte im Video zusammenhängend lagen. Zur Sicherheit die
        // Ast-Schritte hier explizit linear neu verdrahten (idempotent gegen Umsortierung):
        for (let k = 0; k < arm.length - 1; k++) {
          removeBranchesFromStepIds.add(arm[k].id);
          branch(arm[k].id, null, null, arm[k + 1].id);
        }
        // Letzter Ast-Schritt -> rejoin (Wiedereinmündung), falls es einen gibt.
        const last = arm[arm.length - 1];
        removeBranchesFromStepIds.add(last.id);
        if (rejoinRow) branch(last.id, null, null, rejoinRow.id);
      } else {
        // Leerer Ast: Frage -> direkt auf rejoin/Folgeschritt (gelabelt).
        if (rejoinRow) branch(askRow.id, a.label, color, rejoinRow.id);
        // Ohne rejoin ist ein leerer Ast ein Blatt (Ende) — keine Branch nötig.
      }
    });
  }

  return {
    decisionStepIds,
    removeBranchesFromStepIds: [...removeBranchesFromStepIds],
    branches,
    skipped,
  };
}
