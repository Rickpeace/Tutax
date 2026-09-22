// Server-seitige Bild-Redaktion (bewusst OHNE "server-only": wird vom
// Smoke-Test scripts/test-blur-live.mjs direkt importiert; enthält keine Secrets).
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import type { Highlight } from "@/lib/types";

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Rechteck normalisieren: negative Breite/Höhe bedeuten „von rechts/unten aufgezogen“.
 * Der Viewer zeigt sie längst richtig an (Math.min + Math.abs) — das Einbrennen muss
 * exakt dieselbe Fläche treffen, sonst bliebe die öffentliche Bilddatei dort Klartext.
 * Gibt null zurück, wenn Koordinaten fehlen/kaputt sind.
 */
export function normalizeRect(h: {
  x?: unknown;
  y?: unknown;
  w?: unknown;
  h?: unknown;
}): { x: number; y: number; w: number; h: number } | null {
  const nums = [h.x, h.y, h.w, h.h].map((v) => Number(v ?? 0));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, hh] = nums;
  return { x: Math.min(x, x + w), y: Math.min(y, y + hh), w: Math.abs(w), h: Math.abs(hh) };
}

/** Enthält die Highlight-Liste Blur-Markierungen, die eingebrannt werden müssen? */
export function hasBlur(highlights: unknown): boolean {
  return (
    Array.isArray(highlights) &&
    highlights.some((h) => h && typeof h === "object" && (h as Highlight).type === "blur")
  );
}

/**
 * Brennt Blur-Bereiche IN DIE PIXEL (Pixelierung, irreversibel).
 *
 * Hintergrund (REVIEW Top-1): Der Viewer legt Blur nur als SVG-Filter ÜBER das Bild —
 * im public Bucket lag bisher das unredigierte Original (Bild-URL öffnen = Klartext).
 * Diese Funktion erzeugt die redigierte Fassung für ALLES Öffentliche; das private
 * Original bleibt unverändert, damit der Autor die Markierung weiter bearbeiten kann.
 *
 * Pixelierung statt Weichzeichnen: Region stark runterskalieren und grob wieder
 * hochskalieren — die Bildinformation geht dabei wirklich verloren.
 */
export async function burnBlur(image: Buffer, highlights: unknown): Promise<Buffer> {
  const blurs = (Array.isArray(highlights) ? (highlights as Highlight[]) : []).filter(
    (h) => h && h.type === "blur",
  );
  if (!blurs.length) return image;

  const base = sharp(image);
  const meta = await base.metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) return image;

  const overlays: OverlayOptions[] = [];
  for (const b of blurs) {
    // Kaputte Koordinaten (nicht endlich) würden sharp werfen lassen — solche Einträge nimmt
    // updateStep gar nicht erst an; hier zusätzlich robust überspringen statt abzustürzen.
    // Negative Breite/Höhe wird VOR dem Klemmen normalisiert (sonst klemmte width auf 1 und
    // die Stelle bliebe in der öffentlichen Bilddatei lesbar).
    const r = normalizeRect(b);
    if (!r) continue;
    const left = clamp(Math.round(r.x * W), 0, W - 1);
    const top = clamp(Math.round(r.y * H), 0, H - 1);
    const width = clamp(Math.round(r.w * W), 1, W - left);
    const height = clamp(Math.round(r.h * H), 1, H - top);
    if (width < 2 || height < 2) continue;

    // Blockgröße ~1/12 der Region (mind. 1 px Kleinformat) -> grobe, unlesbare Kacheln.
    // WICHTIG: zwei GETRENNTE Pipelines — sharp wendet pro Pipeline nur EIN resize an.
    const smallW = Math.max(1, Math.round(width / 12));
    const smallH = Math.max(1, Math.round(height / 12));
    const small = await sharp(image)
      .extract({ left, top, width, height })
      .resize(smallW, smallH, { fit: "fill" })
      .png() // verlustfreies Zwischenformat
      .toBuffer();
    const region = await sharp(small)
      .resize(width, height, { fit: "fill", kernel: "nearest" })
      .png()
      .toBuffer();
    overlays.push({ input: region, left, top });
  }
  if (!overlays.length) return image;

  return await base.composite(overlays).toBuffer();
}

/**
 * Welle 51a — geteilte Bilder („Bild in neuen Schritt übernehmen“): Mehrere Schritte können
 * denselben image_path nutzen, die öffentliche Kopie liegt aber nur EINMAL unter diesem Pfad.
 * Damit nie ein Schritt ohne Verpixelung die verpixelte Kopie eines anderen überschreibt,
 * wird die VEREINIGUNG aller Verpixelungen der Schritte mit diesem Bild eingebrannt
 * (lieber zu viel als zu wenig unkenntlich). Doppelte Rechtecke fallen weg.
 *
 * Die Rechtecke werden dabei normalisiert (negative Breite/Höhe → gleiche Fläche mit
 * positiven Maßen), damit zwei Schreibweisen derselben Fläche als ein Eintrag gelten
 * und burnBlur in jedem Fall die richtige Stelle trifft.
 */
export function unionBlurs(lists: unknown[]): Highlight[] {
  const out: Highlight[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const h of list as Highlight[]) {
      if (!h || typeof h !== "object" || h.type !== "blur") continue;
      const r = normalizeRect(h);
      if (!r) continue; // kaputte Koordinaten: burnBlur überspringt sie ohnehin
      const key = [r.x, r.y, r.w, r.h].map((v) => Math.round(v * 1000)).join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...h, ...r });
    }
  }
  return out;
}
