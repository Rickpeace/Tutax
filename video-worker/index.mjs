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
// Frame-Diff: Frame kurz VOR vs. kurz NACH der Handlung -> helle Stellen = was sich verändert hat
// (= wohin geklickt/getippt wurde). Erdet die Highlight-Erkennung im echten Bildsignal.
function diffImg(video, tB, tA, dir, idx) {
  const dst = path.join(dir, `diff_${idx}.jpg`);
  const bPng = path.join(dir, `_b${idx}.png`);
  const aPng = path.join(dir, `_a${idx}.png`);
  try {
    sh("ffmpeg", ["-y", "-ss", String(tB), "-i", video, "-frames:v", "1", bPng]);
    sh("ffmpeg", ["-y", "-ss", String(tA), "-i", video, "-frames:v", "1", aPng]);
    sh("ffmpeg", ["-y", "-i", bPng, "-i", aPng, "-filter_complex",
      "[0][1]blend=all_mode=difference,format=gray,eq=contrast=4:brightness=0.06,gblur=sigma=1.2", dst]);
    return gridImg(dst); // gleiches Gitter wie das saubere Bild
  } catch { return null; }
  finally { for (const f of [bPng, aPng]) { try { fs.rmSync(f, { force: true }); } catch {} } }
}
const uuid = () => crypto.randomUUID();
const mkBody = (t) => ({ type: "doc", content: [{ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] }] });
const json = async (model, messages, max = 400) => {
  const c = await openai.chat.completions.create({ model, messages, response_format: { type: "json_object" }, max_completion_tokens: max });
  try { return JSON.parse(c.choices[0].message.content || "{}"); } catch { return {}; }
};

const SEG_SYS = `Du bekommst die Erzählung eines Screencast-Tutorials mit Zeitstempeln und zerlegst sie in Anleitungs-Schritte.
Gib NUR JSON: {"steps":[{"t": <Sekunde, wann die Handlung passiert>, "narration":"der zugehörige gesprochene Teil"}]}.

WICHTIG — Granularität (so wenige, klare Schritte wie möglich):
- Erzeuge nur die Schritte, die ein Leser wirklich als getrennte Anleitungs-Schritte sehen will (typisch 3–6, selten mehr).
- Fasse zusammengehörige Mikro-Aktionen zu EINEM Schritt zusammen. Beispiel: "Suchfeld anklicken + Namen eintippen + auf den Treffer klicken" = EIN Schritt ("Nach X suchen und öffnen"), NICHT drei.
- Reines Erklären/Ergebnis-Beschreiben ("dann sehe ich den Chat", "und dann sind wir fertig") ist KEIN eigener Schritt.
- Lieber zu wenige als zu viele. Im Zweifel zusammenfassen.

MARKER-WÖRTER (haben absoluten VORRANG): Sagt die Person eines dieser Wörter, beginne dort GENAU einen neuen Schritt — und richte dich dann NUR danach (ignoriere die Zusammenfass-Heuristik):
  "nächster Schritt", "Schritt 1/2/3 …", "erster/zweiter/dritter … Schritt", "als Nächstes", "weiter mit".

Reihenfolge wie im Video; t aus den Zeitstempeln (ungefähr wann die Handlung passiert).`;
const STEP_SYS = `Du formulierst EINEN Schritt einer Klick-Anleitung. Du bekommst ZWEI Bilder mit gleichem gelben KOORDINATEN-GITTER (Zahlen 0.0–0.9 oben = x, links = y, Linien alle 0.1):
- BILD 1 = der Screenshot des Bildschirms.
- BILD 2 = eine DIFFERENZ (vorher/nachher der Handlung): HELLE/leuchtende Stellen zeigen, WO sich beim Klick/Tippen etwas verändert hat. Dunkel = unverändert. (BILD 2 fehlt manchmal — dann nur aus BILD 1 + Erzählung.)
BILD 2 ist nur ein HINWEIS, wo etwas passierte. Bestimme das Ziel-Element aus Erzählung + BILD 1, nutze die hellen Stellen zur Eingrenzung. Lies die Box dann am Gitter in BILD 1 ab (nicht schätzen).
Gib NUR JSON: {"title":"...","body":"...","highlight":{"x":0..1,"y":0..1,"w":0..1,"h":0..1}}.
- "title": kurzer Handlungs-Titel im Imperativ (max. 6 Wörter).
- "body": 1–2 knappe Sätze, Sie-Form, was der Nutzer konkret tun soll.
- "highlight": ENGE Box NUR um ein ECHTES, sichtbares Bedien-Element in BILD 1 (Button/Feld/Icon/Listeneintrag mit Text/Symbol) — x,y = obere-linke Ecke, w,h = Breite/Höhe (0..1).
- WICHTIG: Markiere NIEMALS leeren Hintergrund/leere Fläche, auch wenn sie sich in BILD 2 verändert hat (Veränderung kann durch VERSCHWINDEN von Elementen entstehen). Ist die helle Stelle leer, wähle das klickbare Element, das zur Erzählung passt (genannter Treffer/Name/Button/Feld).
- Bei großflächiger Veränderung (ganzer Bereich neu geladen) markiere das ANGEKLICKTE Element, nicht die ganze Fläche. null, wenn wirklich nichts Passendes sichtbar ist.
- Stütze dich auf Text UND Bilder. Erfinde nichts. Kein Markdown.`;
const TITLE_SYS = 'Gib NUR JSON {"title":"..."}. Kurzer, prägnanter Tutorial-Titel auf Deutsch (max. 6 Wörter, handlungsorientiert, ohne Anführungszeichen).';

async function buildTutorial(job, videoPath, dir) {
  let duration = NaN;
  try { duration = parseFloat(sh("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1", videoPath]).trim()); } catch { /* unten abgefangen */ }
  if (!isFinite(duration) || duration < 1) throw new Error("Video konnte nicht gelesen werden (evtl. Aufnahme unvollständig/zu kurz). Bitte erneut aufnehmen.");
  let vdim = [null, null];
  try { vdim = sh("ffprobe", ["-v","error","-select_streams","v:0","-show_entries","stream=width,height","-of","csv=s=x:p=0", videoPath]).trim().split("x").map(Number); } catch { /* dims optional */ }

  // 1) Audio -> Whisper (mit Wort-Zeitstempeln für die Marker-Erkennung)
  const audio = path.join(dir, "audio.mp3");
  sh("ffmpeg", ["-y","-i", videoPath, "-vn","-ac","1","-ar","16000","-b:a","64k", audio]);
  const tr = await openai.audio.transcriptions.create({ file: fs.createReadStream(audio), model: "whisper-1", response_format: "verbose_json", language: "de", timestamp_granularities: ["segment", "word"] });
  const segs = (tr.segments || []).map((s) => ({ start: +s.start.toFixed(1), text: s.text.trim() }));

  // 2) Schritte bestimmen. Jeder Schritt liefert: { shot (Screenshot-Sekunde), tB (Vorher-Frame), narration }.
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-zäöüß]/g, "");
  // (A) MARKER-MODUS: Das Wort "Schnitt" markiert das ENDE eines Schritts (Regie-Logik:
  //     erst Schritt machen + Maus aufs Ziel, dann "Schnitt" sagen). Schnitt genau dort,
  //     Screenshot KURZ DAVOR (Maus auf dem Ziel) — kein Sekunden-Zählen nötig.
  const cuts = (tr.words || []).filter((w) => norm(w.word) === "schnitt").map((w) => +w.start).sort((a, b) => a - b);
  let segSteps = [];
  if (cuts.length >= 1) {
    const ends = [...cuts];
    if (duration - ends[ends.length - 1] > 1.5) ends.push(duration); // letzter Schritt ohne "Schnitt" am Ende
    for (let i = 0; i < ends.length; i++) {
      const start = i === 0 ? 0 : ends[i - 1];
      const end = ends[i];
      if (end - start < 0.8) continue; // zu kurz -> kein eigener Schritt
      const shot = Math.min(Math.max(end - 0.4, start + 0.2), duration - 0.1);
      const tB = Math.min(Math.max(start + 0.2, 0), shot - 0.4);
      const narration = (tr.words || []).filter((w) => w.start >= start && w.start < end && norm(w.word) !== "schnitt").map((w) => w.word).join(" ").replace(/\s+/g, " ").trim();
      segSteps.push({ shot, tB, narration });
    }
  }
  // (B) FALLBACK ohne "Schnitt": KI segmentiert aus dem Transkript; Screenshot ~2s nach Ansage.
  if (!segSteps.length) {
    const tsText = segs.map((s) => `[${s.start}s] ${s.text}`).join("\n") || tr.text || "";
    let llm = (await json("gpt-5.4-mini", [{ role:"system", content: SEG_SYS }, { role:"user", content:`Erzählung:\n${tsText}\n\nVideolänge: ${duration.toFixed(0)}s` }], 700)).steps || [];
    if (llm.length < 2) { llm = []; const n = Math.min(6, Math.max(2, Math.round(duration/6))); for (let i=0;i<n;i++) llm.push({ t: +(i*(duration/n)).toFixed(1), narration: "" }); }
    llm = llm.filter((s) => typeof s.t === "number").sort((a,b)=>a.t-b.t);
    for (let i = 0; i < llm.length; i++) {
      const nextT = i + 1 < llm.length ? llm[i + 1].t : duration;
      const shot = Math.min(Math.max(llm[i].t + 2.0, 0.4), Math.max(Math.min(nextT - 0.8, duration - 0.1), 0.4));
      const tB = Math.min(Math.max(llm[i].t - 0.6, 0), shot - 0.4);
      segSteps.push({ shot, tB, narration: (llm[i].narration || "").trim() });
    }
  }
  segSteps = segSteps.slice(0, 14);

  // 3) pro Schritt: Frame + Vision (robust: kaputte Frames überspringen, Job läuft weiter)
  const tutId = uuid();
  const rows = [];
  const uploaded = []; // erfolgreich hochgeladene Bild-Pfade – bei Abbruch wieder entfernen
  let tutInserted = false;
  try {
    for (let i = 0; i < segSteps.length; i++) {
      const at = segSteps[i].shot;
      const local = path.join(dir, `step_${i + 1}.jpg`);
      try {
        sh("ffmpeg", ["-y", "-ss", String(at), "-i", videoPath, "-frames:v", "1", "-q:v", "3", local]);
        if (!fs.existsSync(local) || fs.statSync(local).size < 500) continue;
      } catch { continue; }
      const narration = (segSteps[i].narration || "").trim();
      // Diff: Schritt-Anfang vs. Screenshot-Moment -> erdet das Highlight (Maus wandert aufs Ziel).
      const diffPath = diffImg(videoPath, segSteps[i].tB, at, dir, i + 1);
      const content = [
        { type: "text", text: `Gesprochen: ${narration || "(nichts gesagt – aus dem Bild ableiten)"}` },
        { type: "text", text: "BILD 1 (Screenshot):" },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(gridImg(local)).toString("base64")}` } },
      ];
      if (diffPath) {
        content.push({ type: "text", text: "BILD 2 (Differenz vorher/nachher – hell = verändert):" });
        content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(diffPath).toString("base64")}` } });
      }
      const p = await json("gpt-5.4-mini", [
        { role: "system", content: STEP_SYS },
        { role: "user", content },
      ], 300);
      const id = uuid();
      const ipath = `${job.account_id}/${tutId}/step_${rows.length + 1}.jpg`;
      // Upload-Fehler NICHT verschlucken: sonst Schritt mit kaputtem Bild-Verweis. Dann Schritt überspringen.
      const { error: upErr } = await sb.storage.from("tutorial-images").upload(ipath, fs.readFileSync(local), { contentType: "image/jpeg", upsert: true });
      if (upErr) { console.error("  Bild-Upload fehlgeschlagen, Schritt übersprungen:", upErr.message); continue; }
      uploaded.push(ipath);
      const hl = p.highlight && [p.highlight.x, p.highlight.y, p.highlight.w, p.highlight.h].every((n) => typeof n === "number" && n >= 0 && n <= 1)
        ? [{ id: uuid(), type: "rect", x: p.highlight.x, y: p.highlight.y, w: p.highlight.w, h: p.highlight.h, color: "#3d4ee6", rounded: true }] : [];
      rows.push({ id, tutorial_id: tutId, title: p.title || `Schritt ${rows.length + 1}`, body: mkBody(p.body || ""), position: rows.length + 1, is_decision: false, image_path: ipath, image_width: vdim[0] || null, image_height: vdim[1] || null, highlights: hl });
    }
    if (!rows.length) throw new Error("Keine Schritte erkannt (Aufnahme evtl. zu kurz/leer). Bitte erneut aufnehmen.");

    // 4) Titel
    const title = (await json("gpt-5.4-mini", [{ role: "system", content: TITLE_SYS }, { role: "user", content: "Schritte: " + rows.map((r) => r.title).join("; ") + "\nErzählung: " + (tr.text || "").slice(0, 500) }], 60)).title || job.title || "Anleitung";

    // 5) Tutorial + Schritte + lineare Verzweigungen (Fehler prüfen -> sonst Cleanup im catch)
    const { error: tErr } = await sb.from("tutorials").insert({ id: tutId, account_id: job.account_id, title, status: "draft" });
    if (tErr) throw new Error("Tutorial anlegen: " + tErr.message);
    tutInserted = true;
    const { error: sErr } = await sb.from("steps").insert(rows);
    if (sErr) throw new Error("Schritte anlegen: " + sErr.message);
    await sb.from("tutorials").update({ root_step_id: rows[0].id }).eq("id", tutId);
    const br = [];
    for (let i = 0; i < rows.length - 1; i++) br.push({ id: uuid(), step_id: rows[i].id, label: null, target_step_id: rows[i + 1].id, position: 0 });
    if (br.length) await sb.from("step_branches").insert(br);
    return { tutId, title, count: rows.length };
  } catch (e) {
    // Teil-Ergebnisse aufräumen: verwaiste Bilder + halb angelegtes Tutorial entfernen.
    if (uploaded.length) { try { await sb.storage.from("tutorial-images").remove(uploaded); } catch {} }
    if (tutInserted) {
      try { await sb.from("step_branches").delete().in("step_id", rows.map((r) => r.id)); } catch {}
      try { await sb.from("steps").delete().eq("tutorial_id", tutId); } catch {}
      try { await sb.from("tutorials").delete().eq("id", tutId); } catch {}
    }
    throw e;
  }
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

// Vom Vorgänger (Absturz/Neustart) hängengebliebene Jobs (>15 Min in "processing")
// zurück in die Warteschlange. Läuft nur zwischen Jobs (loop() await-et sonst processJob),
// kollidiert also nie mit einem aktiv laufenden Job dieser (einzigen) Instanz.
async function reapStale() {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  try {
    const { data } = await sb
      .from("video_jobs")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("status", "processing")
      .lt("updated_at", cutoff)
      .select("id");
    if (data?.length) console.log(`↻ ${data.length} hängende(r) Job(s) neu eingereiht.`);
  } catch (e) { console.error("reapStale-Fehler:", e.message); }
}

async function loop() {
  let ran = false;
  try {
    await reapStale();
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
