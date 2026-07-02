// Steply Video-Worker (Hetzner): pollt video_jobs, macht aus Video -> Klick-Tutorial.
// Pipeline: ffmpeg (Audio + Keyframes) + Whisper (Transkript) + Vision (Schritte/Highlights/Titel).
// Env (.env): SUPABASE_URL, SUPABASE_SECRET_KEY, OPENAI_API_KEY
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// Welle 17: Struktur-Pass (gesprochene Fallunterscheidung -> Verzweigung) + Wiring-Planer.
import { analyzeStructure, planWiring } from "./structure.mjs";
// Welle 18: Video-Export (Tutorial -> MP4). Reine Render-Bausteine + Orchestrierung.
import { renderVideo } from "./render.mjs";

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

// Szenen-Erkennung (Fallback ohne Ton): ffmpeg-scdet-Pass sucht harte Bildschnitte
// (neuer Screen). `-f null -` schreibt NICHTS nach stdout, alle pts_time-Zeilen landen
// auf STDERR und der Prozess endet mit Exit 0. execFileSync gibt aber IMMER nur stdout
// zurück (stderr nur am Fehler-Objekt) -> hier spawnSync, das stdout UND stderr liefert,
// unabhängig vom Exit-Code. Liefert sortierte, entzerrte Szenen-Zeiten (max 12, min 1.2s).
function detectScenes(videoPath, duration) {
  let stderr = "";
  try {
    const r = spawnSync("ffmpeg", ["-i", videoPath, "-vf", "select='gt(scene,0.22)',showinfo", "-f", "null", "-"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    stderr = String(r.stderr || "");
  } catch { stderr = ""; }
  const times = [];
  const re = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
  let m;
  while ((m = re.exec(stderr))) {
    const t = parseFloat(m[1]);
    if (isFinite(t) && t > 0.5 && t < duration - 0.3) times.push(t);
  }
  times.sort((a, b) => a - b);
  const scenes = [];
  for (const t of times) {
    if (!scenes.length || t - scenes[scenes.length - 1] >= 1.2) scenes.push(t);
    if (scenes.length >= 12) break;
  }
  return scenes;
}

// Welle 17: den (reinen) Wiring-Plan tatsächlich in der DB anwenden. `rows` sind die bereits
// linear eingefügten Steps (mit .segIndex). Reihenfolge des Umbaus ist bewusst konsistent:
//   1) betroffene lineare Ausgangs-Branches löschen,
//   2) neue (gelabelte Ast- + Rejoin-)Branches einfügen,
//   3) Frage-Schritte auf is_decision=true setzen.
// Ein Fehler in irgendeinem Schritt wirft -> der Aufrufer stellt die lineare Kette wieder her.
async function applyStructure(tutId, rows, plan) {
  const wiring = planWiring(rows.map((r) => ({ id: r.id, segIndex: r.segIndex })), plan);
  if (!wiring.branches.length && !wiring.decisionStepIds.length) return; // nichts zu tun
  if (wiring.skipped) console.log(`  Struktur-Umbau: ${wiring.skipped} Frage(n) übersprungen (Frame fehlte).`);

  // 1) Lineare Ausgangs-Branches der umzuverdrahtenden Schritte löschen.
  if (wiring.removeBranchesFromStepIds.length) {
    const { error } = await sb.from("step_branches").delete().in("step_id", wiring.removeBranchesFromStepIds);
    if (error) throw new Error("Alte Branches löschen: " + error.message);
  }
  // 2) Neue Branches (mit IDs) einfügen.
  if (wiring.branches.length) {
    const toInsert = wiring.branches.map((b) => ({
      id: uuid(), step_id: b.step_id, label: b.label, color: b.color, target_step_id: b.target_step_id, position: b.position,
    }));
    const { error } = await sb.from("step_branches").insert(toInsert);
    if (error) throw new Error("Neue Branches anlegen: " + error.message);
  }
  // 3) Frage-Schritte als Entscheidung markieren.
  if (wiring.decisionStepIds.length) {
    const { error } = await sb.from("steps").update({ is_decision: true }).in("id", wiring.decisionStepIds);
    if (error) throw new Error("is_decision setzen: " + error.message);
  }
  console.log(`  ✓ Struktur-Umbau: ${wiring.decisionStepIds.length} Frage(n), ${wiring.branches.length} Branch(es) verdrahtet.`);
}

// Welle 17 (Fallback): die rein LINEARE Verkabelung wiederherstellen, falls ein Struktur-Umbau
// mittendrin scheitert. Alle vorhandenen Branches der Tutorial-Schritte wegräumen, is_decision
// überall zurücksetzen und die Schritte in Row-Reihenfolge wieder linear verketten.
async function rewireLinear(tutId, rows) {
  const ids = rows.map((r) => r.id);
  if (ids.length) { try { await sb.from("step_branches").delete().in("step_id", ids); } catch {} }
  try { await sb.from("steps").update({ is_decision: false }).eq("tutorial_id", tutId); } catch {}
  const linear = [];
  for (let i = 0; i < rows.length - 1; i++) {
    linear.push({ id: uuid(), step_id: rows[i].id, label: null, color: null, target_step_id: rows[i + 1].id, position: 0 });
  }
  if (linear.length) {
    const { error } = await sb.from("step_branches").insert(linear);
    if (error) throw new Error("Lineare Kette neu anlegen: " + error.message);
  }
  await sb.from("tutorials").update({ root_step_id: rows[0].id }).eq("id", tutId);
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
  //    Optional bei Klick-Modus zusätzlich: { clickHl (fixe Highlight-Box aus dem Klick),
  //    clickLabel (Extension-Label für den Vision-Prompt) }.
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-zäöüß]/g, "");
  // Marker-Wörter ("Schnitt"/"cut") — früh deklariert, weil narrationBetween sie schon
  // im Klick-Modus (vor dem Marker-Block) zum Herausfiltern nutzt.
  const MARKERS = ["schnitt", "cut"];
  // Narration im Zeitfenster [from, to) aus Wort-Zeitstempeln (bestehendes Muster).
  const narrationBetween = (from, to) => (tr.words || [])
    .filter((w) => w.start >= from && w.start < to && !MARKERS.includes(norm(w.word)))
    .map((w) => w.word).join(" ").replace(/\s+/g, " ").trim();
  const clamp01 = (n) => Math.min(Math.max(n, 0), 1);
  let note = null;
  let segSteps = [];

  // (0) KLICK-MODUS (HÖCHSTE PRIORITÄT, vor "Schnitt"): Die Browser-Extension (Welle 8c)
  //     liefert echte Klick-Telemetrie in job.clicks: [{ t, x:0..1, y:0..1, label? }].
  //     Daraus werden Schrittgrenzen + Highlight-Boxen EXAKT bestimmt (kein Vision-Raten).
  const rawClicks = Array.isArray(job.clicks)
    ? job.clicks.filter((c) => c && typeof c.t === "number" && isFinite(c.t) && c.t >= 0 && c.t <= duration
        && typeof c.x === "number" && typeof c.y === "number").sort((a, b) => a.t - b.t)
    : [];
  // Doppel-/Folgeklicks (<0.8s Abstand zum Vorgänger) zu EINEM Schritt zusammenfassen —
  // der LETZTE Klick der Gruppe zählt (dort ist die UI-Reaktion vollständig).
  const clicks = [];
  for (const c of rawClicks) {
    if (clicks.length && c.t - clicks[clicks.length - 1].t < 0.8) clicks[clicks.length - 1] = c;
    else clicks.push(c);
  }
  if (clicks.length >= 1) {
    for (let i = 0; i < clicks.length; i++) {
      const c = clicks[i];
      // Schritt i endet ~0.6s nach dem Klick (geclampt, aber nicht über den nächsten Klick hinaus).
      const nextT = i + 1 < clicks.length ? clicks[i + 1].t : duration;
      const stepEnd = Math.min(c.t + 0.6, nextT, duration);
      const shot = Math.min(Math.max(c.t + 0.45, 0.1), duration - 0.1); // UI hat reagiert
      const tB = Math.min(Math.max(c.t - 0.3, 0), shot - 0.3);           // 0.3s VOR dem Klick (für den Diff)
      const start = i === 0 ? 0 : clicks[i - 1].t;
      const narration = narrationBetween(start, stepEnd);
      // Highlight DIREKT aus dem Klick: 0.14 x 0.09 Box, zentriert auf (x,y), geclampt.
      const w = 0.14, h = 0.09;
      const hx = clamp01(clamp01(c.x) - w / 2), hy = clamp01(clamp01(c.y) - h / 2);
      const clickHl = { x: hx, y: hy, w: Math.min(w, 1 - hx), h: Math.min(h, 1 - hy) };
      const clickLabel = typeof c.label === "string" && c.label.trim() ? c.label.trim().slice(0, 120) : null;
      segSteps.push({ shot, tB, narration, clickHl, clickLabel });
    }
  }

  // (A) MARKER-MODUS: Das Wort "Schnitt" markiert das ENDE eines Schritts (Regie-Logik:
  //     erst Schritt machen + Maus aufs Ziel, dann "Schnitt" sagen). Schnitt genau dort,
  //     Screenshot KURZ DAVOR (Maus auf dem Ziel) — kein Sekunden-Zählen nötig.
  const cuts = (tr.words || []).filter((w) => MARKERS.includes(norm(w.word))).map((w) => +w.start).sort((a, b) => a - b);
  // Nutzer hat "Schnitt" gesprochen, aber es kamen keine Marker an (fehlende Wort-Zeitstempel
  // von Whisper) -> ehrlicher Hinweis, statt still auf den schwächeren Fallback zu gehen.
  //    (Im Klick-Modus KEIN Schnitt-Hinweis setzen — Klicks sind die Schrittgrenze.)
  const saidSchnitt = /schnitt/i.test(tr.text || "") || segs.some((s) => /schnitt/i.test(s.text));
  if (!segSteps.length && saidSchnitt && !cuts.length)
    note = "Du hast \"Schnitt\" gesagt, aber die Schnitt-Marker konnten nicht sauber erkannt werden. Die Schritte wurden automatisch geschätzt – bitte im Editor prüfen.";
  if (!segSteps.length && cuts.length >= 1) {
    const ends = [...cuts];
    if (duration - ends[ends.length - 1] > 1.5) ends.push(duration); // letzter Schritt ohne "Schnitt" am Ende
    for (let i = 0; i < ends.length; i++) {
      const start = i === 0 ? 0 : ends[i - 1];
      const end = ends[i];
      if (end - start < 0.8) continue; // zu kurz -> kein eigener Schritt
      const shot = Math.min(Math.max(end - 0.4, start + 0.2), duration - 0.1);
      const tB = Math.min(Math.max(start + 0.2, 0), shot - 0.4);
      segSteps.push({ shot, tB, narration: narrationBetween(start, end) });
    }
  }
  // (B) FALLBACK ohne "Schnitt": KI segmentiert aus dem Transkript; Screenshot ~2s nach Ansage.
  if (!segSteps.length) {
    const tsText = segs.map((s) => `[${s.start}s] ${s.text}`).join("\n") || tr.text || "";
    let llm = (await json("gpt-5.4-mini", [{ role:"system", content: SEG_SYS }, { role:"user", content:`Erzählung:\n${tsText}\n\nVideolänge: ${duration.toFixed(0)}s` }], 700)).steps || [];
    llm = llm.filter((s) => typeof s.t === "number").sort((a,b)=>a.t-b.t);
    if (llm.length >= 2) {
      for (let i = 0; i < llm.length; i++) {
        const nextT = i + 1 < llm.length ? llm[i + 1].t : duration;
        const shot = Math.min(Math.max(llm[i].t + 2.0, 0.4), Math.max(Math.min(nextT - 0.8, duration - 0.1), 0.4));
        const tB = Math.min(Math.max(llm[i].t - 0.6, 0), shot - 0.4);
        segSteps.push({ shot, tB, narration: (llm[i].narration || "").trim() });
      }
    }
  }
  // (C) SZENEN-ERKENNUNG (REVIEW I): weder Klicks noch "Schnitt" noch brauchbare
  //     LLM-Segmentierung -> ffmpeg-scdet-Pass findet harte Bildschnitte (neuer Screen)
  //     als Schrittgrenzen. Erst wenn AUCH das < 2 Treffer hat -> Gleichverteilung (D).
  if (!segSteps.length) {
    const scenes = detectScenes(videoPath, duration);
    if (scenes.length >= 2) {
      // Wie Marker-Modus: jeder Szenenwechsel ENDET einen Schritt (Screenshot kurz davor).
      const ends = [...scenes];
      if (duration - ends[ends.length - 1] > 1.5) ends.push(duration);
      for (let i = 0; i < ends.length; i++) {
        const start = i === 0 ? 0 : ends[i - 1];
        const end = ends[i];
        if (end - start < 1.0) continue;
        const shot = Math.min(Math.max(end - 0.4, start + 0.2), duration - 0.1);
        const tB = Math.min(Math.max(start + 0.2, 0), shot - 0.4);
        segSteps.push({ shot, tB, narration: narrationBetween(start, end) });
      }
    }
  }
  // (D) LETZTER FALLBACK: Gleichverteilung, wenn nichts anderes griff.
  if (segSteps.length < 2) {
    segSteps = [];
    const n = Math.min(6, Math.max(2, Math.round(duration / 6)));
    for (let i = 0; i < n; i++) {
      const t = +(i * (duration / n)).toFixed(1);
      const nextT = i + 1 < n ? (i + 1) * (duration / n) : duration;
      const shot = Math.min(Math.max(t + 2.0, 0.4), Math.max(Math.min(nextT - 0.8, duration - 0.1), 0.4));
      const tB = Math.min(Math.max(t - 0.6, 0), shot - 0.4);
      segSteps.push({ shot, tB, narration: narrationBetween(t, nextT) });
    }
  }
  segSteps = segSteps.slice(0, 14);
  // Jedem Segment einen STABILEN Index geben (Array-Position). Der Struktur-Pass und der
  // Wiring-Planer referenzieren Segmente über diesen Index; nicht jedes Segment ergibt
  // zwingend eine eingefügte Row (kaputter Frame), darum wird er später auf die Rows gemappt.
  segSteps.forEach((s, i) => { s.segIndex = i; });

  // 3a) STRUKTUR-PASS (Welle 17): EIN LLM-Call auf den Segment-Texten. Findet AUSGESPROCHENE
  //     Fallunterscheidungen ("wenn … dann … ansonsten", "zwei Möglichkeiten") und liefert
  //     einen Verzweigungs-Plan. KONSERVATIV: im Zweifel/ohne Transkript -> linear (plan.mode
  //     "linear"). Läuft VOR dem Live-Aufbau, wirkt aber erst als finaler Umbau-Pass danach —
  //     so bleibt der sichtbare Live-Aufbau ("Schritt X/Y") unverändert, das Tutorial kann sich
  //     am Ende aber sichtbar "umorganisieren" (aus linear wird eine Frage mit Ästen).
  //     Ohne Transkript (stummes Video) haben die Segmente keine narration -> kein Struktur-Pass.
  const hasNarration = segSteps.some((s) => (s.narration || "").trim().length > 0);
  let structurePlan = { mode: "linear", questions: [] };
  if (hasNarration) {
    try {
      structurePlan = await analyzeStructure(
        segSteps.map((s) => ({ index: s.segIndex, narration: s.narration || "" })),
        (messages, max) => json("gpt-5.4-mini", messages, max),
        { log: (m) => console.log("  " + m) },
      );
      if (structurePlan.mode === "branched")
        console.log(`  Struktur-Pass: ${structurePlan.questions.length} Frage(n) erkannt -> Umbau nach dem Live-Aufbau.`);
    } catch (e) {
      // Jede Unklarheit/Fehler -> linear (kein Crash). Struktur ist optional.
      console.error("  Struktur-Pass fehlgeschlagen -> linear:", String(e?.message || e).slice(0, 160));
      structurePlan = { mode: "linear", questions: [] };
    }
  }

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
        ];
        // Klick-Modus: der KI mitteilen, dass an einer bekannten Stelle geklickt wurde
        // (hilft Titel/Body). Ihr highlight-Feld wird beim Insert trotzdem ignoriert.
        if (seg.clickHl) {
          content.push({ type: "text", text: `Hinweis: Der Nutzer hat an der markierten Stelle geklickt${seg.clickLabel ? ` (Element: "${seg.clickLabel}")` : ""}.` });
        }
        content.push({ type: "text", text: "BILD 1 (Screenshot):" });
        content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(gridSmall).toString("base64")}` } });
        if (diffSmall) {
          content.push({ type: "text", text: "BILD 2 (Differenz vorher/nachher – hell = verändert):" });
          content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(diffSmall).toString("base64")}` } });
        }
        const p = await json("gpt-5.4-mini", [
          { role: "system", content: STEP_SYS },
          { role: "user", content },
        ], 300);
        return { local, videoTime: at, narration, p, clickHl: seg.clickHl || null, segIndex: seg.segIndex };
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
        // Klick-Modus hat VORRANG: existieren Klick-Koordinaten, das highlight-Feld der
        // Vision-KI IGNORIEREN und die feste Box aus dem echten Klick verwenden.
        const hl = a.clickHl
          ? [{ id: uuid(), type: "rect", x: a.clickHl.x, y: a.clickHl.y, w: a.clickHl.w, h: a.clickHl.h, color: "#3d4ee6", rounded: true }]
          : a.p.highlight && [a.p.highlight.x, a.p.highlight.y, a.p.highlight.w, a.p.highlight.h].every((n) => typeof n === "number" && n >= 0 && n <= 1)
          ? [{ id: uuid(), type: "rect", x: a.p.highlight.x, y: a.p.highlight.y, w: a.p.highlight.w, h: a.p.highlight.h, color: "#3d4ee6", rounded: true }] : [];
        const row = { id, tutorial_id: tutId, title: a.p.title || `Schritt ${rows.length + 1}`, body: mkBody(a.p.body || ""), position: rows.length + 1, is_decision: false, image_path: ipath, image_width: vdim[0] || null, image_height: vdim[1] || null, highlights: hl, video_time: a.videoTime };
        const { error: sErr } = await sb.from("steps").insert(row);
        if (sErr) throw new Error("Schritt anlegen: " + sErr.message);
        const prev = rows[rows.length - 1] || null;
        // segIndex NUR im Speicher mitführen (keine steps-Spalte) -> Wiring mappt Segment->Row.
        rows.push({ ...row, segIndex: a.segIndex });
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

    // 3b) STRUKTUR-UMBAU (Welle 17, FINALER PASS): Das Tutorial ist jetzt linear verkabelt
    //     und sichtbar aufgebaut. Wenn der Struktur-Pass eine echte Verzweigung fand, wird
    //     hier UMORGANISIERT: Frage-Schritt -> is_decision, lineare Weiter-Branches der
    //     betroffenen Schritte gelöscht und durch gelabelte Ast-Branches + Wiedereinmündung
    //     (Rejoin) ersetzt. Das Tutorial kann sich dadurch am Ende sichtbar umbauen (aus einer
    //     linearen Kette wird eine Frage mit Ja/Nein-Ästen).
    //     ROBUSTHEIT: Der Umbau geschieht in EINEM konsistenten Schub: erst ALLE zu ersetzenden
    //     linearen Branches löschen, dann ALLE neuen Branches einfügen, dann is_decision setzen.
    //     Scheitert irgendetwas dabei, wird der Umbau rückgängig gemacht und das (funktionierende)
    //     LINEARE Tutorial per Neuaufbau der linearen Kette wiederhergestellt — lieber linear als
    //     ein halb umgebautes, kaputtes Tutorial. Der Fehler ist dann NICHT fatal (Job bleibt done).
    if (structurePlan.mode === "branched") {
      try {
        await applyStructure(tutId, rows, structurePlan);
      } catch (e) {
        console.error("  Struktur-Umbau fehlgeschlagen -> lineare Kette wiederhergestellt:", String(e?.message || e).slice(0, 200));
        try { await rewireLinear(tutId, rows); } catch (e2) { console.error("  Lineare Wiederherstellung fehlgeschlagen:", String(e2?.message || e2).slice(0, 160)); }
      }
    }

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

// ============================================================
// Welle 18: RENDER-JOB (Tutorial -> MP4). Läuft parallel zur create-Pipeline,
// unterschieden per video_jobs.kind. Alle reinen Render-Bausteine leben in render.mjs.
// ============================================================

// Font-Pfade (env FONT_PATH übersteuerbar). Auf Hetzner/Debian: dejavu-Paket.
const FONT_REGULAR = process.env.FONT_PATH || "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_BOLD = (process.env.FONT_PATH || "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
  .replace(/DejaVuSans\.ttf$/, "DejaVuSans-Bold.ttf");
const PUBLIC_BUCKET = "tutorial-images-public"; // Bilder + Vorlese-Audios liegen hier
const VIDEO_BUCKET = "tutorial-videos"; // Quell-Videos (create) + Render-Ergebnisse

// ffprobe-Dauer einer Mediendatei (Sekunden). Wirft bei Unlesbarkeit.
function probeDuration(file) {
  const out = sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]).trim();
  const d = parseFloat(out);
  if (!isFinite(d)) throw new Error("Dauer nicht lesbar: " + file);
  return d;
}

// ffmpeg mit langem Timeout über spawnSync (Render-Kommandos können groß/lang sein).
// stderr wird bei Fehler mitgegeben (für klare Diagnose im Log).
function runFfmpeg(args) {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0) {
    const err = String(r.stderr || r.error?.message || "").split("\n").slice(-8).join("\n");
    throw new Error(`ffmpeg fehlgeschlagen (exit ${r.status}): ${err.slice(0, 400)}`);
  }
  return r;
}

// Datei aus einem Bucket herunterladen -> lokaler Pfad (oder null bei Fehler/kein Pfad).
async function downloadTo(bucket, storagePath, dst) {
  if (!storagePath) return null;
  const { data, error } = await sb.storage.from(bucket).download(storagePath);
  if (error || !data) return null;
  fs.writeFileSync(dst, Buffer.from(await data.arrayBuffer()));
  return dst;
}

// Render-Job verarbeiten: Tutorial-Daten laden, Assets herunterladen, MP4 bauen, hochladen.
async function processRenderJob(job) {
  // Font-Check ganz früh — ohne Font schlägt drawtext fehl. Klar failen.
  if (!fs.existsSync(FONT_REGULAR)) {
    throw new Error(`Schriftdatei fehlt: ${FONT_REGULAR}. Auf dem Server 'fonts-dejavu-core' installieren oder FONT_PATH setzen.`);
  }
  const fontBold = fs.existsSync(FONT_BOLD) ? FONT_BOLD : FONT_REGULAR;

  // sharp + qrcode erst hier laden (Worker-Env). sharp wird von der App mitgebracht
  // (src/lib/redact.ts). ANPASSEN bei deploy: liegt der Worker isoliert ohne App-
  // node_modules, muss sharp dort verfügbar sein (siehe DEPLOY.md / Report).
  let sharp, qrcode;
  try {
    sharp = (await import("sharp")).default;
    qrcode = (await import("qrcode")).default;
  } catch (e) {
    throw new Error("Render-Abhängigkeit fehlt (sharp/qrcode): " + String(e?.message || e));
  }

  const style = job.render_style === "screencast" ? "screencast" : "classic";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "render-"));
  const uploadedPath = `${job.account_id}/renders/${job.tutorial_id}-${style}.mp4`;
  try {
    // 1) Tutorial + Konto + Steps + Branches + Theme laden.
    const { data: tutorial, error: tErr } = await sb
      .from("tutorials")
      .select("id, account_id, title, slug, status, visibility, root_step_id")
      .eq("id", job.tutorial_id)
      .single();
    if (tErr || !tutorial) throw new Error("Tutorial nicht gefunden: " + (tErr?.message || ""));
    if (tutorial.status !== "published" || tutorial.visibility !== "public")
      throw new Error("Tutorial ist nicht öffentlich veröffentlicht.");

    const { data: account } = await sb.from("accounts").select("id, slug").eq("id", tutorial.account_id).single();
    const { data: steps } = await sb
      .from("steps")
      .select("id, title, body, image_path, highlights, position, is_decision, video_time, audio_path")
      .eq("tutorial_id", tutorial.id)
      .order("position");
    const stepIds = (steps || []).map((s) => s.id);
    const { data: branches } = stepIds.length
      ? await sb.from("step_branches").select("step_id, label, color, target_step_id, position").in("step_id", stepIds)
      : { data: [] };
    const { data: theme } = await sb
      .from("themes")
      .select("mode, tokens, ai_tokens, extreme_tokens, logo_path, ai_logo_path, extreme_logo_path")
      .eq("account_id", tutorial.account_id)
      .maybeSingle();

    if (!steps || !steps.length) throw new Error("Tutorial hat keine Schritte.");

    // caption = gesprochener Text (Plain-Text aus dem Tiptap-Body des Schritts).
    const stepsForPlan = steps.map((s) => ({ ...s, caption: bodyToText(s.body) }));

    // 2) Assets herunterladen: Schritt-Bilder + Audios (public Bucket), Logo, Quell-Video.
    await sb.from("video_jobs").update({ progress: "Lädt Medien …", updated_at: new Date().toISOString() }).eq("id", job.id);
    const imageByStep = {}, audioByStep = {};
    for (const s of steps) {
      if (s.image_path) {
        const dst = path.join(tmp, `img_${s.id}.img`);
        if (await downloadTo(PUBLIC_BUCKET, s.image_path, dst)) imageByStep[s.id] = dst;
      }
      if (s.audio_path) {
        const dst = path.join(tmp, `aud_${s.id}.mp3`);
        if (await downloadTo(PUBLIC_BUCKET, s.audio_path, dst)) audioByStep[s.id] = dst;
      }
    }
    const brand = resolveBrandLogo(theme);
    let logoPath = null;
    if (brand.logoPath) {
      const dst = path.join(tmp, "logo.img");
      logoPath = await downloadTo(PUBLIC_BUCKET, brand.logoPath, dst);
    }

    // Screencast: Quell-Video + Klicks des ursprünglichen create-Jobs holen (falls vorhanden).
    let sourceVideoPath = null, clicks = [];
    if (style === "screencast") {
      const { data: createJob } = await sb
        .from("video_jobs")
        .select("video_path, clicks")
        .eq("tutorial_id", tutorial.id)
        .eq("kind", "create")
        .not("video_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (createJob?.video_path) {
        const dst = path.join(tmp, "source.mp4");
        sourceVideoPath = await downloadTo(VIDEO_BUCKET, createJob.video_path, dst);
        clicks = Array.isArray(createJob.clicks) ? createJob.clicks : [];
      }
    }

    // 3) Rendern (reine Bausteine in render.mjs; deps = echte I/O).
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/[/*\s]+$/, "") || "https://steply.app"; // ANPASSEN falls andere Domain
    const { outFile, chaptersText } = await renderVideo(
      {
        runFfmpeg,
        ffprobeDuration: async (f) => probeDuration(f),
        sharp,
        qrcode,
        log: (m) => console.log("  " + m),
      },
      {
        tutorial,
        steps: stepsForPlan,
        branches: branches || [],
        rootStepId: tutorial.root_step_id,
        theme,
        appUrl,
        accountSlug: account?.slug || "",
        files: { imageByStep, audioByStep, logoPath, sourceVideoPath, clicks },
      },
      {
        dir: tmp,
        format: "16:9", // 9:16 + Musikbett = Folgewelle (Format ist Parameter)
        style,
        fontFile: FONT_REGULAR,
        fontBold,
        fps: 30,
        onProgress: async (msg) => {
          await sb.from("video_jobs").update({ progress: msg, updated_at: new Date().toISOString() }).eq("id", job.id);
        },
      },
    );

    // 4) Ergebnis hochladen (upsert) + output_path/chapters setzen.
    await sb.from("video_jobs").update({ progress: "Lädt Video hoch …", updated_at: new Date().toISOString() }).eq("id", job.id);
    const buf = fs.readFileSync(outFile);
    const { error: upErr } = await sb.storage.from(VIDEO_BUCKET).upload(uploadedPath, buf, { contentType: "video/mp4", upsert: true });
    if (upErr) throw new Error("Video-Upload: " + upErr.message);
    const dur = probeDuration(outFile);
    console.log(`✓ Render ${job.id} -> ${uploadedPath} (${dur.toFixed(1)}s, ${(buf.length / 1e6).toFixed(1)} MB)`);
    return { outputPath: uploadedPath, chapters: chaptersText };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Plain-Text aus einem Tiptap-JSON-Body (für eingebrannte Untertitel).
function bodyToText(body) {
  if (!body || typeof body !== "object") return "";
  const parts = [];
  const walk = (n) => {
    if (!n) return;
    if (typeof n.text === "string") parts.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(body);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// Logo-Pfad aus der themes-Zeile (gleiche resolveTheme-Auswahl wie render.mjs.resolveBrand).
function resolveBrandLogo(theme) {
  const mode = theme?.mode === "extreme" ? "extreme" : theme?.mode === "ai" ? "ai" : "manual";
  const logoPath =
    mode === "extreme"
      ? (theme?.extreme_logo_path ?? theme?.ai_logo_path ?? theme?.logo_path)
      : mode === "ai"
        ? (theme?.ai_logo_path ?? theme?.logo_path)
        : theme?.logo_path;
  return { logoPath: logoPath ?? null };
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

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// „Fertig"-Mail (env-gated): nach status=done die Owner des Kontos benachrichtigen.
// Braucht RESEND_API_KEY + INVITE_FROM_EMAIL + NEXT_PUBLIC_APP_URL — auf Hetzner ggf.
// noch nicht gesetzt -> still überspringen. Fehler sind NIE fatal (try/catch + log).
async function sendDoneEmail(job, tutId, title) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_FROM_EMAIL;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/[/*\s]+$/, "");
  if (!key || !from || !appUrl) return; // nicht konfiguriert -> still skip
  try {
    // Owner-User-IDs des Kontos -> deren E-Mails via Admin-API.
    const { data: owners } = await sb.from("account_members").select("user_id").eq("account_id", job.account_id).eq("role", "owner");
    const ids = (owners || []).map((o) => o.user_id).filter(Boolean);
    if (!ids.length) return;
    const users = await Promise.all(ids.map((id) => sb.auth.admin.getUserById(id)));
    const to = users.map((u) => u.data?.user?.email).filter((e) => typeof e === "string" && e.includes("@"));
    if (!to.length) return;
    const link = `${appUrl}/app/tutorials/${tutId}`;
    const safeTitle = escapeHtml(title || "Anleitung");
    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#101524">
    <h2 style="margin:0 0 8px">Ihr Tutorial-Entwurf ist fertig</h2>
    <p style="color:#3b4254;line-height:1.55">Der Entwurf „<b>${safeTitle}</b>" wurde aus Ihrem Video erstellt und wartet im Builder auf den Feinschliff.</p>
    <p style="margin:24px 0"><a href="${link}" style="background:#3d4ee6;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600;display:inline-block">Im Builder öffnen</a></p>
    <p style="color:#6b7280;font-size:12px;word-break:break-all">Falls der Button nicht geht, diesen Link öffnen:<br>${link}</p>
  </div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: `Ihr Tutorial-Entwurf „${title || "Anleitung"}" ist fertig`, html }),
    });
    if (!res.ok) console.error("  Fertig-Mail: Resend antwortete", res.status);
    else console.log(`  ✉ Fertig-Mail an ${to.length} Inhaber gesendet.`);
  } catch (e) { console.error("  Fertig-Mail-Fehler (nicht fatal):", String(e?.message || e).slice(0, 160)); }
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
          if (claimedJob.kind === "render") {
            // Welle 18: Tutorial -> MP4. Bestehende create-Pipeline bleibt unberührt.
            const res = await processRenderJob(claimedJob);
            await sb.from("video_jobs").update({ status: "done", output_path: res.outputPath, chapters: res.chapters ?? null, progress: null, updated_at: new Date().toISOString() }).eq("id", job.id);
          } else {
            await reapOrphanTutorial(claimedJob);
            const res = await processJob(claimedJob);
            await sb.from("video_jobs").update({ status: "done", tutorial_id: res.tutId, title: res.title, note: res.note ?? null, updated_at: new Date().toISOString() }).eq("id", job.id);
            await sendDoneEmail(claimedJob, res.tutId, res.title); // env-gated, nie fatal
          }
        } catch (e) {
          const raw = String(e?.message || "Unbekannter Fehler");
          console.error("✗ Job", job.id, raw);
          const friendly = claimedJob.kind === "render"
            ? raw.slice(0, 300) // Render-Fehler klar durchreichen (Font/sharp/ffmpeg)
            : /Command failed|ffmpeg|ffprobe/i.test(raw)
              ? "Video konnte nicht verarbeitet werden (evtl. unvollständige Aufnahme). Bitte erneut aufnehmen."
              : raw.slice(0, 300);
          await sb.from("video_jobs").update({ status: "failed", error: friendly, progress: null, updated_at: new Date().toISOString() }).eq("id", job.id);
        }
      }
    }
  } catch (e) { console.error("loop-Fehler:", e.message); }
  setTimeout(loop, ran ? 1000 : 5000);
}

console.log("🎬 Steply Video-Worker gestartet — pollt video_jobs.");
loop();
