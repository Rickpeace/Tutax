// Gemeinsame SVG-Bausteine für Markierungen (Welle 51a): Viewer (Hilfe-Seite, Vorschau,
// Lightbox, Druck) UND Editor zeichnen Verpixelung und Lupe identisch — vorher zeigte der
// Editor statt echter Unschärfe nur eine halbdurchsichtige Fläche (Text blieb lesbar).
import type { Highlight } from "@/lib/types";

export const LENS_ZOOM = 2;

/** Stärke der Unschärfe relativ zur angezeigten Bildbreite (wie bisher im Viewer). */
export function blurStdDev(width: number): number {
  return Math.max(5, width * 0.012);
}

/** Box-Markierung in Pixeln, normalisiert (negative Breite/Höhe beim Aufziehen erlaubt). */
export function boxPx(h: Highlight, size: { w: number; h: number }) {
  const px = h.x * size.w;
  const py = h.y * size.h;
  const pw = h.w * size.w;
  const ph = h.h * size.h;
  return {
    x: Math.min(px, px + pw),
    y: Math.min(py, py + ph),
    w: Math.abs(pw),
    h: Math.abs(ph),
  };
}

/** Filter-Definition (gehört in <defs>). */
export function BlurFilterDef({ id, width }: { id: string; width: number }) {
  return (
    <filter id={id}>
      <feGaussianBlur stdDeviation={blurStdDev(width)} />
    </filter>
  );
}

/**
 * Echte Unschärfe: je Verpixelung eine weichgezeichnete Kopie des Bildes, auf das Rechteck
 * beschnitten. Die clipPath-IDs (`${idPrefix}-${h.id}`) nutzt auch die Lupe wieder.
 */
export function BlurLayer({
  blurs,
  url,
  size,
  filterId,
  idPrefix,
}: {
  blurs: Highlight[];
  url: string;
  size: { w: number; h: number };
  filterId: string;
  idPrefix: string;
}) {
  return (
    <g style={{ pointerEvents: "none" }}>
      {blurs.map((h) => {
        const b = boxPx(h, size);
        const clipId = `${idPrefix}-${h.id}`;
        return (
          <g key={h.id}>
            <clipPath id={clipId}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={h.rounded ? 4 : 0} />
            </clipPath>
            <image
              data-blur-mark={h.id}
              href={url}
              x={0}
              y={0}
              width={size.w}
              height={size.h}
              preserveAspectRatio="none"
              clipPath={`url(#${clipId})`}
              filter={`url(#${filterId})`}
            />
          </g>
        );
      })}
    </g>
  );
}

/**
 * Lupe: der Bereich unter der Form 2× vergrößert — INKLUSIVE der Verpixelungen (vergrößert
 * mit), damit die Lupe nie Klartext unter einer Verpixelung zeigt.
 */
export function LensLayer({
  h,
  url,
  size,
  blurs,
  filterId,
  idPrefix,
}: {
  h: Highlight;
  url: string;
  size: { w: number; h: number };
  blurs: Highlight[];
  filterId: string;
  idPrefix: string;
}) {
  const b = boxPx(h, size);
  const clipId = `${idPrefix}-lens-${h.id}`;
  const ccx = b.x + b.w / 2;
  const ccy = b.y + b.h / 2;
  return (
    <g style={{ pointerEvents: "none" }}>
      <clipPath id={clipId}>
        {h.type === "ellipse" ? (
          <ellipse cx={ccx} cy={ccy} rx={b.w / 2} ry={b.h / 2} />
        ) : (
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={h.rounded ? 6 : 0} />
        )}
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#fff" />
        <g
          transform={`translate(${ccx * (1 - LENS_ZOOM)} ${ccy * (1 - LENS_ZOOM)}) scale(${LENS_ZOOM})`}
        >
          <image href={url} x={0} y={0} width={size.w} height={size.h} preserveAspectRatio="none" />
          {/* clipPath-Koordinaten gelten im (skalierten) Raum des Verweisenden -> die
              Verpixelungen wandern mit der Vergrößerung mit. */}
          {blurs.map((bl) => (
            <image
              key={bl.id}
              href={url}
              x={0}
              y={0}
              width={size.w}
              height={size.h}
              preserveAspectRatio="none"
              clipPath={`url(#${idPrefix}-${bl.id})`}
              filter={`url(#${filterId})`}
            />
          ))}
        </g>
      </g>
    </g>
  );
}
