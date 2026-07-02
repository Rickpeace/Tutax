// SPIEGEL-HINWEIS: Der lokale speechScript-Spiegel entspricht noch v1 (mit Titel).
// Produktion (src/lib/tts.ts) nutzt seit 02.07. v2 (Titel nur Kontext, TTS-Regeln) —
// bei grossem Backfill vorher angleichen.
// Vorlesen-Backfill: erzeugt TTS-Audios für ALLE bereits veröffentlichten, öffentlichen
// Tutorials eines Kontos (normalerweise passiert das beim Publish; für Bestands-Tutorials
// einmal nachziehen). Nutzt exakt den produktiven Kern (src/lib/tts-core.ts) + Hash-Cache:
// erneutes Ausführen kostet nichts, solange sich Texte/Anbieter/Stimme nicht ändern.
//
// Welle 19: gleiche Provider-Logik wie src/lib/tts.ts (ElevenLabs, wenn ELEVENLABS_API_KEY
// gesetzt; sonst OpenAI) + Sprechtext-Pass. tts.ts ist „server-only" und daher hier NICHT
// importierbar — die kleine synthesize-Fabrik + speechScript sind darum BEWUSST dupliziert.
//
// Nutzung:  node --experimental-strip-types --env-file=.env.local scripts/backfill-tts.mjs <account_slug>
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { ensureStepAudioCore, stepSpeechText, SPEECH_SCRIPT_VERSION } from "../src/lib/tts-core.ts";

const slug = process.argv[2];
if (!slug) { console.error("Aufruf: … scripts/backfill-tts.mjs <account_slug>"); process.exit(1); }

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 });

// --- Provider-Wahl (env-basiert, wie src/lib/ai.ts / src/lib/tts.ts) ---
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY ?? "";
// ANPASSEN: Default „Rachel" (multilingual) — per ELEVENLABS_VOICE_ID überschreibbar.
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID ?? "TUKJhQmz3RPYBNAgC5A1";
const ELEVEN_MODEL = "eleven_multilingual_v2";
const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const OPENAI_VOICE = "onyx";
const OPENAI_INSTRUCTIONS =
  "Sprich klares, natuerliches Deutsch. Freundlich, ruhig und professionell, wie eine gute Software-Anleitung.";
const CHAT_MODEL = "gpt-5.4-mini"; // wie AI.models.chat

const useEleven = ELEVEN_KEY.length > 0;

// synthesize(text) => Buffer — dieselbe Form wie in src/lib/tts.ts (dort ausführlich kommentiert).
async function synthesize(text) {
  if (useEleven) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": ELEVEN_KEY, "content-type": "application/json" },
          body: JSON.stringify({ text, model_id: ELEVEN_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
          signal: controller.signal,
        },
      );
      if (!res.ok) throw new Error(`ElevenLabs TTS HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 500)}`);
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  }
  const res = await openai.audio.speech.create({
    model: OPENAI_TTS_MODEL, voice: OPENAI_VOICE, input: text, response_format: "mp3", instructions: OPENAI_INSTRUCTIONS,
  });
  return Buffer.from(await res.arrayBuffer());
}

// Sprechtext-Pass (dupliziert aus src/lib/tts.ts, gekürzt): Quelltext -> natürlicher
// Sprechertext. Fehler/leer -> Quelltext (blockiert nie).
const SPEECH_HARD_CAP = 900;
async function speechScript(sourceText) {
  const source = (sourceText ?? "").trim();
  if (!source) return source;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content:
          "Sie sind Sprecher-Redakteur für eine freundliche Software-Anleitung. Aus dem " +
          "Bildschirmtext eines EINZELNEN Anleitungsschritts formen Sie einen natürlich " +
          "klingenden, flüssig vorlesbaren Sprechertext auf Deutsch (deutsches Deutsch, " +
          "Sie-Form). Sie erfinden NICHTS dazu. Namen von Schaltflächen und Menüs übernehmen " +
          "Sie WÖRTLICH in Anführungszeichen. Keine Emojis, keine Sonderzeichen, reiner Fließtext." },
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
    const softCap = Math.min(SPEECH_HARD_CAP, Math.ceil(source.length * 1.6));
    return raw.length > softCap ? raw.slice(0, softCap) : raw;
  } catch (e) {
    console.error("  (Sprechtext-Pass fehlgeschlagen, nutze Quelltext):", e instanceof Error ? e.message : e);
    return source;
  }
}

const cfgBase = useEleven
  ? { provider: "elevenlabs", model: ELEVEN_MODEL, voice: ELEVEN_VOICE }
  : { provider: "openai", model: OPENAI_TTS_MODEL, voice: OPENAI_VOICE };

const { data: acc } = await admin.from("accounts").select("id, plan").eq("slug", slug).single();
if (!acc) { console.error("Konto nicht gefunden:", slug); process.exit(1); }
if (acc.plan !== "business") {
  console.error(`Konto '${slug}' ist '${acc.plan}' — Vorlesen ist Business. Erst Tarif setzen.`);
  process.exit(1);
}

console.log(`Anbieter: ${useEleven ? "ElevenLabs" : "OpenAI"} · Sprechtext-Version v${SPEECH_SCRIPT_VERSION}`);

const { data: tuts } = await admin
  .from("tutorials")
  .select("id, title")
  .eq("account_id", acc.id)
  .eq("status", "published")
  .eq("visibility", "public");

let made = 0, skipped = 0, failed = 0;
for (const tut of tuts ?? []) {
  const { data: steps } = await admin
    .from("steps")
    .select("id, title, body, audio_path, audio_hash")
    .eq("tutorial_id", tut.id)
    .order("position");
  for (const step of steps ?? []) {
    try {
      const res = await ensureStepAudioCore(
        admin,
        synthesize,
        { ...cfgBase, accountId: acc.id, tutorialId: tut.id },
        step,
        // Lazy: Sprechtext-Pass nur bei echtem Cache-Miss (kein LLM-Call bei „skipped").
        () => speechScript(stepSpeechText(step)),
      );
      if (res === "created") made++;
      else skipped++;
    } catch (e) {
      failed++;
      console.error(`  ✗ ${tut.title} / ${step.title ?? step.id}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`✓ ${tut.title}`);
}
console.log(`\nFertig: ${made} erzeugt, ${skipped} übersprungen (Cache/leer), ${failed} Fehler.`);
