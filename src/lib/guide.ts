// Geteilter Kern der „Sofort-Anleitung" (Welle 22): die Extension nimmt bei jedem
// Klick einen Screenshot + das geklickte Element (BoundingClientRect, Label, Aktion)
// auf und lädt daraus in Sekunden einen fertigen Tutorial-ENTWURF hoch — ohne Video,
// ohne Server-KI-Pipeline (Tango-Stil).
//
// Diese Datei ist der server-only Kern für /api/recorder/guide-* : reine Validierung +
// Vorlagen-Texte, KEINE OpenAI/Storage-Aufrufe (die machen die Routen). So bleibt sie
// leicht testbar und die Regeln liegen an EINER Stelle.
import "server-only";
import type { Highlight, StepCondition, StepInteraction, StepJump } from "@/lib/types";
import {
  displayKeyDe,
  dropLabelOf,
  hoverLabelOf,
  modifierKeysDe,
  modifierPhraseDe,
} from "@/lib/interaction-text";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/lib/highlight-color";
import { CATEGORY_NAME_MAX } from "@/lib/category-name";

// Obergrenzen (Kostenbremse + Speicher): eine Anleitung hat höchstens so viele Schritte.
export const MAX_GUIDE_STEPS = 40;
const LABEL_MAX = 60;
const TITLE_MAX = 60;

// Primärfarbe (Koralle, Design-Handoff 07/2026) für das eine Highlight-Rechteck je Schritt.
// Gilt als Standardfarbe -> erscheint auf der Hilfe-Seite in der Firmenfarbe (lib/highlight-color.ts).
export const GUIDE_HIGHLIGHT_COLOR = DEFAULT_HIGHLIGHT_COLOR;

export type GuideAction = "click" | "type";

// Robuster Element-Selektor je Schritt (Welle 24, Vorbau für Live-Führung/Anleitungs-TÜV).
// Wird NUR erfasst + gespeichert (steps.selector, jsonb) — noch nirgends gelesen.
export type GuideSelector = {
  css?: string; // kürzester eindeutiger CSS-Pfad (<=400), OHNE generierte Klassennamen
  text?: string; // sichtbarer Kurztext (<=80)
  role?: string; // implizite/explizite ARIA-Rolle (<=40)
  shadow?: string[]; // Welle 48: Shadow-Host-Kette (außen→innen); css/text/role gelten darin
};

const SHADOW_DEPTH_MAX = 5;
// Welle 55: "nav" (Seitenwechsel ohne Klick), "spot" (Klick ohne brauchbares Element),
// "result" (Abschluss-Bild) kommen dazu. Alle drei tragen NIE einen Selektor.
const INTERACTION_VARIANTS = ["right", "double", "drag", "key", "nav", "spot", "result"] as const;
const INTERACTION_MODIFIERS = ["ctrl", "meta", "alt", "shift"] as const;
// Varianten, die per Definition KEIN Ziel auf der Seite haben (s. validateGuideSteps).
export const NO_TARGET_VARIANTS = ["nav", "spot", "result"] as const;
const INTERACTION_NAV_KINDS = ["back", "reload", "goto"] as const;

// Ein normalisiertes sensibles Rechteck (Auto-Schwärzung, Welle 28) – wie rect, 0..1.
export type SensitiveRect = { x: number; y: number; w: number; h: number };

// ── Datei-Brücke (Welle 39) ──────────────────────────────────────────────────
// Die Aufnahme merkt sich an einem Schritt, dass ein Klick einen DOWNLOAD ausgelöst hat
// bzw. dass ein Datei-Feld einen UPLOAD bekam. Es reisen NUR Metadaten (Rolle + Dateiname/
// MIME/Größe) — NIEMALS die Datei-Bytes (die bleiben lokal in der Extension). Streng, aber
// tolerant validiert; kaputt/unbekannt → verworfen (Aufnahme geht nie verloren).
export type GuideFileRole = "download" | "upload";
export type GuideFileMeta = {
  role: GuideFileRole;
  filename?: string;
  mime?: string;
  size?: number;
};

const FILE_NAME_MAX = 200;
const FILE_MIME_MAX = 120;
const FILE_SIZE_MAX = 5 * 1024 * 1024 * 1024; // 5 GB Plausibilitätsdeckel (nur Metadatum)

// Ein normalisierter Roh-Schritt aus der Extension (nach Validierung).
export type GuideStepInput = {
  path: string;
  label: string;
  action: GuideAction;
  rect: { x: number; y: number; w: number; h: number };
  url: string;
  title: string; // document.title der Seite beim Klick
  w: number; // Bildbreite (px)
  h: number; // Bildhöhe (px)
  selector?: GuideSelector; // optional; fehlt bei alten Extensions (abwärtskompatibel)
  sensitive?: SensitiveRect[]; // optional; Auto-Schwärzung (Welle 28), abwärtskompatibel
  file_meta?: GuideFileMeta; // optional; Datei-Brücke (Welle 39), abwärtskompatibel
  condition?: StepCondition; // optional; bedingte Schritte (Welle 42), abwärtskompatibel
  jump?: StepJump; // optional; bedingter Sprung/Block-Überspringen (Welle 47), abwärtskompatibel
  interaction?: StepInteraction; // optional; Welle 48 (Enter/Rechtsklick/…), abwärtskompatibel
  // optional (Welle 54): der eingetippte Wert eines Eingabe-Schritts (≤80 Zeichen, bereinigt) —
  // NUR für Titel/Text. Die Extension lässt ihn bei sensiblen Feldern weg (Passwort, Karten-/
  // Einmal-Codes, [data-steply-sensitive], sensible Beschriftung); der Server prüft die
  // Beschriftung zusätzlich. Wird NICHT als eigenes Feld gespeichert und NICHT für
  // Automationen verwendet (die füllen Felder weiterhin nie selbst aus).
  typed_value?: string;
};

// Längengrenzen für den Selektor (Kostenbremse + Schutz vor aufgeblähten Payloads).
const SEL_CSS_MAX = 400;
const SEL_TEXT_MAX = 80;
const SEL_ROLE_MAX = 40;

// ── Aufnahme-Anker (Welle 27) ────────────────────────────────────────────────
// Optionales Ziel: die Aufnahme wird in ein BESTEHENDES Entwurfs-Tutorial an einer
// genauen Stelle eingehängt (statt ein neues Tutorial anzulegen). ADDITIV — alte
// Extensions schicken kein `target` und verhalten sich exakt wie bisher.
//
//   anchor = { afterStepId }  -> lineare Kette hinter diesem Schritt einhängen
//                                (afterStepId === tutorialId: Anfang einer LEEREN Anleitung)
//   anchor = { branchId }     -> einen Verzweigungs-Ast füllen/verlängern
//
// parseGuideTarget prüft NUR die FORM (UUID-Strings, genau EIN Anker-Feld). Ob das
// Tutorial dem Konto gehört, ein Entwurf ist und der Anker zu ihm gehört, prüft die
// Route gegen die DB (dort auch der Fallback auf ein neues Tutorial).
export type GuideAnchor = { afterStepId: string } | { branchId: string };
export type GuideTarget = { tutorialId: string; anchor: GuideAnchor };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v.trim());

/**
 * Form-Validierung des optionalen Ziel-Ankers. Gibt ein normalisiertes Ziel zurück oder
 * `null`, wenn die Form ungültig ist (fehlende/kaputte IDs, kein oder mehrdeutiger Anker).
 * Wirft NIE — die Route entscheidet bei `null` auf Fallback (neues Tutorial).
 */
export function parseGuideTarget(raw: unknown): GuideTarget | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isUuid(r.tutorialId)) return null;
  const tutorialId = (r.tutorialId as string).trim();

  const a = r.anchor;
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const ar = a as Record<string, unknown>;
  const hasAfter = isUuid(ar.afterStepId);
  const hasBranch = isUuid(ar.branchId);
  // Genau EIN Anker-Feld (nicht beide, nicht keines) — sonst mehrdeutig.
  if (hasAfter === hasBranch) return null;
  if (hasAfter) return { tutorialId, anchor: { afterStepId: (ar.afterStepId as string).trim() } };
  return { tutorialId, anchor: { branchId: (ar.branchId as string).trim() } };
}

// ── Kategorie (Welle 31d) ────────────────────────────────────────────────────
// Optionale Kategorie für die NEUE Sofort-Anleitung: ENTWEDER eine bestehende Kategorie
// ({ id }) ODER eine neu anzulegende ({ name }). Tolerant geparst wie parseGuideTarget:
// kaputte/mehrdeutige Eingaben -> null (die Route ignoriert sie dann still, die Aufnahme
// geht NIE verloren). Wirft NIE. Nur die FORM wird geprüft; ob die id dem Konto gehört
// bzw. der Name schon existiert, klärt die Route gegen die DB (Admin-Client).
export type GuideCategory = { id: string } | { name: string };
export { CATEGORY_NAME_MAX }; // eine Quelle: lib/category-name.ts (auch Umbenennen)

export function parseGuideCategory(raw: unknown): GuideCategory | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  // Bestehende Kategorie per id hat Vorrang, wenn eine gültige UUID vorliegt.
  if (isUuid(r.id)) return { id: (r.id as string).trim() };
  // Neue Kategorie per name: trim, Steuerzeichen raus, Whitespace kollabieren, ≤60.
  if (typeof r.name === "string") {
    const name = r.name.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim().slice(0, CATEGORY_NAME_MAX);
    if (name) return { name };
  }
  return null;
}

// Einen Selektor-String säubern: nur Strings, Steuerzeichen (\p{Cc}) raus, Whitespace
// kollabieren, auf max kappen. Ungültig/leer -> undefined (Feld wird verworfen).
function cleanSelectorString(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  return s.slice(0, max);
}

/**
 * STRENGE, aber tolerante Selektor-Validierung: unbekannte Keys werden verworfen, falsche
 * Typen ignoriert, überlange Strings gekappt. Wirft NIE — ein kaputter Selektor darf den
 * ganzen Request nicht scheitern lassen (Abwärtskompatibilität). Ergebnis oder undefined,
 * wenn nichts Brauchbares übrig bleibt.
 */
export function validateSelector(raw: unknown): GuideSelector | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: GuideSelector = {};
  const css = cleanSelectorString(r.css, SEL_CSS_MAX);
  const text = cleanSelectorString(r.text, SEL_TEXT_MAX);
  const role = cleanSelectorString(r.role, SEL_ROLE_MAX);
  if (css) out.css = css;
  if (text) out.text = text;
  if (role) out.role = role;
  // shadow (Welle 48): CSS-Pfade der Shadow-Hosts von außen nach innen; css/text/role gelten
  // dann innerhalb des innersten Shadow-Roots. Nur mit Inhalt sinnvoll.
  if (Array.isArray(r.shadow)) {
    const hosts = r.shadow
      .slice(0, SHADOW_DEPTH_MAX)
      .map((h) => cleanSelectorString(h, SEL_CSS_MAX))
      .filter((h): h is string => !!h);
    if (hosts.length && hosts.length === Math.min(r.shadow.length, SHADOW_DEPTH_MAX)) {
      out.shadow = hosts;
    }
  }
  return out.css || out.text || out.role ? out : undefined;
}

/**
 * TOLERANTE Validierung der optionalen `interaction` (Welle 48, Vertrag s. extension/content.js):
 * Enter nach Eingabe, Rechts-/Doppelklick, Ziehen, Tastenkürzel, Hover-Menü, iframe. Nur
 * bekannte Keys überleben, Strings gekappt; kaputt/leer → undefined. Wirft NIE.
 */
export function validateInteraction(raw: unknown, action: GuideAction): StepInteraction | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: StepInteraction = {};
  if (r.enter === true && action === "type") out.enter = true;
  if (action === "click" && typeof r.variant === "string" && INTERACTION_VARIANTS.includes(r.variant as never)) {
    const variant = r.variant as NonNullable<StepInteraction["variant"]>;
    if (variant === "key") {
      const key = cleanSelectorString(r.key, 40);
      if (key) {
        out.variant = "key";
        out.key = key;
      }
    } else if (variant === "drag") {
      const drop = validateSelector(r.drop);
      if (drop) {
        out.variant = "drag";
        out.drop = drop;
        const dl = cleanSelectorString(r.dropLabel, LABEL_MAX);
        if (dl) out.dropLabel = dl;
      }
    } else if (variant === "nav") {
      // Seitenwechsel ohne Klick (Welle 55, L1): die Art MUSS bekannt sein, sonst wäre der
      // Schritt textlos. Kaputt → variant fällt weg (der Schritt bleibt als schlichter Schritt).
      const kind = typeof r.nav === "string" ? r.nav.trim().toLowerCase() : "";
      if (INTERACTION_NAV_KINDS.includes(kind as never)) {
        out.variant = "nav";
        out.nav = kind as NonNullable<StepInteraction["nav"]>;
      }
    } else {
      out.variant = variant;
    }
  }
  // Zusatztasten beim Klick (Welle 55, L3): nur bekannte Namen, ohne Dubletten, feste
  // Reihenfolge (ctrl→meta→alt→shift), damit Texte und Wiedergabe deterministisch sind.
  // NUR bei Varianten, zu denen eine gedrückte Taste überhaupt passt: einfacher Klick,
  // Doppelklick, markierte Stelle. Bei Tastenkürzel/Ziehen/Seitenwechsel/Abschluss-Bild wäre
  // sie sinnlos (und stünde als erfundene Taste in der Anleitung).
  const modsAllowed = !out.variant || out.variant === "double" || out.variant === "spot";
  if (action === "click" && modsAllowed && Array.isArray(r.modifiers)) {
    const seen = new Set<string>();
    for (const m of r.modifiers.slice(0, 8)) {
      const k = typeof m === "string" ? m.trim().toLowerCase() : "";
      if (INTERACTION_MODIFIERS.includes(k as never)) seen.add(k);
    }
    const mods = INTERACTION_MODIFIERS.filter((m) => seen.has(m));
    if (mods.length) out.modifiers = [...mods];
  }
  // Zustand eines Kontrollkästchens nach dem Klick (Runde 4) — nur beim schlichten Klick.
  if (action === "click" && !out.variant && typeof r.checked === "boolean") out.checked = r.checked;
  const hover = validateSelector(r.hover);
  if (hover) {
    out.hover = hover;
    const hl = cleanSelectorString(r.hoverLabel, LABEL_MAX);
    if (hl) out.hoverLabel = hl;
  }
  if (r.frame && typeof r.frame === "object" && !Array.isArray(r.frame)) {
    const fr = r.frame as Record<string, unknown>;
    const url = cleanSelectorString(fr.url, 500);
    // about:blank/about:srcdoc = Rich-Text-Editor-Rahmen (TinyMCE u. ä.) — ohne eigene Adresse.
    if (url && (/^https?:\/\//i.test(url) || /^about:(blank|srcdoc)$/i.test(url))) {
      out.frame = { url };
      // nth: Position unter gleichartigen Geschwister-Frames (Kartenfelder u. ä.), 0..50.
      if (typeof fr.nth === "number" && Number.isFinite(fr.nth) && fr.nth >= 0 && fr.nth <= 50) {
        out.frame.nth = Math.floor(fr.nth);
      }
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * TOLERANTE Validierung der optionalen `condition` (bedingte Schritte, Welle 42). Spiegelt die
 * pure parseCondition aus extension/exec-plan.js: Element-Form (Selektor via validateSelector)
 * oder URL-Form (Teilstring/Glob). Kaputt/unbekannt/leer → undefined (Feld verworfen; die
 * Aufnahme scheitert NIE daran). Wirft NIE. `negate` NUR als echtes true übernehmen.
 */
export function validateStepCondition(raw: unknown): StepCondition | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const negate = r.negate === true;
  if (r.kind === "element") {
    const selector = validateSelector(r.selector);
    if (!selector) return undefined; // leerer/kaputter Selektor → unbrauchbar
    return { kind: "element", selector, ...(negate ? { negate: true } : {}) };
  }
  if (r.kind === "url") {
    const pattern =
      typeof r.pattern === "string" ? r.pattern.replace(/\s+/g, " ").trim().slice(0, 400) : "";
    if (!pattern) return undefined;
    return { kind: "url", pattern, ...(negate ? { negate: true } : {}) };
  }
  return undefined;
}

/**
 * TOLERANTE Validierung des optionalen `jump` (bedingter Sprung/Block-Überspringen, Welle 47).
 * Spiegelt die pure parseJump aus extension/exec-plan.js — hier FORM-seitig (die Position des
 * tragenden Schritts ist bei der Aufnahme noch nicht final, deshalb nur „to_position ist eine
 * positive Ganzzahl"; die Vorwärts-Garantie „> Position" trägt zur Laufzeit jumpTargetIndex bzw.
 * beim Setzen die Server-Action). `when` via validateStepCondition. Kaputt/leer → undefined (die
 * Aufnahme scheitert NIE daran). Wirft NIE.
 */
export function validateStepJump(raw: unknown): StepJump | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const when = validateStepCondition(r.when);
  if (!when) return undefined; // kein/kaputtes when → kein Sprung
  const to = r.to_position;
  if (typeof to !== "number" || !Number.isFinite(to)) return undefined;
  const toInt = Math.trunc(to);
  if (toInt < 1) return undefined; // positive Zielposition (nur VORWÄRTS)
  return { when, to_position: toInt };
}

/**
 * STRENGE, aber tolerante Validierung des optionalen `file_meta` (Datei-Brücke, Welle 39).
 * role MUSS in der Whitelist liegen; Strings gekappt; size als endliche Nicht-Negativ-Zahl.
 * Kaputt/unbekannt → undefined (Feld wird verworfen; die Aufnahme scheitert NIE daran).
 * Wirft NIE. Nur bekannte Keys überleben (fremde Keys fallen weg).
 */
export function validateFileMeta(raw: unknown): GuideFileMeta | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const role = r.role;
  if (role !== "download" && role !== "upload") return undefined;
  const out: GuideFileMeta = { role };
  if (typeof r.filename === "string") {
    // Nur der Basisname (keine Pfade/Traversal), Steuerzeichen raus, gekappt.
    const name = r.filename
      .replace(/\p{Cc}/gu, " ")
      .replace(/[\\/]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, FILE_NAME_MAX);
    if (name) out.filename = name;
  }
  if (typeof r.mime === "string") {
    const mime = r.mime.replace(/\p{Cc}/gu, "").replace(/\s+/g, "").trim().slice(0, FILE_MIME_MAX);
    if (mime) out.mime = mime;
  }
  if (typeof r.size === "number" && Number.isFinite(r.size) && r.size >= 0 && r.size <= FILE_SIZE_MAX) {
    out.size = Math.round(r.size);
  }
  return out;
}

// ── Eingetippter Wert (Welle 54) ─────────────────────────────────────────────
// Entscheidung des Produktinhabers: der getippte Wert darf in Titel/Text, AUSSER bei sensiblen
// Feldern. Die Extension filtert (Feldtyp, autocomplete, Opt-out-Attribut, Beschriftung); hier
// nur die Form + ein zweites Netz über die Beschriftung (Begriffe wie die Auto-Verpixelung).
export const TYPED_VALUE_MAX = 80;
const SENSITIVE_LABEL_RE =
  /(api[-_ ]?key|secret|token|geheim|passw|password|kennwort|\bpin\b|\btan\b|iban|kontonummer|kreditkarte|credit[-_ ]?card|card number|kartennummer|cvv|cvc|\bbic\b|one[- ]?time|einmal-?(code|passwort|kennwort))/i;

/**
 * Validierung des optionalen `typed_value`: nur bei Eingabe-Schritten, nur Strings, Steuer- und
 * unsichtbare Formatzeichen raus, Whitespace kollabiert, getrimmt, auf 80 Zeichen gekappt. Bei
 * sensibler Beschriftung (label) wird der Wert verworfen. Leer/kaputt → undefined. Wirft NIE.
 */
export function validateTypedValue(raw: unknown, action: GuideAction, label: string): string | undefined {
  if (action !== "type" || typeof raw !== "string") return undefined;
  if (label && SENSITIVE_LABEL_RE.test(label)) return undefined;
  const v = raw
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!v) return undefined;
  if (v.length <= TYPED_VALUE_MAX) return v;
  return v.slice(0, TYPED_VALUE_MAX - 1).trimEnd() + "…";
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function isFinitePositiveInt(n: unknown, max: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n <= max;
}

// Auto-Schwärzung (Welle 28): Obergrenzen/Schwellen.
const MAX_SENSITIVE = 10;
const SENSITIVE_MIN_AREA = 0.0004; // Mini-Flächen (< ~2% × 2%) verwerfen – kein sinnvoller Blur.

/**
 * STRENGE, aber tolerante Validierung des optionalen `sensitive`-Feldes (Muster wie
 * validateSelector): Array ≤10 Einträge, jedes {x,y,w,h} endliche Zahlen, auf 0..1 geklemmt,
 * Rechteck bleibt im Bild, Mini-Flächen verworfen, unbekannte Keys entfernt. Wirft NIE –
 * kaputte Werte werden ignoriert, der Request scheitert dadurch nicht.
 */
export function validateSensitive(raw: unknown): SensitiveRect[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  const out: SensitiveRect[] = [];
  for (const item of raw) {
    if (out.length >= MAX_SENSITIVE) break; // Array ≤10 – Überzahl wird abgeschnitten.
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    let x = num(r.x);
    let y = num(r.y);
    let w = num(r.w);
    let h = num(r.h);
    if ([x, y, w, h].some((n) => Number.isNaN(n))) continue; // NaN/fehlend -> verwerfen
    x = clamp01(x);
    y = clamp01(y);
    w = clamp01(w);
    h = clamp01(h);
    if (x + w > 1) w = 1 - x;
    if (y + h > 1) h = 1 - y;
    if (w <= 0 || h <= 0) continue;
    if (w * h < SENSITIVE_MIN_AREA) continue; // Mini-Flächen verwerfen
    out.push({ x, y, w, h }); // NUR bekannte Keys – fremde Keys fallen weg.
  }
  return out;
}

/**
 * Aus gültigen sensiblen Rechtecken je Schritt zusätzliche „blur“-Highlights erzeugen,
 * markiert mit `suggested: true` (Auto-Schwärzung, Welle 28). Der Typ „blur“ sorgt dafür,
 * dass sie beim Veröffentlichen genau wie manuelle Blurs in die Pixel gebrannt werden.
 */
export function suggestedBlurHighlights(sensitive: SensitiveRect[] | undefined): Highlight[] {
  if (!sensitive || !sensitive.length) return [];
  return sensitive.map((r) => ({
    id: crypto.randomUUID(),
    type: "blur" as const,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    rounded: true,
    suggested: true,
  }));
}

/**
 * Strenge Validierung eines rohen Schritt-Arrays aus der Extension. Gibt bei Erfolg
 * bereinigte Schritte zurück (rect je 0..1 geklemmt, label/title gekappt), sonst wirft
 * es mit klarer deutscher Meldung.
 *
 * @param accountId  Konto-Präfix, das JEDER Storage-Pfad tragen MUSS (kein Fremd-Pfad).
 */
export function validateGuideSteps(raw: unknown, accountId: string): GuideStepInput[] {
  if (!Array.isArray(raw)) throw new Error("Die Schritte müssen eine Liste sein.");
  if (raw.length === 0) throw new Error("Es wurden keine Schritte übermittelt.");
  if (raw.length > MAX_GUIDE_STEPS) {
    throw new Error(`Zu viele Schritte (max. ${MAX_GUIDE_STEPS}).`);
  }

  const out: GuideStepInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i] as Record<string, unknown> | null;
    const where = `Schritt ${i + 1}`;
    if (!s || typeof s !== "object") throw new Error(`${where} ist kein Objekt.`);

    // Pfad MUSS im Konto-Ordner liegen (kein Fremd-Pfad, kein Traversal).
    const path = typeof s.path === "string" ? s.path.trim() : "";
    if (!path || !path.startsWith(`${accountId}/`) || path.includes("..")) {
      throw new Error(`${where}: ungültiger Bild-Pfad.`);
    }

    // Bildmaße plausibel (px). Grenze großzügig, aber gegen Unsinn schützend.
    if (!isFinitePositiveInt(s.w, 20000) || !isFinitePositiveInt(s.h, 20000)) {
      throw new Error(`${where}: unplausible Bildmaße.`);
    }

    // rect: jede Komponente auf 0..1 klemmen (leicht daneben → korrigieren).
    const r = (s.rect ?? {}) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const x = clamp01(num(r.x));
    const y = clamp01(num(r.y));
    let w = clamp01(num(r.w));
    let h = clamp01(num(r.h));
    // Rechteck nicht über den rechten/unteren Rand hinauslaufen lassen.
    if (x + w > 1) w = 1 - x;
    if (y + h > 1) h = 1 - y;

    const action: GuideAction = s.action === "type" ? "type" : "click";
    const label =
      typeof s.label === "string" ? s.label.replace(/\s+/g, " ").trim().slice(0, LABEL_MAX) : "";
    const title =
      typeof s.title === "string" ? s.title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const url = typeof s.url === "string" ? s.url.trim().slice(0, 500) : "";

    // selector (Welle 24): optional, tolerant gesäubert (nie werfend). Fehlt/kaputt -> weg.
    const selector = validateSelector(s.selector);
    // sensitive (Welle 28): optional, streng validiert (nie werfend). Fehlt/kaputt -> weg.
    const sensitive = validateSensitive(s.sensitive);
    // file_meta (Welle 39): optional Datei-Brücke, tolerant validiert. Fehlt/kaputt -> weg.
    const fileMeta = validateFileMeta(s.file_meta);
    // condition (Welle 42): optionale Ausführ-Bedingung, tolerant validiert. Fehlt/kaputt -> weg.
    const condition = validateStepCondition(s.condition);
    // jump (Welle 47): optionaler bedingter Sprung/Block-Überspringen, tolerant. Fehlt/kaputt -> weg.
    const jump = validateStepJump(s.jump);
    // interaction (Welle 48): optional, tolerant validiert. Fehlt/kaputt -> weg.
    const interaction = validateInteraction(s.interaction, action);
    // Welle 55 — INVARIANTE: Schritte ohne Ziel (Seitenwechsel, markierte Stelle,
    // Abschluss-Bild) tragen NIE einen Selektor. Genau daran erkennen Automationen und
    // Live-Führung, dass hier nichts angesteuert werden kann. Ein Client könnte sonst
    // { selector, interaction:{variant:"result"} } schicken und so ein Ergebnis-Bild als
    // ausführbaren Klick in eine Automation schmuggeln — darum hier serverseitig erzwungen.
    const noTarget = interaction ? NO_TARGET_VARIANTS.includes(interaction.variant as never) : false;
    const effectiveSelector = noTarget ? undefined : selector;
    // typed_value (Welle 54): optional, nur Eingabe-Schritte; sensible Beschriftung → weg.
    const typedValue = validateTypedValue(s.typed_value, action, label);

    out.push({
      path,
      label,
      action,
      rect: { x, y, w, h },
      url,
      title,
      w: Math.round(s.w),
      h: Math.round(s.h),
      ...(effectiveSelector ? { selector: effectiveSelector } : {}),
      ...(sensitive.length ? { sensitive } : {}),
      ...(fileMeta ? { file_meta: fileMeta } : {}),
      ...(condition ? { condition } : {}),
      ...(jump ? { jump } : {}),
      ...(interaction ? { interaction } : {}),
      ...(typedValue ? { typed_value: typedValue } : {}),
    });
  }
  return out;
}

/** Ein Highlight-Rechteck (Primärfarbe, abgerundet) aus dem rect eines Schritts. */
export function highlightFromRect(rect: GuideStepInput["rect"]): Highlight {
  return {
    id: crypto.randomUUID(),
    type: "rect",
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    color: GUIDE_HIGHLIGHT_COLOR,
    rounded: true,
  };
}

/**
 * Vorlagen-Titel je Schritt (Tango-Stil, deutsche Sie-Form, typografische Quotes):
 *  - click + Label → „Klicken Sie auf „{label}""
 *  - type  + Wert  → „„{wert}“ in „{label}“ eingeben“ (ohne Label: „„{wert}“ eingeben“)
 *  - type  + Label → „Feld „{label}“ ausfüllen“ (Welle 54; Wert fehlt, z. B. sensibles Feld)
 *  - Welle 48 (interaction): Rechtsklick, Doppelklick, Ziehen „X“ auf „Y“, „Drücken Sie Strg+S“,
 *    Hover-Menü („Fahren Sie mit der Maus über „H“ und klicken Sie dann auf „X““)
 *  - ohne Label    → „Schritt {n}"
 */
export function templateTitle(step: GuideStepInput, index: number): string {
  const n = index + 1;
  // Datei-Brücke (Welle 39): Upload-Schritte tragen einen eigenen, sprechenden Titel — der
  // davor erfasste „Datei auswählen"-Klick wurde bereits in der Extension hineingefaltet.
  // Kein Dateiname im Titel/Text: der echte Name („Müller_Lohn_03.pdf“) stand sonst öffentlich
  // auf der Hilfe-Seite — und jeder Leser lädt ohnehin SEINE Datei hoch (Runde 5).
  if (step.file_meta?.role === "upload") return "Datei hochladen";
  const it = step.interaction;
  // Tastenkürzel (Welle 48): braucht kein Label — die Kombination IST der Inhalt.
  if (step.action === "click" && it?.variant === "key" && it.key) {
    return `Drücken Sie ${displayKeyDe(it.key)}`.slice(0, TITLE_MAX);
  }
  // Welle 55 — Schritte OHNE Element (kein Selektor): Seitenwechsel, markierte Stelle,
  // Abschluss-Bild. Sie brauchen kein Label und dürfen nie als „Schritt n" enden.
  if (step.action === "click" && it?.variant === "nav") {
    if (it.nav === "back") return "Zur vorigen Seite zurückgehen";
    if (it.nav === "reload") return "Seite neu laden";
    const page = step.title ? labelHead(step.title) : "";
    if (page) return wrapOne([(p) => `Weiter zu „${p}“`], page);
    return "Zur nächsten Seite wechseln";
  }
  if (step.action === "click" && it?.variant === "result") return "Ergebnis";
  if (step.action === "click" && it?.variant === "spot") {
    // Eine gedrückte Zusatztaste gehört auch hier in den Titel — sonst führt die Anleitung
    // in die Irre (ohne Strg geht die bisherige Auswahl verloren).
    const spotKeys = modifierKeysDe(it);
    const where = step.label ? labelHead(step.label) : "";
    if (spotKeys) {
      const lead = spotKeys.includes("+")
        ? `Mit gedrückten ${spotKeys}-Tasten`
        : `Mit gedrückter ${spotKeys}-Taste`;
      if (where) {
        return wrapOne(
          [(l) => `${lead} in „${l}“ auf die markierte Stelle klicken`, () => `${lead} auf die markierte Stelle klicken`],
          where,
        );
      }
      return `${lead} auf die markierte Stelle klicken`.slice(0, TITLE_MAX);
    }
    if (where) return wrapOne([(l) => `In „${l}“ auf die markierte Stelle klicken`], where);
    return "Auf die markierte Stelle klicken";
  }
  // Eingabe (Welle 54): mit getipptem Wert „„account“ in „Suche“ eingeben“ bzw. „„account“
  // eingeben“; ohne Wert „Feld „Suche“ ausfüllen“ (verständlicher als „Tragen Sie „Suche“ ein“).
  if (step.action === "type") {
    // Passwortfelder: nie ein Wert (die Extension schickt dort keinen) — fester, klarer Titel.
    if (isPasswordField(step.label, step.selector?.css)) return "Passwort eingeben";
    const value = step.typed_value;
    const field = step.label ? labelHead(step.label) : "";
    // Auswahlliste (<select>): Beschriftung = gewählte Option → „„X“ auswählen“ (Erweiterungs-
    // Audit 24.09.: vorher „Geben Sie den Wert in das Feld „Option 2“ ein“).
    const role = step.selector?.role ?? "";
    if (value && (role === "combobox" || role === "listbox") && labelHead(value) === field) {
      return wrapOne([(v) => `„${v}“ auswählen`], value);
    }
    if (value && field) return wrapTwo((a, b) => `„${a}“ in „${b}“ eingeben`, value, field);
    if (value) return wrapOne([(v) => `„${v}“ eingeben`], value);
    if (field) return wrapOne([(l) => `Feld „${l}“ ausfüllen`], field);
    return `Schritt ${n}`;
  }
  if (!step.label) return `Schritt ${n}`;
  // Nur der kennzeichnende Anfang des Labels (Kartentext, Zähler in Klammern fallen weg).
  const label = labelHead(step.label);
  if (step.action === "click" && it?.variant === "drag") {
    const drop = dropLabelOf(it);
    if (drop) return wrapTwo((a, b) => `Ziehen Sie „${a}“ auf „${b}“`, label, drop);
    return wrapOne([(l) => `Ziehen Sie „${l}“ an die markierte Stelle`, (l) => `Ziehen Sie „${l}“`], label);
  }
  if (step.action === "click" && it?.variant === "right") {
    return wrapOne(
      [(l) => `Klicken Sie mit der rechten Maustaste auf „${l}“`, (l) => `Rechtsklick auf „${l}“`],
      label,
    );
  }
  // Kontrollkästchen abwählen (Runde 4): sonst hieß es „aktivieren“, obwohl der Haken wegging.
  if (step.action === "click" && it?.checked === false && !it?.variant) {
    return wrapOne([(l) => `„${l}“ abwählen`], label);
  }
  if (step.action === "click" && it?.variant === "double") {
    return wrapOne([(l) => `Doppelklicken Sie auf „${l}“`], label);
  }
  // Hover-Menü (Welle 48): ausführlich, wenn es passt; sonst „Klicken Sie im Menü „H“ auf „X““.
  // Steht VOR den Zusatztasten: „erst das Menü öffnen“ ist die wichtigere Information, die
  // gedrückte Taste kommt dann im Fließtext (sonst fiele das Menü aus Titel UND Text heraus).
  const hover = hoverLabelOf(it);
  if (step.action === "click" && hover && !it?.variant) {
    const long = `Fahren Sie mit der Maus über „${hover}“ und klicken Sie dann auf „${label}“`;
    if (long.length <= TITLE_MAX) return long;
    return wrapTwo((a, b) => `Klicken Sie im Menü „${a}“ auf „${b}“`, hover, label);
  }
  // Mehrfach-/Bereichsauswahl (Welle 55, L3): die gedrückte Zusatztaste gehört in den TITEL —
  // ohne sie verliert der Leser seine bisherige Auswahl.
  const modKeys = modifierKeysDe(it);
  if (step.action === "click" && modKeys && !it?.variant) {
    const lead = modKeys.includes("+")
      ? `Mit gedrückten ${modKeys}-Tasten`
      : `Mit gedrückter ${modKeys}-Taste`;
    return wrapOne([(l) => `${lead} auf „${l}“ klicken`, (l) => `${modKeys}+Klick auf „${l}“`], label);
  }
  return wrapOne([(l) => `Klicken Sie auf „${l}“`], label);
}

// Passwortfeld? (Beschriftung oder CSS-Pfad verrät es.) Dort gibt es nie einen Wert.
const PASSWORD_LABEL_RE = /passw|kennwort/i;
const PASSWORD_CSS_RE = /password/i;
export function isPasswordField(label: string | null | undefined, css?: string | null): boolean {
  return PASSWORD_LABEL_RE.test(label ?? "") || PASSWORD_CSS_RE.test(css ?? "");
}

// Kleine Wörter, nach denen KEIN Beschreibungssatz beginnt („Rechnungen und Belege …“).
const HEAD_STOP = new Set(
  "und oder für von mit im in zu zum zur der die das den dem des auf an bei and or for of with to the a an on at by from".split(
    " ",
  ),
);
const HEAD_ROOM = 30; // bis hierhin gilt ein Label als kurz

/**
 * Kennzeichnender Anfang eines Labels für Titel-Vorlagen (greift, wenn die KI ausfällt):
 *  - Zähler/Status in Klammern am Ende fällt weg: „Home (New unread posts)“ → „Home“
 *  - lange Kartentexte: nur die Überschrift vor dem Beschreibungssatz — bis zum ersten
 *    Satzzeichen oder bis zu einem großgeschriebenen Wort nach einem kleingeschriebenen, dem
 *    wieder ein kleines Wort folgt: „Account information See your account…“ → „Account information“
 * Kurze Labels (≤ 30 Zeichen, ohne Klammer-Anhängsel) und lange ohne erkennbare Überschrift
 * bleiben unverändert (die Titel-Formen kürzen sie zitat-sicher).
 */
export function labelHead(label: string): string {
  let l = label.replace(/\s+/g, " ").trim();
  const paren = l.match(/^(.+?)\s*\([^()]*\)$/);
  if (paren && paren[1].trim().length >= 2) l = paren[1].trim();
  if (l.length <= HEAD_ROOM) return l;
  const punct = l.search(/[.!?:;|·•–—]\s/);
  if (punct >= 3 && punct <= 40) return l.slice(0, punct).trim();
  const words = l.split(" ");
  for (let i = 1; i < words.length - 1; i++) {
    const prev = words[i - 1];
    if (
      /^\p{Ll}{4,}$/u.test(prev) &&
      !HEAD_STOP.has(prev.toLowerCase()) &&
      /^\p{Lu}\p{Ll}*$/u.test(words[i]) &&
      /^\p{Ll}/u.test(words[i + 1])
    ) {
      const head = words.slice(0, i).join(" ");
      if (head.length >= 3 && head.length <= 40) return head;
      break;
    }
  }
  // Keine erkennbare Überschrift: ganz lassen — die Titel-Formen kürzen zitat-sicher auf die
  // Titel-Länge (mehr Information als ein harter 30-Zeichen-Schnitt).
  return l;
}

/**
 * ZITAT-SICHER kürzen (Richards YouTube-Fund): Der alte Hard-Cut nach dem Einsetzen schnitt das
 * schließende „“" weg („…96GB of VRAM). Stattdessen das Zitat-INNERE an einer Wortgrenze kürzen —
 * die Anführungszeichen bleiben immer paarig.
 */
function cutLabel(label: string, room: number): string {
  if (label.length <= room) return label;
  let cut = label.slice(0, Math.max(1, room - 1));
  const sp = cut.lastIndexOf(" ");
  if (sp >= Math.floor(room * 0.5)) cut = cut.slice(0, sp);
  return cut.replace(/[\s.,;:]+$/, "") + "…";
}

/**
 * Wählt die erste Titel-Form, in der das Label UNGEKÜRZT Platz hat; sonst die letzte (kürzeste)
 * Form mit zitat-sicher gekürztem Label. So bleibt „Klicken Sie mit der rechten Maustaste auf
 * „Datei““ ausführlich, und lange Labels verlieren nicht alles an den Vorspann.
 */
function wrapOne(forms: ((l: string) => string)[], label: string): string {
  for (const f of forms) {
    if (f(label).length <= TITLE_MAX) return f(label);
  }
  const last = forms[forms.length - 1];
  return last(cutLabel(label, TITLE_MAX - last("").length));
}

/**
 * Titel mit ZWEI Zitaten („Ziehen Sie „X“ auf „Y““, Menü „H“ → „X“) auf TITLE_MAX bringen: der
 * Platz wird fair geteilt; ein kurzes Label bleibt ganz, das längere wird zitat-sicher gekürzt.
 */
function wrapTwo(wrap: (a: string, b: string) => string, a: string, b: string): string {
  const room = TITLE_MAX - wrap("", "").length;
  if (a.length + b.length <= room) return wrap(a, b);
  const half = Math.floor(room / 2);
  if (a.length <= half) return wrap(a, cutLabel(b, room - a.length));
  if (b.length <= half) return wrap(cutLabel(a, room - b.length), b);
  return wrap(cutLabel(a, half), cutLabel(b, room - half));
}

/** Satz für die Klick-Variante (Welle 48) — ohne Kontext-Präfix, mit Punkt. null = normal. */
function variantSentence(step: GuideStepInput): string | null {
  const it = step.interaction;
  if (step.action !== "click" || !it?.variant) return null;
  const target = step.label ? `„${step.label}“` : "die markierte Stelle";
  if (it.variant === "right") return `Klicken Sie mit der rechten Maustaste auf ${target}.`;
  if (it.variant === "double") return `Doppelklicken Sie auf ${target}.`;
  if (it.variant === "drag") {
    const drop = dropLabelOf(it);
    const what = step.label ? `„${step.label}“` : "das markierte Element";
    return `Ziehen Sie ${what} mit gedrückter Maustaste auf ${drop ? `„${drop}“` : "die Zielstelle"}.`;
  }
  if (it.variant === "key" && it.key) {
    const k = displayKeyDe(it.key);
    return k.length > 1 && k.includes("+")
      ? `Drücken Sie die Tastenkombination ${k}.`
      : `Drücken Sie die Taste ${k}.`;
  }
  // Welle 55 — Schritte ohne Element.
  if (it.variant === "nav") {
    if (it.nav === "back") return "Gehen Sie mit dem Zurück-Knopf des Browsers zur vorigen Seite.";
    if (it.nav === "reload") return "Laden Sie die Seite neu (Taste F5).";
    return step.title
      ? `Die Seite wechselt zu „${step.title.slice(0, 60)}“ – ohne dass Sie etwas anklicken.`
      : "Die Seite wechselt – ohne dass Sie etwas anklicken.";
  }
  if (it.variant === "result") return "So sieht das Ergebnis am Ende aus.";
  if (it.variant === "spot") {
    return step.label
      ? `Klicken Sie in „${step.label}“ auf die markierte Stelle.`
      : "Klicken Sie auf die markierte Stelle im Bild.";
  }
  return null;
}

/**
 * Zusatz-Satz für die gedrückten Zusatztasten eines Klicks (Welle 55, L3). "" = keine.
 * `standalone` = der Satz trägt den Schritt allein (kein Hover-Menü, keine Klick-Variante);
 * sonst hängt er sich als kurzer Zusatz an den bestehenden Satz an.
 */
function modifierSentence(step: GuideStepInput, standalone: boolean): string {
  if (step.action !== "click") return "";
  const phrase = modifierPhraseDe(step.interaction);
  if (!phrase) return "";
  const target = step.label ? `„${step.label}“` : "die markierte Stelle";
  return standalone
    ? `Halten Sie ${phrase} gedrückt und klicken Sie auf ${target} – so bleibt die bisherige Auswahl erhalten.`
    : `Halten Sie dabei ${phrase} gedrückt.`;
}

/**
 * Vorlagen-Fließtext je Schritt (Welle 54: NUR wenn er etwas zum Titel hinzufügt). Ein
 * einfacher Klick („Klicken Sie auf „X““) oder eine Eingabe ohne Enter hat KEINEN Text — der
 * Titel sagt schon alles. Text entsteht bei: Seitenwechsel (Seiten-Titel hat sich zum vorigen
 * Schritt geändert → „Auf der Seite „…“: …“), Hover-Menü, Klick-Varianten (Rechts-/Doppelklick,
 * Ziehen, Taste), Datei-Up-/Download, Enter-Bestätigung und Schritten ohne Beschriftung (dort
 * ist der Titel nur „Schritt n“). Rückgabe "" = leerer Erklärtext.
 */
export function templateBodyText(
  step: GuideStepInput,
  prev: GuideStepInput | null,
): string {
  const noElement =
    step.action === "click" &&
    (step.interaction?.variant === "nav" ||
      step.interaction?.variant === "result" ||
      step.interaction?.variant === "spot");
  // Welle 55: „Auf der Seite „X": Die Seite wechselt zu „X"" wäre doppelt gemoppelt — Schritte
  // ohne Element beschreiben den Seitenwechsel selbst und bekommen darum keinen Kontext-Vorspann.
  const changedPage = !noElement && !!step.title && step.title !== (prev?.title ?? "");
  const context = changedPage ? `Auf der Seite „${step.title}“: ` : "";
  // Datei-Brücke (Welle 39): Upload-/Download-Schritte bekommen einen passenden Hinweistext.
  if (step.file_meta?.role === "upload") {
    return `${context}Wählen Sie hier Ihre Datei aus – oder ziehen Sie sie in dieses Feld.`;
  }
  // Hover-Menü (Welle 48): erst mit der Maus über den Auslöser, dann die eigentliche Aktion.
  const hover = hoverLabelOf(step.interaction);
  const variant = variantSentence(step);
  let core: string;
  if (hover && step.action === "click" && !variant) {
    const what = step.label ? `„${step.label}“` : "die markierte Stelle";
    core = `Fahren Sie mit der Maus über „${hover}“ und klicken Sie dann auf ${what}.`;
  } else if (hover) {
    core = [`Fahren Sie zuerst mit der Maus über „${hover}“.`, variant ?? extraBodySentence(step)]
      .filter(Boolean)
      .join(" ");
  } else {
    core = variant ?? extraBodySentence(step);
  }
  // Zusatztasten (Welle 55, L3): ohne Variante IST der Modifikator-Satz der Kern, mit Variante
  // (Rechts-/Doppelklick) kommt er als Zusatz dahinter.
  const modSentence = modifierSentence(step, !core);
  if (modSentence) core = core ? `${core} ${modSentence}` : modSentence;
  if (core) return `${context}${core}`;
  // Nichts Zusätzliches: nur beim Seitenwechsel den Kontext + den schlichten Satz, sonst leer.
  return context ? `${context}${plainBodySentence(step)}` : "";
}

/**
 * Satz, der über den Titel HINAUS etwas sagt (Download, Enter, fehlende Beschriftung) —
 * ohne Kontext-Präfix. "" = der Titel reicht.
 */
function extraBodySentence(step: GuideStepInput): string {
  if (step.file_meta?.role === "download") {
    const what = step.label ? `„${step.label}“` : "die markierte Stelle";
    return `Klicken Sie auf ${what} — dabei wird eine Datei heruntergeladen.`;
  }
  if (step.action === "type") {
    if (step.interaction?.enter) {
      if (step.typed_value) return `Geben Sie „${step.typed_value}“ ein und bestätigen Sie mit Enter.`;
      if (step.label) return `Tragen Sie hier „${step.label}“ ein und bestätigen Sie mit Enter.`;
      return "Tragen Sie hier Ihre Eingabe ein und bestätigen Sie mit Enter.";
    }
    return step.label || step.typed_value ? "" : "Füllen Sie das markierte Feld aus.";
  }
  return step.label ? "" : "Klicken Sie auf die markierte Stelle.";
}

/** Schlichter Satz zur Aktion (nur mit Seitenwechsel-Kontext verwendet). */
function plainBodySentence(step: GuideStepInput): string {
  if (step.action === "type") {
    if (step.typed_value) return `Geben Sie „${step.typed_value}“ ein.`;
    return `Füllen Sie das Feld „${step.label}“ aus.`;
  }
  return `Klicken Sie auf „${step.label}“.`;
}

// Tiptap-Doc aus einem Absatz (gleiches Schema wie mkBody in den bestehenden Actions).
export function mkBody(text: string): { type: "doc"; content: unknown[] } {
  const t = text.trim();
  return {
    type: "doc",
    content: [{ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] }],
  };
}

/** Default-Titel für die ganze Anleitung: „Anleitung vom {TT.MM.JJJJ}". */
export function defaultGuideTitle(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Anleitung vom ${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
}
