import "server-only";
import { openai } from "@/lib/openai";
import { AI, aiConfigured } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBusiness } from "@/lib/plan";
import {
  ensureStepAudioCore,
  removeStepAudioCore,
  removeTutorialAudioCore,
  type SpeechClient,
} from "@/lib/tts-core";

/**
 * Vorlesen (Welle 14) — server-only Verdrahtung des reinen Kerns (tts-core.ts) mit
 * den echten Clients (OpenAI + Supabase-Admin) und der zentralen KI-Config (ai.ts).
 *
 * Erzeugung passiert NUR im Publish-Lebenszyklus (siehe app/actions.ts +
 * tutorials/[id]/actions.ts), nie im Viewer. Modell/Stimme/Kosten zentral in ai.ts.
 */

const speech = (): SpeechClient => openai() as unknown as SpeechClient;

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
  for (const step of steps ?? []) {
    try {
      await ensureStepAudioCore(
        admin,
        speech(),
        { model: AI.models.tts, voice: AI.ttsVoice, instructions: AI.ttsInstructions, accountId, tutorialId },
        step,
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
      speech(),
      { model: AI.models.tts, voice: AI.ttsVoice, instructions: AI.ttsInstructions, accountId: tut.account_id, tutorialId: step.tutorial_id },
      step,
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
