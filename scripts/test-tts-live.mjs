// Live-Test Vorlesen (Welle 14, OpenAI TTS). Nutzt EXAKT den produktiven Kern
// (src/lib/tts-core.ts) mit echten Clients (Supabase-Admin + OpenAI).
// Echter Mini-TTS-Call — Text bewusst kurz halten (Kosten). Cleanup am Ende komplett.
// Nutzung:  node --env-file=.env.local scripts/test-tts-live.mjs
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  ensureStepAudioCore,
  removeTutorialAudioCore,
  stepSpeechText,
  speechHash,
  audioPath,
  PUBLIC_BUCKET,
} from "../src/lib/tts-core.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const openaiKey = process.env.OPENAI_API_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: openaiKey, timeout: 30_000, maxRetries: 1 });

// Client-Adapter mit exakt dem Minimal-Interface, das tts-core erwartet.
const speech = openai;
const cfgBase = { model: "tts-1", voice: "alloy" };

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const bodyDoc = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

const email = `tutax-tts-${Date.now()}@example.com`;
const pw = "Test12345!";
let accountId, userId, tutId, s1;

async function reloadStep(id) {
  return (await admin.from("steps").select("id, title, body, audio_path, audio_hash").eq("id", id).single()).data;
}
async function fileInfo(path) {
  // Storage-Metadaten (updated_at/size) über list() der Datei.
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data } = await admin.storage.from(PUBLIC_BUCKET).list(dir, { search: name });
  return (data ?? []).find((f) => f.name === name) ?? null;
}

try {
  if (!openaiKey) throw new Error("OPENAI_API_KEY fehlt in .env.local");

  const { data: u } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  userId = u.user.id;
  accountId = (await admin.from("account_members").select("account_id").eq("user_id", userId)).data[0].account_id;

  // Öffentliches, veröffentlichtes Mini-Tutorial mit 1 Schritt.
  tutId = (await admin.from("tutorials").insert({
    account_id: accountId, title: "Vorlese-Test", status: "published", visibility: "public", slug: `tts-test-${Date.now()}`,
  }).select("id").single()).data.id;
  s1 = (await admin.from("steps").insert({
    tutorial_id: tutId, title: "Hallo", body: bodyDoc("Kurzer Text."), position: 1,
  }).select("id").single()).data.id;

  const cfg = { ...cfgBase, accountId, tutorialId: tutId };

  // --- Reine Helfer prüfen ---
  const text = stepSpeechText({ title: "Hallo", body: bodyDoc("Kurzer Text.") });
  ok(text === "Hallo. Kurzer Text.", `stepSpeechText: Titel + Body ("${text}")`);
  ok(speechHash(text).length === 32 && speechHash(text) === speechHash(text), "speechHash: stabil, 32 Zeichen");

  // --- (a) ensureStepAudio erzeugt MP3 + setzt audio_path/hash ---
  const r1 = await ensureStepAudioCore(admin, speech, cfg, await reloadStep(s1));
  ok(r1 === "created", "(a) erster Aufruf -> created");
  let step = await reloadStep(s1);
  const expectPath = audioPath(accountId, tutId, s1);
  ok(step.audio_path === expectPath, `(a) audio_path gesetzt (${step.audio_path})`);
  ok(step.audio_hash === speechHash(text), "(a) audio_hash = Hash des Sprech-Texts");
  const info1 = await fileInfo(expectPath);
  ok(!!info1, "(a) MP3 liegt im public Bucket");

  // --- (f) MP3-URL öffentlich abrufbar (HTTP 200 + audio Content-Type) ---
  const publicUrl = `${url}/storage/v1/object/public/${PUBLIC_BUCKET}/${expectPath}`;
  const resp = await fetch(publicUrl);
  const ct = resp.headers.get("content-type") ?? "";
  ok(resp.status === 200, `(f) öffentliche MP3-URL erreichbar (HTTP ${resp.status})`);
  ok(ct.includes("audio") || ct.includes("mpeg"), `(f) Content-Type ist Audio (${ct})`);

  // --- (b) zweiter Aufruf mit gleichem Text = NO-OP (kein neuer Upload) ---
  const r2 = await ensureStepAudioCore(admin, speech, cfg, await reloadStep(s1));
  ok(r2 === "skipped", "(b) zweiter Aufruf (gleicher Text) -> skipped (Cache-Treffer)");
  const info2 = await fileInfo(expectPath);
  // NO-OP: kein neuer Upload -> updated_at unverändert.
  ok(info1 && info2 && info1.updated_at === info2.updated_at, "(b) Datei NICHT neu hochgeladen (updated_at unverändert)");

  // --- (c) Textänderung -> neuer Hash, Datei ersetzt ---
  await admin.from("steps").update({ title: "Hallo", body: bodyDoc("Ein anderer, längerer Text jetzt.") }).eq("id", s1);
  const r3 = await ensureStepAudioCore(admin, speech, cfg, await reloadStep(s1));
  ok(r3 === "created", "(c) nach Textänderung -> created (neu erzeugt)");
  step = await reloadStep(s1);
  const newText = stepSpeechText({ title: "Hallo", body: bodyDoc("Ein anderer, längerer Text jetzt.") });
  ok(step.audio_hash === speechHash(newText) && step.audio_hash !== speechHash(text), "(c) neuer Hash gespeichert");
  const info3 = await fileInfo(expectPath);
  ok(info3 && info1 && info3.updated_at !== info1.updated_at, "(c) Datei ersetzt (updated_at geändert)");

  // --- (d) leerer Text -> kein Audio + vorhandenes entfernt ---
  await admin.from("steps").update({ title: null, body: null }).eq("id", s1);
  const r4 = await ensureStepAudioCore(admin, speech, cfg, await reloadStep(s1));
  ok(r4 === "removed", "(d) leerer Sprech-Text -> removed");
  step = await reloadStep(s1);
  ok(step.audio_path === null && step.audio_hash === null, "(d) Spalten genullt");
  ok((await fileInfo(expectPath)) === null, "(d) MP3 aus public Bucket entfernt");

  // --- (e) removeTutorialAudio räumt ab ---
  // Erst wieder Audio erzeugen, dann tutorial-weit entfernen.
  await admin.from("steps").update({ title: "Hallo", body: bodyDoc("Kurzer Text.") }).eq("id", s1);
  await ensureStepAudioCore(admin, speech, cfg, await reloadStep(s1));
  ok(!!(await fileInfo(expectPath)), "(e) Vorbereitung: Audio erneut erzeugt");
  await removeTutorialAudioCore(admin, tutId);
  step = await reloadStep(s1);
  ok(step.audio_path === null && step.audio_hash === null, "(e) removeTutorialAudio: Spalten genullt");
  ok((await fileInfo(expectPath)) === null, "(e) removeTutorialAudio: MP3 entfernt");
} catch (e) {
  ok(false, "Fehler: " + (e?.message ?? e));
} finally {
  // Komplettes Cleanup (auch bei Teilfehler).
  try { await admin.storage.from(PUBLIC_BUCKET).remove([audioPath(accountId, tutId, s1)]); } catch {}
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Vorlesen (TTS) live verifiziert.");
process.exitCode = failed ? 1 : 0;
