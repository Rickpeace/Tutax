/**
 * Reiner Vorlese-Kern (Welle 14, „Vorlesen") OHNE Next-/server-only-Abhängigkeiten,
 * damit er sowohl aus Server-Actions (via src/lib/tts.ts) als auch aus Live-Test-
 * Skripten (scripts/test-tts-live.mjs) importierbar ist. Alle IO-Abhängigkeiten
 * werden injiziert: ein Supabase-(Admin-)Client und ein OpenAI-(Speech-)Client.
 *
 * Ablauf: Erzeugung passiert NUR beim Veröffentlichen (Kostenkontrolle) — nie im
 * Viewer on-the-fly. Ergebnis ist eine MP3 im PUBLIC Bucket; ein Hash über den
 * vorgelesenen Text (steps.audio_hash) verhindert Doppelkosten bei erneutem Publish.
 *
 * Kostenhinweis: tts-1, ~15 $/1M Zeichen. Sprech-Text hart gekappt (MAX_TTS_CHARS).
 *
 * v1: NUR die deutsche Originalsprache. Übersetzungs-Audio (EN/PL/TR) ist bewusst
 * ausgelassen (späterer Ausbau — dann pro Sprache eigene Datei + eigener Hash).
 */
import { createHash } from "node:crypto";

/** Public Bucket (derselbe, in dem veröffentlichte Bilder liegen). */
export const PUBLIC_BUCKET = "tutorial-images-public";

/**
 * Zeichen-Obergrenze fürs TTS-Input (Kostenschutz). Die OpenAI-API kappt hart bei
 * 4096 Zeichen; wir bleiben mit ~1.500 deutlich darunter (ein Schritt ist kurz).
 */
export const MAX_TTS_CHARS = 1_500;

/**
 * Nicht-leere Text-Knoten eines TipTap-Docs in Dokument-Reihenfolge sammeln.
 * Spiegelt bewusst `bodySegments`/`collectTextNodes` aus translate.ts (identische
 * Semantik). Hier lokal gehalten, damit tts-core.ts ein import-freies Leaf-Modul
 * bleibt und aus Node-Test-Skripten (--experimental-strip-types) direkt ladbar ist
 * (Node-ESM verlangt Extensions bei relativen Imports; die Repo-Konvention ist:
 * von Tests importierte Kern-Module haben keine relativen Imports — vgl. redact.ts,
 * translate.ts). Nur der triviale Text-Walk ist dupliziert, nicht die Segment-Logik.
 */
type TipNode = { type?: string; text?: string; content?: TipNode[] };
function bodySegments(doc: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const node = n as TipNode;
    if (node.type === "text" && typeof node.text === "string" && node.text.trim()) {
      out.push(node.text);
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(doc);
  return out;
}

type StepForSpeech = {
  id: string;
  title: string | null;
  body: unknown;
  audio_path?: string | null;
  audio_hash?: string | null;
};

/**
 * Version des Sprechtext-Passes (Welle 19). Teil des Hashes: Wird der SPEECH-Prompt
 * später verbessert, genügt ein Hochzählen dieser Zahl, um KONTROLLIERT alle Audios
 * neu erzeugen zu lassen — ohne jeden Text von Hand anfassen zu müssen.
 */
export const SPEECH_SCRIPT_VERSION = 2;

/**
 * Injizierte Synthese-Funktion: Text rein, MP3-Buffer raus (Welle 19). tts-core bleibt
 * dadurch provider-frei — die konkrete Anbindung (OpenAI ODER ElevenLabs) baut der
 * Aufrufer (src/lib/tts.ts bzw. scripts/backfill-tts.mjs). Fehler werden geworfen.
 */
export type Synthesize = (text: string) => Promise<Buffer>;

/** Minimal-Interface des Supabase-Clients (nur die genutzten Ketten). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = any;

/**
 * Vorlese-Text eines Schritts: Titel + Klartext aus dem TipTap-Body. Die Text-
 * Extraktion aus dem Body übernimmt `bodySegments` (Wiederverwendung aus translate.ts
 * — genau die Segmente, die auch übersetzt/angezeigt werden). Bei ~MAX_TTS_CHARS
 * hart gekappt. Leerer Titel UND leerer Body -> "" (Aufrufer erzeugt dann kein Audio).
 */
/**
 * NUR der Erklärtext (ohne Titel) — das ist die Sprech-Basis: die Überschrift steht
 * sichtbar auf dem Bildschirm; sie zusätzlich vorzulesen klingt nach Folien-Roboter
 * (Richard-Feedback 02.07.). Der Titel bleibt Kontext für den Sprechtext-Pass und
 * Teil des HASH-Quelltexts (stepSpeechText), damit Titeländerungen weiter erneuern.
 */
export function bodySpeechText(step: { body: unknown }): string {
  const parts: string[] = [];
  for (const seg of bodySegments(step.body)) {
    const s = seg.trim();
    if (s) parts.push(s);
  }
  const text = parts.join(". ").replace(/\s+/g, " ").trim();
  return text.length > MAX_TTS_CHARS ? text.slice(0, MAX_TTS_CHARS) : text;
}

export function stepSpeechText(step: { title: string | null; body: unknown }): string {
  const parts: string[] = [];
  if (typeof step.title === "string" && step.title.trim()) parts.push(step.title.trim());
  for (const seg of bodySegments(step.body)) {
    const s = seg.trim();
    if (s) parts.push(s);
  }
  // Satz-Trenner zwischen Titel und Absätzen, damit die Stimme natürlich pausiert.
  const text = parts.join(". ").replace(/\s+/g, " ").trim();
  return text.length > MAX_TTS_CHARS ? text.slice(0, MAX_TTS_CHARS) : text;
}

/**
 * Kurzer, stabiler Hash als Cache-Schlüssel (sha256, gekürzt). Anbieter + Modell +
 * Stimme + Sprechtext-Version gehören MIT in den Hash: ein Anbieter-/Stimmen-/Modell-
 * Wechsel ODER ein Hochzählen von SPEECH_SCRIPT_VERSION erzeugt so automatisch alle
 * Audios neu, statt in der alten Stimme kleben zu bleiben.
 *
 * WICHTIG: `text` ist IMMER der QUELLtext (Titel + Bildschirmtext), NICHT der per LLM
 * erzeugte Sprechertext — sonst würde jeder LLM-Zufallslauf einen neuen Hash liefern
 * und das Audio bei jedem Publish teuer neu erzeugen. Der Sprechertext-Pass ist über
 * `scriptVersion` versioniert, nicht über seinen (nicht-deterministischen) Inhalt.
 */
export function speechHash(
  text: string,
  model = "",
  voice = "",
  provider = "",
  scriptVersion: number = SPEECH_SCRIPT_VERSION,
): string {
  return createHash("sha256")
    .update(`${provider}|${model}|${voice}|v${scriptVersion}|${text}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

/** Ablagepfad der MP3 im public Bucket: {account}/{tutorial}/audio/{step}.mp3 */
export function audioPath(accountId: string, tutorialId: string, stepId: string): string {
  return `${accountId}/${tutorialId}/audio/${stepId}.mp3`;
}

/**
 * Sicherstellen, dass der Schritt eine aktuelle Audio-Datei hat (idempotent).
 *  - Leerer Sprech-Text -> vorhandenes Audio entfernen, Spalten nullen, fertig.
 *  - Hash unverändert + audio_path gesetzt -> NO-OP (Cache-Treffer, kein Kostencall).
 *  - Sonst: `synthesize()` (Provider injiziert) -> MP3 in den public Bucket (upsert)
 *    -> audio_path/audio_hash setzen.
 *
 * Welle 19 — natürlicherer Sprechtext:
 *  - `synthesize` ersetzt den fest verdrahteten OpenAI-Client (Provider-Abstraktion).
 *  - `speechTextOverride` (optional): der per LLM erzeugte, natürliche SPRECHERtext, der
 *    tatsächlich synthetisiert wird. Entweder ein fertiger String ODER — bevorzugt — ein
 *    LAZY-Resolver `() => Promise<string>`, der ERST NACH dem Cache-Check aufgerufen wird.
 *    So kostet ein Cache-Treffer keinen LLM-Call. Der HASH läuft immer über den QUELLtext
 *    (`stepSpeechText(step)`) + Provider/Modell/Stimme/scriptVersion — sonst würde ein
 *    nicht-deterministischer LLM-Lauf das Audio bei jedem Publish neu erzeugen.
 *
 * Fehler werden GEWORFEN (der Aufrufer im Publish-Flow loggt je Schritt und macht
 * weiter — der Publish selbst darf daran nie scheitern).
 *
 * Rückgabe: was passiert ist (für Tests/Diagnose).
 */
export async function ensureStepAudioCore(
  admin: DbClient,
  synthesize: Synthesize,
  cfg: { model: string; voice: string; provider?: string; accountId: string; tutorialId: string },
  step: StepForSpeech,
  speechTextOverride?: string | (() => Promise<string>),
): Promise<"skipped" | "created" | "removed"> {
  // QUELLtext: Basis für Hash UND Fallback für die Synthese.
  const sourceText = stepSpeechText(step);

  // Kein Sprech-Text -> kein Audio; ein evtl. vorhandenes entfernen.
  if (!sourceText) {
    if (step.audio_path)
      await removeStepAudioCore(admin, { id: step.id, audio_path: step.audio_path });
    return "removed";
  }

  // Hash IMMER über den Quelltext (+ Provider/Modell/Stimme/scriptVersion) — nie über
  // den LLM-Sprechertext (der ist nicht-deterministisch, siehe speechHash-Doku).
  const hash = speechHash(sourceText, cfg.model, cfg.voice, cfg.provider);
  // Cache: Quelltext/Anbieter/Modell/Stimme unverändert und Datei existiert -> nichts tun.
  // WICHTIG: vor dem (evtl. teuren) Sprechertext-Resolver — Cache-Treffer = kein LLM-Call.
  if (step.audio_hash === hash && step.audio_path) return "skipped";

  // Erst JETZT (Cache-Miss) den Sprechertext auflösen: String direkt, Funktion lazy.
  let override: string | undefined;
  if (typeof speechTextOverride === "function") override = await speechTextOverride();
  else override = speechTextOverride;
  // Was tatsächlich gesprochen wird: der natürliche Sprechertext, sonst der Quelltext.
  const spoken = override?.trim()
    ? override.trim()
    : bodySpeechText(step) || sourceText; // Fallback: Erklärtext ohne Titel

  const path = audioPath(cfg.accountId, cfg.tutorialId, step.id);
  const buf = await synthesize(spoken);

  const { error: upErr } = await admin.storage
    .from(PUBLIC_BUCKET)
    .upload(path, buf, { upsert: true, contentType: "audio/mpeg" });
  if (upErr) throw new Error(`Audio-Upload fehlgeschlagen: ${upErr.message}`);

  const { error: dbErr } = await admin
    .from("steps")
    .update({ audio_path: path, audio_hash: hash })
    .eq("id", step.id);
  if (dbErr) throw new Error(`Audio-Pfad speichern fehlgeschlagen: ${dbErr.message}`);

  return "created";
}

/** Audio EINES Schritts entfernen (public MP3 löschen + Spalten nullen). */
export async function removeStepAudioCore(
  admin: DbClient,
  step: { id: string; audio_path: string | null },
): Promise<void> {
  if (step.audio_path) {
    await admin.storage.from(PUBLIC_BUCKET).remove([step.audio_path]);
  }
  await admin
    .from("steps")
    .update({ audio_path: null, audio_hash: null })
    .eq("id", step.id);
}

/**
 * Alle Audios eines Tutorials entfernen (unpublish / Wechsel zu intern): der public
 * Bucket darf keine Audios interner/zurückgezogener Tutorials behalten.
 */
export async function removeTutorialAudioCore(admin: DbClient, tutorialId: string): Promise<void> {
  const { data: steps } = await admin
    .from("steps")
    .select("id, audio_path")
    .eq("tutorial_id", tutorialId)
    .not("audio_path", "is", null);
  const paths = ((steps ?? []) as { audio_path: string | null }[])
    .map((s) => s.audio_path)
    .filter((p): p is string => !!p);
  if (paths.length) {
    await admin.storage.from(PUBLIC_BUCKET).remove(paths);
    await admin
      .from("steps")
      .update({ audio_path: null, audio_hash: null })
      .eq("tutorial_id", tutorialId)
      .not("audio_path", "is", null);
  }
}
