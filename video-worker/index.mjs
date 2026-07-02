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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Retry mit Backoff um ALLE OpenAI-Calls (transiente 429/5xx/Netz-Aussetzer): 2 Versuche
// (Wartezeiten 2s, 8s). Wirft erst, wenn auch der letzte Versuch scheitert.
const withRetry = async (fn) => {
  const delays = [2000, 8000];
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (attempt >= delays.length) throw e;
      console.error(`  OpenAI-Call fehlgeschlagen (Versuch ${attempt + 1}), neuer Versuch in ${delays[attempt] / 1000}s: ${String(e?.message || e).slice(0, 160)}`);
      await sleep(delays[attempt]);
    }
  }
};
const json = async (model, messages, max = 400) =>
  withRetry(async () => {
    const c = await openai.chat.completions.create({ model, messages, response_format: { type: "json_object" }, max_completion_tokens: max });
    try { return JSON.parse(c.choices[0].message.content || "{}"); } catch { return {}; }
  });
// Bild für die Vision-KI auf max. 1280px Breite verkleinern (nur die Grid-/Diff-Bilder,
// die an die KI gehen — spart Tokens/Zeit; das gespeicherte Original bleibt voll aufgelöst).
function scaleForVision(src) {
  if (!src) return src;
  const dst = src.replace(/\.jpg$/i, "_s.jpg");
  try { sh("ffmpeg", ["-y", "-i", src, "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", dst]); return fs.existsSync(dst) ? dst : src; }
  catch { return src; }
}

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

// Schärfsten Frame um `at` ziehen: 3 Kandidaten (at-0.15, at, at+0.15, auf [0.1, dur-0.1]
// geklemmt) extrahieren und den mit der GRÖSSTEN Dateigröße nehmen — mehr JPEG-Bytes ≈ mehr
// Detail ≈ schärfer (billige Heuristik, kein neues Tool). Liefert Pfad oder null.
function grabSharpestFrame(videoPath, at, duration, dst, dir, idx) {
  const clamp = (t) => Math.min(Math.max(t, 0.1), Math.max(duration - 0.1, 0.1));
  const offsets = [-0.15, 0, 0.15];
  let best = null, bestSize = -1;
  for (let k = 0; k < offsets.length; k++) {
    const cand = path.join(dir, `_cand_${idx}_${k}.jpg`);
    try {
      sh("ffmpeg", ["-y", "-ss", String(clamp(at + offsets[k])), "-i", videoPath, "-frames:v", "1", "-q:v", "3", cand]);
      if (fs.existsSync(cand)) {
        const size = fs.statSync(cand).size;
        if (size >= 500 && size > bestSize) { bestSize = size; best = cand; }
      }
    } catch { /* Kandidat übersprungen */ }
  }
  if (!best) return null;
  try { fs.copyFileSync(best, dst); } catch { return null; }
  return dst;
}

async function buildTutorial(job, videoPath, dir) {
  let duration = NaN;
  try { duration = parseFloat(sh("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1", videoPath]).trim()); } catch { /* unten abgefangen */ }
  if (!isFinite(duration) || duration < 1) throw new Error("Video konnte nicht gelesen werden (evtl. Aufnahme unvollständig/zu kurz). Bitte erneut aufnehmen.");
  let vdim = [null, null];
  try {
    const wh = sh("ffprobe", ["-v","error","-select_streams","v:0","-show_entries","stream=width,height","-of","csv=s=x:p=0", videoPath]).trim().split("x").map(Number);
    // Rotations-Metadaten (Handy-Hochkant) berücksichtigen: ffmpeg extrahiert die Frames
    // AUTO-ROTIERT, ffprobe liefert aber die codierten (unrotierten) Maße -> bei ±90° tauschen,
    // sonst passen die gespeicherten Bildmaße nicht zum Bild und Highlights verrutschen.
    let rot = 0;
    try { rot = Math.abs(parseInt(sh("ffprobe", ["-v","error","-select_streams","v:0","-show_entries","stream_side_data=rotation","-of","default=nw=1:nk=1", videoPath]).trim(), 10)) || 0; } catch { /* keine Rotation */ }
    vdim = (rot === 90 || rot === 270) ? [wh[1], wh[0]] : [wh[0], wh[1]];
  } catch { /* dims optional */ }

  // 1) Audio -> Whisper (mit Wort-Zeitstempeln für die Marker-Erkennung)
  const audio = path.join(dir, "audio.mp3");
  sh("ffmpeg", ["-y","-i", videoPath, "-vn","-ac","1","-ar","16000","-b:a","64k", audio]);
  // prompt: "Schnitt" biast Whisper darauf, das Marker-Wort sauber zu erkennen. Neuer
  // ReadStream je Versuch (ein verbrauchter Stream lässt sich nicht erneut senden).
  const tr = await withRetry(() => openai.audio.transcriptions.create({ file: fs.createReadStream(audio), model: "whisper-1", response_format: "verbose_json", language: "de", prompt: "Schnitt", timestamp_granularities: ["segment", "word"] }));
  const segs = (tr.segments || []).map((s) => ({ start: +s.start.toFixed(1), text: s.text.trim() }));

  // 2) Schritte bestimmen. Jeder Schritt liefert: { shot (Screenshot-Sekunde), tB (Vorher-Frame), narration }.
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-zäöüß]/g, "");
  // (A) MARKER-MODUS: Das Wort "Schnitt" markiert das ENDE eines Schritts (Regie-Logik:
  //     erst Schritt machen + Maus aufs Ziel, dann "Schnitt" sagen). Schnitt genau dort,
  //     Screenshot KURZ DAVOR (Maus auf dem Ziel) — kein Sekunden-Zählen nötig.
  const MARKERS = ["schnitt", "cut"];
  const cuts = (tr.words || []).filter((w) => MARKERS.includes(norm(w.word))).map((w) => +w.start).sort((a, b) => a - b);
  // Nutzer hat "Schnitt" gesprochen, aber es kamen keine Marker an (fehlende Wort-Zeitstempel
  // von Whisper) -> ehrlicher Hinweis, statt still auf den schwächeren Fallback zu gehen.
  let note = null;
  const saidSchnitt = /schnitt/i.test(tr.text || "") || segs.some((s) => /schnitt/i.test(s.text));
  if (saidSchnitt && !cuts.length)
    note = "Du hast \"Schnitt\" gesagt, aber die Schnitt-Marker konnten nicht sauber erkannt werden. Die Schritte wurden automatisch geschätzt – bitte im Editor prüfen.";
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
      const narration = (tr.words || []).filter((w) => w.start >= start && w.start < end && !MARKERS.includes(norm(w.word))).map((w) => w.word).join(" ").replace(/\s+/g, " ").trim();
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

  // 3) LIVE-AUFBAU: Tutorial FRÜH anlegen, dann pro fertigem Schritt einzeln inserten.
  //    So erscheint der Entwurf schon während der Verarbeitung auf dem Dashboard und
  //    wächst Schritt für Schritt (statt Big-Bang am Ende).
  const tutId = uuid();
  const rows = [];          // erfolgreich eingefügte Step-Rows (für Cleanup + Wiring)
  const branchIds = [];     // eingefügte Branch-IDs (für Cleanup)
  const uploaded = [];      // erfolgreich hochgeladene Bild-Pfade (bei Abbruch entfernen)
  let tutInserted = false;
  try {
    // Tutorial-Hülle + Job-Verknüpfung sofort setzen -> Dashboard-Karte + Crash-Sichtbarkeit.
    const { error: tErr } = await sb.from("tutorials").insert({ id: tutId, account_id: job.account_id, title: job.title || "Anleitung", status: "draft" });
    if (tErr) throw new Error("Tutorial anlegen: " + tErr.message);
    tutInserted = true;
    await sb.from("video_jobs").update({ tutorial_id: tutId, updated_at: new Date().toISOString() }).eq("id", job.id);

    // Schritt-Analyse (KI) PARALLEL in Batches von 3; der eigentliche INSERT danach
    // sequenziell in Positions-Reihenfolge (Live-Reihenfolge + korrektes Branch-Wiring).
    const BATCH = 3;
    for (let base = 0; base < segSteps.length; base += BATCH) {
      const chunk = segSteps.slice(base, base + BATCH);
      // (a) KI-Analyse je Batch parallel. Kaputte Frames -> analyzed=null (Schritt fällt aus).
      const analyzed = await Promise.all(chunk.map(async (seg, k) => {
        const idx = base + k;
        const at = seg.shot;
        const local = path.join(dir, `step_${idx + 1}.jpg`);
        // Schärfsten Frame ziehen (3 Kandidaten); scheitert das, klassischer Einzel-Grab.
        let frame = grabSharpestFrame(videoPath, at, duration, local, dir, idx + 1);
        if (!frame) {
          try {
            sh("ffmpeg", ["-y", "-ss", String(at), "-i", videoPath, "-frames:v", "1", "-q:v", "3", local]);
            if (fs.existsSync(local) && fs.statSync(local).size >= 500) frame = local;
          } catch { /* unten null */ }
        }
        if (!frame) return null;
        const narration = (seg.narration || "").trim();
        // Diff: Schritt-Anfang vs. Screenshot-Moment -> erdet das Highlight (Maus wandert aufs Ziel).
        const diffPath = diffImg(videoPath, seg.tB, at, dir, idx + 1);
        // Nur die an die KI gesendeten Bilder auf 1280px verkleinern; `local` bleibt Original.
        const gridSmall = scaleForVision(gridImg(local));
        const diffSmall = diffPath ? scaleForVision(diffPath) : null;
        const content = [
          { type: "text", text: `Gesprochen: ${narration || "(nichts gesagt – aus dem Bild ableiten)"}` },
          { type: "text", text: "BILD 1 (Screenshot):" },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(gridSmall).toString("base64")}` } },
        ];
        if (diffSmall) {
          content.push({ type: "text", text: "BILD 2 (Differenz vorher/nachher – hell = verändert):" });
          content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(diffSmall).toString("base64")}` } });
        }
        const p = await json("gpt-5.4-mini", [
          { role: "system", content: STEP_SYS },
          { role: "user", content },
        ], 300);
        return { local, videoTime: at, narration, p };
      }));

      // (b) INSERT sequenziell in Reihenfolge -> Live-Aufbau + lineare Branch vom Vorgänger.
      for (const a of analyzed) {
        if (!a) continue;
        const id = uuid();
        const ipath = `${job.account_id}/${tutId}/step_${rows.length + 1}.jpg`;
        // Upload-Fehler NICHT verschlucken: sonst Schritt mit kaputtem Bild-Verweis -> überspringen.
        const { error: upErr } = await sb.storage.from("tutorial-images").upload(ipath, fs.readFileSync(a.local), { contentType: "image/jpeg", upsert: true });
        if (upErr) { console.error("  Bild-Upload fehlgeschlagen, Schritt übersprungen:", upErr.message); continue; }
        uploaded.push(ipath);
        const hl = a.p.highlight && [a.p.highlight.x, a.p.highlight.y, a.p.highlight.w, a.p.highlight.h].every((n) => typeof n === "number" && n >= 0 && n <= 1)
          ? [{ id: uuid(), type: "rect", x: a.p.highlight.x, y: a.p.highlight.y, w: a.p.highlight.w, h: a.p.highlight.h, color: "#3d4ee6", rounded: true }] : [];
        const row = { id, tutorial_id: tutId, title: a.p.title || `Schritt ${rows.length + 1}`, body: mkBody(a.p.body || ""), position: rows.length + 1, is_decision: false, image_path: ipath, image_width: vdim[0] || null, image_height: vdim[1] || null, highlights: hl, video_time: a.videoTime };
        const { error: sErr } = await sb.from("steps").insert(row);
        if (sErr) throw new Error("Schritt anlegen: " + sErr.message);
        const prev = rows[rows.length - 1] || null;
        rows.push(row);
        if (rows.length === 1) {
          // Nach dem 1. Schritt: root_step_id setzen.
          await sb.from("tutorials").update({ root_step_id: id }).eq("id", tutId);
        } else if (prev) {
          // Ab dem 2. Schritt: lineare Branch vom Vorgänger auf diesen Schritt.
          const bId = uuid();
          const { error: bErr } = await sb.from("step_branches").insert({ id: bId, step_id: prev.id, label: null, target_step_id: id, position: 0 });
          if (bErr) throw new Error("Verzweigung anlegen: " + bErr.message);
          branchIds.push(bId);
        }
      }
      // Fortschritt für Dialog + Dashboard-Karte („Schritt X von Y …").
      await sb.from("video_jobs").update({ progress: `Schritt ${rows.length} von ${segSteps.length}`, updated_at: new Date().toISOString() }).eq("id", job.id);
    }
    if (!rows.length) throw new Error("Keine Schritte erkannt (Aufnahme evtl. zu kurz/leer). Bitte erneut aufnehmen.");

    // 4) Titel generieren -> Tutorial-Titel aktualisieren.
    const title = (await json("gpt-5.4-mini", [{ role: "system", content: TITLE_SYS }, { role: "user", content: "Schritte: " + rows.map((r) => r.title).join("; ") + "\nErzählung: " + (tr.text || "").slice(0, 500) }], 60)).title || job.title || "Anleitung";
    await sb.from("tutorials").update({ title }).eq("id", tutId);
    // progress leeren (der Job wird gleich in loop() auf status=done gesetzt).
    await sb.from("video_jobs").update({ progress: null, updated_at: new Date().toISOString() }).eq("id", job.id);
    return { tutId, title, count: rows.length, note };
  } catch (e) {
    // Cleanup: verwaiste Bilder + Branches + Steps + Tutorial entfernen UND tutorial_id nullen,
    // damit kein halbes Tutorial + keine tote Job-Verknüpfung zurückbleibt.
    if (uploaded.length) { try { await sb.storage.from("tutorial-images").remove(uploaded); } catch {} }
    if (tutInserted) {
      if (rows.length) { try { await sb.from("step_branches").delete().in("step_id", rows.map((r) => r.id)); } catch {} }
      try { await sb.from("steps").delete().eq("tutorial_id", tutId); } catch {}
      try { await sb.from("tutorials").delete().eq("id", tutId); } catch {}
      try { await sb.from("video_jobs").update({ tutorial_id: null, progress: null, updated_at: new Date().toISOString() }).eq("id", job.id); } catch {}
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
    } catch (e) {
      // Gerade krumme Aufnahmen brauchen die Normalisierung am nötigsten -> Fehler sichtbar loggen
      // (buildTutorial wirft klar, falls auch das Original nicht lesbar ist).
      console.error(`  Normalisierung fehlgeschlagen, nutze Original: ${String(e?.message || e).slice(0, 200)}`);
    }
    const res = await buildTutorial(job, vpath, tmp);
    console.log(`✓ Job ${job.id} -> Tutorial "${res.title}" (${res.count} Schritte, ${res.tutId})`);
    return res;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Crash-Waise aufräumen: Ein via reapStale requeuter Job kann noch eine tutorial_id von
// einem abgestürzten Lauf tragen. Vor dem Neu-Verarbeiten dieses halbe Teil-Tutorial (samt
// Steps/Branches/Bildern) löschen und tutorial_id nullen — sonst entstehen Doppel-Tutorials.
async function reapOrphanTutorial(job) {
  const oldTutId = job.tutorial_id;
  if (!oldTutId) return;
  console.log(`  ↻ Räume Crash-Waise auf: altes Teil-Tutorial ${oldTutId} von Job ${job.id}.`);
  try {
    const { data: stepRows } = await sb.from("steps").select("id, image_path").eq("tutorial_id", oldTutId);
    const stepIds = (stepRows || []).map((s) => s.id);
    const imgs = (stepRows || []).map((s) => s.image_path).filter(Boolean);
    if (imgs.length) { try { await sb.storage.from("tutorial-images").remove(imgs); } catch {} }
    if (stepIds.length) { try { await sb.from("step_branches").delete().in("step_id", stepIds); } catch {} }
    try { await sb.from("steps").delete().eq("tutorial_id", oldTutId); } catch {}
    try { await sb.from("tutorials").delete().eq("id", oldTutId); } catch {}
  } catch (e) { console.error("  Crash-Waisen-Cleanup-Fehler:", e.message); }
  // tutorial_id am Job nullen, damit der frische Lauf sauber startet.
  try { await sb.from("video_jobs").update({ tutorial_id: null, progress: null, updated_at: new Date().toISOString() }).eq("id", job.id); } catch {}
  job.tutorial_id = null;
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
        // Frisch geclaimte Row nutzen (aktueller DB-Stand); trägt sie noch eine tutorial_id,
        // ist das eine Crash-Waise (requeut via reapStale) -> vor dem Lauf aufräumen.
        const claimedJob = claimed[0];
        try {
          await reapOrphanTutorial(claimedJob);
          const res = await processJob(claimedJob);
          await sb.from("video_jobs").update({ status: "done", tutorial_id: res.tutId, title: res.title, note: res.note ?? null, updated_at: new Date().toISOString() }).eq("id", job.id);
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
