// Welle 51: lokaler Beweis für die Video-Worker-Bausteine (video-worker/media.mjs) — OHNE
// Supabase/OpenAI, nur lokales ffmpeg/ffprobe. Reproduziert die zwei Ursachen für
// „Video konnte nicht verarbeitet werden (evtl. unvollständige Aufnahme)“:
//   A) Aufnahme OHNE Audiospur (Erweiterung „Ohne Ton“): Audio-Extraktion scheiterte.
//   B) Fenster-Aufnahme mit UNGERADER Breite/Höhe: libx264-Normalisierung scheiterte, Fallback
//      aufs MediaRecorder-WebM ohne Dauer im Header -> Dauer NaN.
// Fixtures werden per lavfi erzeugt und als STREAM (pipe) geschrieben -> WebM ohne Dauer/Cues,
// wie MediaRecorder es liefert.
//
// Nutzung:  node scripts/test-video-normalize.mjs [echte-aufnahme.webm]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hasAudioStream, probeDuration, normalizeVideo } from "../video-worker/media.mjs";

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.log("ffmpeg nicht gefunden – Test übersprungen.");
  process.exit(0);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "steply-vnorm-"));

// WebM als Stream erzeugen (kein Zurückspulen -> keine Dauer im Header, wie MediaRecorder).
function streamWebm(name, { size, secs, audio }) {
  const args = ["-v", "error", "-f", "lavfi", "-i", `testsrc=size=${size}:rate=15`];
  if (audio) args.push("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000");
  args.push("-t", String(secs), "-pix_fmt", "yuv420p", "-c:v", "libvpx", "-deadline", "realtime", "-b:v", "300k");
  if (audio) args.push("-c:a", "libopus");
  args.push("-live", "1", "-f", "webm", "pipe:1"); // live: ohne Dauer/Cues (wie MediaRecorder)
  const buf = execFileSync("ffmpeg", args, { maxBuffer: 256 * 1024 * 1024 });
  const p = path.join(dir, name);
  fs.writeFileSync(p, buf);
  return p;
}

// Alter Worker-Weg (vor Welle 51) — zum Reproduzieren.
function oldNormalize(raw, sub) {
  const d = path.join(dir, sub);
  fs.mkdirSync(d, { recursive: true });
  const norm = path.join(d, "norm.mp4");
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "aac", "-movflags", "+faststart", norm], { stdio: "ignore" });
    return norm;
  } catch {
    return raw;
  }
}
function oldDuration(file) {
  try {
    return parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" }).trim());
  } catch {
    return NaN;
  }
}
function extractAudio(file, sub) {
  const out = path.join(dir, sub + "-audio.mp3");
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", out], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

try {
  // --- Fall A: gerade Maße, ohne Ton (wie Max’ Aufnahme vom 21.07.) ---
  const a = streamWebm("silent.webm", { size: "640x360", secs: 4, audio: false });
  ok(!isFinite(oldDuration(a)), "A: Stream-WebM hat (wie MediaRecorder) keine Dauer im Header");
  ok(hasAudioStream(a) === false, "A: keine Audiospur erkannt");
  const aOld = oldNormalize(a, "a-old");
  ok(extractAudio(aOld, "a-old") === false, "A: alter Weg – Audio-Extraktion scheitert (reproduziert „Command failed: ffmpeg“)");
  const aDir = path.join(dir, "a-new");
  fs.mkdirSync(aDir);
  const aNew = normalizeVideo(a, aDir);
  ok(aNew.method === "encode", `A: Normalisierung per Neu-Kodierung (${aNew.method})`);
  const aDur = probeDuration(aNew.path);
  ok(Math.abs(aDur - 4) < 0.5, `A: Dauer nach Normalisierung ≈ 4 s (${aDur})`);
  ok(hasAudioStream(aNew.path) === false, "A: neuer Weg erkennt „keine Audiospur“ -> Transkript wird übersprungen statt zu scheitern");

  // --- Fall B: ungerade Maße, ohne Ton (Fenster-Aufnahme) ---
  const b = streamWebm("odd.webm", { size: "641x481", secs: 3, audio: false });
  const bOld = oldNormalize(b, "b-old");
  ok(bOld === b, "B: alter Weg – libx264 scheitert an ungerader Breite (Fallback aufs Original)");
  ok(!isFinite(oldDuration(bOld)), "B: alter Weg – Dauer NaN -> „Video konnte nicht gelesen werden“");
  const bDir = path.join(dir, "b-new");
  fs.mkdirSync(bDir);
  const bNew = normalizeVideo(b, bDir);
  ok(bNew.method === "encode", `B: neuer Weg normalisiert trotz ungerader Maße (${bNew.method})`);
  const wh = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", bNew.path], { encoding: "utf8" }).trim();
  ok(wh === "640x480", `B: Maße auf gerade Werte gebracht (${wh})`);
  ok(Math.abs(probeDuration(bNew.path) - 3) < 0.5, "B: Dauer ≈ 3 s");

  // --- Fall C: mit Ton (Regressionsschutz: Audio bleibt erhalten) ---
  const c = streamWebm("audio.webm", { size: "640x360", secs: 3, audio: true });
  ok(hasAudioStream(c) === true, "C: Audiospur erkannt");
  const cDir = path.join(dir, "c-new");
  fs.mkdirSync(cDir);
  const cNew = normalizeVideo(c, cDir);
  ok(cNew.method === "encode" && hasAudioStream(cNew.path), "C: normalisiert, Audiospur erhalten");
  ok(extractAudio(cNew.path, "c-new"), "C: Audio-Extraktion funktioniert weiter");

  // --- Fall D: Dauer-Fallback direkt auf dem Stream-WebM (ohne Normalisierung) ---
  const dDur = probeDuration(a);
  ok(Math.abs(dDur - 4) < 0.5, `D: probeDuration liest die Dauer auch ohne Header (letztes Paket: ${dDur})`);

  // --- Fall E: kaputte Datei -> sauber NaN / Original, kein Absturz ---
  const broken = path.join(dir, "broken.webm");
  fs.writeFileSync(broken, fs.readFileSync(a).subarray(0, 200));
  const eDir = path.join(dir, "e-new");
  fs.mkdirSync(eDir);
  const eNew = normalizeVideo(broken, eDir);
  ok(eNew.method === "original" || !isFinite(probeDuration(eNew.path)) || probeDuration(eNew.path) < 1, `E: abgeschnittene Datei wird nicht als gültig ausgegeben (${eNew.method})`);

  // --- Optional: echte Aufnahme ---
  const real = process.argv[2];
  if (real && fs.existsSync(real)) {
    const rDir = path.join(dir, "real");
    fs.mkdirSync(rDir);
    console.log(`… echte Aufnahme: Audiospur=${hasAudioStream(real)}, Header-Dauer=${oldDuration(real)}`);
    const rOld = oldNormalize(real, "real-old");
    console.log(`… alter Weg: Audio-Extraktion ${extractAudio(rOld, "real-old") ? "ok" : "SCHEITERT"}`);
    const rNew = normalizeVideo(real, rDir);
    const rDur = probeDuration(rNew.path);
    ok(rNew.method === "encode" && isFinite(rDur) && rDur > 1, `Echt: normalisiert (${rNew.method}), Dauer ${rDur} s, Audiospur ${hasAudioStream(rNew.path)}`);
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failed ? "\nFEHLGESCHLAGEN" : "\nAlle Prüfungen grün.");
process.exit(failed ? 1 : 0);
