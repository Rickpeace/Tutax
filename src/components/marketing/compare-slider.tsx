"use client";

import { useState } from "react";
import { ChevronsLeftRight } from "lucide-react";

/**
 * Vorher/Nachher-Vergleich (Landing): zwei Screenshots derselben Seite, das obere
 * Bild wird per Regler horizontal beschnitten. Der unsichtbare Range-Input über der
 * ganzen Fläche macht Maus, Touch UND Tastatur (Pfeiltasten) frei Haus möglich.
 */
export function CompareSlider({
  beforeSrc,
  beforeLabel,
  afterSrc,
  afterLabel,
  width,
  height,
  alt,
}: {
  beforeSrc: string;
  beforeLabel: string;
  afterSrc: string;
  afterLabel: string;
  width: number;
  height: number;
  alt: string;
}) {
  const [pos, setPos] = useState(50);

  return (
    <div
      className="relative select-none overflow-hidden rounded-2xl border border-border bg-card shadow-[0_30px_80px_-20px_rgba(16,21,36,0.3)]"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {/* Unten: nachher (rechts sichtbar) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterSrc}
        alt={alt}
        width={width}
        height={height}
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Oben: vorher, links des Reglers sichtbar */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeSrc}
          alt=""
          width={width}
          height={height}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>

      {/* Trennlinie + Griff */}
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -left-px w-0.5 bg-white shadow-[0_0_0_1px_rgba(16,21,36,0.2)]" />
        <div className="absolute top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-ink shadow-lg">
          <ChevronsLeftRight className="size-4" />
        </div>
      </div>

      {/* Labels */}
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-[11px] font-bold text-white">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-white">
        {afterLabel}
      </span>

      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Vergleich verschieben: links Standard, rechts KI-Design"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
