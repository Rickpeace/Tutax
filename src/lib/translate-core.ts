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

// ---------------------------------------------------------------------------
// Kategorienamen (Welle 29). Quelle bleibt categories.name (de); Übersetzungen liegen
// in categories.name_i18n als jsonb { _src, en, pl, tr }. `_src` merkt sich den deutschen
// Namen zum Zeitpunkt der Übersetzung -> ändert er sich (Umbenennen/DB-Edit), gilt die
// Übersetzung als veraltet und wird beim nächsten Voll-Übersetzen automatisch erneuert.
// ---------------------------------------------------------------------------

type CategoryRow = {
  id: string;
  name: string;
  name_i18n: Record<string, unknown> | null;
};

/** Merker-Quelle (deutscher Name) aus name_i18n lesen. */
function categorySrc(row: CategoryRow): string | undefined {
  const v = row.name_i18n;
  return v && typeof v === "object" && typeof v._src === "string" ? v._src : undefined;
}

/** Fehlt für diese Sprache eine gültige, aktuelle Übersetzung? */
function categoryNeedsLang(row: CategoryRow, lang: Lang): boolean {
  if (categorySrc(row) !== row.name) return true; // Name geändert -> alles neu
  const v = row.name_i18n?.[lang];
  return !(typeof v === "string" && v.trim());
}

/**
 * Die EIGENEN Kategorien eines Kontos in die aktiven Zusatzsprachen übersetzen — nur die,
 * denen eine Sprache fehlt oder deren deutscher Name sich geändert hat. Pro Sprache genau
 * EIN Batch-Call (kostengünstig). Idempotent: sind alle aktuell, passiert nichts (kein
 * OpenAI-Call). Gibt die Anzahl aktualisierter Kategorien zurück.
 *
 * Bewusst NUR account-eigene Kategorien (account_id = accountId): globale Standard-
 * Kategorien (account_id IS NULL) sind admin-verwaltet und geteilt — sie hier je Konto-
 * Publish zu beschreiben wäre ein tenant-übergreifender Schreibzugriff. Der Hub fällt für
 * unübersetzte (globale) Kategorien sauber auf den deutschen Namen zurück.
 */
export async function translateAccountCategoriesCore(
  db: DbClient,
  openai: ChatClient,
  model: string,
  accountId: string,
  languages: Lang[],
): Promise<{ updated: number }> {
  if (!languages.length) return { updated: 0 };
  const { data: cats } = await db
    .from("categories")
    .select("id, name, name_i18n")
    .eq("account_id", accountId);
  const rows: CategoryRow[] = ((cats ?? []) as CategoryRow[]).filter(
    (c) => typeof c.name === "string" && c.name.trim(),
  );
  if (!rows.length) return { updated: 0 };

  // Nur Kategorien, die für IRGENDEINE aktive Sprache Arbeit brauchen.
  const work = rows.filter((c) => languages.some((l) => categoryNeedsLang(c, l)));
  if (!work.length) return { updated: 0 };

  // Pro Sprache ein Batch-Call über genau die Kategorien, denen diese Sprache fehlt.
  const fresh = new Map<string, Record<string, string>>(); // catId -> { lang -> text }
  for (const lang of languages) {
    const subset = work.filter((c) => categoryNeedsLang(c, lang));
    if (!subset.length) continue;
    const translated = await translateSegmentsCore(
      openai,
      model,
      subset.map((c) => c.name),
      lang,
    );
    subset.forEach((c, i) => {
      const t = translated[i];
      if (typeof t === "string" && t.trim()) {
        const m = fresh.get(c.id) ?? {};
        m[lang] = t;
        fresh.set(c.id, m);
      }
    });
  }

  let updated = 0;
  for (const c of work) {
    // Bei unverändertem Namen bereits vorhandene Sprachen behalten, sonst neu aufbauen.
    const keep =
      categorySrc(c) === c.name && c.name_i18n && typeof c.name_i18n === "object"
        ? (c.name_i18n as Record<string, unknown>)
        : {};
    const next: Record<string, string> = { _src: c.name };
    for (const lang of languages) {
      const f = fresh.get(c.id)?.[lang];
      const kept = keep[lang];
      next[lang] =
        typeof f === "string" && f.trim()
          ? f
          : typeof kept === "string" && kept.trim()
            ? kept
            : c.name; // DE-Fallback
    }
    const { error } = await db.from("categories").update({ name_i18n: next }).eq("id", c.id);
    if (!error) updated++;
  }
  return { updated };
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
