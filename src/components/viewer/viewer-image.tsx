"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Highlight } from "@/lib/types";
import { markColor, markColorKey } from "@/lib/highlight-color";
import { BlurFilterDef, BlurLayer, LensLayer, blurStdDev, boxPx } from "@/components/viewer/svg-marks";

/** Read-only Darstellung eines Schritt-Bildes mit Highlights, Lupe & Blur. */
export function ViewerImage({
  url,
  highlights,
  width,
  height,
  alt = "",
  eager = false,
}: {
  url: string;
  highlights: Highlight[];
  /** Bildmaße aus der DB -> aspect-ratio reserviert den Platz (kein Layout-Shift). */
  width?: number | null;
  height?: number | null;
  alt?: string;
  /** Sofort laden (Druckansicht: „lazy“ druckte bei großen Anleitungen die meisten Bilder nicht). */
  eager?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // ANGEZEIGTER Stand (Bild + Markierungen + Maße) — wechselt beim Durchklicken erst, wenn
  // das neue Bild fertig dekodiert ist. Bis dahin bleibt das vorige Bild samt seinen
  // Markierungen stehen: kein Moment, in dem das neue Bild ohne Verpixelung oder ohne
  // Rahmen zu sehen ist, und Bild + Markierungen erscheinen im selben Frame.
  const [shown, setShown] = useState({ url, highlights, width, height });
  // Erstes Laden: Bild bleibt unsichtbar, bis es komplett da ist (kein zeilenweises
  // Aufbauen, Markierungen erscheinen zusammen mit dem Bild).
  const [loaded, setLoaded] = useState(false);
  // Eindeutige SVG-IDs je Instanz: Schritt-Bild und Lightbox zeigen dieselben Markierungen
  // gleichzeitig — doppelte IDs ließen clipPath/Marker der falschen Instanz greifen.
  const uid = `vi${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const blurs = shown.highlights.filter((h) => h.type === "blur");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Schon vor dem Hydrieren fertig geladene Bilder (Cache) feuern kein onLoad mehr.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  // Gleiches Bild (z. B. nur Markierungen geändert): sofort übernehmen (State-Anpassung im
  // Render, wie von React für abgeleiteten State empfohlen).
  if (
    url === shown.url &&
    (highlights !== shown.highlights || width !== shown.width || height !== shown.height)
  ) {
    setShown({ url, highlights, width, height });
  }

  useEffect(() => {
    if (url === shown.url) return;
    // Neues Bild erst vorladen + dekodieren, dann alles auf einmal umschalten.
    let cancelled = false;
    const pre = new Image();
    pre.src = url;
    pre
      .decode()
      .catch(() => {}) // Fehler: trotzdem umschalten, das <img> zeigt dann den Fehlerzustand
      .then(() => {
        if (cancelled) return;
        setShown({ url, highlights, width, height });
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url, highlights, width, height, shown]);

  const ready = loaded && size.w > 0;

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden border border-black/5 ${ready ? "" : "animate-pulse"}`}
      style={{
        borderRadius: "var(--brand-radius, 12px)",
        ...(shown.width && shown.height ? { aspectRatio: `${shown.width} / ${shown.height}` } : {}),
        // Lade-Platzhalter folgt dem Kunden-CI (dezente Tönung aus der Brand-Tinte) —
        // ein neutralgrauer Block wirkt in fremden Designs wie ein Fremdkörper.
        ...(ready
          ? {}
          : { background: "color-mix(in srgb, var(--brand-ink, #101524) 7%, transparent)" }),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={shown.url}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className="block w-full print:!opacity-100"
        style={ready ? undefined : { opacity: 0 }}
      />
      {/* Verpixelung, Schicht 1: Unschärfe direkt auf dem darunterliegenden Bild
          (backdrop-filter) — braucht KEIN eigenes Bild, ist also im selben Frame da wie das
          Bild selbst. Prozent-Positionen, damit sie auch vor dem Ausmessen stimmt. */}
      {blurs.map((h) => {
        const x = Math.min(h.x, h.x + h.w);
        const y = Math.min(h.y, h.y + h.h);
        const blur = `blur(${blurStdDev(size.w || 600)}px)`;
        return (
          <div
            key={h.id}
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${Math.abs(h.w) * 100}%`,
              height: `${Math.abs(h.h) * 100}%`,
              borderRadius: h.rounded ? 4 : 0,
              backdropFilter: blur,
              WebkitBackdropFilter: blur,
            }}
          />
        );
      })}
      {/* Schicht 2: SVG-Unschärfe wie bisher (gleiche Optik wie im Editor, greift auch im
          Druck, wo backdrop-filter nicht zuverlässig ist) + übrige Markierungen. */}
      {ready && (
        <svg width={size.w} height={size.h} className="pointer-events-none absolute inset-0">
          <defs>
            <BlurFilterDef id={`${uid}-blur`} width={size.w} />
            {[...new Set(shown.highlights.map((h) => markColorKey(h.color)))].map((key) => {
              const h = shown.highlights.find((x) => markColorKey(x.color) === key)!;
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
          <BlurLayer blurs={blurs} url={shown.url} size={size} filterId={`${uid}-blur`} idPrefix={uid} />
          {shown.highlights
            .filter((h) => h.type !== "blur")
            .map((h) => (
              <ViewShape key={h.id} h={h} url={shown.url} size={size} blurs={blurs} uid={uid} />
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
