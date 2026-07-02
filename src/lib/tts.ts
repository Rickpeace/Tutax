import "server-only";
import { openai } from "@/lib/openai";
import { AI, aiConfigured, ttsProvider } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBusiness } from "@/lib/plan";
import {
  ensureStepAudioCore,
  bodySpeechText,
  removeStepAudioCore,
  removeTutorialAudioCore,
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

// v2 (Richard-Feedback 02.07.): geschrieben FÜR eine TTS-Stimme (ElevenLabs) —
// Pausen entstehen aus Satzzeichen, Anführungszeichen/Klammern verwirren die
// Betonung, Denglisch klingt unecht. Der Titel wird NIE mitgelesen (steht sichtbar
// über dem Schritt), dient aber als Kontext.
const SPEECH_SYSTEM =
  "Sie schreiben Sprechertexte für eine Text-zu-Sprache-Stimme in einer freundlichen " +
  "deutschen Software-Anleitung (Sie-Form). Aus dem Erklärtext EINES Schritts machen " +
  "Sie einen natürlich gesprochenen Absatz — wie ein Kollege, der nebenbei erklärt, " +
  "nicht wie eine Dokumentation. REGELN FÜRS SPRECHEN: Kurze Sätze. Sprechpausen " +
  "entstehen durch Kommas und Punkte; für eine kleine Denkpause dürfen Sie sparsam " +
  "drei Punkte verwenden. KEINE Anführungszeichen, keine Klammern, keine " +
  "Doppelpunkte, keine Aufzählungen, keine Emojis. Namen von Schaltflächen, Menüs " +
  "und Feldern übernehmen Sie WÖRTLICH, aber ohne Anführungszeichen, natürlich in " +
  "den Satz eingebettet. Natürliches, echtes Deutsch — KEIN Denglisch, keine " +
  "Anglizismen außer festen Begriffen der Oberfläche, keine Marketing-Floskeln. " +
  "Sie erfinden NICHTS dazu: keine Fakten, keine Elemente, keine Schritte. Der " +
  "mitgelieferte TITEL ist nur Kontext — lesen Sie ihn NICHT vor und wiederholen " +
  "Sie ihn nicht als ersten Satz; steigen Sie direkt menschlich in die Handlung ein. " +
  "Schreiben Sie den Erklärtext NIE wörtlich ab — immer hörbar umformulieren, gern " +
  "leicht ausführlicher und wärmer, mit natürlichen Überleitungen.";

function buildSpeechUser(title: string, bodyText: string): string {
  return (
    (title ? "Titel des Schritts (NUR Kontext, nicht vorlesen): " + title + "\n\n" : "") +
    "Erklärtext des Schritts:\n" +
    "---\n" +
    bodyText +
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
export async function speechScript(title: string, bodyText: string): Promise<string> {
  const source = bodyText.trim();
  if (!source || !aiConfigured()) return source;

  try {
    const completion = await openai().chat.completions.create({
      model: AI.models.chat,
      messages: [
        { role: "system", content: SPEECH_SYSTEM },
        { role: "user", content: buildSpeechUser(title.trim(), source) },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 700,
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      speech?: unknown;
    };
    const raw = typeof parsed.speech === "string" ? parsed.speech.trim() : "";
    if (!raw) return source;
    // Weiche Grenze relativ zur Quelle (mit Mindest-Spielraum für sehr kurze Schritte,
    // sonst kann kein natürlicher Satz entstehen) + harte Grenze.
    const softCap = Math.min(SPEECH_HARD_CAP, Math.max(220, Math.ceil(source.length * 1.6)));
    if (raw.length <= softCap) return raw;
    // NIE mitten im Wort abschneiden — die Stimme liest den Schnitt sonst mit.
    const cut = raw.slice(0, softCap);
    const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    if (sentenceEnd > softCap * 0.5) return cut.slice(0, sentenceEnd + 1);
    const lastSpace = cut.lastIndexOf(" ");
    return lastSpace > 0 ? cut.slice(0, lastSpace) + "." : cut;
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
        speechScript(step.title ?? "", bodySpeechText(step)),
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
      () => speechScript(step.title ?? "", bodySpeechText(step)),
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
