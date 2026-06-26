"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Box = { x: number; y: number; w: number; h: number };
type Handle = "nw" | "ne" | "sw" | "se" | null;
const MINC = 0.05;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const RATIOS: { label: string; r: number | null }[] = [
  { label: "Frei", r: null },
  { label: "16:9", r: 16 / 9 },
  { label: "4:3", r: 4 / 3 },
  { label: "1:1", r: 1 },
  { label: "9:16", r: 9 / 16 },
];

export function CropDialog({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 1, h: 1 });
  const [aspect, setAspect] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const manip = useRef<{ orig: Box; handle: Handle; x: number; y: number } | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setSrc(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // relatives Breiten/Höhen-Verhältnis (Pixel-Ratio R -> relativ via Bild-Aspekt)
  const lockRel =
    aspect != null && natural.w ? (aspect * natural.h) / natural.w : null;

  // Bei Seitenverhältnis-Wahl: zentrierte Box passend einsetzen.
  useEffect(() => {
    if (lockRel == null) return;
    let w = 0.92;
    let h = w / lockRel;
    if (h > 0.92) {
      h = 0.92;
      w = h * lockRel;
    }
    setBox({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, natural.w, natural.h]);

  function rel(e: React.PointerEvent) {
    const r = imgRef.current!.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left) / r.width, 0, 1),
      y: clamp((e.clientY - r.top) / r.height, 0, 1),
    };
  }

  function apply(orig: Box, handle: Handle, dx: number, dy: number): Box {
    if (handle === null) {
      return {
        x: clamp(orig.x + dx, 0, 1 - orig.w),
        y: clamp(orig.y + dy, 0, 1 - orig.h),
        w: orig.w,
        h: orig.h,
      };
    }
    // Anker = gegenüberliegende Ecke (fix); gezogene Ecke = original + (dx,dy)
    const ax = handle.includes("e") ? orig.x : orig.x + orig.w;
    const ay = handle.includes("s") ? orig.y : orig.y + orig.h;
    const cx = clamp((handle.includes("e") ? orig.x + orig.w : orig.x) + dx, 0, 1);
    const cy = clamp((handle.includes("s") ? orig.y + orig.h : orig.y) + dy, 0, 1);

    if (lockRel == null) {
      const left = Math.min(ax, cx);
      const top = Math.min(ay, cy);
      return {
        x: left,
        y: top,
        w: Math.max(MINC, Math.abs(cx - ax)),
        h: Math.max(MINC, Math.abs(cy - ay)),
      };
    }
    // mit Seitenverhältnis: W aus dem kleineren der beiden Achsen-Auslenkungen
    const W = Math.max(MINC, Math.min(Math.abs(cx - ax), Math.abs(cy - ay) * lockRel));
    const H = W / lockRel;
    const nx = cx >= ax ? ax : ax - W;
    const ny = cy >= ay ? ay : ay - H;
    return { x: nx, y: ny, w: W, h: H };
  }

  function onDown(e: React.PointerEvent, handle: Handle) {
    e.stopPropagation();
    const { x, y } = rel(e);
    manip.current = { orig: box, handle, x, y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    if (!manip.current) return;
    const { x, y } = rel(e);
    const m = manip.current;
    setBox(apply(m.orig, m.handle, x - m.x, y - m.y));
  }
  function onUp() {
    manip.current = null;
  }

  async function confirm() {
    const img = imgRef.current;
    if (!img || !natural.w) return;
    setBusy(true);
    const sw = Math.max(1, box.w * natural.w);
    const sh = Math.max(1, box.h * natural.h);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, box.x * natural.w, box.y * natural.h, sw, sh, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      setBusy(false);
      if (!blob) return;
      const name = file.name.replace(/\.\w+$/, "") + ".png";
      onConfirm(new File([blob], name, { type: "image/png" }));
    }, "image/png");
  }

  const handles: { h: Handle; cls: string; cursor: string }[] = [
    { h: "nw", cls: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "nwse-resize" },
    { h: "ne", cls: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "nesw-resize" },
    { h: "sw", cls: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "nesw-resize" },
    { h: "se", cls: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", cursor: "nwse-resize" },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/80 p-4">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <div className="mb-2 text-center text-sm font-semibold text-white">
          Bereich zuschneiden
        </div>

        {/* Seitenverhältnis */}
        <div className="mb-3 flex flex-wrap justify-center gap-1.5">
          {RATIOS.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setAspect(r.r)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                aspect === r.r ? "bg-white text-ink" : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 items-center justify-center overflow-hidden">
          {src && (
            <div
              className="relative max-h-full select-none"
              style={{ touchAction: "none" }}
              onPointerMove={onMove}
              onPointerUp={onUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={src}
                alt="Zuschneiden"
                draggable={false}
                className="block max-h-[68vh] w-auto max-w-full"
                onLoad={(e) =>
                  setNatural({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  })
                }
              />
              <div
                className="absolute border-2 border-white"
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.w * 100}%`,
                  height: `${box.h * 100}%`,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
                  cursor: "move",
                  touchAction: "none",
                }}
                onPointerDown={(e) => onDown(e, null)}
              >
                {handles.map((hd) => (
                  <div
                    key={hd.h}
                    className={`absolute ${hd.cls} flex size-7 items-center justify-center`}
                    style={{ cursor: hd.cursor, touchAction: "none" }}
                    onPointerDown={(e) => onDown(e, hd.h)}
                  >
                    <span className="size-3.5 rounded-full border-2 border-primary bg-white" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={onCancel} disabled={busy} className="bg-white">
            <X className="size-4" /> Abbrechen
          </Button>
          <button
            type="button"
            onClick={() => {
              setAspect(null);
              setBox({ x: 0, y: 0, w: 1, h: 1 });
            }}
            className="text-sm font-medium text-white/80 hover:text-white"
          >
            Ganzes Bild
          </button>
          <Button onClick={confirm} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{" "}
            Übernehmen
          </Button>
        </div>
      </div>
    </div>
  );
}
