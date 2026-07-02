// Live-Test Vorlesen (Welle 14 + Welle 19: Sprechtext-Pass + Provider-Abstraktion).
// Nutzt EXAKT den produktiven Kern (src/lib/tts-core.ts) mit echten Clients
// (Supabase-Admin + OpenAI). Echter Mini-TTS- + Mini-Chat-Call — Texte bewusst kurz
// halten (Kosten). Cleanup am Ende komplett.
//
// Der Sprechtext-Pass (speechScript) + die synthesize-Fabrik leben in src/lib/tts.ts
// (server-only, hier nicht importierbar) — darum sind sie unten schlank NACHGEBAUT
// (gleiches Muster wie test-translate-live.mjs / test-kb-import-live.mjs).
//
// ElevenLabs: OHNE ELEVENLABS_API_KEY nur der Codepfad per Mock-fetch (Request-Form);
// echter Call NUR falls der Key in .env.local steht.
//
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
  SPEECH_SCRIPT_VERSION,
} from "../src/lib/tts-core.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const openaiKey = process.env.OPENAI_API_KEY;
const elevenKey = process.env.ELEVENLABS_API_KEY ?? "";
const admin = createClient(url, secret, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: openaiKey, timeout: 30_000, maxRetries: 1 });

// --- Provider: OpenAI-synthesize (Text -> MP3-Buffer), wie src/lib/tts.ts ---
const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const OPENAI_VOICE = "onyx";
const CHAT_MODEL = "gpt-5.4-mini";
const openaiSynthesize = async (text) => {
  const res = await openai.audio.speech.create({
    model: OPENAI_TTS_MODEL, voice: OPENAI_VOICE, input: text, response_format: "mp3",
    instructions: "Sprich klares, natuerliches Deutsch. Freundlich, ruhig und professionell.",
  });
  return Buffer.from(await res.arrayBuffer());
};

// --- Sprechtext-Pass (nachgebaut aus src/lib/tts.ts::speechScript) ---
const SPEECH_HARD_CAP = 900;
async function speechScript(sourceText, client = openai) {
  const source = (sourceText ?? "").trim();
  if (!source) return source;
  try {
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content:
          "Sie sind Sprecher-Redakteur für eine freundliche Software-Anleitung. Aus dem " +
          "Bildschirmtext eines EINZELNEN Anleitungsschritts formen Sie einen natürlich " +
          "klingenden, flüssig vorlesbaren Sprechertext auf Deutsch (Sie-Form). Sie erfinden " +
          "NICHTS dazu. Namen von Schaltflächen und Menüs übernehmen Sie WÖRTLICH in " +
          "Anführungszeichen. WICHTIG: Schreiben Sie den Text NIE wörtlich ab — " +
          "formulieren Sie ihn IMMER hörbar um, so wie man es einem Menschen nebenbei " +
          "erklären würde. Keine Emojis, keine Sonderzeichen, reiner Fließtext." },
        { role: "user", content:
          "Bildschirmtext:\n---\n" + source + "\n---\n\n" +
          'Antworten Sie AUSSCHLIESSLICH als JSON: { "speech": "der Sprechertext" }.' },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 700,
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const raw = typeof parsed.speech === "string" ? parsed.speech.trim() : "";
    if (!raw) return source;
    const softCap = Math.min(SPEECH_HARD_CAP, Math.max(220, Math.ceil(source.length * 1.6)));
    if (raw.length <= softCap) return raw;
    const cut = raw.slice(0, softCap);
    const se = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    if (se > softCap * 0.5) return cut.slice(0, se + 1);
    const sp = cut.lastIndexOf(" ");
    return sp > 0 ? cut.slice(0, sp) + "." : cut;
  } catch {
    return source; // Fehler/Timeout -> Fallback auf Quelltext (blockiert nie).
  }
}

const cfgBase = { provider: "openai", model: OPENAI_TTS_MODEL, voice: OPENAI_VOICE };

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
  const h = (t) => speechHash(t, cfgBase.model, cfgBase.voice, cfgBase.provider);
  ok(h(text).length === 32 && h(text) === h(text), "speechHash: stabil, 32 Zeichen");
  // Hash bezieht Anbieter + scriptVersion ein.
  ok(speechHash(text, cfgBase.model, cfgBase.voice, "openai") !== speechHash(text, cfgBase.model, cfgBase.voice, "elevenlabs"),
    "speechHash: Anbieterwechsel -> anderer Hash");
  ok(speechHash(text, cfgBase.model, cfgBase.voice, "openai", 1) !== speechHash(text, cfgBase.model, cfgBase.voice, "openai", 2),
    `speechHash: scriptVersion Teil des Hashes (aktuell v${SPEECH_SCRIPT_VERSION})`);

  // --- (a) ensureStepAudio erzeugt MP3 + setzt audio_path/hash ---
  const r1 = await ensureStepAudioCore(admin, openaiSynthesize, cfg, await reloadStep(s1));
  ok(r1 === "created", "(a) erster Aufruf -> created");
  let step = await reloadStep(s1);
  const expectPath = audioPath(accountId, tutId, s1);
  ok(step.audio_path === expectPath, `(a) audio_path gesetzt (${step.audio_path})`);
  ok(step.audio_hash === h(text), "(a) audio_hash = Hash des QUELLtexts");
  const info1 = await fileInfo(expectPath);
  ok(!!info1, "(a) MP3 liegt im public Bucket");

  // --- (f) MP3-URL öffentlich abrufbar ---
  const publicUrl = `${url}/storage/v1/object/public/${PUBLIC_BUCKET}/${expectPath}`;
  const resp = await fetch(publicUrl);
  const ct = resp.headers.get("content-type") ?? "";
  ok(resp.status === 200, `(f) öffentliche MP3-URL erreichbar (HTTP ${resp.status})`);
  ok(ct.includes("audio") || ct.includes("mpeg"), `(f) Content-Type ist Audio (${ct})`);

  // --- (b) zweiter Aufruf mit gleichem Text = NO-OP ---
  const r2 = await ensureStepAudioCore(admin, openaiSynthesize, cfg, await reloadStep(s1));
  ok(r2 === "skipped", "(b) zweiter Aufruf (gleicher Text) -> skipped (Cache-Treffer)");
  const info2 = await fileInfo(expectPath);
  ok(info1 && info2 && info1.updated_at === info2.updated_at, "(b) Datei NICHT neu hochgeladen (updated_at unverändert)");

  // --- (c) Textänderung -> neuer Hash, Datei ersetzt ---
  await admin.from("steps").update({ title: "Hallo", body: bodyDoc("Ein anderer, längerer Text jetzt.") }).eq("id", s1);
  const r3 = await ensureStepAudioCore(admin, openaiSynthesize, cfg, await reloadStep(s1));
  ok(r3 === "created", "(c) nach Textänderung -> created (neu erzeugt)");
  step = await reloadStep(s1);
  const newText = stepSpeechText({ title: "Hallo", body: bodyDoc("Ein anderer, längerer Text jetzt.") });
  ok(step.audio_hash === h(newText) && step.audio_hash !== h(text), "(c) neuer Hash gespeichert");
  const info3 = await fileInfo(expectPath);
  ok(info3 && info1 && info3.updated_at !== info1.updated_at, "(c) Datei ersetzt (updated_at geändert)");

  // --- (d) leerer Text -> kein Audio + vorhandenes entfernt ---
  await admin.from("steps").update({ title: null, body: null }).eq("id", s1);
  const r4 = await ensureStepAudioCore(admin, openaiSynthesize, cfg, await reloadStep(s1));
  ok(r4 === "removed", "(d) leerer Sprech-Text -> removed");
  step = await reloadStep(s1);
  ok(step.audio_path === null && step.audio_hash === null, "(d) Spalten genullt");
  ok((await fileInfo(expectPath)) === null, "(d) MP3 aus public Bucket entfernt");

  // --- (e) removeTutorialAudio räumt ab ---
  await admin.from("steps").update({ title: "Hallo", body: bodyDoc("Kurzer Text.") }).eq("id", s1);
  await ensureStepAudioCore(admin, openaiSynthesize, cfg, await reloadStep(s1));
  ok(!!(await fileInfo(expectPath)), "(e) Vorbereitung: Audio erneut erzeugt");
  await removeTutorialAudioCore(admin, tutId);
  step = await reloadStep(s1);
  ok(step.audio_path === null && step.audio_hash === null, "(e) removeTutorialAudio: Spalten genullt");
  ok((await fileInfo(expectPath)) === null, "(e) removeTutorialAudio: MP3 entfernt");

  // --- (g) speechScript: echter Mini-Call liefert flüssigeren Text ≠ Quelltext ---
  //   Quelltext enthält einen wörtlichen Schaltflächen-Namen, der im Sprechertext auftauchen muss.
  const gSource = 'Öffnen Sie zuerst die Einstellungen. Wählen Sie dort den Reiter Sicherheit aus. Klicken Sie anschließend auf die Schaltfläche "Weiter", um fortzufahren. Prüfen Sie am Ende, ob die Änderung gespeichert wurde.';
  const gSpeech = await speechScript(gSource);
  ok(gSpeech && gSpeech !== gSource, `(g) speechScript: Text ≠ Quelltext (len ${gSpeech.length} vs ${gSource.length})`);
  ok(gSpeech.includes("Weiter"), `(g) speechScript: wörtlicher Schaltflächen-Name "Weiter" enthalten`);
  ok(gSpeech.length <= Math.min(SPEECH_HARD_CAP, Math.max(220, Math.ceil(gSource.length * 1.6))), "(g) speechScript: innerhalb Längen-Kappung");

  // --- (h) Fallback: kaputter LLM-Call (Mock) -> Quelltext ---
  const brokenClient = { chat: { completions: { create: async () => { throw new Error("boom"); } } } };
  const hSource = "Öffnen Sie das Menü.";
  const hOut = await speechScript(hSource, brokenClient);
  ok(hOut === hSource, "(h) Fallback: kaputter LLM-Call -> exakt der Quelltext");

  // --- (i) Hash stabil bei gleichem Quelltext trotz unterschiedlichem Override ---
  //   Zweimal ensureStepAudioCore, gleicher Quelltext, VERSCHIEDENE Overrides
  //   -> zweiter Lauf muss "skipped" sein (Hash läuft über Quelltext, nicht Override).
  await admin.from("steps").update({ title: "Speichern", body: bodyDoc("Bitte speichern Sie.") }).eq("id", s1);
  const iRes1 = await ensureStepAudioCore(admin, openaiSynthesize, cfg, await reloadStep(s1), "Override A: ganz anderer Sprechertext.");
  const iRes2 = await ensureStepAudioCore(admin, openaiSynthesize, cfg, await reloadStep(s1), "Override B: noch ein anderer Text!");
  ok(iRes1 === "created" && iRes2 === "skipped", `(i) gleicher Quelltext, versch. Override -> zweiter Lauf skipped (${iRes1}/${iRes2})`);
  //   auch ein Lazy-Resolver, der NICHT aufgerufen werden darf, weil Cache greift:
  let lazyCalled = false;
  const iRes3 = await ensureStepAudioCore(admin, openaiSynthesize, cfg, await reloadStep(s1), async () => { lazyCalled = true; return "X"; });
  ok(iRes3 === "skipped" && !lazyCalled, "(i) Cache-Treffer: Lazy-Sprechtext-Resolver NICHT aufgerufen (kein LLM-Call)");
  await removeTutorialAudioCore(admin, tutId);

  // --- ElevenLabs: Request-Form per Mock-fetch (URL/Header/Body) ---
  {
    const captured = {};
    const mockFetch = async (u, init) => {
      captured.url = u; captured.init = init;
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, text: async () => "" };
    };
    // synthesize-Fabrik von src/lib/tts.ts nachgebaut (ElevenLabs-Zweig) mit injiziertem fetch.
    const EL_VOICE = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
    const EL_MODEL = "eleven_multilingual_v2";
    const elSynthesize = async (text, key) => {
      const res = await mockFetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}?output_format=mp3_44100_128`,
        { method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" },
          body: JSON.stringify({ text, model_id: EL_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }) },
      );
      if (!res.ok) throw new Error(`ElevenLabs TTS HTTP ${res.status}: ${await res.text()}`);
      return Buffer.from(await res.arrayBuffer());
    };
    const buf = await elSynthesize("Guten Tag.", "dummy-key");
    ok(Buffer.isBuffer(buf) && buf.length === 3, "ElevenLabs: Mock liefert MP3-Buffer");
    ok(captured.url === `https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}?output_format=mp3_44100_128`,
      "ElevenLabs: URL korrekt (voiceId + output_format=mp3_44100_128)");
    ok(captured.init.method === "POST", "ElevenLabs: Methode POST");
    ok(captured.init.headers["xi-api-key"] === "dummy-key", "ElevenLabs: Header xi-api-key gesetzt");
    ok(captured.init.headers["content-type"] === "application/json", "ElevenLabs: Header content-type json");
    const body = JSON.parse(captured.init.body);
    ok(body.text === "Guten Tag." && body.model_id === "eleven_multilingual_v2", "ElevenLabs: Body text + model_id korrekt");
    ok(body.voice_settings.stability === 0.5 && body.voice_settings.similarity_boost === 0.75, "ElevenLabs: voice_settings korrekt");
  }

  // Echter ElevenLabs-Call NUR, wenn ein Key vorhanden ist.
  if (elevenKey) {
    try {
      const EL_VOICE = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}?output_format=mp3_44100_128`, {
        method: "POST", headers: { "xi-api-key": elevenKey, "content-type": "application/json" },
        body: JSON.stringify({ text: "Guten Tag.", model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
        signal: controller.signal,
      });
      clearTimeout(t);
      const b = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
      ok(res.ok && b && b.length > 100, `ElevenLabs ECHT: MP3 erhalten (HTTP ${res.status}, ${b?.length ?? 0} Bytes)`);
    } catch (e) {
      ok(false, "ElevenLabs ECHT: " + (e?.message ?? e));
    }
  } else {
    console.log("ℹ ElevenLabs ECHT: übersprungen (kein ELEVENLABS_API_KEY in .env.local) — Codepfad nur per Mock verifiziert.");
  }
} catch (e) {
  ok(false, "Fehler: " + (e?.message ?? e));
} finally {
  try { await admin.storage.from(PUBLIC_BUCKET).remove([audioPath(accountId, tutId, s1)]); } catch {}
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Vorlesen (TTS v2) live verifiziert.");
process.exitCode = failed ? 1 : 0;
