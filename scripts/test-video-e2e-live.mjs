// ECHTER Ende-zu-Ende-Test „Video → Anleitung“ gegen live (App + Hetzner-Video-Server):
//  1) kurzes Bildschirm-Video erzeugen: 3 Folien (Menü → Einstellungen → Speichern) mit
//     gesprochener Anleitung (OpenAI-Stimme) inkl. Marker-Wort „Schnitt“ je Schritt,
//  2) hochladen wie die Erweiterung (handshake → PUT → complete, Pro-Konto per Verbindungs-Code),
//  3) warten, bis der Video-Server die Anleitung gebaut hat,
//  4) prüfen: Entwurf mit Schritten, Titel/Texte, Bilder im Speicher.
// Kosten: einige Cent (Sprache + Whisper + Bildanalyse). Räumt Konto und Dateien auf.
//
// Nutzung:  TEST_BASE=https://tutax-ivory.vercel.app node --env-file=.env.local scripts/test-video-e2e-live.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.TEST_BASE || "https://tutax-ivory.vercel.app").replace(/\/$/, "");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
  if (!cond) failed++;
};
const stamp = Date.now().toString(36);
const tmp = mkdtempSync(path.join(os.tmpdir(), "steply-video-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SLIDES = [
  { say: "Zuerst öffnen Sie oben links das Menü. Schnitt.", title: "Übersicht", hint: "☰ Menü", hx: 40, hy: 30 },
  { say: "Dann klicken Sie im Menü auf Einstellungen. Schnitt.", title: "Menü", hint: "⚙ Einstellungen", hx: 60, hy: 200 },
  { say: "Zum Schluss speichern Sie mit dem grünen Knopf Speichern. Schnitt.", title: "Einstellungen", hint: "Speichern", hx: 980, hy: 600, green: true },
];

function slideSvg(s) {
  const btnFill = s.green ? "#18a999" : "#ef6a4e";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <rect width="1280" height="720" fill="#fdf9f3"/>
  <rect x="0" y="0" width="1280" height="90" fill="#ffffff" stroke="#f0e7d9" stroke-width="2"/>
  <text x="640" y="58" font-family="Arial" font-size="34" font-weight="bold" fill="#33291f" text-anchor="middle">Muster-Software · ${s.title}</text>
  <rect x="${s.hx}" y="${s.hy}" width="260" height="70" rx="14" fill="${btnFill}"/>
  <text x="${s.hx + 130}" y="${s.hy + 46}" font-family="Arial" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">${s.hint}</text>
  <text x="640" y="400" font-family="Arial" font-size="26" fill="#6b5e4b" text-anchor="middle">Beispiel-Oberfläche für den Video-Test</text>
</svg>`;
}

async function tts(text, file) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "alloy", input: text, response_format: "mp3" }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}
const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "pipe" });

async function makeVideo() {
  const segs = [];
  for (const [i, s] of SLIDES.entries()) {
    const png = path.join(tmp, `s${i}.png`);
    const mp3 = path.join(tmp, `s${i}.mp3`);
    const seg = path.join(tmp, `s${i}.webm`);
    await sharp(Buffer.from(slideSvg(s))).png().toFile(png);
    await tts(s.say, mp3);
    ff(["-loop", "1", "-i", png, "-i", mp3, "-af", "apad=pad_dur=1", "-shortest", "-r", "10",
      "-c:v", "libvpx", "-b:v", "600k", "-pix_fmt", "yuv420p", "-c:a", "libopus", seg]);
    segs.push(seg);
  }
  const list = path.join(tmp, "list.txt");
  writeFileSync(list, segs.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
  const out = path.join(tmp, "aufnahme.webm");
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
  return out;
}

async function purge(prefix) {
  for (const bucket of ["tutorial-images", "tutorial-images-public", "tutorial-videos"]) {
    const walk = async (p) => {
      const { data } = await admin.storage.from(bucket).list(p, { limit: 1000 });
      const files = [];
      for (const e of data ?? []) {
        const full = `${p}/${e.name}`;
        if (e.id) files.push(full);
        else files.push(...(await walk(full)));
      }
      return files;
    };
    const files = await walk(prefix);
    if (files.length) await admin.storage.from(bucket).remove(files);
  }
}

let uid = null;
let acc = null;
try {
  console.log("1. Video erzeugen");
  const video = await makeVideo();
  const size = readFileSync(video).length;
  ok(size > 20_000, `Aufnahme erzeugt (${Math.round(size / 1024)} KB, ${SLIDES.length} Folien mit Sprache)`);

  console.log("2. Pro-Konto + Verbindungs-Code, Hochladen wie die Erweiterung");
  const email = `video-e2e-${stamp}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({ email, password: "Probe12345!", email_confirm: true });
  uid = u.user.id;
  const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", uid).single();
  acc = m.account_id;
  await admin.from("accounts").update({ plan: "pro", onboarded: true, name: "Video-Test GmbH" }).eq("id", acc);
  const token = crypto.randomUUID();
  const { error: tErr } = await admin.from("recorder_tokens").insert({ token, account_id: acc, user_id: uid });
  if (tErr) throw tErr;

  const hs = await (await fetch(`${BASE}/api/recorder/handshake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  })).json();
  ok(!!hs.uploadUrl && !!hs.path, `Handshake liefert Upload-Adresse${hs.error ? ` — ${hs.error}` : ""}`);
  const put = await fetch(hs.uploadUrl, { method: "PUT", headers: { "Content-Type": "video/webm" }, body: readFileSync(video) });
  ok(put.ok, `Video hochgeladen (HTTP ${put.status})`);
  const done = await (await fetch(`${BASE}/api/recorder/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, path: hs.path, title: "Einstellungen speichern" }),
  })).json();
  ok(!!done.jobId, `Auftrag eingereiht${done.error ? ` — ${done.error}` : ""}`);

  console.log("3. Video-Server verarbeitet (max. 12 min)");
  const t0 = Date.now();
  let job = null;
  let lastProgress = "";
  while (Date.now() - t0 < 12 * 60_000) {
    const { data } = await admin.from("video_jobs").select("status, tutorial_id, error, progress, note").eq("id", done.jobId).single();
    job = data;
    if (data.progress && data.progress !== lastProgress) {
      lastProgress = data.progress;
      console.log(`    … ${Math.round((Date.now() - t0) / 1000)} s: ${data.progress}`);
    }
    if (data.status === "done" || data.status === "failed") break;
    await sleep(5000);
  }
  ok(job?.status === "done", `Verarbeitung fertig nach ${Math.round((Date.now() - t0) / 1000)} s (Status: ${job?.status}${job?.error ? `, Fehler: ${job.error}` : ""})`);

  if (job?.tutorial_id) {
    console.log("4. Ergebnis prüfen");
    const { data: tut } = await admin.from("tutorials").select("title, status, account_id, root_step_id").eq("id", job.tutorial_id).single();
    ok(tut.account_id === acc && tut.status === "draft", `Entwurf im richtigen Konto („${tut.title}“)`);
    const { data: steps } = await admin.from("steps").select("title, body, image_path, highlights, position").eq("tutorial_id", job.tutorial_id).order("position");
    const plain = (b) => JSON.stringify(b ?? "").match(/"text":"([^"]*)"/g)?.map((x) => x.slice(8, -1)).join(" ") ?? "";
    console.log(steps.map((s, i) => `    ${i + 1}. ${s.title} — ${plain(s.body).slice(0, 140)}`).join("\n"));
    if (job.note) console.log(`    Hinweis des Video-Servers: ${job.note}`);
    ok(steps.length >= 2 && steps.length <= 5, `${steps.length} Schritte (erwartet ~${SLIDES.length})`);
    ok(steps.every((s) => (s.title ?? "").trim().length > 2), "jeder Schritt hat einen Titel");
    ok(steps.filter((s) => s.image_path).length >= 2, "Schritte haben Screenshots");
    const withImg = steps.find((s) => s.image_path);
    if (withImg) {
      const { data: blob } = await admin.storage.from("tutorial-images").download(withImg.image_path);
      ok(!!blob && blob.size > 1000, `Screenshot im Speicher (${blob ? Math.round(blob.size / 1024) : 0} KB)`);
    }
    const text = steps.map((s) => `${s.title} ${JSON.stringify(s.body ?? "")}`).join(" ").toLowerCase();
    ok(/men[üu]/.test(text) && /einstellung/.test(text) && /speicher/.test(text), "Inhalt passt zum Gesprochenen (Menü, Einstellungen, Speichern)");
    ok(!!tut.root_step_id, "Startschritt gesetzt");
  }
} finally {
  if (acc) {
    await purge(acc).catch(() => {});
    await admin.from("accounts").delete().eq("id", acc);
  }
  if (uid) await admin.auth.admin.deleteUser(uid).catch(() => {});
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\n✗ ${failed} Prüfung(en) fehlgeschlagen` : "\n✓ Video → Anleitung funktioniert Ende-zu-Ende");
process.exit(failed ? 1 : 0);
