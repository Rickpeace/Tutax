"use client";

import { useEffect, useRef, useState } from "react";
import {
  MousePointer2,
  Square,
  Circle,
  ArrowUpRight,
  EyeOff,
  Trash2,
  ZoomIn,
} from "lucide-react";
import type { Highlight } from "@/lib/types";

type Tool = "select" | "rect" | "ellipse" | "arrow" | "blur";
type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | "start" | "end";

const COLORS = ["#111827", "#d6455d", "#3d4ee6", "#0f9d72"];
const MIN = 0.01;
const ZOOM = 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function HighlightEditor({
  url,
  highlights,
  onChange,
}: {
  url: string;
  highlights: Highlight[];
  onChange: (h: Highlight[]) => void;
}) {
  const [tool, setTool] = useState<Tool>("rect");
  const [color, setColor] = useState(COLORS[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Highlight | null>(null);
  const [live, setLive] = useState<Highlight | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

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
    if (draft && drawStart.current) {
      const { x, y } = rel(e);
      setDraft({ ...draft, w: x - drawStart.current.x, h: y - drawStart.current.y });
    } else if (manip.current) {
      const { x, y } = rel(e);
      const m = manip.current;
      setLive(applyManip(m.orig, m.handle, x - m.x, y - m.y));
    }
  }

  function onCanvasUp() {
    if (draft) {
      const n = normalize(draft);
      if (Math.abs(n.w) >= MIN || Math.abs(n.h) >= MIN) {
        onChange([...highlights, n]);
        setSelectedId(n.id);
      }
      setDraft(null);
      drawStart.current = null;
    } else if (live) {
      const n = normalize(live);
      onChange(highlights.map((h) => (h.id === n.id ? n : h)));
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
    onChange(highlights.filter((h) => h.id !== selectedId));
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
    onChange(highlights.map((h) => (h.id === selectedId ? { ...h, zoom: !h.zoom } : h)));
  }

  const selected = highlights.find((h) => h.id === selectedId) ?? null;
  const rendered = highlights.map((h) => (live && h.id === live.id ? live : h));
  const shapes = draft ? [...rendered, draft] : rendered;

  return (
    <div className="space-y-2">
      {/* Werkzeugleiste */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-1.5">
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
          <ToolBtn active={tool === "blur"} onClick={() => setTool("blur")} title="Schwärzen / Blur">
            <EyeOff className="size-4" />
          </ToolBtn>
        </div>
        <div className="mx-1 h-5 w-px bg-line" />
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`size-5 rounded-full border-2 ${color === c ? "border-ink" : "border-transparent"}`}
              style={{ background: c }}
              aria-label={`Farbe ${c}`}
            />
          ))}
        </div>
        {selected && (
          <div className="ml-auto flex items-center gap-1">
            {selected.type !== "arrow" && (
              <button
                type="button"
                onClick={toggleZoom}
                title="Diesen Bereich als Lupe vergrößert zeigen"
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  selected.zoom ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <ZoomIn className="size-3.5" /> Lupe
              </button>
            )}
            <button
              type="button"
              onClick={deleteSelected}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-no hover:bg-no-soft"
            >
              <Trash2 className="size-3.5" /> Löschen
            </button>
          </div>
        )}
      </div>

      {/* Bild + Overlay */}
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-lg border border-border select-none"
        style={{ touchAction: "none", cursor: tool === "select" ? "default" : "crosshair" }}
        onPointerDown={onCanvasDown}
        onPointerMove={onCanvasMove}
        onPointerUp={onCanvasUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Screenshot" className="block w-full" draggable={false} />
        {size.w > 0 && (
          <svg width={size.w} height={size.h} className="pointer-events-none absolute inset-0">
            <defs>
              {COLORS.map((c) => (
                <marker
                  key={c}
                  id={`arrow-${c.replace("#", "")}`}
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
            {shapes.map((h) => (
              <Shape
                key={h.id}
                h={h}
                url={url}
                size={size}
                selected={selectedId === h.id && h.id !== draft?.id}
                onDown={(e) => startManip(e, h.id, null)}
                onHandle={(e, handle) => startManip(e, h.id, handle)}
              />
            ))}
          </svg>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Werkzeug wählen, dann über dem Bild ziehen. Form anklicken zum Verschieben,
        an den Punkten ziehen zum Größe-Ändern, als <b>Lupe</b> vergrößern. „Blur“
        schwärzt sensible Daten.
      </p>
    </div>
  );
}

function Shape({
  h,
  url,
  size,
  selected,
  onDown,
  onHandle,
}: {
  h: Highlight;
  url: string;
  size: { w: number; h: number };
  selected: boolean;
  onDown: (e: React.PointerEvent) => void;
  onHandle: (e: React.PointerEvent, handle: Handle) => void;
}) {
  const sw = h.strokeWidth ?? 3;
  const stroke = h.color ?? "#111827";
  const common = {
    onPointerDown: onDown,
    style: { cursor: "move", pointerEvents: "all" as const },
    stroke,
    strokeWidth: sw,
    fill: "transparent",
  };

  const px = h.x * size.w;
  const py = h.y * size.h;
  const pw = h.w * size.w;
  const ph = h.h * size.h;

  if (h.type === "arrow") {
    return (
      <g>
        <line
          {...common}
          x1={px}
          y1={py}
          x2={px + pw}
          y2={py + ph}
          markerEnd={`url(#arrow-${stroke.replace("#", "")})`}
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

  const nx = Math.min(px, px + pw);
  const ny = Math.min(py, py + ph);
  const nw = Math.abs(pw);
  const nh = Math.abs(ph);

  const lens =
    h.zoom && (h.type === "rect" || h.type === "ellipse") ? (
      <Lens id={h.id} type={h.type} url={url} nx={nx} ny={ny} nw={nw} nh={nh} rounded={!!h.rounded} size={size} />
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
    return (
      <g>
        <rect
          x={nx}
          y={ny}
          width={nw}
          height={nh}
          rx={h.rounded ? 4 : 0}
          fill="rgba(15,23,42,0.45)"
          stroke="rgba(15,23,42,0.6)"
          strokeWidth={1}
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
        stroke="#3d4ee6"
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
        stroke="#3d4ee6"
        strokeWidth={1.5}
      />
    </g>
  );
}

function Lens({
  id,
  type,
  url,
  nx,
  ny,
  nw,
  nh,
  rounded,
  size,
}: {
  id: string;
  type: "rect" | "ellipse";
  url: string;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  rounded: boolean;
  size: { w: number; h: number };
}) {
  const clipId = `lens-${id}`;
  const ccx = nx + nw / 2;
  const ccy = ny + nh / 2;
  return (
    <g style={{ pointerEvents: "none" }}>
      <clipPath id={clipId}>
        {type === "ellipse" ? (
          <ellipse cx={ccx} cy={ccy} rx={nw / 2} ry={nh / 2} />
        ) : (
          <rect x={nx} y={ny} width={nw} height={nh} rx={rounded ? 6 : 0} />
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
      className={`flex size-8 items-center justify-center rounded-md transition-colors ${
        active ? "bg-ink text-white" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
