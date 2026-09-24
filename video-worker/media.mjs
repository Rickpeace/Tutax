// Welle 51: reine ffmpeg/ffprobe-Bausteine des Video-Workers (ohne Supabase/OpenAI), damit sie
// lokal testbar sind (scripts/test-video-normalize.mjs). index.mjs startet beim Import die
// Poll-Schleife und ist darum nicht testbar importierbar.
//
// Befund (Job vom 21.07.2026, Kunde Max): Die Erweiterungs-Aufnahme war VOLLSTÄNDIG (125 s VP9,
// 29 Klicks), hatte aber KEINE Audiospur („Ohne Ton“). Die Audio-Extraktion scheiterte daran und
// die Fehler-Übersetzung machte daraus „evtl. unvollständige Aufnahme“. Zweite, latente Ursache:
// Fenster-Aufnahmen mit UNGERADER Breite/Höhe ließen die H.264-Normalisierung scheitern
// („width not divisible by 2“) -> Worker fiel aufs Original-WebM zurück, das (MediaRecorder)
// keine Dauer im Header trägt -> „Video konnte nicht gelesen werden“.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const sh = (cmd, args) =>
  execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });

/** Hat die Datei mindestens eine Audiospur? Im Zweifel (ffprobe-Fehler) true -> alter Weg meldet echte Fehler. */
export function hasAudioStream(file) {
  try {
    return sh("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file]).trim().length > 0;
  } catch {
    return true;
  }
}

/**
 * Dauer in Sekunden. Erst aus dem Container-Header; fehlt sie (MediaRecorder-WebM: „N/A“),
 * aus dem Zeitstempel des letzten Video-Pakets. NaN, wenn beides nicht lesbar ist.
 */
export function probeDuration(file) {
  try {
    const d = parseFloat(sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]).trim());
    if (isFinite(d) && d > 0) return d;
  } catch { /* unten Paket-Fallback */ }
  try {
    const lines = sh("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", file])
      .split(/\r?\n/)
      .map((l) => parseFloat(l))
      .filter((n) => isFinite(n));
    if (lines.length) return Math.max(...lines);
  } catch { /* nicht lesbar */ }
  return NaN;
}

/**
 * Auf MP4/H.264 normalisieren (zuverlässiges Seeking + Dauer im Header).
 *  1) Neu kodieren; Breite/Höhe auf gerade Werte (libx264 + yuv420p verlangt das), genpts
 *     für WebM ohne saubere Zeitstempel.
 *  2) Scheitert das: verlustfrei nach MKV umpacken (schreibt Dauer + Cues nach).
 *  3) Sonst Original (buildTutorial wirft dann klar).
 * Liefert { path, method: "encode" | "remux" | "original", error? }.
 */
export function normalizeVideo(raw, dir) {
  const norm = path.join(dir, "norm.mp4");
  let encodeError;
  try {
    sh("ffmpeg", [
      "-y", "-fflags", "+genpts", "-i", raw,
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-pix_fmt", "yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
      "-c:a", "aac", "-movflags", "+faststart", norm,
    ]);
    if (fs.existsSync(norm) && fs.statSync(norm).size > 0) return { path: norm, method: "encode" };
  } catch (e) {
    encodeError = String(e?.message || e).slice(0, 200);
  }
  const remux = path.join(dir, "remux.mkv");
  try {
    sh("ffmpeg", ["-y", "-fflags", "+genpts", "-i", raw, "-c", "copy", remux]);
    if (fs.existsSync(remux) && fs.statSync(remux).size > 0) return { path: remux, method: "remux", error: encodeError };
  } catch { /* Original */ }
  return { path: raw, method: "original", error: encodeError };
}

/**
 * Ist die Datei ein echtes Video-Container-Format? Prüft die ersten Bytes (Magic Numbers) OHNE
 * ffmpeg: MP4/MOV (…ftyp/moov/mdat/free/wide/skip), WebM/MKV (EBML 1A 45 DF A3), AVI (RIFF…AVI).
 * Sicherheitsprüfung Runde 4: ffmpeg errät das Format selbst — eine hochgeladene HLS-Playlist
 * oder concat-Liste ließe es LOKALE Dateien des Servers (z. B. Umgebungsvariablen) lesen und
 * ins Video schreiben. Solche Dateien werden vor jedem ffmpeg-Aufruf abgelehnt.
 */
export function looksLikeVideoContainer(file) {
  let head;
  try {
    const fd = fs.openSync(file, "r");
    head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
  } catch {
    return false;
  }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return true; // WebM/MKV
  const box = head.toString("latin1", 4, 8);
  if (["ftyp", "moov", "mdat", "free", "wide", "skip", "pnot"].includes(box)) return true; // MP4/MOV
  if (head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "AVI ") return true;
  return false;
}
