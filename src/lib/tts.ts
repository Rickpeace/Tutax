import "server-only";
import { openai } from "@/lib/openai";
import { AI, aiConfigured, ttsProvider } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBusiness } from "@/lib/plan";
import {
  ensureStepAudioCore,
  removeStepAudioCore,
  removeTutorialAudioCore,
  stepSpeechText,
  type Synthesize,
} from "@/lib/tts-core";

/**
 * Vorlesen (Welle 14, Sprechtext-Pass + Provider-Abstraktion Welle 19) — server-only
 * Verdrahtung des reinen Kerns (tts-core.ts) mit den echten Clients (OpenAI /
 * ElevenLabs + Supabase-Admin) und der zentralen KI-Config (ai.ts).
 *
 * Erzeugung passiert NUR im Publish-Lebenszyklus (siehe app/actions.ts +
 * tutorials/[id]/actions.ts), nie im Viewer. Modell/Stimme/Kosten zentral in ai.ts.
 */

// ---------------------------------------------------------------------------
// Sprechtext-Pass (Welle 19): aus Titel+Bildschirmtext einen natürlichen,
// flüssigen SPRECHERtext formen. Wirkt sofort — auch mit OpenAI-TTS.
// ---------------------------------------------------------------------------

const SPEECH_SYSTEM =
  "Sie sind Sprecher-Redakteur für eine freundliche Software-Anleitung. Aus dem " +
  "Bildschirmtext eines EINZELNEN Anleitungsschritts formen Sie einen natürlich " +
  "klingenden, flüssig vorlesbaren Sprechertext auf Deutsch (deutsches Deutsch, " +
  "Sie-Form). Sie erfinden NICHTS dazu: keine Fakten, keine Schaltflächen, keine " +
  "Menüs, keine Schritte, die nicht im Text stehen. Namen von Schaltflächen, Menüs " +
  "und Feldern übernehmen Sie WÖRTLICH und setzen sie in Anführungszeichen. Sie " +
  "dürfen leicht ausführlicher und wärmer formulieren und natürliche Überleitungen " +
  "verwenden (etwa „Als Nächstes …“ oder „Jetzt wird es einfach: …“), aber niemals " +
  "den Sinn verändern. Keine Emojis, keine Sonderzeichen, keine Aufzählungszeichen " +
  "— reiner Fließtext zum Vorlesen.";

function buildSpeechUser(sourceText: string): string {
  return (
    "Hier ist der Bildschirmtext des Schritts (Titel und Erklärung):\n" +
    "---\n" +
    sourceText +
    "\n---\n\n" +
    "Formulieren Sie daraus EINEN zusammenhängenden Sprechertext. Antworten Sie " +
    'AUSSCHLIESSLICH als JSON-Objekt: { "speech": "der Sprechertext" }. ' +
    "Kein Markdown, kein Text vor oder nach dem JSON."
  );
}

// Der Sprechertext darf leicht ausführlicher sein als die Quelle, aber nicht ausufern:
// max. ~1,6× Quelllänge, hart bei 900 Zeichen gekappt (Kosten + Aufmerksamkeit).
const SPEECH_HARD_CAP = 900;

/**
 * Aus dem QUELLtext (Titel + Bildschirmtext eines Schritts) per EINEM Chat-LLM-Call
 * einen natürlichen Sprechertext erzeugen (JSON-Mode, Muster aus lib/kb-import.ts).
 *
 * Fehler/Timeout/leere Antwort ⇒ Fallback auf den Quelltext (blockiert NIE das Publish).
 * Kappung: max. ~1,6× Quelllänge, hart bei SPEECH_HARD_CAP Zeichen.
 */
export async function speechScript(sourceText: string): Promise<string> {
  const source = sourceText.trim();
  if (!source || !aiConfigured()) return source;

  try {
    const completion = await openai().chat.completions.create({
      model: AI.models.chat,
      messages: [
        { role: "system", content: SPEECH_SYSTEM },
        { role: "user", content: buildSpeechUser(source) },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 700,
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      speech?: unknown;
    };
    const raw = typeof parsed.speech === "string" ? parsed.speech.trim() : "";
    if (!raw) return source;
    // Weiche Grenze relativ zur Quelle + harte Grenze — je kleiner, desto besser.
    const softCap = Math.min(SPEECH_HARD_CAP, Math.ceil(source.length * 1.6));
    return raw.length > softCap ? raw.slice(0, softCap) : raw;
  } catch (e) {
    console.error("[tts] Sprechtext-Pass fehlgeschlagen, nutze Quelltext:", e instanceof Error ? e.message : e);
    return source;
  }
}

// ---------------------------------------------------------------------------
// Provider-Abstraktion (Welle 19): synthesize(text) => MP3-Buffer.
//   ElevenLabs, wenn ELEVENLABS_API_KEY gesetzt — sonst OpenAI wie bisher.
// ---------------------------------------------------------------------------

/** ElevenLabs REST: Text -> MP3 (mp3_44100_128). 30s-Timeout via AbortController. */
async function elevenLabsSynthesize(text: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${AI.elevenLabsVoiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": AI.elevenLabsKey, "content-type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: AI.elevenLabsModel,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`ElevenLabs TTS HTTP ${res.status}: ${detail.slice(0, 500)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/** OpenAI TTS (gpt-4o-mini-tts + onyx + instructions): Text -> MP3. */
async function openaiSynthesize(text: string): Promise<Buffer> {
  const res = await openai().audio.speech.create({
    model: AI.models.tts,
    voice: AI.ttsVoice,
    input: text,
    response_format: "mp3",
    // Stil-Anweisung (nur gpt-4o-mini-tts versteht das Feld) — tts-1 würde es ablehnen.
    ...(AI.ttsInstructions ? { instructions: AI.ttsInstructions } : {}),
  } as Parameters<ReturnType<typeof openai>["audio"]["speech"]["create"]>[0]);
  return Buffer.from(await res.arrayBuffer());
}

/** Aktive Synthese-Funktion nach env-Wahl (ElevenLabs, wenn Key gesetzt; sonst OpenAI). */
const synthesize = (): Synthesize =>
  ttsProvider() === "elevenlabs" ? elevenLabsSynthesize : openaiSynthesize;

/** Provider/Modell/Stimme für den Hash — muss zur synthesize-Wahl passen. */
function providerCfg(): { provider: string; model: string; voice: string } {
  return ttsProvider() === "elevenlabs"
    ? { provider: "elevenlabs", model: AI.elevenLabsModel, voice: AI.elevenLabsVoiceId }
    : { provider: "openai", model: AI.models.tts, voice: AI.ttsVoice };
}

/**
 * Audio für ALLE Schritte eines Tutorials sicherstellen (Publish-Pfad). Sequenziell;
 * ein Fehler je Schritt wird geloggt, die anderen laufen weiter (der Publish selbst
 * darf nie an TTS scheitern). No-op ohne OPENAI_API_KEY.
 */
export async function ensureTutorialAudio(accountId: string, tutorialId: string): Promise<void> {
  if (!aiConfigured()) return;
  const admin = createAdminClient();
  // Vorlesen ist ein Business-Feature — leiser No-op darunter (kein Publish-Fehler).
  const { data: acc } = await admin.from("accounts").select("plan").eq("id", accountId).maybeSingle();
  if (!isBusiness(acc ?? {})) return;
  const { data: steps } = await admin
    .from("steps")
    .select("id, title, body, audio_path, audio_hash")
    .eq("tutorial_id", tutorialId);
  const cfg = { ...providerCfg(), accountId, tutorialId };
  const fn = synthesize();
  for (const step of steps ?? []) {
    try {
      // Lazy-Resolver: der Sprechtext-Pass (LLM-Call) läuft NUR bei echtem Cache-Miss.
      await ensureStepAudioCore(admin, fn, cfg, step, () =>
        speechScript(stepSpeechText(step)),
      );
    } catch (e) {
      console.error(
        `Vorlese-Audio fehlgeschlagen (Schritt ${step.id}):`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}

/**
 * Audio EINES Schritts sicherstellen (Edit-Pfad, updateStep). Nur wenn das Tutorial
 * published+public ist; sonst NO-OP (interne/Entwurf-Tutorials bekommen nie Audio).
 * Der Hash-Cache verhindert Doppelkosten bei unveränderten Texten. Wirft nicht.
 */
export async function ensureStepAudio(stepId: string): Promise<void> {
  if (!aiConfigured()) return;
  const admin = createAdminClient();
  const { data: step } = await admin
    .from("steps")
    .select("id, title, body, audio_path, audio_hash, tutorial_id, tutorials(account_id, status, visibility)")
    .eq("id", stepId)
    .maybeSingle();
  if (!step) return;
  const tut = Array.isArray(step.tutorials) ? step.tutorials[0] : step.tutorials;
  // Gleiches Gate wie Übersetzung/public-Bilder: nur published + public.
  if (tut?.status !== "published" || tut?.visibility !== "public") return;
  // Vorlesen ist ein Business-Feature — leiser No-op darunter.
  const { data: acc } = await admin.from("accounts").select("plan").eq("id", tut.account_id).maybeSingle();
  if (!isBusiness(acc ?? {})) return;

  try {
    await ensureStepAudioCore(
      admin,
      synthesize(),
      { ...providerCfg(), accountId: tut.account_id, tutorialId: step.tutorial_id },
      step,
      () => speechScript(stepSpeechText(step)),
    );
  } catch (e) {
    console.error(
      `Vorlese-Audio (Edit) fehlgeschlagen (Schritt ${stepId}):`,
      e instanceof Error ? e.message : e,
    );
  }
}

/** Audio EINES Schritts entfernen (deleteStep). Wirft nicht. */
export async function removeStepAudio(step: {
  id: string;
  audio_path: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  try {
    await removeStepAudioCore(admin, step);
  } catch (e) {
    console.error("Vorlese-Audio entfernen fehlgeschlagen:", e instanceof Error ? e.message : e);
  }
}

/** Alle Audios eines Tutorials entfernen (unpublish / -> intern). Wirft nicht. */
export async function removeTutorialAudio(tutorialId: string): Promise<void> {
  const admin = createAdminClient();
  try {
    await removeTutorialAudioCore(admin, tutorialId);
  } catch (e) {
    console.error(
      "Vorlese-Audios (Tutorial) entfernen fehlgeschlagen:",
      e instanceof Error ? e.message : e,
    );
  }
}
