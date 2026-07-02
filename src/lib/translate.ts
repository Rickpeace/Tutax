// Reine Text-/TipTap-Helfer (keine Secrets, kein IO, keine Alias-Imports) -> bewusst
// OHNE `server-only` und self-contained, damit der Übersetzungs-Kern (translate-core.ts)
// auch aus Live-Test-Skripten (Node --experimental-strip-types) läuft.

/** Zusätzlich aktivierbare Sprachen (Deutsch ist immer Original). */
type ExtraLang = "en" | "pl" | "tr";

/**
 * Übersetzungs-Kern (Welle 13). Deutsch bleibt das Original; Übersetzungen liegen
 * in tutorial_translations/step_translations/branch_translations.
 *
 * WICHTIG bei TipTap-Bodies: Wir übersetzen NUR die Text-Knoten, nie die Struktur.
 * Die KI bekommt eine nummerierte Liste der Textsegmente und liefert dieselben
 * Nummern übersetzt zurück; wir mappen sie an ihren Ursprungsort zurück. So bleiben
 * Marks (bold/link/…) und Knotenstruktur unangetastet — die KI schreibt NIE das
 * ganze JSON.
 */

type TipNode = {
  type?: string;
  text?: string;
  content?: TipNode[];
  marks?: unknown[];
  attrs?: Record<string, unknown>;
};

/** Alle nicht-leeren Text-Knoten eines TipTap-Docs in Dokument-Reihenfolge sammeln. */
export function collectTextNodes(doc: unknown): TipNode[] {
  const out: TipNode[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const node = n as TipNode;
    if (node.type === "text" && typeof node.text === "string" && node.text.trim()) {
      out.push(node);
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(doc);
  return out;
}

/** Reine Textsegmente eines TipTap-Docs (zur Anzeige/zum Übersetzen). */
export function bodySegments(doc: unknown): string[] {
  return collectTextNodes(doc).map((n) => n.text as string);
}

/**
 * Ein TipTap-Doc mit übersetzten Segmenten neu aufbauen. `translations` ist parallel
 * zu collectTextNodes(doc); fehlende Einträge behalten den Originaltext (DE-Fallback
 * pro Segment). Gibt eine tiefe Kopie zurück, das Original bleibt unberührt.
 */
export function applyBodyTranslation(
  doc: unknown,
  translations: (string | null | undefined)[],
): unknown {
  if (!doc || typeof doc !== "object") return doc;
  let i = 0;
  const clone = (n: TipNode): TipNode => {
    const copy: TipNode = { ...n };
    if (n.type === "text" && typeof n.text === "string" && n.text.trim()) {
      const tr = translations[i++];
      if (typeof tr === "string" && tr.trim()) copy.text = tr;
    }
    if (Array.isArray(n.content)) copy.content = n.content.map(clone);
    return copy;
  };
  return clone(doc as TipNode);
}

/**
 * Baut die vollständige Segmentliste eines Tutorials in stabiler Reihenfolge:
 * [Titel, Beschreibung?, je Step: Titel? + Body-Segmente…, je Branch: Label?].
 * Die Reihenfolge ist deterministisch, damit sich die KI-Antwort wieder zuordnen
 * lässt. Ein Index-Plan beschreibt, wohin jedes Segment zurückgeschrieben wird.
 */
export type SegmentSlot =
  | { kind: "tutorial-title" }
  | { kind: "tutorial-description" }
  | { kind: "step-title"; stepId: string }
  | { kind: "step-body"; stepId: string; nodeIndex: number }
  | { kind: "branch-label"; branchId: string };

export type TutorialForTranslate = {
  title: string;
  description: string | null;
  steps: { id: string; title: string | null; body: unknown }[];
  branches: { id: string; label: string | null; step_id: string }[];
};

export type SegmentPlan = {
  slots: SegmentSlot[];
  segments: string[];
};

/** Nur nicht-leere Werte werden zu Segmenten (leere Felder brauchen keine Übersetzung). */
export function buildSegmentPlan(t: TutorialForTranslate): SegmentPlan {
  const slots: SegmentSlot[] = [];
  const segments: string[] = [];
  const push = (slot: SegmentSlot, text: string | null | undefined) => {
    if (typeof text === "string" && text.trim()) {
      slots.push(slot);
      segments.push(text);
    }
  };

  push({ kind: "tutorial-title" }, t.title);
  push({ kind: "tutorial-description" }, t.description);

  for (const s of t.steps) {
    push({ kind: "step-title", stepId: s.id }, s.title);
    const nodes = bodySegments(s.body);
    nodes.forEach((seg, idx) =>
      push({ kind: "step-body", stepId: s.id, nodeIndex: idx }, seg),
    );
  }
  for (const b of t.branches) {
    push({ kind: "branch-label", branchId: b.id }, b.label);
  }

  return { slots, segments };
}

/**
 * Übersetzte Segmente (parallel zu plan.segments) in Upsert-Zeilen für die drei
 * Tabellen umwandeln. Fehlende Segmente fallen pro Feld auf das Original zurück:
 * für Titel/Label heißt das Original-Text; für Bodies der unveränderte Text-Knoten.
 */
export type TranslationRows = {
  tutorial: { title: string; description: string | null };
  steps: { step_id: string; title: string | null; body: unknown }[];
  branches: { branch_id: string; label: string | null }[];
};

export function assembleTranslationRows(
  source: TutorialForTranslate,
  plan: SegmentPlan,
  translated: (string | null | undefined)[],
): TranslationRows {
  // Schnellzugriff Slot -> übersetzter Wert (nur nicht-leere behalten).
  const trByKey = new Map<string, string>();
  plan.slots.forEach((slot, i) => {
    const v = translated[i];
    if (typeof v === "string" && v.trim()) trByKey.set(slotKey(slot), v);
  });

  const tutorialTitle = trByKey.get(slotKey({ kind: "tutorial-title" })) ?? source.title;
  const tutorialDescription =
    trByKey.get(slotKey({ kind: "tutorial-description" })) ?? source.description ?? null;

  const steps = source.steps.map((s) => {
    const title =
      trByKey.get(slotKey({ kind: "step-title", stepId: s.id })) ?? s.title ?? null;
    // Body: pro Text-Knoten den übersetzten Wert (oder Original) einsetzen.
    const nodes = bodySegments(s.body);
    const perNode = nodes.map(
      (_seg, idx) =>
        trByKey.get(slotKey({ kind: "step-body", stepId: s.id, nodeIndex: idx })),
    );
    const body = applyBodyTranslation(s.body, perNode);
    return { step_id: s.id, title, body };
  });

  const branches = source.branches.map((b) => ({
    branch_id: b.id,
    label: trByKey.get(slotKey({ kind: "branch-label", branchId: b.id })) ?? b.label ?? null,
  }));

  return {
    tutorial: { title: tutorialTitle, description: tutorialDescription },
    steps,
    branches,
  };
}

function slotKey(slot: SegmentSlot): string {
  switch (slot.kind) {
    case "tutorial-title":
      return "tt";
    case "tutorial-description":
      return "td";
    case "step-title":
      return `st:${slot.stepId}`;
    case "step-body":
      return `sb:${slot.stepId}:${slot.nodeIndex}`;
    case "branch-label":
      return `bl:${slot.branchId}`;
  }
}

/** Zeichen-Obergrenze fürs KI-Input (Kostenschutz). */
export const MAX_TRANSLATE_CHARS = 30_000;

/**
 * Prompt-Baustein: nummerierte Segmentliste. Die KI soll GENAU diese Nummern
 * übersetzt zurückgeben (JSON-Objekt {"1": "...", "2": "..."}), damit wir 1:1
 * zuordnen können. Segmente werden hart bei MAX_TRANSLATE_CHARS gekappt.
 */
export function segmentsToPrompt(segments: string[]): string {
  const lines: string[] = [];
  let total = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i].replace(/\r?\n/g, " ").trim();
    const line = `${i + 1}. ${seg}`;
    total += line.length;
    if (total > MAX_TRANSLATE_CHARS) break; // Rest bleibt unübersetzt -> DE-Fallback
    lines.push(line);
  }
  return lines.join("\n");
}

export function targetLanguageName(lang: ExtraLang): string {
  return { en: "English", pl: "Polish", tr: "Turkish" }[lang];
}

/**
 * Delta-Plan für EINEN Schritt (Titel + Body-Segmente). Gleiche Slot-/Segment-
 * Semantik wie buildSegmentPlan, aber nur für diesen Schritt — für billige
 * Einzel-Übersetzungen (Delta-Sync bei Edits).
 */
export function buildStepPlan(step: {
  id: string;
  title: string | null;
  body: unknown;
}): SegmentPlan {
  const slots: SegmentSlot[] = [];
  const segments: string[] = [];
  if (typeof step.title === "string" && step.title.trim()) {
    slots.push({ kind: "step-title", stepId: step.id });
    segments.push(step.title);
  }
  bodySegments(step.body).forEach((seg, idx) => {
    if (seg.trim()) {
      slots.push({ kind: "step-body", stepId: step.id, nodeIndex: idx });
      segments.push(seg);
    }
  });
  return { slots, segments };
}

/** Delta-Rows für einen Schritt aus den übersetzten Segmenten bauen (mit DE-Fallback). */
export function assembleStepRow(
  step: { id: string; title: string | null; body: unknown },
  plan: SegmentPlan,
  translated: (string | null | undefined)[],
): { step_id: string; title: string | null; body: unknown } {
  const trByKey = new Map<string, string>();
  plan.slots.forEach((slot, i) => {
    const v = translated[i];
    if (typeof v === "string" && v.trim()) trByKey.set(slotKey(slot), v);
  });
  const title =
    trByKey.get(slotKey({ kind: "step-title", stepId: step.id })) ?? step.title ?? null;
  const nodes = bodySegments(step.body);
  const perNode = nodes.map((_seg, idx) =>
    trByKey.get(slotKey({ kind: "step-body", stepId: step.id, nodeIndex: idx })),
  );
  const body = applyBodyTranslation(step.body, perNode);
  return { step_id: step.id, title, body };
}
