"use client";

import { useEffect, useRef, useState } from "react";
import type { Highlight } from "@/lib/types";

const ZOOM = 2;

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
      className={`relative overflow-hidden border border-black/5 ${loaded ? "" : "animate-pulse bg-black/5"}`}
      style={{
        borderRadius: "var(--brand-radius, 12px)",
        ...(width && height ? { aspectRatio: `${width} / ${height}` } : {}),
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
            <filter id="vi-blur">
              <feGaussianBlur stdDeviation={Math.max(5, size.w * 0.012)} />
            </filter>
            {[...new Set(highlights.map((h) => h.color ?? "#111827"))].map((c) => (
              <marker
                key={c}
                id={`vi-arrow-${c.replace("#", "")}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
              </marker>
            ))}
          </defs>
          {highlights.map((h) => (
            <ViewShape key={h.id} h={h} url={url} size={size} />
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
}: {
  h: Highlight;
  url: string;
  size: { w: number; h: number };
}) {
  const stroke = h.color ?? "#111827";
  const sw = h.strokeWidth ?? 3;
  const px = h.x * size.w;
  const py = h.y * size.h;
  const pw = h.w * size.w;
  const ph = h.h * size.h;

  if (h.type === "arrow") {
    return (
      <line
        x1={px}
        y1={py}
        x2={px + pw}
        y2={py + ph}
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        markerEnd={`url(#vi-arrow-${stroke.replace("#", "")})`}
      />
    );
  }

  const nx = Math.min(px, px + pw);
  const ny = Math.min(py, py + ph);
  const nw = Math.abs(pw);
  const nh = Math.abs(ph);
  const clipId = `vi-clip-${h.id}`;
  const ccx = nx + nw / 2;
  const ccy = ny + nh / 2;

  if (h.type === "blur") {
    return (
      <g>
        <clipPath id={clipId}>
          <rect x={nx} y={ny} width={nw} height={nh} rx={h.rounded ? 4 : 0} />
        </clipPath>
        <image
          href={url}
          x={0}
          y={0}
          width={size.w}
          height={size.h}
          preserveAspectRatio="none"
          clipPath={`url(#${clipId})`}
          filter="url(#vi-blur)"
        />
      </g>
    );
  }

  const shape =
    h.type === "ellipse" ? (
      <ellipse
        cx={ccx}
        cy={ccy}
        rx={nw / 2}
        ry={nh / 2}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
      />
    ) : (
      <rect
        x={nx}
        y={ny}
        width={nw}
        height={nh}
        rx={h.rounded ? 6 : 0}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
      />
    );

  if (!h.zoom) return shape;

  // Lupe: Inhalt unter der Form 2× vergrößert
  return (
    <g>
      <clipPath id={clipId}>
        {h.type === "ellipse" ? (
          <ellipse cx={ccx} cy={ccy} rx={nw / 2} ry={nh / 2} />
        ) : (
          <rect x={nx} y={ny} width={nw} height={nh} rx={h.rounded ? 6 : 0} />
        )}
      </clipPath>
      <rect x={nx} y={ny} width={nw} height={nh} fill="#fff" clipPath={`url(#${clipId})`} />
      <image
        href={url}
        x={ccx * (1 - ZOOM)}
        y={ccy * (1 - ZOOM)}
        width={size.w * ZOOM}
        height={size.h * ZOOM}
        preserveAspectRatio="none"
        clipPath={`url(#${clipId})`}
      />
      {shape}
    </g>
  );
}
