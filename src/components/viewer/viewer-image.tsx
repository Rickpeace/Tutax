"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Highlight } from "@/lib/types";
import { markColor, markColorKey } from "@/lib/highlight-color";
import { BlurFilterDef, BlurLayer, LensLayer, boxPx } from "@/components/viewer/svg-marks";

/** Read-only Darstellung eines Schritt-Bildes mit Highlights, Lupe & Blur. */
export function ViewerImage({
  url,
  highlights,
  width,
  height,
  alt = "",
}: {
  url: string;
  highlights: Highlight[];
  /** Bildmaße aus der DB -> aspect-ratio reserviert den Platz (kein Layout-Shift). */
  width?: number | null;
  height?: number | null;
  alt?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Markierungen erst zeigen, wenn das Bild wirklich da ist — der aspect-ratio-Wrapper
  // reserviert die Fläche sofort, sonst schweben Highlights über leerem Grund.
  const [loaded, setLoaded] = useState(false);
  // Eindeutige SVG-IDs je Instanz: Schritt-Bild und Lightbox zeigen dieselben Markierungen
  // gleichzeitig — doppelte IDs ließen clipPath/Marker der falschen Instanz greifen.
  const uid = `vi${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const blurs = highlights.filter((h) => h.type === "blur");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bei URL-Wechsel zurücksetzen; aus dem Cache geladene Bilder sind sofort complete.
  useEffect(() => {
    setLoaded(imgRef.current?.complete ?? false);
  }, [url]);

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden border border-black/5 ${loaded ? "" : "animate-pulse"}`}
      style={{
        borderRadius: "var(--brand-radius, 12px)",
        ...(width && height ? { aspectRatio: `${width} / ${height}` } : {}),
        // Lade-Platzhalter folgt dem Kunden-CI (dezente Tönung aus der Brand-Tinte) —
        // ein neutralgrauer Block wirkt in fremden Designs wie ein Fremdkörper.
        ...(loaded
          ? {}
          : { background: "color-mix(in srgb, var(--brand-ink, #101524) 7%, transparent)" }),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={url}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className="block w-full"
      />
      {loaded && size.w > 0 && (
        <svg width={size.w} height={size.h} className="pointer-events-none absolute inset-0">
          <defs>
            <BlurFilterDef id={`${uid}-blur`} width={size.w} />
            {[...new Set(highlights.map((h) => markColorKey(h.color)))].map((key) => {
              const h = highlights.find((x) => markColorKey(x.color) === key)!;
              return (
                <marker
                  key={key}
                  id={`${uid}-arrow-${key}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: markColor(h.color) }} />
                </marker>
              );
            })}
          </defs>
          {/* Verpixelungen zuerst (unter Rahmen/Pfeilen), dann die übrigen Markierungen. */}
          <BlurLayer blurs={blurs} url={url} size={size} filterId={`${uid}-blur`} idPrefix={uid} />
          {highlights
            .filter((h) => h.type !== "blur")
            .map((h) => (
              <ViewShape key={h.id} h={h} url={url} size={size} blurs={blurs} uid={uid} />
            ))}
        </svg>
      )}
    </div>
  );
}

function ViewShape({
  h,
  url,
  size,
  blurs,
  uid,
}: {
  h: Highlight;
  url: string;
  size: { w: number; h: number };
  blurs: Highlight[];
  uid: string;
}) {
  // Standardfarbe ⇒ Firmenfarbe des Kunden (--brand-accent); eigene Farben bleiben (Welle 51a).
  const stroke = markColor(h.color);
  const sw = h.strokeWidth ?? 3;

  if (h.type === "arrow") {
    const px = h.x * size.w;
    const py = h.y * size.h;
    return (
      <line
        data-mark={h.type}
        x1={px}
        y1={py}
        x2={px + h.w * size.w}
        y2={py + h.h * size.h}
        style={{ stroke }}
        strokeWidth={sw}
        strokeLinecap="round"
        markerEnd={`url(#${uid}-arrow-${markColorKey(h.color)})`}
      />
    );
  }

  const b = boxPx(h, size);
  const shape =
    h.type === "ellipse" ? (
      <ellipse
        data-mark={h.type}
        cx={b.x + b.w / 2}
        cy={b.y + b.h / 2}
        rx={b.w / 2}
        ry={b.h / 2}
        fill="none"
        style={{ stroke }}
        strokeWidth={sw}
      />
    ) : (
      <rect
        data-mark={h.type}
        x={b.x}
        y={b.y}
        width={b.w}
        height={b.h}
        rx={h.rounded ? 6 : 0}
        fill="none"
        style={{ stroke }}
        strokeWidth={sw}
      />
    );

  if (!h.zoom) return shape;

  // Lupe: Inhalt unter der Form 2× vergrößert (inkl. Verpixelungen)
  return (
    <g>
      <LensLayer h={h} url={url} size={size} blurs={blurs} filterId={`${uid}-blur`} idPrefix={uid} />
      {shape}
    </g>
  );
}
