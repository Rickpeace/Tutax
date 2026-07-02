/**
 * Reiner Übersetzungs-Kern (Welle 13) OHNE Next-/server-only-Abhängigkeiten, damit
 * er sowohl aus Server-Actions (actions-translate.ts) als auch aus Live-Test-Skripten
 * (scripts/test-translate-live.mjs) importierbar ist. Alle IO-Abhängigkeiten werden
 * injiziert: ein Supabase-(Admin-)Client und ein OpenAI-Client.
 *
 * Übersetzt wird nur Text; TipTap-Struktur/Marks bleiben unangetastet (siehe translate.ts).
 * Deutsch bleibt Original; Ergebnisse landen in *_translations.
 */
import {
  buildSegmentPlan,
  buildStepPlan,
  assembleTranslationRows,
  assembleStepRow,
  segmentsToPrompt,
  targetLanguageName,
  bodySegments,
  type TutorialForTranslate,
} from "./translate";

/** Minimal-Interface des OpenAI-Chat-Clients, das wir brauchen (leicht mockbar). */
export type ChatClient = {
  chat: {
    completions: {
      create: (args: {
        model: string;
        response_format: { type: "json_object" };
        max_completion_tokens: number;
        messages: { role: string; content: string }[];
      }) => Promise<{ choices: { message: { content: string | null } }[] }>;
    };
  };
};

/** Minimal-Interface des Supabase-Clients (nur die genutzten Ketten). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = any;

export type Lang = "en" | "pl" | "tr";

/** Ein Sprach-Call: nummerierte Segmente -> {"1":"…"}; Rückgabe parallel zur Eingabe. */
export async function translateSegmentsCore(
  openai: ChatClient,
  model: string,
  segments: string[],
  lang: Lang,
): Promise<(string | null)[]> {
  if (!segments.length) return [];
  const target = targetLanguageName(lang);
  const system =
    `You are a professional translator. Translate each numbered segment from German into ${target}. ` +
    "These are UI/help-guide texts for tax firms and their clients: keep the polite/formal register, " +
    "keep the meaning, do NOT add or drop segments, do NOT merge lines, keep placeholders and " +
    "product names as-is. Return ONLY a JSON object whose keys are the segment numbers (as strings) " +
    'and whose values are the translations, e.g. {"1":"…","2":"…"}. Translate every provided number.';

  const res = await openai.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: segmentsToPrompt(segments) },
    ],
  });

  const raw = res.choices[0]?.message?.content || "{}";
  let parsed: Record<string, unknown> = {};
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === "object") parsed = p as Record<string, unknown>;
  } catch {
    throw new Error("KI-Antwort war kein gültiges JSON.");
  }
  return segments.map((_s, i) => {
    const v = parsed[String(i + 1)];
    return typeof v === "string" && v.trim() ? v : null;
  });
}

/** Ganzes Tutorial in eine Sprache übersetzen + upserten (stale=false). */
export async function translateTutorialLangCore(
  db: DbClient,
  openai: ChatClient,
  model: string,
  tutorialId: string,
  source: TutorialForTranslate,
  lang: Lang,
): Promise<void> {
  const plan = buildSegmentPlan(source);
  const translated = plan.segments.length
    ? await translateSegmentsCore(openai, model, plan.segments, lang)
    : [];
  const rows = assembleTranslationRows(source, plan, translated);

  const { error: e1 } = await db.from("tutorial_translations").upsert(
    {
      tutorial_id: tutorialId,
      lang,
      title: rows.tutorial.title,
      description: rows.tutorial.description,
      stale: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tutorial_id,lang" },
  );
  if (e1) throw new Error(`tutorial_translations (${lang}): ${e1.message}`);

  if (rows.steps.length) {
    const { error: e2 } = await db.from("step_translations").upsert(
      rows.steps.map((s) => ({ step_id: s.step_id, lang, title: s.title, body: s.body })),
      { onConflict: "step_id,lang" },
    );
    if (e2) throw new Error(`step_translations (${lang}): ${e2.message}`);
  }
  if (rows.branches.length) {
    const { error: e3 } = await db.from("branch_translations").upsert(
      rows.branches.map((b) => ({ branch_id: b.branch_id, lang, label: b.label })),
      { onConflict: "branch_id,lang" },
    );
    if (e3) throw new Error(`branch_translations (${lang}): ${e3.message}`);
  }
}

/** Ein Schritt (Titel+Body) in eine Sprache übersetzen + upserten (Delta-Sync). */
export async function translateStepLangCore(
  db: DbClient,
  openai: ChatClient,
  model: string,
  step: { id: string; title: string | null; body: unknown },
  lang: Lang,
): Promise<void> {
  const plan = buildStepPlan(step);
  const translated = plan.segments.length
    ? await translateSegmentsCore(openai, model, plan.segments, lang)
    : [];
  const row = assembleStepRow(step, plan, translated);
  const { error } = await db
    .from("step_translations")
    .upsert({ step_id: row.step_id, lang, title: row.title, body: row.body }, {
      onConflict: "step_id,lang",
    });
  if (error) throw new Error(`step_translations delta (${lang}): ${error.message}`);
}

/** Übersetzungen eines Tutorials als veraltet markieren (nur frische Zeilen). */
export async function markStaleCore(db: DbClient, tutorialId: string): Promise<void> {
  const { error } = await db
    .from("tutorial_translations")
    .update({ stale: true })
    .eq("tutorial_id", tutorialId)
    .eq("stale", false);
  if (error) throw new Error(`markStale: ${error.message}`);
}

/** Übersetzungen eines Tutorials wieder als aktuell markieren. */
export async function clearStaleCore(db: DbClient, tutorialId: string): Promise<void> {
  const { error } = await db
    .from("tutorial_translations")
    .update({ stale: false, updated_at: new Date().toISOString() })
    .eq("tutorial_id", tutorialId);
  if (error) throw new Error(`clearStale: ${error.message}`);
}

// Wieder-Export der reinen Segment-Helfer für Tests/Debug.
export { bodySegments, buildSegmentPlan, buildStepPlan };
export type { TutorialForTranslate };
