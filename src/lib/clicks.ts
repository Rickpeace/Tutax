// Gemeinsame Validierung der Klick-Telemetrie („clicks.json") aus dem Steply Recorder.
// Vertrag (siehe extension/README.md bzw. Migration 0020 → video_jobs.clicks):
//   [{ t: Sekunden seit Aufnahmestart (≥ 0), x: 0..1, y: 0..1, label?: Text (≤ 60) }]
//
// EINE Quelle der Wahrheit — genutzt von:
//   • src/components/app/video-upload.tsx (Datei-Upload, wirft mit deutscher Meldung)
//   • src/app/api/recorder/complete/route.ts (Direkt-Upload, verwirft bei Fehler still)

export type Click = { t: number; x: number; y: number; label?: string };

export const MAX_CLICKS = 500;
const LABEL_MAX = 60;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Strenge Validierung einer bereits geparsten Struktur. Wirft mit klarer deutscher
 * Meldung bei Ungültigkeit; gibt bei Erfolg bereinigte Klicks zurück (x/y auf 0..1
 * geklemmt, label auf 60 Zeichen gekappt). x/y nur „knapp daneben" (−1..2) wird
 * geklemmt — grob unsinnige Werte gelten als kaputt.
 */
export function validateClicks(raw: unknown): Click[] {
  if (!Array.isArray(raw)) throw new Error("Die Klick-Datei muss eine JSON-Liste sein.");
  if (raw.length === 0) throw new Error("Die Klick-Datei enthält keine Einträge.");
  if (raw.length > MAX_CLICKS) throw new Error(`Die Klick-Datei hat zu viele Einträge (max. ${MAX_CLICKS}).`);
  const out: Click[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i] as Record<string, unknown> | null;
    const where = `Eintrag ${i + 1}`;
    if (!c || typeof c !== "object") throw new Error(`Klick-Datei: ${where} ist kein Objekt.`);
    const { t, x, y, label } = c as { t?: unknown; x?: unknown; y?: unknown; label?: unknown };
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0) throw new Error(`Klick-Datei: ${where} hat kein gültiges „t" (Sekunden ≥ 0).`);
    if (typeof x !== "number" || !Number.isFinite(x) || x < -1 || x > 2) throw new Error(`Klick-Datei: ${where} hat kein gültiges „x" (0..1).`);
    if (typeof y !== "number" || !Number.isFinite(y) || y < -1 || y > 2) throw new Error(`Klick-Datei: ${where} hat kein gültiges „y" (0..1).`);
    if (label !== undefined && typeof label !== "string") throw new Error(`Klick-Datei: ${where} hat ein ungültiges „label".`);
    const click: Click = { t, x: clamp01(x), y: clamp01(y) };
    if (typeof label === "string" && label.length > 0) click.label = label.slice(0, LABEL_MAX);
    out.push(click);
  }
  return out;
}

/**
 * Nicht-werfende Variante für Server-Kontexte, die bei kaputten Klicks lieber ohne
 * Klicks weitermachen (Direkt-Upload). Gibt null zurück, wenn ungültig/leer.
 */
export function validateClicksOrNull(raw: unknown): Click[] | null {
  try {
    return validateClicks(raw);
  } catch {
    return null;
  }
}
