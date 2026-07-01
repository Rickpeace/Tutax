// Server-seitige Bild-Redaktion (bewusst OHNE "server-only": wird vom
// Smoke-Test scripts/test-blur-live.mjs direkt importiert; enthält keine Secrets).
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import type { Highlight } from "@/lib/types";

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

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
    const left = clamp(Math.round((b.x ?? 0) * W), 0, W - 1);
    const top = clamp(Math.round((b.y ?? 0) * H), 0, H - 1);
    const width = clamp(Math.round((b.w ?? 0) * W), 1, W - left);
    const height = clamp(Math.round((b.h ?? 0) * H), 1, H - top);
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
