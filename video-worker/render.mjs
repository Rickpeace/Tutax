// Video-Export (Welle 18): Tutorial -> MP4 in zwei Stilen (classic | screencast).
//
// Umkehrung der create-Pipeline: Aus einem veröffentlichten Tutorial (Screenshots +
// Markierungs-Koordinaten + TTS-Audios + Brand-Theme) wird ein 1080p-MP4.
//
// Dieses Modul enthält BEWUSST reine, testbare Bausteine (Stil von structure.mjs) —
// KEIN src/-Import, kein DB-/OpenAI-Client hier drin. Die Orchestrierung (renderVideo)
// bekommt einen fertigen Kontext (Steps/Branches/Theme/Audio-Dateien) hereingereicht.
//
// Bausteine:
//   1) buildSegmentPlan(ctx)        -> lineare Segment-/Kapitel-Liste (DFS über Branches)
//   2) escapeDrawtext(text)         -> Text für ffmpeg drawtext maskieren (Umlaute/Doppelpunkt)
//   3) buildSegmentFilter(...)      -> ffmpeg-Filtergraph je Segment (zoompan/clip + Overlays)
//   4) resolveBrand(themeRow)       -> Brand-Farben/Logo aus der themes-Zeile (Fallback Indigo)
//   5) introCardSvg/outroCardSvg/…  -> SVG-Karten (via sharp zu PNG gerendert vom Aufrufer)
//   6) renderVideo(deps, ctx, opts) -> orchestriert den kompletten Render (ffmpeg + sharp)

import fs from "node:fs";
import path from "node:path";

// ---- Konstanten (bewusst hier dupliziert, damit der Worker keine src/-Imports braucht) ----
export const FALLBACK_BRAND = {
  // Steply-Indigo (siehe src/app/globals.css :root / OVERVIEW.md §3).
  primary: "#3d4ee6",
  surface: "#f6f7fe",
  background: "#ffffff",
  text: "#101524",
  accentFg: "#ffffff",
};
const YES_COLOR = "#0f9d72"; // --yes (Ja-Ast)
const NO_COLOR = "#d6455d"; // --no (Nein-Ast)
export const HIGHLIGHT_COLOR = "#3d4ee6";

// Video-Format (9:16 + Musikbett kommen als Folgewelle — Format als Parameter vorbereitet).
export const FORMATS = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
};

// Timings (Sekunden).
export const INTRO_SEC = 2.5;
export const OUTRO_SEC = 4.0;
export const CHAPTER_CARD_SEC = 1.5; // Kapitel-Karte je Ast ("Fall: {Label}")
export const BREATH_SEC = 0.8; // Atempause nach Schritt-Audio
export const SILENT_STEP_SEC = 4.0; // Schritt ohne Audio
export const XFADE_SEC = 0.4; // Übergang zwischen Segmenten
export const SCREENCAST_PRE_SEC = 1.5; // Clip beginnt so viel vor video_time

// ============================================================
// 1) SEGMENTPLAN: flache (steps + step_branches) -> lineare Render-Reihenfolge
//    per DFS (gleiche Semantik wie src/lib/builder/tree.ts, hier LESEND nachgebaut).
//    Verzweigungen: Frage-Schritt normal, dann pro Ast eine Kapitel-Karte
//    ("Fall: {Label}") + die Ast-Schritte, Rejoin-Teil EINMAL am Ende.
// ============================================================

/**
 * @typedef {Object} PlanSegment
 * @property {"intro"|"step"|"chapter"|"outro"} type
 * @property {string} [stepId]        - bei type=step
 * @property {number} [duration]      - Sekunden (bei step aus Audio bestimmt, sonst fix)
 * @property {string} title           - Anzeige-Titel (Lower-Third / Karte)
 * @property {string} [caption]       - gesprochener Text (eingebrannte Untertitel)
 * @property {string|null} [color]    - Kapitel-Karten-Akzent (Ast-Farbe) / null
 * @property {number} [chapterMark]   - true, wenn dieser Schritt eine Kapitelmarke setzt
 */

/**
 * Baut die lineare Segmentfolge (DFS) aus Steps + Branches.
 * Rein: keine Seiteneffekte. `stepDuration(step)` liefert die Schritt-Dauer.
 *
 * @param {Object} ctx
 * @param {Array} ctx.steps    - [{id, title, is_decision, position, caption?, ...}]
 * @param {Array} ctx.branches - [{step_id, label, color, target_step_id, position}]
 * @param {string|null} ctx.rootStepId
 * @param {(step:any)=>number} stepDuration
 * @returns {PlanSegment[]}
 */
export function buildSegmentPlan(ctx, stepDuration) {
  const steps = ctx.steps ?? [];
  const branches = ctx.branches ?? [];
  if (!steps.length) return [];

  const stepById = new Map(steps.map((s) => [s.id, s]));
  const branchesByStep = new Map();
  for (const b of branches) {
    const list = branchesByStep.get(b.step_id) ?? [];
    list.push(b);
    branchesByStep.set(b.step_id, list);
  }
  for (const list of branchesByStep.values()) list.sort((a, b) => a.position - b.position);

  // Wurzel: explizit -> Eingangsgrad 0 -> erster nach position (wie tree.ts).
  const targeted = new Set(branches.map((b) => b.target_step_id).filter(Boolean));
  const root =
    (ctx.rootStepId && stepById.has(ctx.rootStepId) && ctx.rootStepId) ||
    [...steps].filter((s) => !targeted.has(s.id)).sort((a, b) => a.position - b.position)[0]?.id ||
    [...steps].sort((a, b) => a.position - b.position)[0].id;

  const forwardTargets = (id) =>
    (branchesByStep.get(id) ?? []).map((b) => b.target_step_id).filter(Boolean);

  // Vorwärts erreichbare Knoten ab start (zyklensicher) — für den Join-Punkt.
  const reachable = (start) => {
    const seen = new Set();
    const stack = [start];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const t of forwardTargets(id)) stack.push(t);
    }
    return seen;
  };

  // Join-Punkt einer Entscheidung: frühester gemeinsamer Knoten aller Äste (wie tree.ts).
  const joinPoint = (decisionId) => {
    const targets = [...new Set(forwardTargets(decisionId))];
    if (targets.length < 2) return null;
    const sets = targets.map(reachable);
    let common = [...sets[0]];
    for (let i = 1; i < sets.length; i++) common = common.filter((id) => sets[i].has(id));
    common = common.filter((id) => id !== decisionId);
    if (!common.length) return null;
    const posOf = (id) => stepById.get(id)?.position ?? Infinity;
    common.sort(
      (a, b) =>
        reachable(b).size - reachable(a).size ||
        posOf(a) - posOf(b) ||
        (a < b ? -1 : a > b ? 1 : 0),
    );
    return common[0];
  };

  const out = [];
  const placed = new Set();

  // stepSegment: ein Schritt -> Segment (Dauer aus Audio/Fallback), mit Kapitelmarke.
  const pushStep = (step) => {
    out.push({
      type: "step",
      stepId: step.id,
      duration: Math.max(0.5, stepDuration(step)),
      title: (step.title || "Schritt").trim(),
      caption: (step.caption || "").trim(),
      chapterMark: true,
    });
  };

  // Rekursiver Walk. stopAt = Knoten, an dem dieser Zweig endet (Join wird außerhalb gerendert).
  const walk = (id, onPath, stopAt) => {
    let cur = id;
    // Iterativ die lineare Kette entlang, um tiefe Rekursion zu vermeiden.
    while (cur) {
      if (stopAt && cur === stopAt) return;
      if (placed.has(cur) || onPath.has(cur)) return; // Zyklus-/Merge-Schutz
      const step = stepById.get(cur);
      if (!step) return;
      placed.add(cur);
      onPath.add(cur);
      const bs = branchesByStep.get(cur) ?? [];

      if (!step.is_decision) {
        pushStep(step);
        cur = bs[0]?.target_step_id ?? null;
        continue;
      }

      // Entscheidungs-Schritt: erst die Frage selbst als Schritt rendern.
      pushStep(step);
      const join = joinPoint(cur);
      const childStop = join ?? stopAt;
      for (const b of bs) {
        if (!b.target_step_id) continue;
        // Kapitel-Karte je Ast ("Fall: {Label}").
        const label = (b.label || "").trim() || "Weiter";
        out.push({
          type: "chapter",
          title: `Fall: ${label}`,
          color: b.color || labelColor(label),
        });
        walk(b.target_step_id, new Set(onPath), childStop);
      }
      // Rejoin-Teil EINMAL am Ende der Verzweigung.
      if (join && join !== stopAt) walk(join, onPath, stopAt);
      return;
    }
  };

  walk(root, new Set(), null);
  return out;
}

/** Ast-Farbe aus dem Label ableiten (Ja=grün, Nein=rosé, sonst null). */
function labelColor(label) {
  const l = label.trim().toLowerCase();
  return l === "ja" ? YES_COLOR : l === "nein" ? NO_COLOR : null;
}

// ============================================================
// 2) Kapitelmarken (YouTube-Format "M:SS Titel") + Gesamt-Zeitleiste
// ============================================================

/**
 * Aus dem Segmentplan die Kapitelmarken-Textliste + die Segment-Startzeiten berechnen.
 * Übergänge (xfade) überlappen die Segmente um XFADE_SEC -> Startzeit berücksichtigt das.
 *
 * @param {PlanSegment[]} plan
 * @param {number} xfade - Überlappung je Übergang
 * @returns {{ chaptersText:string, starts:number[], total:number }}
 */
export function computeChapters(plan, xfade = XFADE_SEC) {
  const starts = [];
  let t = 0;
  const lines = [];
  for (let i = 0; i < plan.length; i++) {
    const seg = plan[i];
    starts.push(t);
    // Kapitelmarke für Intro, jeden Schritt und die Kapitel-Karten.
    if (seg.type === "intro") lines.push({ t, label: "Intro" });
    else if (seg.type === "step" && seg.chapterMark) lines.push({ t, label: seg.title });
    else if (seg.type === "chapter") lines.push({ t, label: seg.title });
    else if (seg.type === "outro") lines.push({ t, label: "Abschluss" });
    // nächster Start: aktuelle Dauer minus Übergangs-Überlappung (nicht beim letzten).
    const dur = seg.duration ?? 0;
    t += dur - (i < plan.length - 1 ? xfade : 0);
  }
  const chaptersText = lines.map((l) => `${fmtTime(l.t)} ${l.label}`).join("\n");
  return { chaptersText, starts, total: t };
}

/** Sekunden -> "M:SS" (YouTube-Kapitelmarken). */
export function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// ============================================================
// 3) ffmpeg drawtext-Maskierung (deutsche Umlaute + Doppelpunkte in Titeln!)
// ============================================================

/**
 * Maskiert Text für ffmpeg drawtext (text='…'). Kritisch: Backslash, Doppelpunkt,
 * einfache Anführungszeichen, Prozent. Zeilenumbrüche werden zu Zeilenumbruch-Escapes.
 * Umlaute (äöüß) bleiben unangetastet (UTF-8; libfreetype rendert sie mit DejaVuSans).
 */
export function escapeDrawtext(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "’") // echtes Apostroph statt Quote-Bruch im drawtext
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Langen Text auf `maxLine` Zeichen je Zeile hart umbrechen (max `maxLines` Zeilen,
 * dann mit … kürzen). Für eingebrannte Untertitel (gesprochener Text).
 */
export function wrapCaption(text, maxLine = 52, maxLines = 2) {
  const words = String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return "";
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxLine) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  let result = lines.slice(0, maxLines);
  // War der Text länger als maxLines -> letzte Zeile mit … abschließen.
  const consumed = result.join(" ").split(" ").length;
  if (consumed < words.length) {
    const last = result[result.length - 1];
    result[result.length - 1] = (last.length > maxLine - 1 ? last.slice(0, maxLine - 1) : last) + "…";
  }
  return result.join("\n");
}

// ============================================================
// 4) Brand-Farben aus der themes-Zeile lesen (resolveTheme-Logik nachgebaut,
//    OHNE src/-Import). Fallback Indigo.
// ============================================================

/**
 * Liest die aktiven Brand-Tokens direkt aus einer themes-Zeile (kein src/-Import).
 * Entspricht der resolveTheme-Logik: mode 'ai' -> ai_tokens, 'extreme' -> extreme_tokens,
 * sonst tokens. Fehlt etwas, Fallback auf Indigo.
 *
 * @param {Object|null} themeRow
 * @returns {{ primary:string, surface:string, background:string, text:string, accentFg:string, logoPath:string|null }}
 */
export function resolveBrand(themeRow) {
  const mode = themeRow?.mode === "extreme" ? "extreme" : themeRow?.mode === "ai" ? "ai" : "manual";
  const tokens =
    mode === "extreme"
      ? (themeRow?.extreme_tokens ?? themeRow?.ai_tokens ?? themeRow?.tokens)
      : mode === "ai"
        ? (themeRow?.ai_tokens ?? themeRow?.tokens)
        : themeRow?.tokens;
  const logoPath =
    mode === "extreme"
      ? (themeRow?.extreme_logo_path ?? themeRow?.ai_logo_path ?? themeRow?.logo_path)
      : mode === "ai"
        ? (themeRow?.ai_logo_path ?? themeRow?.logo_path)
        : themeRow?.logo_path;

  const c = (tokens && typeof tokens === "object" ? tokens.colors : null) ?? {};
  const primary = validHex(c.primary) ?? FALLBACK_BRAND.primary;
  const surface = validHex(c.surface) ?? FALLBACK_BRAND.surface;
  const background = validHex(c.background) ?? FALLBACK_BRAND.background;
  const text = validHex(c.text) ?? FALLBACK_BRAND.text;
  // Kontrast auf der Akzentfarbe (helle Akzente -> dunkle Schrift).
  const lum = luminance(primary);
  const accentFg = lum != null && lum > 0.55 ? "#101524" : "#ffffff";
  return { primary, surface, background, text, accentFg, logoPath: logoPath ?? null };
}

function validHex(v) {
  if (typeof v !== "string") return null;
  const h = v.trim();
  return /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(h) ? h : null;
}

function luminance(hex) {
  const h = hex.replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// ============================================================
// 5) SVG-Karten + Overlays (Aufrufer rendert per sharp -> PNG).
//    Deutsche Umlaute in SVG sind ok (UTF-8). SVG-Text muss XML-maskiert werden.
// ============================================================

const xmlEsc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

/** Text auf ~maxLine Zeichen für SVG-Zeilen umbrechen (mehrzeilige Titel). */
function svgWrap(text, maxLine) {
  const words = String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxLine) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/**
 * Intro-Karte: Brand-Hintergrund, optional Logo, Tutorial-Titel.
 * `logoDataUri` optional (data:image/...;base64,…) — der Aufrufer lädt das Logo.
 */
export function introCardSvg(brand, title, size, logoDataUri = null) {
  const { w, h } = size;
  const lines = svgWrap(title, w > h ? 26 : 18);
  const titleSize = w > h ? 76 : 64;
  const lineH = titleSize * 1.2;
  const logoH = Math.round(h * 0.14);
  const hasLogo = !!logoDataUri;
  const blockH = lines.length * lineH + (hasLogo ? logoH + 48 : 0);
  let y = h / 2 - blockH / 2;
  const parts = [];
  parts.push(`<rect width="${w}" height="${h}" fill="${brand.background}"/>`);
  // Dezenter Akzent-Balken oben.
  parts.push(`<rect x="0" y="0" width="${w}" height="${Math.round(h * 0.012)}" fill="${brand.primary}"/>`);
  if (hasLogo) {
    const logoW = Math.round(w * 0.5);
    parts.push(`<image x="${(w - logoW) / 2}" y="${y}" width="${logoW}" height="${logoH}" href="${logoDataUri}" preserveAspectRatio="xMidYMid meet"/>`);
    y += logoH + 48;
  }
  const textStart = y + titleSize;
  lines.forEach((ln, i) => {
    parts.push(
      `<text x="${w / 2}" y="${textStart + i * lineH}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${titleSize}" font-weight="700" fill="${brand.text}" text-anchor="middle">${xmlEsc(ln)}</text>`,
    );
  });
  return svgDoc(w, h, parts.join(""));
}

/**
 * Outro-Karte: "Interaktiv durchklicken:" + Hilfe-Seiten-URL + QR-Code.
 * `qrDataUri` = data-URI des QR-PNGs (der Aufrufer erzeugt ihn via qrcode).
 */
export function outroCardSvg(brand, url, size, qrDataUri = null) {
  const { w, h } = size;
  const qr = Math.round(Math.min(w, h) * 0.34);
  const parts = [];
  parts.push(`<rect width="${w}" height="${h}" fill="${brand.primary}"/>`);
  const cy = h / 2;
  const headSize = w > h ? 64 : 52;
  parts.push(
    `<text x="${w / 2}" y="${cy - qr / 2 - 60}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${headSize}" font-weight="700" fill="${brand.accentFg}" text-anchor="middle">Interaktiv durchklicken:</text>`,
  );
  if (qrDataUri) {
    const qx = (w - qr) / 2;
    const qy = cy - qr / 2 + 10;
    // Weißer Rahmen hinter dem QR (Kontrast auf Akzent-Hintergrund).
    parts.push(`<rect x="${qx - 20}" y="${qy - 20}" width="${qr + 40}" height="${qr + 40}" rx="24" fill="#ffffff"/>`);
    parts.push(`<image x="${qx}" y="${qy}" width="${qr}" height="${qr}" href="${qrDataUri}"/>`);
  }
  const urlSize = Math.round(headSize * 0.5);
  parts.push(
    `<text x="${w / 2}" y="${cy + qr / 2 + 70}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${urlSize}" font-weight="500" fill="${brand.accentFg}" text-anchor="middle" opacity="0.92">${xmlEsc(url)}</text>`,
  );
  return svgDoc(w, h, parts.join(""));
}

/** Kapitel-Karte je Ast ("Fall: {Label}", Brand-Stil). */
export function chapterCardSvg(brand, title, color, size) {
  const { w, h } = size;
  const accent = validHex(color) ?? brand.primary;
  const lines = svgWrap(title, w > h ? 22 : 16);
  const titleSize = w > h ? 68 : 56;
  const lineH = titleSize * 1.2;
  const parts = [];
  parts.push(`<rect width="${w}" height="${h}" fill="${brand.background}"/>`);
  // Farbiger Ast-Balken links.
  parts.push(`<rect x="0" y="0" width="${Math.round(w * 0.02)}" height="${h}" fill="${accent}"/>`);
  const start = h / 2 - ((lines.length - 1) * lineH) / 2 + titleSize / 3;
  lines.forEach((ln, i) => {
    parts.push(
      `<text x="${w / 2}" y="${start + i * lineH}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${titleSize}" font-weight="700" fill="${accent}" text-anchor="middle">${xmlEsc(ln)}</text>`,
    );
  });
  return svgDoc(w, h, parts.join(""));
}

/**
 * Markierungs-Overlay (transparentes PNG in Videogröße): abgerundetes Rechteck um
 * die Highlight-Box (normalisiert 0..1). `pulse` (0..1) skaliert die Rahmenstärke +
 * Glow leicht -> zwei Varianten im Wechsel ergeben einen dezenten Puls.
 */
export function highlightOverlaySvg(highlight, size, pulse = 0, color = HIGHLIGHT_COLOR) {
  const { w, h } = size;
  if (!highlight) return svgDoc(w, h, "");
  const x = clamp01(highlight.x) * w;
  const y = clamp01(highlight.y) * h;
  const bw = clamp01(highlight.w) * w;
  const bh = clamp01(highlight.h) * h;
  const accent = validHex(color) ?? HIGHLIGHT_COLOR;
  const stroke = 6 + pulse * 4; // 6..10px
  const glow = 10 + pulse * 14;
  const pad = glow + stroke;
  const rx = 14;
  const parts = [];
  parts.push(
    `<defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${glow / 2}"/></filter></defs>`,
  );
  // Glow-Kopie hinter dem Rahmen.
  parts.push(
    `<rect x="${x - pad}" y="${y - pad}" width="${bw + pad * 2}" height="${bh + pad * 2}" rx="${rx + pad}" fill="none" stroke="${accent}" stroke-width="${stroke}" opacity="${0.35 + pulse * 0.25}" filter="url(#g)"/>`,
  );
  parts.push(
    `<rect x="${x - stroke / 2}" y="${y - stroke / 2}" width="${bw + stroke}" height="${bh + stroke}" rx="${rx}" fill="none" stroke="${accent}" stroke-width="${stroke}"/>`,
  );
  return svgDoc(w, h, parts.join(""));
}

/**
 * Cursor-Frame (transparentes PNG): Zeiger an Position (px,py in 0..1) + optionaler
 * Klick-Ripple (ripple 0..1 -> wachsender, verblassender Kreis). Für die
 * screencast-Cursor-Animation (Frame-Sequenz via sharp).
 */
export function cursorFrameSvg(px, py, size, ripple = -1) {
  const { w, h } = size;
  const x = clamp01(px) * w;
  const y = clamp01(py) * h;
  const s = Math.round(Math.min(w, h) * 0.035); // Zeigergröße
  const parts = [];
  if (ripple >= 0) {
    const r = s * (0.6 + ripple * 2.4);
    const op = Math.max(0, 0.5 * (1 - ripple));
    parts.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${HIGHLIGHT_COLOR}" stroke-width="4" opacity="${op}"/>`);
  }
  // Einfacher Pfeil-Cursor (weiß mit dunklem Rand), Spitze auf (x,y).
  const p = (dx, dy) => `${x + dx},${y + dy}`;
  parts.push(
    `<polygon points="${p(0, 0)} ${p(0, s)} ${p(s * 0.28, s * 0.72)} ${p(s * 0.46, s * 1.06)} ${p(s * 0.62, s * 0.98)} ${p(s * 0.42, s * 0.64)} ${p(s * 0.72, s * 0.6)}" fill="#ffffff" stroke="#101524" stroke-width="2.5" stroke-linejoin="round"/>`,
  );
  return svgDoc(w, h, parts.join(""));
}

const clamp01 = (n) => Math.min(Math.max(Number(n) || 0, 0), 1);

function svgDoc(w, h, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
}

// ============================================================
// 6) ffmpeg-Kommandobau je Segment (reine String-Erzeugung, testbar).
// ============================================================

/**
 * Zoompan-Ziel: langsamer Ken-Burns-Zoom, dessen ZENTRUM auf das Zentrum der ersten
 * Markierung zielt (normalisiert 0..1). Ohne Markierung -> Bildmitte.
 * Gibt den zoompan-Filterstring zurück (für 1:1 fps, d=frames).
 */
export function kenBurnsFilter(highlight, size, frames, fps) {
  const { w, h } = size;
  // Zielzentrum in 0..1 (Markierungs-Mitte oder Bildmitte).
  const cx = highlight ? clamp01(highlight.x + highlight.w / 2) : 0.5;
  const cy = highlight ? clamp01(highlight.y + highlight.h / 2) : 0.5;
  const d = Math.max(1, Math.round(frames));
  // Zoom von 1.0 -> 1.18 linear über die Dauer.
  const zExpr = `min(1.0+0.18*on/${d},1.18)`;
  // x/y so, dass (cx,cy) im sichtbaren Ausschnitt bleibt: iw/2*cx ... (zoompan nutzt iw/ih der Quelle).
  const xExpr = `iw*${cx.toFixed(4)}-(iw/zoom/2)`;
  const yExpr = `ih*${cy.toFixed(4)}-(ih/zoom/2)`;
  // zoompan arbeitet auf upgescaltem Input für ruhigen Zoom; s=Zielgröße, fps setzen.
  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${d}:s=${w}x${h}:fps=${fps}`;
}

/**
 * drawtext-Filter für Lower-Third (Titel-Bauchbinde) + eingebrannte Untertitel.
 * Gibt ein Array von Filterstrings zurück (Box + zwei drawtext).
 *
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.caption   - bereits umgebrochener Text (mit \n)
 * @param {string} opts.fontFile  - Pfad zu DejaVuSans.ttf
 * @param {string} opts.fontBold  - Pfad zu DejaVuSans-Bold.ttf
 * @param {Object} opts.brand
 * @param {{w:number,h:number}} opts.size
 */
export function lowerThirdFilters({ title, caption, fontFile, fontBold, brand, size }) {
  const { w, h } = size;
  const filters = [];
  const titleFs = Math.round(h * 0.038);
  const capFs = Math.round(h * 0.030);
  const boxH = Math.round(h * 0.20);
  const boxY = h - boxH;
  // Halbtransparente Brand-Bauchbinde unten.
  filters.push(
    `drawbox=x=0:y=${boxY}:w=${w}:h=${boxH}:color=${hexToFfmpeg(brand.primary)}@0.82:t=fill`,
  );
  const margin = Math.round(w * 0.04);
  if (title) {
    filters.push(
      `drawtext=fontfile='${ffPath(fontBold)}':text='${escapeDrawtext(title)}':x=${margin}:y=${boxY + Math.round(boxH * 0.16)}:fontsize=${titleFs}:fontcolor=${hexToFfmpeg(brand.accentFg)}:box=0`,
    );
  }
  if (caption) {
    filters.push(
      `drawtext=fontfile='${ffPath(fontFile)}':text='${escapeDrawtext(caption)}':x=${margin}:y=${boxY + Math.round(boxH * 0.16) + titleFs + Math.round(h * 0.02)}:fontsize=${capFs}:fontcolor=${hexToFfmpeg(brand.accentFg)}@0.95:line_spacing=8:box=0`,
    );
  }
  return filters;
}

/** #rrggbb -> 0xRRGGBB für ffmpeg color=. */
function hexToFfmpeg(hex) {
  const h = validHex(hex) ?? "#3d4ee6";
  let x = h.replace(/^#/, "");
  if (x.length === 3) x = x.split("").map((c) => c + c).join("");
  return `0x${x.toUpperCase()}`;
}

/** Windows-Pfade für ffmpeg-Filter maskieren (Backslash + Doppelpunkt nach Laufwerk). */
function ffPath(p) {
  return String(p).replace(/\\/g, "/").replace(/:/g, "\\:");
}

export { ffPath, hexToFfmpeg, validHex, luminance };

// ============================================================
// 7) ORCHESTRIERUNG: renderVideo — baut das komplette MP4.
//    deps = { runFfmpeg, ffprobeDuration, sharp, qrcode, log } (echte im index.mjs).
//    ctx  = { tutorial, steps, branches, rootStepId, theme, appUrl, accountSlug,
//             files: { audioByStep:{stepId->path}, imageByStep:{stepId->path},
//                      logoPath|null, sourceVideoPath|null, clicks:[] } }
//    opts = { dir, format:"16:9"|"9:16", style:"classic"|"screencast", fontFile, fontBold,
//             fps=30, onProgress? }
//    Rückgabe: { outFile, chaptersText, plan }
// ============================================================

/**
 * Schritt-Dauer = Audio-Dauer + Atempause, oder SILENT_STEP_SEC ohne Audio.
 * Braucht die (bereits ermittelten) Audio-Dauern (audioDurByStep).
 */
export function stepDurationFn(audioDurByStep) {
  return (step) => {
    const d = audioDurByStep?.[step.id];
    return d && isFinite(d) && d > 0 ? d + BREATH_SEC : SILENT_STEP_SEC;
  };
}

/**
 * Baut die vollständige Segmentliste inkl. Intro/Outro (mit fixen Dauern).
 */
export function fullPlan(ctx, audioDurByStep) {
  const inner = buildSegmentPlan(
    { steps: ctx.steps, branches: ctx.branches, rootStepId: ctx.rootStepId },
    stepDurationFn(audioDurByStep),
  );
  const plan = [
    { type: "intro", duration: INTRO_SEC, title: ctx.tutorial?.title || "Anleitung" },
    ...inner.map((s) => (s.type === "chapter" ? { ...s, duration: CHAPTER_CARD_SEC } : s)),
    { type: "outro", duration: OUTRO_SEC, title: "Abschluss" },
  ];
  return plan;
}

/**
 * Orchestriert den Render. Reine I/O passiert über deps — dadurch testbar.
 */
export async function renderVideo(deps, ctx, opts) {
  const log = deps.log || (() => {});
  const dir = opts.dir;
  const format = FORMATS[opts.format] ? opts.format : "16:9";
  const size = FORMATS[format];
  const fps = opts.fps || 30;
  const style = opts.style === "screencast" ? "screencast" : "classic";

  // 1) Audio-Dauern ermitteln (aus den lokal vorliegenden MP3s).
  const audioDurByStep = {};
  for (const s of ctx.steps) {
    const ap = ctx.files.audioByStep?.[s.id];
    if (ap && fs.existsSync(ap)) {
      try { audioDurByStep[s.id] = await deps.ffprobeDuration(ap); } catch { /* stumm */ }
    }
  }

  const plan = fullPlan(ctx, audioDurByStep);
  const { chaptersText } = computeChapters(plan, XFADE_SEC);

  // 2) Logo + QR vorbereiten (sharp/qrcode).
  const brand = resolveBrand(ctx.theme);
  let logoDataUri = null;
  if (ctx.files.logoPath && fs.existsSync(ctx.files.logoPath)) {
    try {
      const png = await deps.sharp(ctx.files.logoPath).png().toBuffer();
      logoDataUri = `data:image/png;base64,${png.toString("base64")}`;
    } catch (e) { log("Logo konnte nicht geladen werden: " + (e?.message || e)); }
  }
  // Outro-URL = {appUrl}/h/{account_slug}/{tutorial_slug}.
  const helpUrl = `${ctx.appUrl}/h/${ctx.accountSlug}/${ctx.tutorial.slug}`;
  let qrDataUri = null;
  try {
    const qrPng = await deps.qrcode.toBuffer(helpUrl, { type: "png", margin: 1, width: 600, errorCorrectionLevel: "M" });
    qrDataUri = `data:image/png;base64,${qrPng.toString("base64")}`;
  } catch (e) { log("QR-Code-Erzeugung fehlgeschlagen: " + (e?.message || e)); }

  // 3) Jedes Segment zu einem eigenen MP4 rendern.
  const segFiles = [];
  const stepIndexOf = new Map(ctx.steps.map((s, i) => [s.id, i]));
  let stepCounter = 0;
  const totalSteps = plan.filter((p) => p.type === "step").length;

  for (let i = 0; i < plan.length; i++) {
    const seg = plan[i];
    const segOut = path.join(dir, `seg_${String(i).padStart(3, "0")}.mp4`);
    if (seg.type === "step") {
      stepCounter++;
      if (opts.onProgress) await opts.onProgress(`Rendert Schritt ${stepCounter}/${totalSteps}`);
    }
    await renderSegment(deps, { seg, size, fps, brand, style, ctx, opts, logoDataUri, qrDataUri, helpUrl, audioDurByStep, stepIndexOf }, segOut);
    segFiles.push(segOut);
  }

  // 4) Segmente mit xfade + acrossfade verketten.
  const outFile = path.join(dir, "render.mp4");
  await concatWithXfade(deps, segFiles, plan, XFADE_SEC, size, fps, outFile);

  return { outFile, chaptersText, plan };
}

/** Ein einzelnes Segment -> MP4 (mit Audiospur, auf Segmentdauer gepolstert). */
async function renderSegment(deps, s, segOut) {
  const { seg, size, fps, brand, style, ctx, opts, logoDataUri, qrDataUri, helpUrl } = s;
  const { w, h } = size;
  const dur = Math.max(0.5, seg.duration ?? SILENT_STEP_SEC);

  // Karten-Segmente (intro/chapter/outro): SVG -> PNG -> Standbild-Video.
  if (seg.type === "intro" || seg.type === "chapter" || seg.type === "outro") {
    const svg =
      seg.type === "intro"
        ? introCardSvg(brand, seg.title, size, logoDataUri)
        : seg.type === "outro"
          ? outroCardSvg(brand, helpUrl, size, qrDataUri)
          : chapterCardSvg(brand, seg.title, seg.color, size);
    const png = path.join(opts.dir, `card_${path.basename(segOut, ".mp4")}.png`);
    await deps.sharp(Buffer.from(svg)).png().toFile(png);
    await deps.runFfmpeg([
      "-y", "-loop", "1", "-i", png,
      "-f", "lavfi", "-t", String(dur), "-i", "anullsrc=r=48000:cl=stereo",
      "-t", String(dur), "-r", String(fps),
      "-vf", `scale=${w}:${h},format=yuv420p`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-ar", "48000", "-shortest", segOut,
    ]);
    return;
  }

  // Schritt-Segment.
  const step = ctx.steps.find((x) => x.id === seg.stepId);
  const highlight = firstHighlight(step);
  const audioPath = ctx.files.audioByStep?.[step.id] || null;
  const caption = wrapCaption(seg.caption, w > h ? 52 : 34, 2);
  const lower = lowerThirdFilters({ title: seg.title, caption, fontFile: opts.fontFile, fontBold: opts.fontBold, brand, size });

  // Screencast: echter Clip aus dem Quellvideo, sofern video_time gesetzt + Quelle da.
  const canScreencast =
    style === "screencast" &&
    step.video_time != null &&
    ctx.files.sourceVideoPath &&
    fs.existsSync(ctx.files.sourceVideoPath);

  if (canScreencast) {
    await renderScreencastStep(deps, { step, seg, size, fps, brand, dur, highlight, caption, lower, audioPath, ctx, opts }, segOut);
    return;
  }

  // Classic: Ken-Burns aus dem Schritt-Screenshot + animiertes Highlight-Overlay.
  await renderClassicStep(deps, { step, seg, size, fps, brand, dur, highlight, lower, audioPath, ctx, opts }, segOut);
}

/** Classic-Schritt: Ken-Burns + Puls-Highlight + Lower-Third + Audio. */
async function renderClassicStep(deps, s, segOut) {
  const { step, size, fps, dur, highlight, lower, audioPath, ctx, opts } = s;
  const { w, h } = size;
  const img = ctx.files.imageByStep?.[step.id];
  const frames = Math.round(dur * fps);

  // Highlight-Overlay: zwei Puls-Varianten (0 und 1) -> Wechsel-Loop = dezenter Puls.
  let overlayInputs = [];
  let overlayChain = "";
  if (highlight) {
    const p0 = path.join(opts.dir, `hl0_${path.basename(segOut, ".mp4")}.png`);
    const p1 = path.join(opts.dir, `hl1_${path.basename(segOut, ".mp4")}.png`);
    await deps.sharp(Buffer.from(highlightOverlaySvg(highlight, size, 0))).png().toFile(p0);
    await deps.sharp(Buffer.from(highlightOverlaySvg(highlight, size, 1))).png().toFile(p1);
    overlayInputs = ["-i", p0, "-i", p1];
  }

  const args = ["-y"];
  if (img && fs.existsSync(img)) args.push("-loop", "1", "-i", img);
  else args.push("-f", "lavfi", "-i", `color=c=${hexToFfmpeg(ctx.theme ? resolveBrand(ctx.theme).surface : "#f6f7fe")}:s=${w}x${h}`);
  args.push(...overlayInputs);
  if (audioPath && fs.existsSync(audioPath)) args.push("-i", audioPath);
  else args.push("-f", "lavfi", "-t", String(dur), "-i", "anullsrc=r=48000:cl=stereo");

  // Filtergraph: [0] Ken-Burns -> base; Highlight-Puls overlay; Lower-Third drawtext.
  const kb = kenBurnsFilter(highlight, size, frames, fps);
  const chain = [];
  chain.push(`[0:v]${kb},format=rgba[base]`);
  let last = "base";
  if (highlight) {
    // Puls: overlay p0 dauerhaft, p1 mit sinus-getakteter Sichtbarkeit (enable). Einfach:
    // zwei Overlays, das zweite alle ~0.9s ein/aus -> Alpha-Puls-Eindruck.
    chain.push(`[1:v]scale=${w}:${h}[hl0]`);
    chain.push(`[2:v]scale=${w}:${h}[hl1]`);
    chain.push(`[${last}][hl0]overlay=0:0[o0]`);
    // p1 nur in der zweiten Hälfte jeder Sekunde sichtbar -> Puls.
    chain.push(`[o0][hl1]overlay=0:0:enable='lt(mod(t,1),0.5)'[o1]`);
    last = "o1";
  }
  // Lower-Third + Untertitel.
  const ltChain = lower.join(",");
  chain.push(`[${last}]${ltChain},format=yuv420p[v]`);
  overlayChain = chain.join(";");

  const audioIdx = highlight ? 3 : 1;
  args.push(
    "-filter_complex", overlayChain,
    "-map", "[v]", "-map", `${audioIdx}:a`,
    "-t", String(dur), "-r", String(fps),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-ar", "48000", "-shortest", segOut,
  );
  await deps.runFfmpeg(args);
}

/** Screencast-Schritt: echter Clip um video_time + Highlight-Overlay (+ ggf. Cursor). */
async function renderScreencastStep(deps, s, segOut) {
  const { step, size, fps, dur, highlight, lower, audioPath, ctx, opts } = s;
  const { w, h } = size;
  const src = ctx.files.sourceVideoPath;
  const startAt = Math.max(0, (step.video_time ?? 0) - SCREENCAST_PRE_SEC);

  // Klick im Zeitfenster? -> Cursor-Animation via Frame-Sequenz.
  const clicks = Array.isArray(ctx.files.clicks) ? ctx.files.clicks : [];
  const clickInWindow = clicks.find(
    (c) => typeof c.t === "number" && c.t >= startAt && c.t <= startAt + dur && typeof c.x === "number" && typeof c.y === "number",
  );

  // Highlight-Overlay (statisch, ein PNG reicht auf bewegtem Clip).
  let hlPng = null;
  if (highlight) {
    hlPng = path.join(opts.dir, `hlc_${path.basename(segOut, ".mp4")}.png`);
    await deps.sharp(Buffer.from(highlightOverlaySvg(highlight, size, 1))).png().toFile(hlPng);
  }

  // Cursor-Overlay: kurze Frame-Sequenz (~18fps) im Bewegungsfenster.
  let cursorVideo = null;
  if (clickInWindow) {
    cursorVideo = await buildCursorClip(deps, { click: clickInWindow, startAt, dur, size, opts, segOut });
  }

  const args = ["-y", "-ss", String(startAt), "-t", String(dur), "-i", src];
  if (hlPng) args.push("-i", hlPng);
  if (cursorVideo) args.push("-i", cursorVideo);
  if (audioPath && fs.existsSync(audioPath)) args.push("-i", audioPath);
  else args.push("-f", "lavfi", "-t", String(dur), "-i", "anullsrc=r=48000:cl=stereo");

  // Clip auf Zielgröße skalieren + letztes Frame einfrieren (tpad), falls zu kurz.
  const chain = [];
  chain.push(`[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,tpad=stop_mode=clone:stop_duration=${dur.toFixed(2)},fps=${fps},format=rgba[clip]`);
  let last = "clip";
  let idx = 1;
  if (hlPng) { chain.push(`[${idx}:v]scale=${w}:${h}[hl]`); chain.push(`[${last}][hl]overlay=0:0[oh]`); last = "oh"; idx++; }
  if (cursorVideo) { chain.push(`[${idx}:v]scale=${w}:${h}[cur]`); chain.push(`[${last}][cur]overlay=0:0:shortest=0[oc]`); last = "oc"; idx++; }
  const ltChain = lower.join(",");
  chain.push(`[${last}]${ltChain},format=yuv420p[v]`);

  const audioIdx = idx; // nächster Input nach den Overlays
  args.push(
    "-filter_complex", chain.join(";"),
    "-map", "[v]", "-map", `${audioIdx}:a`,
    "-t", String(dur), "-r", String(fps),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-ar", "48000", "-shortest", segOut,
  );
  await deps.runFfmpeg(args);
}

/** Cursor-Frame-Sequenz -> kurzes transparentes Overlay-Video (Cursor gleitet zum Klick + Ripple). */
async function buildCursorClip(deps, { click, startAt, dur, size, opts, segOut }) {
  const seqFps = 18;
  const nFrames = Math.max(6, Math.round(dur * seqFps));
  // Klick-Zeitpunkt relativ im Segment (0..1). Cursor gleitet von Rand -> Klickpunkt,
  // danach Ripple.
  const clickRel = clamp01((click.t - startAt) / dur);
  const startX = 0.5, startY = 0.9; // Startposition (unten mitte)
  const frameDir = path.join(opts.dir, `cur_${path.basename(segOut, ".mp4")}`);
  fs.mkdirSync(frameDir, { recursive: true });
  for (let f = 0; f < nFrames; f++) {
    const rel = f / (nFrames - 1);
    let px, py, ripple;
    if (rel <= clickRel && clickRel > 0) {
      const k = rel / clickRel; // 0..1 Anfahrt
      const ease = 1 - Math.pow(1 - k, 3);
      px = startX + (click.x - startX) * ease;
      py = startY + (click.y - startY) * ease;
      ripple = -1;
    } else {
      px = click.x; py = click.y;
      ripple = clamp01((rel - clickRel) / Math.max(0.001, 1 - clickRel));
    }
    const svg = cursorFrameSvg(px, py, size, ripple);
    await deps.sharp(Buffer.from(svg)).png().toFile(path.join(frameDir, `f${String(f).padStart(4, "0")}.png`));
  }
  const clip = path.join(opts.dir, `cursor_${path.basename(segOut, ".mp4")}.mov`);
  // PNG-Sequenz -> transparentes Video (qtrle für Alpha).
  await deps.runFfmpeg([
    "-y", "-framerate", String(seqFps), "-i", path.join(frameDir, "f%04d.png"),
    "-c:v", "qtrle", "-t", String(dur), clip,
  ]);
  return clip;
}

/**
 * Segmente pairwise mit xfade (Video) + acrossfade (Audio) verketten.
 * Bei nur einem Segment: direkt kopieren. Robuste, sequenzielle Kette.
 */
async function concatWithXfade(deps, segFiles, plan, xfade, size, fps, outFile) {
  if (segFiles.length === 1) {
    await deps.runFfmpeg(["-y", "-i", segFiles[0], "-c", "copy", outFile]);
    return;
  }
  // Alle Segmente als Inputs; xfade-Kette über offsets (kumulierte Dauer - Überlappungen).
  const args = ["-y"];
  for (const f of segFiles) args.push("-i", f);
  const chain = [];
  let vLast = "0:v";
  let aLast = "0:a";
  let offset = (plan[0].duration ?? SILENT_STEP_SEC) - xfade;
  for (let i = 1; i < segFiles.length; i++) {
    const vOut = i === segFiles.length - 1 ? "vout" : `vx${i}`;
    const aOut = i === segFiles.length - 1 ? "aout" : `ax${i}`;
    chain.push(`[${vLast}][${i}:v]xfade=transition=fade:duration=${xfade}:offset=${offset.toFixed(3)}[${vOut}]`);
    chain.push(`[${aLast}][${i}:a]acrossfade=d=${xfade}[${aOut}]`);
    vLast = vOut; aLast = aOut;
    offset += (plan[i].duration ?? SILENT_STEP_SEC) - xfade;
  }
  args.push(
    "-filter_complex", chain.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-r", String(fps),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-ar", "48000", "-movflags", "+faststart", outFile,
  );
  await deps.runFfmpeg(args);
}

/** Erste (nicht-blur) Markierung eines Schritts als {x,y,w,h}, oder null. */
export function firstHighlight(step) {
  const hs = Array.isArray(step?.highlights) ? step.highlights : [];
  const h = hs.find((x) => x && x.type !== "blur" && [x.x, x.y, x.w, x.h].every((n) => typeof n === "number"));
  return h ? { x: h.x, y: h.y, w: h.w, h: h.h } : null;
}
