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

// Primärfarbe (#3d4ee6, ARCHITEKTUR §13) für das eine Highlight-Rechteck je Schritt.
export const GUIDE_HIGHLIGHT_COLOR = "#3d4ee6";

export type GuideAction = "click" | "type";

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
};

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

    out.push({
      path,
      label,
      action,
      rect: { x, y, w, h },
      url,
      title,
      w: Math.round(s.w),
      h: Math.round(s.h),
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
  const title =
    step.action === "type"
      ? `Tragen Sie „${step.label}“ ein`
      : `Klicken Sie auf „${step.label}“`;
  return title.slice(0, TITLE_MAX);
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
