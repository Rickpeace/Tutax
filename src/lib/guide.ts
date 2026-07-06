// Geteilter Kern der „Sofort-Anleitung" (Welle 22): die Extension nimmt bei jedem
// Klick einen Screenshot + das geklickte Element (BoundingClientRect, Label, Aktion)
// auf und lädt daraus in Sekunden einen fertigen Tutorial-ENTWURF hoch — ohne Video,
// ohne Server-KI-Pipeline (Tango-Stil).
//
// Diese Datei ist der server-only Kern für /api/recorder/guide-* : reine Validierung +
// Vorlagen-Texte, KEINE OpenAI/Storage-Aufrufe (die machen die Routen). So bleibt sie
// leicht testbar und die Regeln liegen an EINER Stelle.
import "server-only";
import type { Highlight } from "@/lib/types";

// Obergrenzen (Kostenbremse + Speicher): eine Anleitung hat höchstens so viele Schritte.
export const MAX_GUIDE_STEPS = 40;
const LABEL_MAX = 60;
const TITLE_MAX = 60;

// Primärfarbe (Koralle, Design-Handoff 07/2026) für das eine Highlight-Rechteck je Schritt.
export const GUIDE_HIGHLIGHT_COLOR = "#ef6a4e";

export type GuideAction = "click" | "type";

// Robuster Element-Selektor je Schritt (Welle 24, Vorbau für Live-Führung/Anleitungs-TÜV).
// Wird NUR erfasst + gespeichert (steps.selector, jsonb) — noch nirgends gelesen.
export type GuideSelector = {
  css?: string; // kürzester eindeutiger CSS-Pfad (<=400), OHNE generierte Klassennamen
  text?: string; // sichtbarer Kurztext (<=80)
  role?: string; // implizite/explizite ARIA-Rolle (<=40)
};

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
  return out.css || out.text || out.role ? out : undefined;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function isFinitePositiveInt(n: unknown, max: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n <= max;
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

    out.push({
      path,
      label,
      action,
      rect: { x, y, w, h },
      url,
      title,
      w: Math.round(s.w),
      h: Math.round(s.h),
      ...(selector ? { selector } : {}),
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
 *  - type  + Label → „Tragen Sie {label} ein"
 *  - ohne Label    → „Schritt {n}"
 */
export function templateTitle(step: GuideStepInput, index: number): string {
  const n = index + 1;
  if (!step.label) return `Schritt ${n}`;
  const wrap = (l: string) =>
    step.action === "type" ? `Tragen Sie „${l}“ ein` : `Klicken Sie auf „${l}“`;
  // ZITAT-SICHER kürzen (Richards YouTube-Fund): Der alte Hard-Cut nach dem Einsetzen
  // schnitt das schließende „“" weg („…96GB of VRAM). Stattdessen das Zitat-INNERE an
  // einer Wortgrenze kürzen — die Anführungszeichen bleiben immer paarig.
  const room = TITLE_MAX - wrap("").length;
  let label = step.label;
  if (label.length > room) {
    let cut = label.slice(0, Math.max(1, room - 1));
    const sp = cut.lastIndexOf(" ");
    if (sp >= Math.floor(room * 0.5)) cut = cut.slice(0, sp);
    label = cut.replace(/[\s.,;:]+$/, "") + "…";
  }
  return wrap(label);
}

/**
 * Vorlagen-Fließtext je Schritt: ein Absatz mit Kontext. Zeigt den Seiten-Titel nur,
 * wenn er sich zum vorigen Schritt geändert hat (Seitenwechsel) — dann als „Auf der
 * Seite „…"" eingeleitet. So bleibt der Text knapp und nicht redundant.
 */
export function templateBodyText(
  step: GuideStepInput,
  prev: GuideStepInput | null,
): string {
  const changedPage = !!step.title && step.title !== (prev?.title ?? "");
  const context = changedPage ? `Auf der Seite „${step.title}“: ` : "";
  if (step.action === "type" && step.label) {
    return `${context}Tragen Sie hier „${step.label}“ ein.`;
  }
  if (step.label) {
    return `${context}Klicken Sie auf „${step.label}“, um fortzufahren.`;
  }
  return `${context}Führen Sie diesen Schritt wie im Bild markiert aus.`;
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
