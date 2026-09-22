"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  MousePointer2,
  Square,
  Circle,
  ArrowUpRight,
  EyeOff,
  Trash2,
  ZoomIn,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Check,
} from "lucide-react";
import type { Highlight } from "@/lib/types";
import { DEFAULT_HIGHLIGHT_COLOR, markColor, markColorKey } from "@/lib/highlight-color";
import { BlurFilterDef, BlurLayer, LensLayer, boxPx } from "@/components/viewer/svg-marks";

type Tool = "select" | "rect" | "ellipse" | "arrow" | "blur";
type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | "start" | "end";
type Guides = { x: number[]; y: number[] };

// Erstes Feld = Standard: erscheint auf der Hilfe-Seite in der Firmenfarbe des Kunden
// (lib/highlight-color.ts). Dunkel ist jetzt die Tinte #33291f (bleibt bewusst dunkel).
const COLORS: { value: string; label: string }[] = [
  { value: DEFAULT_HIGHLIGHT_COLOR, label: "Firmenfarbe (Standard) – auf der Hilfe-Seite in Ihrer Akzentfarbe" },
  { value: "#33291f", label: "Dunkel" },
  { value: "#d6455d", label: "Rot" },
  { value: "#3d4ee6", label: "Blau" },
  { value: "#0f9d72", label: "Grün" },
];
const MIN = 0.01;
// Magnetisches Einrasten (Welle 51a): Toleranz relativ zur Bildgröße.
const SNAP = 0.015;
const NO_GUIDES: Guides = { x: [], y: [] };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Werkzeug + Farbe überleben den Schrittwechsel (Modul-Gedächtnis für die Sitzung):
// wer zehn Schritte hintereinander markiert, will nicht jedes Mal neu wählen.
let lastTool: Tool = "rect";
let lastColor = COLORS[0].value;

// Auto-Schwärzung (Welle 28): Sobald der Autor die Markierungen eines Schritts speichert
// (= irgendeine Änderung), gelten die automatisch vorgeschlagenen Blurs als GEPRÜFT — der
// `suggested`-Marker fällt weg (Feld ganz entfernen, damit die DB kein `suggested:false` hält).
// Gilt genauso für vom vorigen Schritt übernommene Verpixelungen (Welle 51a, suggestedFrom).
function markReviewed(list: Highlight[]): Highlight[] {
  return list.map((h) => {
    if (!h.suggested && !h.suggestedFrom) return h;
    const next = { ...h };
    delete next.suggested;
    delete next.suggestedFrom;
    return next;
  });
}

/** Kanten + Mitte einer Markierung (für das Einrasten an anderen Markierungen). */
function anchorsOf(h: Highlight): { x: number[]; y: number[] } {
  const x1 = Math.min(h.x, h.x + h.w);
  const x2 = Math.max(h.x, h.x + h.w);
  const y1 = Math.min(h.y, h.y + h.h);
  const y2 = Math.max(h.y, h.y + h.h);
  return { x: [x1, (x1 + x2) / 2, x2], y: [y1, (y1 + y2) / 2, y2] };
}

/** Bester Einrast-Versatz: welcher eigene Anker liegt am nächsten an welchem Ziel? */
function bestSnap(own: number[], targets: number[]): { delta: number; line: number } | null {
  let best: { delta: number; line: number } | null = null;
  for (const a of own) {
    for (const t of targets) {
      const d = t - a;
      if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, line: t };
    }
  }
  return best;
}

/**
 * Einrasten einer Box (Rechteck/Kreis/Verpixelung) beim Verschieben, Größe-Ändern oder
 * Aufziehen: an der Bildmitte (0,5) und an Kanten/Mitten der anderen Markierungen.
 * handle null = Verschieben (ganze Box), sonst die gezogene(n) Kante(n).
 */
export function snapBox(
  box: Highlight,
  handle: Handle | null,
  others: Highlight[],
): { box: Highlight; guides: Guides } {
  const tx = [0.5];
  const ty = [0.5];
  for (const o of others) {
    const a = anchorsOf(o);
    tx.push(...a.x);
    ty.push(...a.y);
  }
  const guides: Guides = { x: [], y: [] };
  const { w, h } = box;
  let { x, y } = box;

  if (handle === null) {
    const a = anchorsOf({ ...box, x, y });
    const sx = bestSnap(a.x, tx);
    if (sx) {
      x = Math.min(Math.max(0, 1 - w), Math.max(0, x + sx.delta));
      guides.x.push(sx.line);
    }
    const sy = bestSnap(a.y, ty);
    if (sy) {
      y = Math.min(Math.max(0, 1 - h), Math.max(0, y + sy.delta));
      guides.y.push(sy.line);
    }
    return { box: { ...box, x, y }, guides };
  }

  // Größe ändern / Aufziehen: nur die bewegten Kanten rasten ein.
  let left = x;
  let right = x + w;
  let top = y;
  let bottom = y + h;
  const snapEdge = (v: number, targets: number[], axis: "x" | "y") => {
    const s = bestSnap([v], targets);
    if (!s) return v;
    guides[axis].push(s.line);
    return clamp01(v + s.delta);
  };
  if (handle.includes("w")) left = snapEdge(left, tx, "x");
  if (handle.includes("e")) right = snapEdge(right, tx, "x");
  if (handle.includes("n")) top = snapEdge(top, ty, "y");
  if (handle.includes("s")) bottom = snapEdge(bottom, ty, "y");
  return { box: { ...box, x: left, y: top, w: right - left, h: bottom - top }, guides };
}

export function HighlightEditor({
  url,
  highlights,
  onChange,
  stickyToolbar = false,
}: {
  url: string;
  highlights: Highlight[];
  onChange: (h: Highlight[]) => void;
  /** Werkzeugleiste beim Scrollen oben festhalten (für den Großmodus). */
  stickyToolbar?: boolean;
}) {
  const [tool, setToolState] = useState<Tool>(lastTool);
  const [color, setColorState] = useState(lastColor);
  const setTool = (t: Tool) => {
    lastTool = t;
    setToolState(t);
  };
  const setColor = (c: string) => {
    lastColor = c;
    setColorState(c);
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Highlight | null>(null);
  const [live, setLive] = useState<Highlight | null>(null);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [helpOpen, setHelpOpen] = useState(false);
  // Eindeutige SVG-IDs: kleiner Editor und Großansicht dürfen sich nie IDs teilen.
  const uid = `he${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // Jede gespeicherte Highlight-Liste läuft durch markReviewed: eine Änderung an den
  // Markierungen gilt als Prüfung der Auto-Schwärzungen (Welle 28).
  const commit = (list: Highlight[]) => onChange(markReviewed(list));
  const inherited = highlights.filter((h) => h.suggested && h.suggestedFrom === "previous");
  const hasAutoSuggested = highlights.some((h) => h.suggested && !h.suggestedFrom);

  const wrapRef = useRef<HTMLDivElement>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const manip = useRef<{
    orig: Highlight;
    handle: Handle | null;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function rel(e: React.PointerEvent) {
    const r = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  function normalize(h: Highlight): Highlight {
    if (h.type === "arrow") return h;
    let { x, y, w, ["h"]: hh } = h;
    if (w < 0) { x += w; w = -w; }
    if (hh < 0) { y += hh; hh = -hh; }
    return { ...h, x, y, w, h: hh };
  }

  function applyManip(orig: Highlight, handle: Handle | null, dx: number, dy: number): Highlight {
    if (orig.type === "arrow") {
      // Endpunkte hart auf 0..1 klemmen, damit die Pfeilspitze nicht aus dem Bild rutscht.
      const sx = orig.x;
      const sy = orig.y;
      const ex = orig.x + orig.w;
      const ey = orig.y + orig.h;
      if (handle === null) {
        // Verschieben: ganzen Pfeil bewegen, aber so, dass beide Enden im Bild bleiben.
        const cdx = clamp01(Math.min(sx, ex) + dx) - Math.min(sx, ex);
        const cdy = clamp01(Math.min(sy, ey) + dy) - Math.min(sy, ey);
        const cdx2 = clamp01(Math.max(sx, ex) + cdx) - Math.max(sx, ex);
        const cdy2 = clamp01(Math.max(sy, ey) + cdy) - Math.max(sy, ey);
        const fx = Math.abs(cdx2) < Math.abs(cdx) ? cdx2 : cdx;
        const fy = Math.abs(cdy2) < Math.abs(cdy) ? cdy2 : cdy;
        return { ...orig, x: sx + fx, y: sy + fy };
      }
      if (handle === "start") {
        const nx = clamp01(sx + dx);
        const ny = clamp01(sy + dy);
        return { ...orig, x: nx, y: ny, w: ex - nx, h: ey - ny };
      }
      const nex = clamp01(ex + dx);
      const ney = clamp01(ey + dy);
      return { ...orig, w: nex - sx, h: ney - sy };
    }

    if (handle === null) {
      // Verschieben: Box komplett im Bild halten (Position innerhalb [0, 1 - Größe]).
      const w = orig.w;
      const h = orig.h;
      return {
        ...orig,
        x: Math.min(Math.max(0, 1 - w), Math.max(0, orig.x + dx)),
        y: Math.min(Math.max(0, 1 - h), Math.max(0, orig.y + dy)),
      };
    }

    // Resize: gezogene Kante(n) auf 0..1 klemmen, MIN-Größe erzwingen.
    let left = orig.x;
    let right = orig.x + orig.w;
    let top = orig.y;
    let bottom = orig.y + orig.h;
    if (handle.includes("w")) left = clamp01(orig.x + dx);
    if (handle.includes("e")) right = clamp01(orig.x + orig.w + dx);
    if (handle.includes("n")) top = clamp01(orig.y + dy);
    if (handle.includes("s")) bottom = clamp01(orig.y + orig.h + dy);
    return { ...orig, x: left, y: top, w: right - left, h: bottom - top };
  }

  // --- Zeichnen (Hintergrund) ---
  function onCanvasDown(e: React.PointerEvent) {
    if (tool === "select") {
      setSelectedId(null);
      return;
    }
    const { x, y } = rel(e);
    drawStart.current = { x, y };
    setDraft({
      id: crypto.randomUUID(),
      type: tool,
      x, y, w: 0, h: 0,
      color,
      strokeWidth: 3,
      rounded: true,
    });
    wrapRef.current?.setPointerCapture(e.pointerId);
  }

  function onCanvasMove(e: React.PointerEvent) {
    // Alt gedrückt = frei ziehen, ohne Einrasten.
    const snapOn = !e.altKey;
    if (draft && drawStart.current) {
      const { x, y } = rel(e);
      let next: Highlight = { ...draft, w: x - drawStart.current.x, h: y - drawStart.current.y };
      if (snapOn && next.type !== "arrow") {
        // Aufziehen = die „bewegte Ecke“ rastet ein (Richtung je nach Zugrichtung).
        const handle = `${next.h < 0 ? "n" : "s"}${next.w < 0 ? "w" : "e"}` as Handle;
        const n = normalize(next);
        const r = snapBox(n, handle, highlights);
        next = r.box;
        setGuides(r.guides);
      }
      setDraft(next);
    } else if (manip.current) {
      const { x, y } = rel(e);
      const m = manip.current;
      let next = applyManip(m.orig, m.handle, x - m.x, y - m.y);
      if (snapOn && next.type !== "arrow") {
        const r = snapBox(next, m.handle, highlights.filter((h) => h.id !== next.id));
        next = r.box;
        setGuides(r.guides);
      } else {
        setGuides(NO_GUIDES);
      }
      setLive(next);
    }
  }

  function onCanvasUp() {
    setGuides(NO_GUIDES);
    if (draft) {
      const n = normalize(draft);
      if (Math.abs(n.w) >= MIN || Math.abs(n.h) >= MIN) {
        commit([...highlights, n]);
        setSelectedId(n.id);
      }
      setDraft(null);
      drawStart.current = null;
    } else if (live) {
      const n = normalize(live);
      commit(highlights.map((h) => (h.id === n.id ? n : h)));
      setLive(null);
      manip.current = null;
    }
  }

  function startManip(e: React.PointerEvent, id: string, handle: Handle | null) {
    e.stopPropagation();
    const orig = highlights.find((h) => h.id === id);
    if (!orig) return;
    setSelectedId(id);
    const { x, y } = rel(e);
    manip.current = { orig, handle, x, y };
    setLive(orig);
    wrapRef.current?.setPointerCapture(e.pointerId);
  }

  function deleteSelected() {
    if (!selectedId) return;
    commit(highlights.filter((h) => h.id !== selectedId));
    setSelectedId(null);
  }

  // Entf/Backspace löscht die ausgewählte Form — aber nie beim Tippen in einem
  // Eingabefeld (Titel/Text daneben bleiben davon unberührt).
  useEffect(() => {
    if (!selectedId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      deleteSelected();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deleteSelected liest nur selectedId/highlights
  }, [selectedId, highlights]);

  function toggleZoom() {
    if (!selectedId) return;
    commit(highlights.map((h) => (h.id === selectedId ? { ...h, zoom: !h.zoom } : h)));
  }

  // Zentrieren (Welle 51a): Mitte der Markierung auf die Bildmitte — x = (1 − w) / 2.
  function center(axis: "x" | "y") {
    if (!selectedId) return;
    commit(
      highlights.map((h) => {
        if (h.id !== selectedId) return h;
        return axis === "x" ? { ...h, x: 0.5 - h.w / 2 } : { ...h, y: 0.5 - h.h / 2 };
      }),
    );
  }

  const selected = highlights.find((h) => h.id === selectedId) ?? null;
  const rendered = highlights.map((h) => (live && h.id === live.id ? live : h));
  const shapes = draft ? [...rendered, draft] : rendered;
  const blurs = shapes.filter((h) => h.type === "blur");
  // Je Farb-Schlüssel EIN Pfeilspitzen-Marker (alle Standardfarben teilen sich „default“).
  const markerColors = [
    ...new Map([...shapes.map((h) => h.color), color].map((c) => [markColorKey(c), c])).values(),
  ];

  return (
    <div className="space-y-2">
      {/* Werkzeugleiste */}
      <div
        className={`flex flex-wrap items-center gap-2 rounded-lg border-2 border-line bg-card p-[5px] ${
          stickyToolbar ? "sticky top-0 z-20 shadow-sm" : ""
        }`}
      >
        <div className="flex gap-0.5">
          <ToolBtn active={tool === "select"} onClick={() => setTool("select")} title="Auswählen">
            <MousePointer2 className="size-4" />
          </ToolBtn>
          <ToolBtn active={tool === "rect"} onClick={() => setTool("rect")} title="Rechteck">
            <Square className="size-4" />
          </ToolBtn>
          <ToolBtn active={tool === "ellipse"} onClick={() => setTool("ellipse")} title="Kreis">
            <Circle className="size-4" />
          </ToolBtn>
          <ToolBtn active={tool === "arrow"} onClick={() => setTool("arrow")} title="Pfeil">
            <ArrowUpRight className="size-4" />
          </ToolBtn>
          <ToolBtn active={tool === "blur"} onClick={() => setTool("blur")} title="Verpixeln">
            <EyeOff className="size-4" />
          </ToolBtn>
        </div>
        <div className="mx-1 h-5 w-px bg-line" />
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              className={`size-5 rounded-full border-2 ${color === c.value ? "border-ink" : "border-transparent"}`}
              style={{ background: c.value }}
              title={c.label}
              aria-label={`Farbe: ${c.label}`}
              aria-pressed={color === c.value}
            />
          ))}
        </div>
        {/* Aktionen für die ausgewählte Form: IMMER gerendert (nur deaktiviert ohne Auswahl),
            damit die Leiste beim Anklicken einer Form nicht umbricht und das Bild unter dem
            Mauszeiger verrutscht (sonst springt die Form beim Ziehen). */}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => center("x")}
            disabled={!selected}
            title="Waagerecht auf die Bildmitte zentrieren"
            aria-label="Waagerecht zentrieren"
            className="flex items-center rounded-md p-1 text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-35"
          >
            <AlignHorizontalJustifyCenter className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => center("y")}
            disabled={!selected}
            title="Senkrecht auf die Bildmitte zentrieren"
            aria-label="Senkrecht zentrieren"
            className="flex items-center rounded-md p-1 text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-35"
          >
            <AlignVerticalJustifyCenter className="size-4" />
          </button>
          <button
            type="button"
            onClick={toggleZoom}
            disabled={!selected || selected.type === "arrow" || selected.type === "blur"}
            title="Diesen Bereich als Lupe vergrößert zeigen"
            aria-pressed={!!selected?.zoom}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-35 ${
              selected?.zoom ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <ZoomIn className="size-3.5" /> Lupe
          </button>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={!selected}
            title="Ausgewählte Form löschen (Entf)"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-no hover:bg-no-soft disabled:pointer-events-none disabled:opacity-35"
          >
            <Trash2 className="size-3.5" /> Löschen
          </button>
        </div>
      </div>

      {/* Auto-Schwärzung (Welle 28): dezenter Hinweis, solange vorgeschlagene Blurs
          ungeprüft sind. Verschwindet, sobald der Autor die Markierungen speichert. */}
      {hasAutoSuggested && (
        <div className="flex items-start gap-2 rounded-lg border-2 border-primary/30 bg-accent px-3 py-2 text-xs text-ink">
          <EyeOff className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>
            <b>Automatisch verpixelt — bitte prüfen.</b> Sensible Felder wurden erkannt und
            unkenntlich gemacht. Verschieben, anpassen oder löschen Sie die Markierungen bei
            Bedarf; jede Änderung bestätigt die Prüfung.
          </span>
        </div>
      )}

      {/* Welle 51a: vom vorigen Schritt übernommene Verpixelung — nie stillschweigend:
          sichtbar, mit einem Klick bestätigen oder entfernen. */}
      {inherited.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-primary/30 bg-accent px-3 py-2 text-xs text-ink"
          data-testid="inherited-blur-hint"
        >
          <EyeOff className="size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <b>Verpixelung vom vorigen Schritt übernommen – bitte prüfen.</b>
          </span>
          <button
            type="button"
            onClick={() => commit(highlights)}
            className="flex items-center gap-1 rounded-md bg-card px-2 py-1 font-bold text-ink hover:bg-muted"
          >
            <Check className="size-3.5" /> Passt
          </button>
          <button
            type="button"
            onClick={() =>
              commit(highlights.filter((h) => !(h.suggested && h.suggestedFrom === "previous")))
            }
            className="flex items-center gap-1 rounded-md bg-card px-2 py-1 font-bold text-no hover:bg-no-soft"
          >
            <Trash2 className="size-3.5" /> Entfernen
          </button>
        </div>
      )}

      {/* Bild + Overlay */}
      <div
        ref={wrapRef}
        data-testid="highlight-canvas"
        className="relative overflow-hidden rounded-lg ring-2 ring-line select-none"
        style={{ touchAction: "none", cursor: tool === "select" ? "default" : "crosshair" }}
        onPointerDown={onCanvasDown}
        onPointerMove={onCanvasMove}
        onPointerUp={onCanvasUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Screenshot" className="block w-full max-w-full" draggable={false} />
        {size.w > 0 && (
          <svg width={size.w} height={size.h} className="pointer-events-none absolute inset-0">
            <defs>
              <BlurFilterDef id={`${uid}-blur`} width={size.w} />
              {markerColors.map((c) => (
                <marker
                  key={markColorKey(c)}
                  id={`${uid}-arrow-${markColorKey(c)}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: markColor(c) }} />
                </marker>
              ))}
            </defs>
            {/* Echte Unschärfe wie auf der Hilfe-Seite (vorher: nur halbdurchsichtige Fläche). */}
            <BlurLayer blurs={blurs} url={url} size={size} filterId={`${uid}-blur`} idPrefix={uid} />
            {shapes.map((h) => (
              <Shape
                key={h.id}
                h={h}
                url={url}
                size={size}
                uid={uid}
                blurs={blurs}
                selected={selectedId === h.id && h.id !== draft?.id}
                onDown={(e) => startManip(e, h.id, null)}
                onHandle={(e, handle) => startManip(e, h.id, handle)}
              />
            ))}
            {/* Hilfslinien beim Einrasten */}
            {guides.x.map((gx) => (
              <line
                key={`gx${gx}`}
                data-testid="snap-guide"
                x1={gx * size.w}
                x2={gx * size.w}
                y1={0}
                y2={size.h}
                className="stroke-teal"
                strokeWidth={1}
                strokeDasharray="5 4"
              />
            ))}
            {guides.y.map((gy) => (
              <line
                key={`gy${gy}`}
                data-testid="snap-guide"
                x1={0}
                x2={size.w}
                y1={gy * size.h}
                y2={gy * size.h}
                className="stroke-teal"
                strokeWidth={1}
                strokeDasharray="5 4"
              />
            ))}
          </svg>
        )}
      </div>
      {/* Hilfetext standardmäßig eingeklappt — spart Platz unter dem Bild. */}
      <button
        type="button"
        onClick={() => setHelpOpen((o) => !o)}
        aria-expanded={helpOpen}
        aria-controls={`${uid}-help`}
        className="rounded-sm text-xs font-bold text-muted-foreground underline-offset-2 outline-none hover:text-ink hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Wie funktionieren die Werkzeuge?
      </button>
      {helpOpen && (
        <p id={`${uid}-help`} className="text-xs text-muted-foreground">
          Werkzeug wählen, dann über dem Bild ziehen. Form anklicken zum Verschieben,
          an den Punkten ziehen zum Größe-Ändern, als <b>Lupe</b> vergrößern.
          „Verpixeln“ macht sensible Daten unkenntlich. Formen rasten an der Bildmitte und an
          anderen Markierungen ein (mit gedrückter Alt-Taste frei ziehen).
        </p>
      )}
    </div>
  );
}

function Shape({
  h,
  url,
  size,
  uid,
  blurs,
  selected,
  onDown,
  onHandle,
}: {
  h: Highlight;
  url: string;
  size: { w: number; h: number };
  uid: string;
  blurs: Highlight[];
  selected: boolean;
  onDown: (e: React.PointerEvent) => void;
  onHandle: (e: React.PointerEvent, handle: Handle) => void;
}) {
  const sw = h.strokeWidth ?? 3;
  const stroke = markColor(h.color);
  const common = {
    onPointerDown: onDown,
    style: { cursor: "move", pointerEvents: "all" as const, stroke },
    strokeWidth: sw,
    fill: "transparent",
  };

  if (h.type === "arrow") {
    const px = h.x * size.w;
    const py = h.y * size.h;
    const pw = h.w * size.w;
    const ph = h.h * size.h;
    return (
      <g>
        <line
          {...common}
          x1={px}
          y1={py}
          x2={px + pw}
          y2={py + ph}
          markerEnd={`url(#${uid}-arrow-${markColorKey(h.color)})`}
          strokeLinecap="round"
        />
        <line
          x1={px}
          y1={py}
          x2={px + pw}
          y2={py + ph}
          stroke="transparent"
          strokeWidth={16}
          style={{ cursor: "move", pointerEvents: "all" }}
          onPointerDown={onDown}
        />
        {selected && (
          <>
            <Dot cx={px} cy={py} cursor="move" onDown={(e) => onHandle(e, "start")} />
            <Dot cx={px + pw} cy={py + ph} cursor="move" onDown={(e) => onHandle(e, "end")} />
          </>
        )}
      </g>
    );
  }

  const { x: nx, y: ny, w: nw, h: nh } = boxPx(h, size);

  const lens =
    h.zoom && (h.type === "rect" || h.type === "ellipse") ? (
      <LensLayer h={h} url={url} size={size} blurs={blurs} filterId={`${uid}-blur`} idPrefix={uid} />
    ) : null;

  const handles = selected ? <BoxHandles nx={nx} ny={ny} nw={nw} nh={nh} onHandle={onHandle} /> : null;

  if (h.type === "ellipse") {
    return (
      <g>
        {lens}
        <ellipse {...common} cx={nx + nw / 2} cy={ny + nh / 2} rx={nw / 2} ry={nh / 2} />
        {handles}
      </g>
    );
  }

  if (h.type === "blur") {
    // Die Unschärfe selbst zeichnet der BlurLayer darunter; hier nur die greifbare Fläche
    // (Verschieben/Griffe) mit dezentem Rand, damit der Autor den Bereich erkennt.
    return (
      <g>
        <rect
          data-blur-frame={h.id}
          x={nx}
          y={ny}
          width={nw}
          height={nh}
          rx={h.rounded ? 4 : 0}
          fill="transparent"
          className={h.suggested ? "stroke-primary" : "stroke-ink/45"}
          strokeWidth={1}
          strokeDasharray="4 3"
          style={{ cursor: "move", pointerEvents: "all" }}
          onPointerDown={onDown}
        />
        {handles}
      </g>
    );
  }

  return (
    <g>
      {lens}
      <rect {...common} x={nx} y={ny} width={nw} height={nh} rx={h.rounded ? 6 : 0} />
      {handles}
    </g>
  );
}

function BoxHandles({
  nx,
  ny,
  nw,
  nh,
  onHandle,
}: {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  onHandle: (e: React.PointerEvent, handle: Handle) => void;
}) {
  const pts: { h: Handle; x: number; y: number; c: string }[] = [
    { h: "nw", x: nx, y: ny, c: "nwse-resize" },
    { h: "ne", x: nx + nw, y: ny, c: "nesw-resize" },
    { h: "sw", x: nx, y: ny + nh, c: "nesw-resize" },
    { h: "se", x: nx + nw, y: ny + nh, c: "nwse-resize" },
    { h: "n", x: nx + nw / 2, y: ny, c: "ns-resize" },
    { h: "s", x: nx + nw / 2, y: ny + nh, c: "ns-resize" },
    { h: "w", x: nx, y: ny + nh / 2, c: "ew-resize" },
    { h: "e", x: nx + nw, y: ny + nh / 2, c: "ew-resize" },
  ];
  return (
    <>
      <rect
        x={nx}
        y={ny}
        width={nw}
        height={nh}
        fill="none"
        className="stroke-primary"
        strokeWidth={1}
        strokeDasharray="4 3"
        style={{ pointerEvents: "none" }}
      />
      {pts.map((p) => (
        <Dot key={p.h} cx={p.x} cy={p.y} cursor={p.c} onDown={(e) => onHandle(e, p.h)} />
      ))}
    </>
  );
}

function Dot({
  cx,
  cy,
  cursor,
  onDown,
}: {
  cx: number;
  cy: number;
  cursor: string;
  onDown: (e: React.PointerEvent) => void;
}) {
  return (
    <g onPointerDown={onDown} style={{ cursor, pointerEvents: "all" }}>
      {/* große, unsichtbare Touch-Trefferfläche */}
      <rect x={cx - 13} y={cy - 13} width={26} height={26} fill="transparent" />
      <rect
        x={cx - 5.5}
        y={cy - 5.5}
        width={11}
        height={11}
        rx={2}
        fill="#fff"
        className="stroke-primary"
        strokeWidth={1.5}
      />
    </g>
  );
}

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      // Fester Name für Screenreader und die Live-Führung der Steply-Doku (Symbol-Knopf).
      aria-label={title}
      aria-pressed={active}
      className={`flex size-8 items-center justify-center rounded-md transition-colors ${
        active ? "bg-ink text-white" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
