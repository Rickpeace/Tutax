import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI, aiConfigured } from "@/lib/ai";
import { openai } from "@/lib/openai";
import {
  mkBody,
  isPasswordField,
  labelHead,
  templateBodyText,
  templateTitle,
  type GuideStepInput,
} from "@/lib/guide";
import { normalizeDomain } from "@/lib/site-domains";
import {
  describeInteractionForAi,
  displayKeyDe,
  dropLabelOf,
  hoverLabelOf,
  modifierKeysDe,
} from "@/lib/interaction-text";
import type { StepInteraction } from "@/lib/types";
import {
  GUIDE_REFINE_SYSTEM,
  GUIDE_REFINE_EXAMPLE_USER,
  GUIDE_REFINE_EXAMPLE_ASSISTANT,
  guideRefineUser,
  type GuideRefinePromptStep,
} from "@/lib/ai-prompts";

// KI-FEINSCHLIFF der Schritt-Texte (Welle 22, überarbeitet 09/2026). Zwei Aufrufer, EINE Logik:
//   • Sofort-Anleitung: refineGuideSteps() via after() nach dem Insert (speichert direkt).
//   • Editor „Texte mit KI verbessern“: suggestStepTexts() liefert nur VORSCHLÄGE.
// Billig + ausfallsicher: reine Chat-Calls (keine Bilder), je bis zu 10 Schritte parallel. Jede
// KI-Antwort wird hart geprüft (paarige Zitate, Längen, Zitate nur aus echten Beschriftungen/
// Texten, Interaktion erhalten, Platzhalter vollständig) — sonst bleibt die Vorlage stehen.
//
// DATENSCHUTZ: eingetippte Werte erreichen die KI NIE. Jedes Vorkommen (auch in Seitentiteln
// anderer Schritte) wird vor dem Call durch {{WERT}}/{{WERT2}}/… ersetzt und danach wieder
// eingesetzt; buildRefineRequest() prüft das am fertigen Prompt und bricht sonst ab.

/** Ein Schritt als Eingabe für den Feinschliff (Aufnahme ODER bestehende Anleitung). */
export type RefineStep = {
  title: string; // bisheriger Titel (Vorlage oder von Hand)
  bodyText: string; // bisheriger Text als ein Absatz ("" = keiner)
  label: string; // exakte Bildschirm-Beschriftung ("" = keine bekannt)
  action: "click" | "type";
  interaction?: StepInteraction | null; // Rechtsklick/Enter/… — MUSS erhalten bleiben
  values?: string[]; // eingetippte Werte — werden maskiert, nie gesendet
  password?: boolean; // Passwortfeld: nie ein Wert, Titel „Passwort eingeben“
  fieldKind?: string | null; // „Suchfeld“, „Textfeld“ … (nur Eingaben)
  element?: string | null; // Art des geklickten Elements („Link“, „Kontrollkästchen“ …)
  page?: string | null; // Seitentitel beim Klick
  bodyLocked?: boolean; // formatierter Text (Liste, Fett …) → nur der Titel wird verbessert
  extraSources?: string[]; // weitere wörtlich zitierbare Angaben (z. B. Dateiname)
  requireLabel?: boolean; // Ergebnis MUSS die Beschriftung (bzw. ihren Anfang) in „…“ nennen
  quote?: string; // empfohlenes Zitat, wenn die Beschriftung Anhängsel trägt („Home“ statt „Home (…)“)
};

export type RefineContext = { guideTitle?: string | null; domains?: string[] };

/**
 * Art des geklickten Elements für die KI (Erweiterungs-Audit 24.09.: ohne diese Angabe erfand
 * sie Handlungen — Link „filter()“ → „Nach Filter suchen“, Häkchen → „Aufgabe öffnen“).
 */
const ELEMENT_KIND: Record<string, string> = {
  link: "Link",
  button: "Schaltfläche",
  checkbox: "Kontrollkästchen",
  radio: "Optionsfeld",
  switch: "Schalter",
  tab: "Reiter",
  menuitem: "Menüeintrag",
  menuitemcheckbox: "Menüeintrag zum Ankreuzen",
  option: "Listeneintrag",
  treeitem: "Eintrag in einer Baumansicht",
};
export function elementKindWord(role: string | null | undefined): string | null {
  return ELEMENT_KIND[(role ?? "").toLowerCase()] ?? null;
}

/** Auswahlliste (<select>): die Aufnahme nimmt die gewählte Option als Beschriftung UND Wert. */
export function isChoiceStep(s: GuideStepInput): boolean {
  const role = s.selector?.role ?? "";
  return (
    s.action === "type" &&
    (role === "combobox" || role === "listbox") &&
    !!s.typed_value &&
    labelHead(s.typed_value) === labelHead(s.label ?? "")
  );
}

/** Eingabe-Schritt einer frischen Aufnahme (Vorlagen-Texte) → Feinschliff-Eingabe. */
export function refineStepFromGuide(steps: GuideStepInput[], i: number): RefineStep {
  const s = steps[i];
  const role = s.selector?.role ?? "";
  const password = s.action === "type" && isPasswordField(s.label, s.selector?.css);
  return {
    title: templateTitle(s, i),
    bodyText: templateBodyText(s, i > 0 ? steps[i - 1] : null),
    label: s.label,
    action: s.action,
    interaction: s.interaction ?? null,
    values: s.typed_value && !password ? [s.typed_value] : [],
    password,
    fieldKind:
      role === "searchbox" || /such|search/i.test(s.label)
        ? "Suchfeld"
        : isChoiceStep(s)
          ? "Auswahlliste"
          : role === "combobox"
            ? "Auswahlfeld"
            : "Textfeld",
    element: s.action === "click" ? elementKindWord(role) : null,
    page: s.title || null,
    extraSources: s.file_meta?.filename ? [s.file_meta.filename] : [],
    requireLabel: !!s.label,
    quote: quoteHint(s.label, s.selector?.text),
  };
}

/**
 * Empfohlenes Zitat für lange/verzierte Beschriftungen: der sichtbare Text des Elements, wenn er
 * ein kürzerer Teil der Beschriftung ist (aria-label „Home (New unread posts)“ ↔ sichtbar „Home“),
 * sonst der kennzeichnende Anfang (labelHead). undefined = Beschriftung ist schon gut.
 */
export function quoteHint(label: string, visible?: string | null): string | undefined {
  const l = oneLine(label);
  if (!l) return undefined;
  let q = labelHead(l);
  const v = oneLine(visible ?? "");
  if (v.length >= 2 && v.length < q.length && l.startsWith(v)) q = v;
  return q && q !== l && l.includes(q.replace(/…$/, "")) && !q.endsWith("…") ? q : undefined;
}

/**
 * Tiptap-Body → Klartext + ob er „einfach“ ist (höchstens EIN Absatz aus reinem Text, ohne
 * Fett/Links/Listen). Nur einfache Texte darf die KI ersetzen — sonst ginge Formatierung verloren.
 */
export function bodyInfo(body: unknown): { text: string; simple: boolean } {
  if (!body || typeof body !== "object") return { text: "", simple: true };
  let simple = true;
  let paragraphs = 0;
  const parts: string[] = [];
  const walk = (n: unknown, depth: number) => {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; text?: string; marks?: unknown[]; content?: unknown[] };
    if (node.type === "text") {
      if (Array.isArray(node.marks) && node.marks.length) simple = false;
      parts.push(node.text ?? "");
      return;
    }
    if (node.type === "hardBreak") {
      parts.push(" ");
      return;
    }
    if (node.type === "paragraph") {
      const before = parts.join("").trim();
      (node.content ?? []).forEach((c) => walk(c, depth + 1));
      if (parts.join("").trim() !== before) paragraphs += 1;
      parts.push(" ");
      return;
    }
    if (node.type !== "doc" || depth > 0) simple = false;
    (node.content ?? []).forEach((c) => walk(c, depth + 1));
    parts.push(" ");
  };
  walk(body, 0);
  if (paragraphs > 1) simple = false;
  return { text: oneLine(parts.join("")), simple };
}

const INPUT_ROLES = new Set(["textbox", "searchbox"]);
const INPUT_WORDS = /eingeben|eintragen|ausfüllen|suchen|tippen/i;

/**
 * Gespeicherter Schritt (Editor „Texte mit KI verbessern“) → Feinschliff-Eingabe; null = nichts
 * zu verbessern. Einen gespeicherten Eingabewert gibt es nicht — bei Eingabe-Schritten gelten
 * zitierte Angaben, die nicht zur Beschriftung gehören, als Wert und werden maskiert (die KI
 * sieht sie nicht und muss sie unverändert behalten).
 */
export function refineStepFromSaved(s: {
  title: string | null;
  body: unknown;
  selector: { css?: string; text?: string; role?: string } | null;
  interaction: StepInteraction | null;
  file_meta?: { filename?: string } | null;
}): RefineStep | null {
  const title = oneLine(s.title ?? "");
  const { text, simple } = bodyInfo(s.body);
  const label = oneLine(s.selector?.text ?? "");
  if (!title && !text) return null;
  const role = s.selector?.role ?? "";
  const isInput =
    INPUT_ROLES.has(role) || !!s.interaction?.enter || (role === "combobox" && INPUT_WORDS.test(`${title} ${text}`));
  const password = isInput && isPasswordField(label, s.selector?.css);
  const values: string[] = [];
  if (isInput && !password) {
    const pageQuotes = new Set(
      [...`${title} ${text}`.matchAll(/Seite „([^„“]*)“/g)].map((m) => m[1].trim()),
    );
    for (const q of [...quotesOf(title), ...quotesOf(text)]) {
      if (q && !q.endsWith("…") && q.length <= 80 && !label.includes(q) && !pageQuotes.has(q) && !values.includes(q)) {
        values.push(q);
      }
    }
  }
  return {
    title,
    bodyText: text,
    label,
    action: isInput ? "type" : "click",
    interaction: s.interaction ?? null,
    values,
    password,
    fieldKind: role === "searchbox" || /such|search/i.test(label) ? "Suchfeld" : "Textfeld",
    page: null,
    bodyLocked: !simple,
    extraSources: s.file_meta?.filename ? [s.file_meta.filename] : [],
    quote: quoteHint(label),
  };
}

/** Kontext einer Aufnahme: Anleitungstitel (ohne Datums-Standardtitel) + Domains der Schritte. */
export function refineContextFromGuide(title: string | null, steps: GuideStepInput[]): RefineContext {
  const domains = [...new Set(steps.map((s) => normalizeDomain(s.url || "")).filter((d): d is string => !!d))];
  return { guideTitle: title && !/^Anleitung vom /.test(title) ? title : null, domains };
}

/** Ergebnis je Schritt: neuer Titel + Text (body null = Text bleibt), oder null = unverändert. */
export type RefineResult = { title: string; body: string | null } | null;

const CHUNK = 10;
const TITLE_MAX = 50; // maskiert (Platzhalter zählen als 8–9 Zeichen)
const TITLE_MAX_RESTORED = 90; // mit eingesetztem Wert (Werte sind bis 80 Zeichen lang)
const BODY_MAX = 220;
const PAGE_MAX = 80;
const PH_RE = /\{\{WERT(\d*)\}\}/g;

const placeholderName = (i: number) => (i === 0 ? "{{WERT}}" : `{{WERT${i + 1}}}`);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const valueRe = (v: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(v)}(?![\\p{L}\\p{N}])`, "gu");
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

export type Masker = {
  mask: (s: string) => string;
  restore: (s: string) => string;
  placeholderOf: (v: string) => string | null;
  values: string[];
};

/** Werte → Platzhalter (längere zuerst, nur an Wortgrenzen, Groß/Klein genau). */
function makeMasker(steps: RefineStep[]): Masker {
  const values: string[] = [];
  for (const s of steps) {
    for (const v of s.values ?? []) {
      const t = oneLine(v);
      if (t && !values.includes(t)) values.push(t);
    }
  }
  const byLength = values.map((v, i) => ({ v, ph: placeholderName(i) })).sort((a, b) => b.v.length - a.v.length);
  const phToValue = new Map(values.map((v, i) => [placeholderName(i), v]));
  return {
    values,
    mask: (s) => byLength.reduce((acc, { v, ph }) => acc.replace(valueRe(v), ph), s),
    restore: (s) => s.replace(PH_RE, (m) => phToValue.get(m) ?? m),
    placeholderOf: (v) => {
      const i = values.indexOf(oneLine(v));
      return i >= 0 ? placeholderName(i) : null;
    },
  };
}

/** Maskierte Sicht auf einen Schritt (für Prompt UND Prüfung). */
export type Masked = {
  n: number;
  step: RefineStep;
  title: string;
  body: string;
  label: string;
  page: string;
  required: string[]; // eigene Platzhalter, die im Ergebnis vorkommen MÜSSEN
  allowed: Set<string>; // Platzhalter, die vorkommen DÜRFEN
  sources: string[]; // Texte, aus denen Zitate stammen dürfen
  labelReferenced: boolean; // zitiert der bisherige Text die Beschriftung? → Ergebnis auch
};

const quotesOf = (s: string) => [...s.matchAll(/„([^„“]*)“/g)].map((m) => m[1].trim());

function fieldKindWord(s: RefineStep): string | undefined {
  if (s.action !== "type") return undefined;
  if (s.password) return "Passwortfeld";
  return s.fieldKind || "Eingabefeld";
}

export type RefineRequest = {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  masked: Masked[];
  masker: Masker;
};

/**
 * Prompt für EINEN Call bauen (steps = ein Abschnitt, nOffset = Nummer des ersten Schritts − 1).
 * Getrennt testbar: der fertige Prompt darf keinen eingetippten Wert enthalten (wird geprüft).
 */
export function buildRefineRequest(
  ctx: RefineContext,
  steps: RefineStep[],
  opts?: { masker?: Masker; nOffset?: number; prevPage?: string | null },
): RefineRequest {
  const masker = opts?.masker ?? makeMasker(steps);
  const off = opts?.nOffset ?? 0;
  let prevPage = opts?.prevPage ?? null;
  const masked: Masked[] = steps.map((s, i) => {
    const page = oneLine(s.page ?? "").slice(0, PAGE_MAX);
    const showPage = page && page !== prevPage ? masker.mask(page) : "";
    prevPage = page || prevPage;
    const title = masker.mask(oneLine(s.title));
    const body = masker.mask(oneLine(s.bodyText));
    const label = masker.mask(oneLine(s.label));
    const own = (s.values ?? []).map((v) => masker.placeholderOf(v)).filter((p): p is string => !!p);
    const it = s.interaction ?? null;
    const extra = [hoverLabelOf(it), dropLabelOf(it), it?.key ? displayKeyDe(it.key) : "", ...(s.extraSources ?? [])]
      .filter(Boolean)
      .map((x) => masker.mask(oneLine(x)));
    const inAll = [title, body, label, showPage, ...extra].join(" ");
    const allowed = new Set([...own, ...[...inAll.matchAll(PH_RE)].map((m) => m[0])]);
    const oldQuotes = [...quotesOf(title), ...quotesOf(body)].map((q) => q.replace(/…$/, "").trim()).filter(Boolean);
    const labelReferenced =
      !!label && (!!s.requireLabel || oldQuotes.some((q) => q.length >= 2 && label.includes(q)));
    return {
      n: off + i + 1,
      step: s,
      title,
      body,
      label,
      page: showPage,
      required: [...new Set(own)],
      allowed,
      sources: [label, title, body, page ? masker.mask(page) : "", masker.mask(oneLine(ctx.guideTitle ?? "")), ...extra].filter(Boolean),
      labelReferenced,
    };
  });

  const promptSteps: GuideRefinePromptStep[] = masked.map((m) => {
    const s = m.step;
    const interaktion = describeInteractionForAi(s.interaction ?? null);
    const feld = fieldKindWord(s);
    return {
      n: m.n,
      aktion: s.action === "type" ? "eingabe" : "klick",
      label: m.label || null,
      ...(s.quote && m.label ? { zitat: masker.mask(oneLine(s.quote)) } : {}),
      ...(feld ? { feld } : {}),
      ...(s.element && s.action === "click" ? { element: s.element } : {}),
      ...(interaktion ? { interaktion: masker.mask(interaktion) } : {}),
      ...(m.required.length && !s.password ? { wert: m.required.join(", ") } : {}),
      ...(m.page ? { seite: m.page } : {}),
      titel_bisher: m.title,
      text_bisher: m.body,
      ...(s.bodyLocked ? { text_fest: true as const } : {}),
    };
  });

  const user = guideRefineUser(
    {
      guideTitle: ctx.guideTitle ? masker.mask(oneLine(ctx.guideTitle)).slice(0, 120) : null,
      domains: (ctx.domains ?? []).slice(0, 5),
    },
    promptSteps,
  );
  const messages: RefineRequest["messages"] = [
    { role: "system", content: GUIDE_REFINE_SYSTEM },
    { role: "user", content: GUIDE_REFINE_EXAMPLE_USER },
    { role: "assistant", content: GUIDE_REFINE_EXAMPLE_ASSISTANT },
    { role: "user", content: user },
  ];
  // Harte Datenschutz-Sicherung: kein eingetippter Wert im fertigen Prompt.
  const all = messages.map((m) => m.content).join("\n");
  for (const v of masker.values) {
    if (valueRe(v).test(all)) throw new Error("Eingabewert im KI-Prompt – Abbruch.");
  }
  return { messages, masked, masker };
}

/** Anführungszeichen paarig und nicht verschachtelt? Gerade/englische Zeichen sind tabu. */
export function quotesBalanced(s: string): boolean {
  if (/["”]/.test(s)) return false;
  let open = false;
  for (const ch of s) {
    if (ch === "„") {
      if (open) return false;
      open = true;
    } else if (ch === "“") {
      if (!open) return false;
      open = false;
    }
  }
  return !open;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Bleibt die Art der Bedienung in Titel/Text erhalten? (exportiert fuer Tests) */
export function keepsInteraction(text: string, it: StepInteraction | null | undefined): boolean {
  if (!it) return true;
  if (it.enter && !/enter|eingabetaste|↵/i.test(text)) return false;
  if (it.variant === "right" && !/recht/i.test(text)) return false;
  if (it.variant === "double" && !/doppel/i.test(text)) return false;
  if (it.variant === "drag" && !/zieh|drag/i.test(text)) return false;
  if (it.variant === "key" && it.key && !text.toLowerCase().includes(displayKeyDe(it.key).toLowerCase())) return false;
  // Welle 55 — Schritte OHNE Element: die KI darf daraus keinen Klick machen.
  if (it.variant === "nav") {
    if (it.nav === "back" && !/zurück|vorherig|vorig/i.test(text)) return false;
    if (it.nav === "reload" && !/neu\s*lad|\bneu\b|aktualisier|\bf5\b/i.test(text)) return false;
    if (it.nav === "goto" && !/seite|wechsel|weiter/i.test(text)) return false;
  }
  if (it.variant === "spot" && !/markiert/i.test(text)) return false;
  if (it.variant === "result" && !/ergebnis|abschluss|fertig/i.test(text)) return false;
  // Zusatztasten (L3): ohne sie ist die Anleitung falsch (Auswahl geht verloren).
  const mods = modifierKeysDe(it);
  if (mods && !mods.split("+").every((k) => text.toLowerCase().includes(k.toLowerCase()))) return false;
  if (it.hover && !/maus|fahren|zeige|hover|beweg/i.test(text)) return false;
  return true;
}

/**
 * Abschluss-Bild (Welle 55, L2 Variante A): reines Ergebnis-Bild ohne Bedienung. Es geht GAR
 * NICHT erst an die KI — es gibt nichts zu formulieren und „Ergebnis“ soll stabil bleiben.
 */
export function isResultStep(s: { interaction?: StepInteraction | null }): boolean {
  return s.interaction?.variant === "result";
}

/**
 * Eine KI-Antwort für EINEN Schritt prüfen und (bei Erfolg) die Werte wieder einsetzen.
 * Rückgabe null = Vorlage/bisherigen Text behalten. Exportiert für Tests.
 */
export function checkRefined(m: Masked, raw: { title?: unknown; body?: unknown }, masker: Masker): RefineResult {
  const s = m.step;
  let title = typeof raw.title === "string" ? oneLine(raw.title) : "";
  let body = typeof raw.body === "string" ? oneLine(raw.body) : "";
  if (s.bodyLocked) body = "";
  if (s.password) title = "Passwort eingeben";
  if (!title || title.length > TITLE_MAX) return null;
  if (body.length > BODY_MAX) return null;
  const both = `${title} ${body}`;
  if (/[\p{Extended_Pictographic}*`<>]/u.test(both)) return null; // keine Emojis/Markdown/HTML
  if (!quotesBalanced(title) || !quotesBalanced(body)) return null;
  // Jedes Zitat stammt wörtlich aus Beschriftung/bisherigem Text/Kontext (nie übersetzt/erfunden).
  const quotes = [...quotesOf(title), ...quotesOf(body)];
  for (const q0 of quotes) {
    const q = q0.replace(/…$/, "").trim();
    if (!q) return null;
    if (!m.sources.some((src) => src.includes(q))) return null;
  }
  // Wurde die Beschriftung bisher genannt, muss sie (bzw. ihr Anfang) weiterhin zitiert sein.
  if (m.labelReferenced && !s.bodyLocked) {
    const min = Math.min(3, m.label.length);
    if (!quotes.some((q) => q.length >= min && m.label.includes(q.replace(/…$/, "").trim()))) return null;
  }
  // Platzhalter: nur erlaubte, alle geforderten.
  const used = new Set([...both.matchAll(PH_RE)].map((x) => x[0]));
  for (const p of used) if (!m.allowed.has(p)) return null;
  if (!s.password) for (const p of m.required) if (!used.has(p)) return null;
  // Interaktion darf nicht verloren gehen (bei festem Text zählt der bisherige mit).
  if (!keepsInteraction(`${title} ${s.bodyLocked ? m.body : body}`, s.interaction)) return null;
  // Text wiederholt nicht den Titel.
  if (body && norm(body) === norm(title)) return null;

  const outTitle = masker.restore(title);
  const outBody = s.bodyLocked ? null : masker.restore(body);
  // Kein Platzhalter-Rest (unbekannte/kaputte Schreibweise) → lieber die Vorlage.
  if (/\{\{|\}\}/.test(`${outTitle} ${outBody ?? ""}`)) return null;
  if (outTitle.length > TITLE_MAX_RESTORED) return null;
  // Nichts geändert → kein Vorschlag.
  if (outTitle === oneLine(s.title) && (outBody === null || outBody === oneLine(s.bodyText))) return null;
  return { title: outTitle, body: outBody };
}

type ChatCreate = (args: {
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  response_format: { type: "json_object" };
  max_completion_tokens: number;
}) => Promise<{ choices: { message: { content: string | null } }[] }>;

/**
 * Vorschläge für alle Schritte (gleiche Reihenfolge). Ausfallsicher: ein fehlgeschlagener
 * Abschnitt liefert null-Einträge; `failed` zählt die gescheiterten Calls.
 */
export async function suggestStepTexts(
  ctx: RefineContext,
  steps: RefineStep[],
  opts?: { create?: ChatCreate },
): Promise<{ results: RefineResult[]; failed: number; calls: number }> {
  const results: RefineResult[] = steps.map(() => null);
  if (!steps.length) return { results, failed: 0, calls: 0 };
  const create: ChatCreate =
    opts?.create ?? ((args) => openai().chat.completions.create(args) as ReturnType<ChatCreate>);
  const masker = makeMasker(steps);
  const chunks: { from: number; list: RefineStep[] }[] = [];
  for (let i = 0; i < steps.length; i += CHUNK) chunks.push({ from: i, list: steps.slice(i, i + CHUNK) });
  let failed = 0;
  await Promise.all(
    chunks.map(async ({ from, list }) => {
      try {
        const prevPage = from > 0 ? oneLine(steps[from - 1].page ?? "").slice(0, PAGE_MAX) || null : null;
        const req = buildRefineRequest(ctx, list, { masker, nOffset: from, prevPage });
        const completion = await create({
          model: AI.models.chat,
          messages: req.messages,
          response_format: { type: "json_object" },
          max_completion_tokens: 4000,
        });
        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { steps?: unknown };
        const arr = Array.isArray(parsed.steps) ? parsed.steps : [];
        const byN = new Map<number, Record<string, unknown>>();
        for (const r of arr) {
          if (r && typeof r === "object" && typeof (r as { n?: unknown }).n === "number") {
            byN.set((r as { n: number }).n, r as Record<string, unknown>);
          }
        }
        if (!byN.size) throw new Error("leere KI-Antwort");
        req.masked.forEach((m, i) => {
          const raw = byN.get(m.n);
          if (raw) results[from + i] = checkRefined(m, raw, masker);
        });
      } catch (e) {
        failed += 1;
        console.error("[guide-ai] Feinschliff-KI-Fehler:", e instanceof Error ? e.message : e);
      }
    }),
  );
  return { results, failed, calls: chunks.length };
}

/**
 * Feinschliff direkt nach der Aufnahme (via after()). Aktualisiert title/body der bereits
 * angelegten Steps. Vollständig ausfallsicher: ohne KI-Key oder bei jedem Fehler bleibt alles
 * beim Alten (die Vorlagen sind bereits gespeichert).
 *
 * @param admin  Admin-Client (Update immer eng auf die konkreten Step-IDs begrenzt).
 */
export async function refineGuideSteps(
  admin: SupabaseClient,
  ctx: RefineContext,
  steps: (RefineStep & { id: string })[],
  guide?: { tutorialId: string; currentTitle: string | null },
): Promise<void> {
  if (!aiConfigured() || steps.length === 0) return;
  const { results } = await suggestStepTexts(ctx, steps);
  await Promise.all(
    steps.map(async (s, i) => {
      const r = results[i];
      if (!r) return;
      const patch: Record<string, unknown> = { title: r.title };
      if (r.body !== null) patch.body = mkBody(r.body);
      await admin.from("steps").update(patch).eq("id", s.id);
    }),
  ).catch((e) => {
    console.error("[guide-ai] Feinschliff-Update-Fehler:", e instanceof Error ? e.message : e);
  });
  // Anleitungstitel: steht noch der Datums-Standardtitel, einen passenden vorschlagen (Erweiterungs-
  // Audit 24.09.: acht Aufnahmen = acht Karten „Anleitung vom 24.09.2026“). Nur solange niemand
  // den Titel inzwischen geändert hat (Update nur bei unverändertem Titel).
  if (guide?.currentTitle && DEFAULT_GUIDE_TITLE_RE.test(guide.currentTitle)) {
    const titles = steps.map((s, i) => results[i]?.title ?? s.title);
    const title = await suggestGuideTitle(ctx, steps, titles).catch(() => null);
    if (title) {
      await admin
        .from("tutorials")
        .update({ title })
        .eq("id", guide.tutorialId)
        .eq("title", guide.currentTitle)
        .then(
          () => undefined,
          () => undefined,
        );
    }
  }
}

const DEFAULT_GUIDE_TITLE_RE = /^Anleitung vom /;
const GUIDE_TITLE_SYS =
  'Gib NUR JSON {"title":"..."}. Kurzer, prägnanter Titel für eine Klick-Anleitung auf Deutsch: das Ziel der ganzen Anleitung, höchstens 6 Wörter, handlungsorientiert (z. B. „Rechnung als PDF exportieren“), ohne Anführungszeichen, ohne Datum. Erfinde nichts, was nicht aus den Schritten hervorgeht. Platzhalter wie {{WERT}} nie in den Titel übernehmen.';

/** Titel-Vorschlag aus den (maskierten) Schritt-Titeln — eingetippte Werte erreichen die KI nie. */
async function suggestGuideTitle(ctx: RefineContext, steps: RefineStep[], titles: string[]): Promise<string | null> {
  const masker = makeMasker(steps);
  const list = titles.map((t) => masker.mask(oneLine(t))).filter(Boolean).slice(0, 25);
  if (!list.length) return null;
  const user = [
    ctx.domains?.length ? `Website: ${ctx.domains.slice(0, 3).join(", ")}` : "",
    `Schritte:\n${list.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
  if (masker.values.some((v) => v && user.includes(v))) return null; // Datenschutz-Riegel
  const completion = await openai().chat.completions.create({
    model: AI.models.chat,
    messages: [
      { role: "system", content: GUIDE_TITLE_SYS },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 200,
  });
  const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { title?: unknown };
  const t = typeof raw.title === "string" ? oneLine(raw.title).replace(/^[„"“]+|[“"”]+$/g, "").trim() : "";
  if (!t || t.length > 80 || /\{\{|WERT/.test(t) || DEFAULT_GUIDE_TITLE_RE.test(t)) return null;
  return t;
}
