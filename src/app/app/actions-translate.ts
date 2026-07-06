"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { openai } from "@/lib/openai";
import { AI, aiConfigured } from "@/lib/ai";
import { invalidateTutorialTags } from "@/lib/cache-tags";
import {
  translateTutorialLangCore,
  translateStepLangCore,
  translateSegmentsCore,
  translateAccountCategoriesCore,
  clearStaleCore,
  type ChatClient,
} from "@/lib/translate-core";
import { type TutorialForTranslate } from "@/lib/translate";
import { isExtraLang, LANG_NAME, type ExtraLang } from "@/lib/i18n-hub";
import type { Step, StepBranch } from "@/lib/types";

export type TranslateResult = { languages: ExtraLang[] };

/**
 * Welle 13 – Übersetzungs-Orchestrierung. Deutsch bleibt Original; Übersetzungen liegen
 * in tutorial_translations/step_translations/branch_translations.
 *
 * Der reine Kern (OpenAI-Call + Upserts + TipTap-Text-Merge) steckt in
 * `@/lib/translate-core` — von hier UND vom Live-Test (scripts/test-translate-live.mjs)
 * genutzt, damit getestet wird, was produktiv läuft.
 *
 * Zwei Ebenen:
 *  - translateTutorial: VOLL (alle Sprachen, alle Felder) — Publish, Backfill, manueller
 *    Reparatur-Button.
 *  - translate*Delta: nur EIN Stück (Schritt / Titel / Label) je Sprache — billiger
 *    Delta-Sync nach Edits an published+public Tutorials.
 *
 * Autorisierung: läuft teils via after() (kein RLS-Kontext) und aus dem Backfill -> Admin-
 * Client + explizite published/public-Gates. Der Builder-Button ruft translateTutorial im
 * RLS-Kontext (Nutzer sieht nur eigene Tutorials).
 */

const chat = (): ChatClient => openai() as unknown as ChatClient;

// ---------------------------------------------------------------------------
// Datenzugriff über Admin-Client (für after()/Backfill ohne RLS-Kontext geeignet).
// ---------------------------------------------------------------------------
async function loadTutorialForTranslate(
  tutorialId: string,
): Promise<{ source: TutorialForTranslate; languages: ExtraLang[]; accountId: string } | null> {
  const admin = createAdminClient();
  const { data: tut } = await admin
    .from("tutorials")
    .select("id, title, description, account_id, accounts(languages)")
    .eq("id", tutorialId)
    .maybeSingle();
  if (!tut) return null;
  const acc = Array.isArray(tut.accounts) ? tut.accounts[0] : tut.accounts;
  const languages = ((acc as { languages?: string[] } | null)?.languages ?? []).filter(
    isExtraLang,
  ) as ExtraLang[];

  const { data: steps } = await admin
    .from("steps")
    .select("id, title, body, position")
    .eq("tutorial_id", tutorialId)
    .order("position", { ascending: true })
    .returns<Pick<Step, "id" | "title" | "body" | "position">[]>();
  const stepIds = (steps ?? []).map((s) => s.id);
  const { data: branches } = stepIds.length
    ? await admin
        .from("step_branches")
        .select("id, label, step_id")
        .in("step_id", stepIds)
        .returns<Pick<StepBranch, "id" | "label" | "step_id">[]>()
    : { data: [] as Pick<StepBranch, "id" | "label" | "step_id">[] };

  return {
    languages,
    accountId: tut.account_id as string,
    source: {
      title: tut.title,
      description: tut.description,
      steps: (steps ?? []).map((s) => ({ id: s.id, title: s.title, body: s.body })),
      branches: (branches ?? []).map((b) => ({ id: b.id, label: b.label, step_id: b.step_id })),
    },
  };
}

/** Aktive Zusatzsprachen + published/public-Status eines Tutorials. */
async function tutorialMeta(
  tutorialId: string,
): Promise<{ languages: ExtraLang[]; published: boolean } | null> {
  const admin = createAdminClient();
  const { data: tut } = await admin
    .from("tutorials")
    .select("status, visibility, accounts(languages)")
    .eq("id", tutorialId)
    .maybeSingle();
  if (!tut) return null;
  const acc = Array.isArray(tut.accounts) ? tut.accounts[0] : tut.accounts;
  const languages = ((acc as { languages?: string[] } | null)?.languages ?? []).filter(
    isExtraLang,
  ) as ExtraLang[];
  return { languages, published: tut.status === "published" && tut.visibility === "public" };
}

// ---------------------------------------------------------------------------
// VOLL: ganzes Tutorial in alle aktivierten Sprachen. Sequenziell mit Zwischen-
// speicherung (scheitert Sprache 2, bleibt Sprache 1 erhalten).
// ---------------------------------------------------------------------------
export async function translateTutorial(tutorialId: string): Promise<TranslateResult> {
  if (!aiConfigured()) throw new Error("KI ist nicht konfiguriert (OPENAI_API_KEY fehlt).");
  const loaded = await loadTutorialForTranslate(tutorialId);
  if (!loaded) throw new Error("Tutorial nicht gefunden.");
  const { source, languages, accountId } = loaded;
  if (!languages.length) throw new Error("Keine Zusatzsprachen aktiviert.");
  if (!source.title.trim() && !source.steps.length)
    throw new Error("Nichts zu übersetzen (leeres Tutorial).");

  const admin = createAdminClient();
  const done: ExtraLang[] = [];
  for (const lang of languages) {
    try {
      await translateTutorialLangCore(admin, chat(), AI.models.chat, tutorialId, source, lang);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Übersetzungsfehler";
      if (done.length)
        throw new Error(
          `Übersetzung für ${LANG_NAME[lang]} fehlgeschlagen (${msg}). Bereits gespeichert: ${done
            .map((l) => LANG_NAME[l])
            .join(", ")}.`,
        );
      throw new Error(`Übersetzung für ${LANG_NAME[lang]} fehlgeschlagen: ${msg}`);
    }
    done.push(lang);
  }
  // Kategorienamen des Kontos mitübersetzen (billig: idempotent, ein Batch-Call je Sprache;
  // sind alle aktuell, passiert nichts). Fehler dürfen die Tutorial-Übersetzung nicht kippen.
  try {
    await translateAccountCategoriesCore(admin, chat(), AI.models.chat, accountId, languages);
  } catch (e) {
    console.error("Kategorie-Übersetzung:", e instanceof Error ? e.message : e);
  }
  await invalidateTutorialTags(tutorialId, { force: true });
  return { languages: done };
}

// ---------------------------------------------------------------------------
// DELTA: nur EIN Stück je aktivierter Sprache. Bei Erfolg für ALLE Sprachen wird
// stale=false gesetzt. Fehler werfen NICHT (hängt an after()) -> stale bleibt stehen,
// Reparatur-Button/Backfill fängt es.
// ---------------------------------------------------------------------------
export async function translateStepDelta(stepId: string): Promise<void> {
  if (!aiConfigured()) return;
  const admin = createAdminClient();
  const { data: step } = await admin
    .from("steps")
    .select("id, title, body, tutorial_id")
    .eq("id", stepId)
    .maybeSingle();
  if (!step) return;
  const meta = await tutorialMeta(step.tutorial_id);
  if (!meta || !meta.published || !meta.languages.length) return;

  try {
    for (const lang of meta.languages) {
      await translateStepLangCore(
        admin,
        chat(),
        AI.models.chat,
        { id: step.id, title: step.title, body: step.body },
        lang,
      );
    }
    await clearStaleCore(admin, step.tutorial_id);
    await invalidateTutorialTags(step.tutorial_id, { force: true });
  } catch (e) {
    console.error("translateStepDelta:", e instanceof Error ? e.message : e);
  }
}

export async function translateTitleDelta(tutorialId: string): Promise<void> {
  if (!aiConfigured()) return;
  const admin = createAdminClient();
  const { data: tut } = await admin
    .from("tutorials")
    .select("id, title, description")
    .eq("id", tutorialId)
    .maybeSingle();
  if (!tut) return;
  const meta = await tutorialMeta(tutorialId);
  if (!meta || !meta.published || !meta.languages.length) return;

  const titleSeg = typeof tut.title === "string" && tut.title.trim() ? tut.title : "";
  const descSeg =
    typeof tut.description === "string" && tut.description.trim() ? tut.description : "";
  const segments = [titleSeg, descSeg].filter((s) => s);

  try {
    for (const lang of meta.languages) {
      const translated = segments.length
        ? await translateSegmentsCore(chat(), AI.models.chat, segments, lang)
        : [];
      let ti = 0;
      const title = titleSeg ? translated[ti++] ?? tut.title : tut.title;
      const description = descSeg ? translated[ti++] ?? tut.description : tut.description;
      const { error } = await admin.from("tutorial_translations").upsert(
        { tutorial_id: tutorialId, lang, title, description, stale: false, updated_at: new Date().toISOString() },
        { onConflict: "tutorial_id,lang" },
      );
      if (error) throw new Error(error.message);
    }
    await invalidateTutorialTags(tutorialId, { force: true });
  } catch (e) {
    console.error("translateTitleDelta:", e instanceof Error ? e.message : e);
  }
}

export async function translateBranchDelta(branchId: string): Promise<void> {
  if (!aiConfigured()) return;
  const admin = createAdminClient();
  const { data: branch } = await admin
    .from("step_branches")
    .select("id, label, step_id, steps(tutorial_id)")
    .eq("id", branchId)
    .maybeSingle();
  if (!branch) return;
  const st = Array.isArray(branch.steps) ? branch.steps[0] : branch.steps;
  const tutorialId = (st as { tutorial_id?: string } | null)?.tutorial_id;
  if (!tutorialId) return;
  const meta = await tutorialMeta(tutorialId);
  if (!meta || !meta.published || !meta.languages.length) return;

  const label = typeof branch.label === "string" && branch.label.trim() ? branch.label : "";
  try {
    for (const lang of meta.languages) {
      const translated = label
        ? await translateSegmentsCore(chat(), AI.models.chat, [label], lang)
        : [];
      const value = label ? translated[0] ?? branch.label : branch.label;
      const { error } = await admin
        .from("branch_translations")
        .upsert({ branch_id: branchId, lang, label: value }, { onConflict: "branch_id,lang" });
      if (error) throw new Error(error.message);
    }
    await clearStaleCore(admin, tutorialId);
    await invalidateTutorialTags(tutorialId, { force: true });
  } catch (e) {
    console.error("translateBranchDelta:", e instanceof Error ? e.message : e);
  }
}

// ---------------------------------------------------------------------------
// BACKFILL: beim Aktivieren neuer Sprachen alle published+public Tutorials des Kontos
// übersetzen, denen mindestens eine Sprache fehlt/veraltet ist. Sequenziell, gedeckelt.
// ---------------------------------------------------------------------------
const BACKFILL_CAP = 15;

export async function backfillAccountTranslations(accountId: string): Promise<void> {
  if (!aiConfigured()) return;
  const admin = createAdminClient();
  const { data: acc } = await admin
    .from("accounts")
    .select("languages")
    .eq("id", accountId)
    .maybeSingle();
  const languages = ((acc?.languages as string[] | null) ?? []).filter(isExtraLang) as ExtraLang[];
  if (!languages.length) return;

  const { data: tuts } = await admin
    .from("tutorials")
    .select("id, updated_at")
    .eq("account_id", accountId)
    .eq("status", "published")
    .eq("visibility", "public")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (!tuts?.length) return;

  let processed = 0;
  for (const tut of tuts) {
    if (processed >= BACKFILL_CAP) break;
    const { data: existing } = await admin
      .from("tutorial_translations")
      .select("lang, stale")
      .eq("tutorial_id", tut.id);
    const byLang = new Map((existing ?? []).map((r) => [r.lang as string, r.stale as boolean]));
    const needs = languages.some((l) => !byLang.has(l) || byLang.get(l) === true);
    if (!needs) continue;
    try {
      await translateTutorial(tut.id);
      processed++;
    } catch (e) {
      console.error("backfill translateTutorial:", e instanceof Error ? e.message : e);
    }
  }
}
