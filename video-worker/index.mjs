// Steply Video-Worker (Hetzner): pollt video_jobs, macht aus Video -> Klick-Tutorial.
// Pipeline: ffmpeg (Audio + Keyframes) + Whisper (Transkript) + Vision (Schritte/Highlights/Titel).
// Env (.env): SUPABASE_URL, SUPABASE_SECRET_KEY, OPENAI_API_KEY
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });

// Gelbes Koordinaten-Gitter (Linien alle 0.1 + Zahlen 0.0–0.9) aufs Bild legen,
// damit die Vision-KI die Highlight-Box am Raster ABLESEN kann (deutlich genauer).
const GRID_FONT = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"].find((f) => fs.existsSync(f));
function gridImg(src) {
  const dst = src.replace(/\.jpg$/i, "_grid.jpg");
  const parts = ["drawgrid=w=iw/10:h=ih/10:t=1:color=yellow@0.55"];
  if (GRID_FONT) {
    for (let k = 0; k <= 9; k++) {
      const f = (k / 10).toFixed(1);
      parts.push(`drawtext=fontfile=${GRID_FONT}:text=${f}:x=(iw*${k}/10)+3:y=3:fontsize=15:fontcolor=yellow:box=1:boxcolor=black@0.55`);
      parts.push(`drawtext=fontfile=${GRID_FONT}:text=${f}:x=3:y=(ih*${k}/10)+3:fontsize=15:fontcolor=yellow:box=1:boxcolor=black@0.55`);
    }
  }
  try { sh("ffmpeg", ["-y", "-i", src, "-vf", parts.join(","), dst]); return dst; }
  catch { return src; }
}
const uuid = () => crypto.randomUUID();
const mkBody = (t) => ({ type: "doc", content: [{ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] }] });
const json = async (model, messages, max = 400) => {
  const c = await openai.chat.completions.create({ model, messages, response_format: { type: "json_object" }, max_completion_tokens: max });
  try { return JSON.parse(c.choices[0].message.content || "{}"); } catch { return {}; }
};

const SEG_SYS = `Du bekommst die Erzählung eines Screencast-Tutorials mit Zeitstempeln.
Zerlege sie in die EINZELNEN konkreten HANDLUNGS-Schritte (Klicks/Eingaben/Navigation).
Gib NUR JSON: {"steps":[{"t": <Sekunde, wann die Handlung passiert>, "narration":"der zugehörige gesprochene Teil"}]}.
Regeln:
- Schneide an natürlichen Handlungsgrenzen — nur ECHTE Aktionen, kein Füllmaterial ("so", "okay", Begrüßung).
- MARKER-WÖRTER haben VORRANG (Hybrid): Kommt eines dieser Wörter, beginne dort IMMER einen neuen Schritt — auch wenn es sonst natürlich nicht trennen würdest:
  HART (immer schneiden): "nächster Schritt", "Schritt 1/2/3 …", "erster/zweiter/dritter … Schritt".
  WEICH (starker Hinweis): "zuerst", "als Erstes", "als Nächstes", "danach", "dann", "weiter mit".
- Reihenfolge wie im Video; t aus den Zeitstempeln.`;
const STEP_SYS = `Du formulierst EINEN Schritt einer Klick-Anleitung aus einem Screenshot + der dabei gesprochenen Erklärung.
Auf dem Bild liegt ein gelbes KOORDINATEN-GITTER: Zahlen 0.0–0.9 oben (x) und links (y), Linien alle 0.1. LIES die Position am Gitter AB (nicht schätzen).
Gib NUR JSON: {"title":"...","body":"...","highlight":{"x":0..1,"y":0..1,"w":0..1,"h":0..1}}.
- "title": kurzer Handlungs-Titel im Imperativ (max. 6 Wörter).
- "body": 1–2 knappe Sätze, Sie-Form, was der Nutzer konkret tun soll.
- "highlight": ENGE Box NUR um das Ziel-Element (Button/Feld/Icon), am Gitter abgelesen — x,y = obere-linke Ecke, w,h = Breite/Höhe (0..1). null, wenn nicht eindeutig.
- Stütze dich auf Text UND Bild. Erfinde nichts. Kein Markdown.`;
const TITLE_SYS = 'Gib NUR JSON {"title":"..."}. Kurzer, prägnanter Tutorial-Titel auf Deutsch (max. 6 Wörter, handlungsorientiert, ohne Anführungszeichen).';

async function buildTutorial(job, videoPath, dir) {
  let duration = NaN;
  try { duration = parseFloat(sh("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1", videoPath]).trim()); } catch { /* unten abgefangen */ }
  if (!isFinite(duration) || duration < 1) throw new Error("Video konnte nicht gelesen werden (evtl. Aufnahme unvollständig/zu kurz). Bitte erneut aufnehmen.");
  let vdim = [null, null];
  try { vdim = sh("ffprobe", ["-v","error","-select_streams","v:0","-show_entries","stream=width,height","-of","csv=s=x:p=0", videoPath]).trim().split("x").map(Number); } catch { /* dims optional */ }

  // 1) Audio -> Whisper
  const audio = path.join(dir, "audio.mp3");
  sh("ffmpeg", ["-y","-i", videoPath, "-vn","-ac","1","-ar","16000","-b:a","64k", audio]);
  const tr = await openai.audio.transcriptions.create({ file: fs.createReadStream(audio), model: "whisper-1", response_format: "verbose_json", language: "de" });
  const segs = (tr.segments || []).map((s) => ({ start: +s.start.toFixed(1), text: s.text.trim() }));

  // 2) Transkript -> Handlungsschritte
  const tsText = segs.map((s) => `[${s.start}s] ${s.text}`).join("\n") || tr.text || "";
  let segSteps = (await json("gpt-5.4-mini", [{ role:"system", content: SEG_SYS }, { role:"user", content:`Erzählung:\n${tsText}\n\nVideolänge: ${duration.toFixed(0)}s` }], 700)).steps || [];
  if (segSteps.length < 2) { segSteps = []; const n = Math.min(6, Math.max(2, Math.round(duration/6))); for (let i=0;i<n;i++) segSteps.push({ t: +(i*(duration/n)).toFixed(1), narration: "" }); }
  segSteps = segSteps.filter((s) => typeof s.t === "number").sort((a,b)=>a.t-b.t).slice(0, 14);

  // 3) pro Schritt: Frame + Vision (robust: kaputte Frames überspringen, Job läuft weiter)
  const tutId = uuid();
  const rows = [];
  for (let i = 0; i < segSteps.length; i++) {
    // Screenshot kurz NACH dem Ansage-Moment, aber früh genug, dass das Ziel-Element noch sichtbar ist.
    const at = Math.min(Math.max(segSteps[i].t + 0.5, 0.2), Math.max(duration - 0.1, 0.2));
    const local = path.join(dir, `step_${i + 1}.jpg`);
    try {
      sh("ffmpeg", ["-y", "-ss", String(at), "-i", videoPath, "-frames:v", "1", "-q:v", "3", local]);
      if (!fs.existsSync(local) || fs.statSync(local).size < 500) continue;
    } catch { continue; }
    const narration = (segSteps[i].narration || "").trim();
    const b64 = fs.readFileSync(gridImg(local)).toString("base64"); // Gitter-Version an die KI (genauere Highlights)
    const p = await json("gpt-5.4-mini", [
      { role: "system", content: STEP_SYS },
      { role: "user", content: [{ type: "text", text: `Gesprochen: ${narration || "(nichts gesagt – aus dem Bild ableiten)"}` }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }] },
    ], 300);
    const id = uuid();
    const ipath = `${job.account_id}/${tutId}/step_${rows.length + 1}.jpg`;
    await sb.storage.from("tutorial-images").upload(ipath, fs.readFileSync(local), { contentType: "image/jpeg", upsert: true });
    const hl = p.highlight && [p.highlight.x, p.highlight.y, p.highlight.w, p.highlight.h].every((n) => typeof n === "number" && n >= 0 && n <= 1)
      ? [{ id: uuid(), type: "rect", x: p.highlight.x, y: p.highlight.y, w: p.highlight.w, h: p.highlight.h, color: "#3d4ee6", rounded: true }] : [];
    rows.push({ id, tutorial_id: tutId, title: p.title || `Schritt ${rows.length + 1}`, body: mkBody(p.body || ""), position: rows.length + 1, is_decision: false, image_path: ipath, image_width: vdim[0] || null, image_height: vdim[1] || null, highlights: hl });
  }
  if (!rows.length) throw new Error("Keine Schritte erkannt (Aufnahme evtl. zu kurz/leer). Bitte erneut aufnehmen.");

  // 4) Titel
  const title = (await json("gpt-5.4-mini", [{ role: "system", content: TITLE_SYS }, { role: "user", content: "Schritte: " + rows.map((r) => r.title).join("; ") + "\nErzählung: " + (tr.text || "").slice(0, 500) }], 60)).title || job.title || "Anleitung";

  // 5) Tutorial + Schritte + lineare Verzweigungen
  await sb.from("tutorials").insert({ id: tutId, account_id: job.account_id, title, status: "draft" });
  await sb.from("steps").insert(rows);
  await sb.from("tutorials").update({ root_step_id: rows[0].id }).eq("id", tutId);
  const br = [];
  for (let i = 0; i < rows.length - 1; i++) br.push({ id: uuid(), step_id: rows[i].id, label: null, target_step_id: rows[i + 1].id, position: 0 });
  if (br.length) await sb.from("step_branches").insert(br);
  return { tutId, title, count: rows.length };
}

async function processJob(job) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vid-"));
  try {
    const raw = path.join(tmp, "in");
    const { data, error } = await sb.storage.from("tutorial-videos").download(job.video_path);
    if (error) throw new Error("Download: " + error.message);
    fs.writeFileSync(raw, Buffer.from(await data.arrayBuffer()));
    // Auf MP4/H.264 normalisieren (webm-Aufnahmen, krumme Codecs -> zuverlässiges Seeking/ffprobe).
    let vpath = raw;
    try {
      const norm = path.join(tmp, "norm.mp4");
      sh("ffmpeg", ["-y", "-i", raw, "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "aac", "-movflags", "+faststart", norm]);
      vpath = norm;
    } catch { /* Fallback: Original verwenden */ }
    const res = await buildTutorial(job, vpath, tmp);
    console.log(`✓ Job ${job.id} -> Tutorial "${res.title}" (${res.count} Schritte, ${res.tutId})`);
    return res;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function loop() {
  let ran = false;
  try {
    const { data: jobs } = await sb.from("video_jobs").select("*").eq("status", "queued").order("created_at").limit(1);
    const job = jobs?.[0];
    if (job) {
      // atomar beanspruchen
      const { data: claimed } = await sb.from("video_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "queued").select();
      if (claimed?.length) {
        ran = true;
        try {
          const res = await processJob(job);
          await sb.from("video_jobs").update({ status: "done", tutorial_id: res.tutId, title: res.title, updated_at: new Date().toISOString() }).eq("id", job.id);
        } catch (e) {
          const raw = String(e?.message || "Unbekannter Fehler");
          console.error("✗ Job", job.id, raw);
          const friendly = /Command failed|ffmpeg|ffprobe/i.test(raw)
            ? "Video konnte nicht verarbeitet werden (evtl. unvollständige Aufnahme). Bitte erneut aufnehmen."
            : raw.slice(0, 300);
          await sb.from("video_jobs").update({ status: "failed", error: friendly, updated_at: new Date().toISOString() }).eq("id", job.id);
        }
      }
    }
  } catch (e) { console.error("loop-Fehler:", e.message); }
  setTimeout(loop, ran ? 1000 : 5000);
}

console.log("🎬 Steply Video-Worker gestartet — pollt video_jobs.");
loop();
