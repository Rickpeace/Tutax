"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireAccount,
  requireTutorialAccess,
  requireStepAccess,
  requireBranchAccess,
} from "@/lib/account";
import { hasInvalidBlur, rebuildPublicCopy, removeUnusedPublicCopies } from "@/lib/public-images";
import { takeHourlyAiRun } from "@/lib/ai-rate-limit";
import { invalidateTutorialTags, invalidateStepTags, invalidateBranchTags } from "@/lib/cache-tags";
import {
  markTranslationsStale,
  markTranslationsStaleByStep,
  markTranslationsStaleByBranch,
} from "@/lib/translate-stale";
import {
  translateStepDelta,
  translateTitleDelta,
  translateBranchDelta,
} from "@/lib/translate-jobs";
import { ensureStepAudio, removeStepAudio } from "@/lib/tts";
import { reindexTutorialIfLive } from "@/lib/kb";
import { YES } from "@/lib/builder/constants";
import { normalizeDomain, mergeDomains } from "@/lib/site-domains";
import { validateStepCondition } from "@/lib/guide";
import { CATEGORY_NAME_MAX, CATEGORY_NAME_TOO_LONG, cleanCategoryName } from "@/lib/category-name";
import { GUIDE_DESCRIPTION_MAX, GUIDE_TITLE_MAX } from "@/lib/text-limits";
import type { Highlight, Step, StepBranch } from "@/lib/types";
import { flowOrder } from "@/lib/builder/tree";
import { planMove } from "@/lib/builder/rewire";
import { canEdit } from "@/lib/roles";
import { aiConfigured } from "@/lib/ai";
import { mkBody, MAX_GUIDE_STEPS } from "@/lib/guide";
import { refineStepFromSaved, suggestStepTexts, type RefineStep } from "@/lib/guide-ai";
import { withUserErrors, UserError } from "@/lib/action-error";
import { isPro, PRO_REQUIRED } from "@/lib/plan";

// Hinweis: Diese Builder-Actions persistieren NUR (kein revalidatePath).
// Die UI führt der Client optimistisch & sofort; der Server speichert im
// Hintergrund. IDs für Inserts kommen vom Client (crypto.randomUUID), damit
// das Einfügen ohne Roundtrip sichtbar ist.

/**
 * „Erneut versuchen“ wiederholt eine ganze Kette (addStep → updateBranch → addBranch). Lief ein
 * Teil beim ersten Mal schon durch, scheitert der Insert mit derselben Client-ID an 23505
 * (doppelter Schlüssel) — und der Retry endlos. Deshalb: Duplikat = schon erledigt, ABER nur,
 * wenn die vorhandene Zeile (RLS-sichtbar) wirklich zum selben Eltern-Datensatz gehört. Eine
 * fremde ID führt weiterhin zum Fehler.
 */
async function isOwnRetryDuplicate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  error: { code?: string } | null,
  table: "steps" | "step_branches",
  id: string,
  parent: { column: "tutorial_id" | "step_id"; value: string },
): Promise<boolean> {
  if (error?.code !== "23505") return false;
  const { data } = await supabase.from(table).select(parent.column).eq("id", id).maybeSingle();
  return !!data && (data as Record<string, unknown>)[parent.column] === parent.value;
}

/**
 * Neuen Schritt anlegen (Client liefert id + Verdrahtung).
 * Welle 51a „Bild in neuen Schritt übernehmen“: `opts.imageFromStepId` übernimmt Bild + Maße
 * eines Schritts DERSELBEN Anleitung (serverseitig per RLS gelesen — nie ein vom Client
 * gelieferter Pfad), `opts.highlights` die mitgegebenen Markierungen (übernommene Verpixelung).
 * Der Pfad wird geteilt; Löschen entfernt die öffentliche Kopie nur, wenn sie niemand mehr nutzt.
 */
export async function addStep(
  tutorialId: string,
  step: { id: string; title: string; position: number },
  setRoot: boolean,
  wire: { branchId: string; fromStepId: string } | null,
  opts?: { imageFromStepId?: string; highlights?: Highlight[] },
) {
  await requireTutorialAccess(tutorialId);
  const supabase = await createClient();
  let image: { image_path: string; image_width: number | null; image_height: number | null } | null = null;
  if (opts?.imageFromStepId) {
    const { data: src } = await supabase
      .from("steps")
      .select("tutorial_id, image_path, image_width, image_height")
      .eq("id", opts.imageFromStepId)
      .maybeSingle();
    if (!src || src.tutorial_id !== tutorialId || !src.image_path) {
      throw new Error("Bild des Schritts nicht gefunden");
    }
    image = { image_path: src.image_path, image_width: src.image_width, image_height: src.image_height };
  }
  const highlights = Array.isArray(opts?.highlights)
    ? opts.highlights.filter((h) => h && typeof h === "object" && typeof h.type === "string")
    : null;
  if (hasInvalidBlur(highlights)) throw new Error("Ungültige Verpixelung.");
  const { error } = await supabase.from("steps").insert({
    id: step.id,
    tutorial_id: tutorialId,
    title: step.title,
    position: step.position,
    is_decision: false,
    ...(image ?? {}),
    ...(highlights ? { highlights } : {}),
  });
  if (error && !(await isOwnRetryDuplicate(supabase, error, "steps", step.id, { column: "tutorial_id", value: tutorialId }))) {
    throw new Error(error.message);
  }

  if (setRoot) {
    await supabase
      .from("tutorials")
      .update({ root_step_id: step.id })
      .eq("id", tutorialId);
  }
  if (wire) {
    const { error: be } = await supabase.from("step_branches").insert({
      id: wire.branchId,
      step_id: wire.fromStepId,
      label: null,
      target_step_id: step.id,
      position: 0,
    });
    if (be && !(await isOwnRetryDuplicate(supabase, be, "step_branches", wire.branchId, { column: "step_id", value: wire.fromStepId }))) {
      throw new Error(be.message);
    }
  }
  // Geteiltes Bild in einer veröffentlichten Anleitung: öffentliche Kopie mit allen
  // Verpixelungen neu erzeugen (no-op bei Entwürfen).
  if (image) await refreshPublicImage(step.id); // wirft sichtbar; Kopie ist dann entfernt
  await invalidateTutorialTags(tutorialId); // nur wirksam, wenn veröffentlicht
  await markTranslationsStale(tutorialId); // neuer Schritt -> Übersetzungen unvollständig
  after(() => reindexTutorialIfLive(tutorialId)); // Chatbot kennt den neuen Schritt
}

/** Titel/Text/Bild speichern (stiller Auto-Save). */
export async function updateStep(
  stepId: string,
  patch: {
    title?: string;
    body?: unknown;
    image_path?: string | null;
    image_width?: number | null;
    image_height?: number | null;
    highlights?: unknown;
    video_time?: number | null;
  },
) {
  const { tutorialId } = await requireStepAccess(stepId);
  const supabase = await createClient();
  if (Object.keys(patch).length === 0) return;
  if ("highlights" in patch && hasInvalidBlur(patch.highlights)) {
    throw new Error("Ungültige Verpixelung.");
  }
  // Alten Bildpfad merken: wird das Bild ersetzt oder entfernt, muss seine öffentliche Kopie weg
  // (Sicherheitsprüfung Welle 51, H2) — sonst bliebe z. B. ein entfernter Screenshot abrufbar.
  let oldImagePath: string | null = null;
  if ("image_path" in patch) {
    const { data: before } = await supabase.from("steps").select("image_path").eq("id", stepId).maybeSingle();
    oldImagePath = (before?.image_path as string | null) ?? null;
  }
  // SICHERHEIT: Ein Bildpfad kommt vom Browser. Er muss im Ordner des KONTOS dieser Anleitung
  // liegen (`<account_id>/…`, wie /api/upload-url ihn vergibt) — sonst könnte man einen fremden
  // Pfad eintragen, den das Veröffentlichen dann mit Admin-Rechten öffentlich kopiert.
  if (typeof patch.image_path === "string") {
    const { data: owner } = await supabase
      .from("steps")
      .select("tutorials!steps_tutorial_id_fkey!inner(account_id)")
      .eq("id", stepId)
      .maybeSingle<{ tutorials: { account_id: string | null } }>();
    const accountId = owner?.tutorials?.account_id;
    if (!accountId || !patch.image_path.startsWith(`${accountId}/`) || patch.image_path.includes("..")) {
      throw new Error("Ungültiger Bildpfad.");
    }
  }
  const { error } = await supabase.from("steps").update(patch).eq("id", stepId);
  if (error) throw new Error(error.message);

  // Ist das Tutorial VERÖFFENTLICHT und Bild/Markierungen haben sich geändert,
  // muss die öffentliche Bild-Kopie nachgezogen werden — inkl. eingebranntem Blur.
  // Sonst bliebe z. B. eine nachträglich geschwärzte Stelle öffentlich lesbar.
  if (oldImagePath && oldImagePath !== patch.image_path) {
    await removeUnusedPublicCopies([oldImagePath], { accountId: await tutorialAccountId(tutorialId) });
  }
  if ("image_path" in patch || "highlights" in patch) {
    // Wirft sichtbar („Speichern fehlgeschlagen“), wenn die öffentliche Kopie nicht sicher neu
    // erzeugt werden konnte — die Kopie ist dann bereits entfernt (nie Klartext stehen lassen).
    await refreshPublicImage(stepId);
  }
  await invalidateStepTags(stepId); // nur wirksam, wenn veröffentlicht
  // Nur Text-Änderungen entwerten Übersetzungen (Bild/Markierungen sind sprachneutral).
  if ("title" in patch || "body" in patch) {
    await markTranslationsStaleByStep(stepId); // sofort veraltet …
    after(() => translateStepDelta(stepId)); // … und im Hintergrund nachziehen (Delta-Sync)
    // Vorlesen: Text geändert -> Audio nachziehen (nur published+public, Hash-Cache
    // vermeidet Doppelkosten). ensureStepAudio wirft nicht -> stört den Save nie.
    after(() => ensureStepAudio(stepId));
    // Chatbot-Index: bei veröffentlichten Anleitungen den neuen Text sofort nachziehen.
    after(() => reindexTutorialIfLive(tutorialId));
  }
}

/** Konto der Anleitung aus der DB (nie aus einem Pfad) — für Admin-Storage-Aufräumarbeiten. */
async function tutorialAccountId(tutorialId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("tutorials")
    .select("account_id")
    .eq("id", tutorialId)
    .maybeSingle();
  return (data?.account_id as string | null) ?? null;
}

/** Öffentliche Kopie des Schritt-Bilds neu erzeugen (Blur eingebrannt). */
async function refreshPublicImage(stepId: string) {
  const supabase = await createClient();
  // RLS-sichtbarer Read: liefert nur Schritte aus eigenen Tutorials.
  const { data: step } = await supabase
    .from("steps")
    // FK explizit: steps↔tutorials hat ZWEI Beziehungen (steps.tutorial_id und
    // tutorials.root_step_id). Ohne Hinweis antwortet PostgREST mit „more than one
    // relationship“ -> data null -> die öffentliche Kopie wurde NIE nachgezogen (Welle 51a).
    .select("image_path, highlights, tutorials!steps_tutorial_id_fkey!inner(status, visibility, account_id)")
    .eq("id", stepId)
    .maybeSingle();
  if (!step) return;
  const tut = Array.isArray(step.tutorials) ? step.tutorials[0] : step.tutorials;
  // Nur öffentliche, veröffentlichte Tutorials haben eine public Bild-Kopie.
  if (tut?.status !== "published" || tut?.visibility !== "public") return;

  if (!step.image_path) return; // Bild entfernt: alte Kopie räumt updateStep auf
  await rebuildPublicCopy(step.image_path, tut?.account_id as string | null | undefined);
}

/** Frage an/aus. Server spiegelt exakt die optimistische Client-Logik. */
export async function setDecision(stepId: string, isDecision: boolean) {
  await requireStepAccess(stepId);
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("step_branches")
    .select("id")
    .eq("step_id", stepId)
    .order("position");

  await supabase
    .from("steps")
    .update({ is_decision: isDecision })
    .eq("id", stepId);

  if (existing?.length) {
    if (isDecision) {
      await supabase
        .from("step_branches")
        .update({ label: "Ja", color: YES })
        .eq("id", existing[0].id);
    } else {
      await supabase
        .from("step_branches")
        .update({ label: null, color: null })
        .eq("id", existing[0].id);
      const rest = existing.slice(1).map((b) => b.id);
      if (rest.length) await supabase.from("step_branches").delete().in("id", rest);
    }
  }
  await invalidateStepTags(stepId);
  await markTranslationsStaleByStep(stepId); // Labels/Verzweigung geändert
  // setDecision ändert das Label der ersten Verzweigung („Ja“ bzw. null) -> Label-Delta.
  const firstBranch = existing?.[0]?.id;
  if (firstBranch) after(() => translateBranchDelta(firstBranch));
}

/**
 * Bedingte Schritte (Welle 42): Ausführ-Bedingung an einem Schritt setzen/entfernen. Der MENSCH
 * (Tutorial/Führung) ignoriert sie; NUR der Automations-Lauf wertet sie aus. Tolerant validiert
 * (validateStepCondition): kaputt/leer → null (immer ausführen). Optimistisch-still wie setDecision.
 */
export async function setStepCondition(stepId: string, condition: unknown) {
  await requireStepAccess(stepId);
  const supabase = await createClient();
  const clean = validateStepCondition(condition) ?? null;
  await supabase.from("steps").update({ condition: clean }).eq("id", stepId);
  await invalidateStepTags(stepId);
}

/** Antwort-Option anlegen (Client liefert id/color/position). */
export async function addBranch(branch: {
  id: string;
  step_id: string;
  label: string | null;
  color: string | null;
  target_step_id: string | null;
  position: number;
}) {
  await requireStepAccess(branch.step_id);
  const supabase = await createClient();
  const { error } = await supabase.from("step_branches").insert(branch);
  if (error && !(await isOwnRetryDuplicate(supabase, error, "step_branches", branch.id, { column: "step_id", value: branch.step_id }))) {
    throw new Error(error.message);
  }
  await invalidateStepTags(branch.step_id);
  await markTranslationsStaleByStep(branch.step_id);
  if (branch.label?.trim()) after(() => translateBranchDelta(branch.id));
}

export async function updateBranch(
  branchId: string,
  patch: { label?: string; target_step_id?: string | null; color?: string | null },
) {
  await requireBranchAccess(branchId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("step_branches")
    .update(patch)
    .eq("id", branchId);
  if (error) throw new Error(error.message);
  await invalidateBranchTags(branchId);
  if ("label" in patch) {
    await markTranslationsStaleByBranch(branchId);
    after(() => translateBranchDelta(branchId));
  }
}

export async function deleteBranch(branchId: string) {
  await requireBranchAccess(branchId);
  const supabase = await createClient();
  await invalidateBranchTags(branchId); // VOR dem Delete (Lookup braucht die Zeile)
  await markTranslationsStaleByBranch(branchId); // ebenfalls VOR dem Delete
  const { error } = await supabase
    .from("step_branches")
    .delete()
    .eq("id", branchId);
  if (error) throw new Error(error.message);
}

/**
 * Schritt löschen + Auto-Umverdrahtung (§7.4). Client liefert das eindeutige
 * Folgeziel (linear) bzw. null (Entscheidung) und ob es die Wurzel war.
 */
export async function deleteStep(
  tutorialId: string,
  stepId: string,
  nextTarget: string | null,
  wasRoot: boolean,
) {
  // „Erneut versuchen“ nach einem Löschen, das beim ersten Mal schon durchlief: den Schritt
  // gibt es nicht mehr -> erledigt (nur mit Zugriff auf die Anleitung, sonst Fehler wie bisher).
  const { data: exists } = await createAdminClient().from("steps").select("id").eq("id", stepId).maybeSingle();
  if (!exists) {
    await requireTutorialAccess(tutorialId);
    return;
  }
  const { tutorialId: owner } = await requireStepAccess(stepId);
  if (owner !== tutorialId) throw new Error("Schritt nicht gefunden.");
  const supabase = await createClient();

  // Vorlese-Audio des Schritts VOR dem Delete aus dem public Bucket räumen (danach
  // ist der Pfad weg; der DB-Row-Delete wird durch das Nullen nicht behindert).
  const { data: victim } = await supabase
    .from("steps")
    .select("id, audio_path, image_path")
    .eq("id", stepId)
    .maybeSingle();
  if (victim?.audio_path) await removeStepAudio({ id: victim.id, audio_path: victim.audio_path });

  await supabase
    .from("step_branches")
    .update({ target_step_id: nextTarget })
    .eq("target_step_id", stepId);

  if (wasRoot) {
    await supabase
      .from("tutorials")
      .update({ root_step_id: nextTarget })
      .eq("id", tutorialId);
  }

  const { error } = await supabase.from("steps").delete().eq("id", stepId);
  if (error) throw new Error(error.message);
  // Öffentliche Bildkopie des gelöschten Schritts entfernen, sofern kein anderer veröffentlichter
  // Schritt sie noch nutzt (Sicherheitsprüfung Welle 51, H2/M1).
  if (victim?.image_path) {
    await removeUnusedPublicCopies([victim.image_path as string], { accountId: await tutorialAccountId(tutorialId) });
  }
  await invalidateTutorialTags(tutorialId);
  await markTranslationsStale(tutorialId); // Schritt entfernt -> Übersetzungen veraltet
  after(() => reindexTutorialIfLive(tutorialId)); // Chatbot vergisst den Schritt
}

/**
 * Wurzel-Schritt eines Tutorials setzen (Schritt-Umordnen: wenn der bisherige
 * Startschritt getauscht wird, wird der Nachbar zur neuen Wurzel). Additiv —
 * persistiert nur, die UI führt optimistisch.
 */
/**
 * „Schritt nach oben/unten“ in EINEM Aufruf (Audit 23.09.2026). Vorher schickte der Editor
 * drei Einzel-Aufrufe (Kante, Kante, Startschritt); klickte man sofort weg, kam der letzte
 * nicht mehr an und der Ablauf war kaputt (Schritt unerreichbar). Der Server rechnet den
 * Tausch selbst aus dem aktuellen DB-Stand (gleiche Regel wie der Editor: swapPlan) und
 * schreibt alles am Stück — ein einmal abgeschickter Aufruf läuft auch zu Ende, wenn der
 * Nutzer die Seite verlässt.
 */
export const moveStep = withUserErrors(async function moveStep(
  tutorialId: string,
  stepId: string,
  dir: "up" | "down",
  newBranchId: string,
  /** Paar, das der Editor getauscht hat (A vor B) — macht „Erneut versuchen“ idempotent. */
  expect?: { a: string; b: string } | null,
) {
  await requireTutorialAccess(tutorialId);
  const supabase = await createClient();
  const [{ data: tut }, { data: steps }] = await Promise.all([
    supabase.from("tutorials").select("root_step_id").eq("id", tutorialId).maybeSingle(),
    supabase.from("steps").select("*").eq("tutorial_id", tutorialId).returns<Step[]>(),
  ]);
  const ids = (steps ?? []).map((s) => s.id);
  const { data: branches } = ids.length
    ? await supabase.from("step_branches").select("*").in("step_id", ids).returns<StepBranch[]>()
    : { data: [] as StepBranch[] };
  const decision = planMove(
    steps ?? [],
    branches ?? [],
    tut?.root_step_id ?? null,
    stepId,
    dir,
    newBranchId,
    expect,
  );
  if (decision.kind === "stale") {
    throw new UserError("Dieser Schritt lässt sich hier nicht verschieben. Bitte laden Sie die Seite neu.");
  }
  // Wiederholung eines schon ausgeführten Tauschs: nicht erneut tauschen (sonst wanderte der
  // Schritt einen Platz weiter) — höchstens den Startschritt nachziehen.
  if (decision.kind === "done") {
    if (decision.newRoot) {
      const { error } = await supabase.from("tutorials").update({ root_step_id: decision.newRoot }).eq("id", tutorialId);
      if (error) throw new Error(error.message);
      await invalidateTutorialTags(tutorialId);
    }
    return;
  }
  const { plan } = decision;

  for (const t of plan.targets) {
    const { error } = await supabase.from("step_branches").update({ target_step_id: t.target }).eq("id", t.branchId);
    if (error) throw new Error(error.message);
  }
  if (plan.newBranch) {
    const { error } = await supabase
      .from("step_branches")
      .insert({ ...plan.newBranch, label: null, color: null, position: 0 });
    if (error && !(await isOwnRetryDuplicate(supabase, error, "step_branches", plan.newBranch.id, { column: "step_id", value: plan.newBranch.step_id }))) {
      throw new Error(error.message);
    }
  }
  if (plan.newRoot) {
    const { error } = await supabase.from("tutorials").update({ root_step_id: plan.newRoot }).eq("id", tutorialId);
    if (error) throw new Error(error.message);
  }
  await invalidateTutorialTags(tutorialId);
});

export async function setRootStep(tutorialId: string, stepId: string) {
  const { tutorialId: owner } = await requireStepAccess(stepId);
  if (owner !== tutorialId) throw new Error("Schritt nicht gefunden.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tutorials")
    .update({ root_step_id: stepId })
    .eq("id", tutorialId);
  if (error) throw new Error(error.message);
  await invalidateTutorialTags(tutorialId);
}

/** Kategorie anlegen (§7.3, „on the fly" aus der Combobox). */
export const createCategory = withUserErrors(async function createCategory(name: string): Promise<{ id: string; name: string }> {
  const clean = cleanCategoryName(name);
  if (!clean) throw new UserError("Name fehlt");
  // Gleiche Höchstlänge wie Umbenennen und Sofort-Anleitung (lib/category-name.ts).
  if (clean.length > CATEGORY_NAME_MAX) throw new UserError(CATEGORY_NAME_TOO_LONG);
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("categories")
    .select("position")
    .eq("account_id", account.id);
  const maxPos = (existing ?? []).reduce((m, c) => Math.max(m, Number(c.position) || 0), -1);
  const { data, error } = await supabase
    .from("categories")
    .insert({ account_id: account.id, name: clean, position: maxPos + 1 })
    .select("id, name")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Kategorie anlegen fehlgeschlagen");
  return data;
});

/** Tutorial-Titel ändern. */
export const setTutorialTitle = withUserErrors(async function setTutorialTitle(tutorialId: string, title: string) {
  await requireTutorialAccess(tutorialId);
  // Gleiche Grenze wie im Formular (maxLength) — Einfügen aus der Zwischenablage umgeht das.
  const clean = title.replace(/\s+/g, " ").trim().slice(0, GUIDE_TITLE_MAX);
  if (!clean) throw new UserError("Titel fehlt");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tutorials")
    .update({ title: clean })
    .eq("id", tutorialId);
  if (error) throw new Error(error.message);
  await invalidateTutorialTags(tutorialId);
  await markTranslationsStale(tutorialId);
  after(() => translateTitleDelta(tutorialId));
  after(() => reindexTutorialIfLive(tutorialId)); // Titel steckt in jedem Chatbot-Ausschnitt
});

/**
 * Kurzbeschreibung des Tutorials (Untertitel auf der Hilfe-Seiten-Karte + Suchtreffer).
 * Leer = entfernen (Karte zeigt dann nur den Titel). Richards Fund 06.07.: Das Feld
 * wurde auf /h angezeigt, war aber im Builder nirgends editierbar (nur Seeds setzten es).
 * Auto-Sync (Welle 29): wie setTutorialTitle stößt die Beschreibung jetzt die Delta-
 * Übersetzung an (translateTitleDelta übersetzt Titel + Beschreibung zusammen), damit die
 * EN/PL/TR-Hub-Karten die übersetzte Beschreibung zeigen statt der deutschen.
 */
export async function setTutorialDescription(tutorialId: string, description: string) {
  await requireTutorialAccess(tutorialId);
  const clean = description.replace(/\s+/g, " ").trim().slice(0, GUIDE_DESCRIPTION_MAX);
  const supabase = await createClient();
  const { error } = await supabase
    .from("tutorials")
    .update({ description: clean || null })
    .eq("id", tutorialId);
  if (error) throw new Error(error.message);
  await invalidateTutorialTags(tutorialId);
  await markTranslationsStale(tutorialId);
  after(() => translateTitleDelta(tutorialId)); // Delta „tutorial-description" (Titel + Beschreibung)
}

/**
 * Signierte URL des Quell-Videos zu diesem Tutorial (Frame-Picker im Builder).
 * RLS-Check: nur wenn das Tutorial für den Nutzer sichtbar ist; dann via Admin-Client
 * die neueste video_jobs-Zeile mit video_path suchen und signierte URL (3600s) liefern.
 * Null, wenn kein Quell-Video existiert (manuell gebautes Tutorial) oder nicht erlaubt.
 */
export async function getTutorialVideoUrl(tutorialId: string): Promise<string | null> {
  await requireTutorialAccess(tutorialId);
  const supabase = await createClient();
  // RLS-Gate: liefert nur eigene Tutorials -> unsichtbar = kein Zugriff.
  const { data: tut } = await supabase
    .from("tutorials")
    .select("id")
    .eq("id", tutorialId)
    .maybeSingle();
  if (!tut) return null;

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("video_jobs")
    .select("video_path")
    .eq("tutorial_id", tutorialId)
    .not("video_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!job?.video_path) return null;

  const { data: signed } = await admin.storage
    .from("tutorial-videos")
    .createSignedUrl(job.video_path, 3600);
  return signed?.signedUrl ?? null;
}

/**
 * Auto-Schwärzung (Welle 28): Welche Schritte tragen noch UNGEPRÜFTE automatische
 * Schwärzungen (Highlight vom Typ „blur“ mit `suggested:true`)? Dient dem UI-Gate vor
 * dem Veröffentlichen im Builder-Header — rein informativ, blockiert NICHT. RLS-sicher:
 * liefert nur Schritte aus eigenen Tutorials. Rückgabe: Anzeigenamen in Ablauf-Reihenfolge
 * (Titel, sonst „Schritt N“ mit N = Nummer im Ablauf — wie im Editor).
 */
export async function listUnreviewedBlurSteps(tutorialId: string): Promise<string[]> {
  await requireTutorialAccess(tutorialId);
  const supabase = await createClient();
  const [{ data: steps }, { data: tut }] = await Promise.all([
    supabase.from("steps").select("*").eq("tutorial_id", tutorialId).returns<Step[]>(),
    supabase.from("tutorials").select("root_step_id").eq("id", tutorialId).maybeSingle(),
  ]);
  const all = steps ?? [];
  const ids = all.map((s) => s.id);
  const { data: branches } = ids.length
    ? await supabase.from("step_branches").select("*").in("step_id", ids).returns<StepBranch[]>()
    : { data: [] as StepBranch[] };
  const ordered = flowOrder(all, branches ?? [], (tut?.root_step_id as string | null) ?? null);
  const out: string[] = [];
  ordered.forEach((s, i) => {
    const hs = Array.isArray(s.highlights) ? s.highlights : [];
    const unreviewed = hs.some(
      (h) => h && typeof h === "object" && (h as { suggested?: unknown }).suggested === true,
    );
    if (unreviewed) out.push(s.title?.trim() || `Schritt ${i + 1}`);
  });
  return out;
}

/**
 * Basis-Domains setzen, für die dieses Tutorial gilt (Welle 31c: „Gilt für Website").
 * Der Client schickt die VOLLSTÄNDIGE gewünschte Liste (optimistische UI); wir normalisieren
 * jede Angabe via normalizeDomain (ungültige fallen weg), deduplizieren/sortieren/begrenzen
 * via mergeDomains und schreiben das Ergebnis. Eigentum erzwingt RLS (createClient = Session-
 * scoped, `my_account_ids()`): ein Fremd-Tutorial trifft 0 Zeilen. Muster wie
 * setTutorialCategory (persistiert nur, invalidiert den Cache).
 */
export async function setTutorialSiteDomains(tutorialId: string, domains: string[]) {
  await requireTutorialAccess(tutorialId);
  const normalized: string[] = [];
  for (const d of Array.isArray(domains) ? domains : []) {
    const n = typeof d === "string" ? normalizeDomain(d) : null;
    if (n) normalized.push(n);
  }
  const clean = mergeDomains(normalized, []); // dedup + sort + max 10
  const supabase = await createClient();
  const { error } = await supabase
    .from("tutorials")
    .update({ site_domains: clean })
    .eq("id", tutorialId);
  if (error) throw new Error(error.message);
  await invalidateTutorialTags(tutorialId);
  return clean; // normalisierte Endliste → Client kann seinen optimistischen State abgleichen
}

/** Tutorial einer Kategorie zuordnen (oder lösen mit null). */
export async function setTutorialCategory(
  tutorialId: string,
  categoryId: string | null,
) {
  await requireTutorialAccess(tutorialId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("tutorials")
    .update({ category_id: categoryId })
    .eq("id", tutorialId);
  if (error) throw new Error(error.message);
  await invalidateTutorialTags(tutorialId);
}

// ── „Texte mit KI verbessern“ (09/2026) ───────────────────────────────────────────────────
// Liefert nur VORSCHLÄGE (nichts wird gespeichert); „Übernehmen“ und „Rückgängig“ laufen über
// applyStepTexts. Dieselbe Prompt-/Prüf-Logik wie der Feinschliff nach der Aufnahme (guide-ai.ts).

export type StepTextSuggestion = {
  stepId: string;
  oldTitle: string;
  oldBody: string; // Klartext (Anzeige)
  newTitle: string;
  newBody: string | null; // null = Text bleibt (formatiert oder unverändert)
};

export type SuggestTextsResult =
  | { ok: true; items: StepTextSuggestion[]; total: number; capped: boolean }
  | { ok: false; error: string };

// Kostenbremse pro Person: höchstens so viele KI-Läufe je angefangener Stunde.
const TEXT_RUNS_PER_HOUR = 30;

/**
 * Stunden-Zähler im app_metadata des Nutzers (lib/ai-rate-limit). Fällt der Zähler aus, läuft
 * die Aktion trotzdem (die 40-Schritte-Kappe begrenzt die Kosten je Lauf).
 */
async function takeTextRun(userId: string): Promise<boolean> {
  return takeHourlyAiRun(userId, "ai_text_runs", TEXT_RUNS_PER_HOUR);
}

/** Vorschläge für bessere Schritt-Titel/-Texte (Ablauf-Reihenfolge, max. 40 Schritte). */
export async function suggestStepTextImprovements(tutorialId: string): Promise<SuggestTextsResult> {
  const ctx = await requireTutorialAccess(tutorialId);
  if (!canEdit(ctx.role)) return { ok: false, error: "Nur Inhaber und Bearbeiter können Texte verbessern." };
  // KI-Aufruf (kostet) → erst ab Pro.
  if (!isPro(ctx.account)) return { ok: false, error: PRO_REQUIRED };
  if (!aiConfigured()) return { ok: false, error: "Die KI ist gerade nicht verfügbar." };

  const supabase = await createClient();
  const [{ data: steps }, { data: tut }] = await Promise.all([
    supabase.from("steps").select("*").eq("tutorial_id", tutorialId).returns<(Step & { file_meta?: { filename?: string } | null })[]>(),
    supabase.from("tutorials").select("title, root_step_id, site_domains").eq("id", tutorialId).maybeSingle(),
  ]);
  const all = steps ?? [];
  if (!all.length) return { ok: false, error: "Die Anleitung hat noch keine Schritte." };
  const { data: branches } = await supabase
    .from("step_branches")
    .select("*")
    .in("step_id", all.map((s) => s.id))
    .returns<StepBranch[]>();
  const ordered = flowOrder(all, branches ?? [], (tut?.root_step_id as string | null) ?? null);
  const capped = ordered.length > MAX_GUIDE_STEPS;
  const chosen = ordered.slice(0, MAX_GUIDE_STEPS);

  const inputs: { step: Step; input: RefineStep }[] = [];
  for (const s of chosen) {
    const input = refineStepFromSaved(s);
    if (input) inputs.push({ step: s, input });
  }
  if (!inputs.length) return { ok: true, items: [], total: 0, capped };

  if (!(await takeTextRun(ctx.userId))) {
    return { ok: false, error: "Sie haben die KI in der letzten Stunde oft genutzt. Bitte versuchen Sie es später erneut." };
  }

  const { results, failed, calls } = await suggestStepTexts(
    {
      guideTitle: (tut?.title as string | null) ?? null,
      domains: Array.isArray(tut?.site_domains) ? (tut.site_domains as string[]) : [],
    },
    inputs.map((x) => x.input),
  );
  if (failed === calls) {
    return { ok: false, error: "Die KI hat gerade nicht geantwortet. Es wurde nichts geändert – bitte später erneut versuchen." };
  }
  const items: StepTextSuggestion[] = [];
  inputs.forEach(({ step, input }, i) => {
    const r = results[i];
    if (!r) return;
    items.push({
      stepId: step.id,
      oldTitle: input.title,
      oldBody: input.bodyText,
      newTitle: r.title,
      newBody: r.body,
    });
  });
  return { ok: true, items, total: inputs.length, capped };
}

/**
 * Titel/Texte mehrerer Schritte auf einmal speichern („Übernehmen“ und „Rückgängig“). body:
 * String = ein Absatz (wird zu Tiptap), Objekt = Tiptap-Dokument (Rückgängig stellt das Original
 * samt Formatierung wieder her), fehlt = Text bleibt. Nebenwirkungen wie updateStep: Cache,
 * Übersetzungen (Delta), Vorlesen, KI-Assistent-Index.
 */
export async function applyStepTexts(
  tutorialId: string,
  patches: { stepId: string; title: string; body?: unknown }[],
): Promise<{ ok: true; count: number } | { ok: false; error: string; savedIds?: string[] }> {
  const ctx = await requireTutorialAccess(tutorialId);
  if (!canEdit(ctx.role)) return { ok: false, error: "Nur Inhaber und Bearbeiter können Texte ändern." };
  if (!Array.isArray(patches) || patches.length === 0) return { ok: true, count: 0 };
  if (patches.length > MAX_GUIDE_STEPS) return { ok: false, error: "Zu viele Schritte auf einmal." };

  const clean: { id: string; patch: { title: string; body?: unknown } }[] = [];
  for (const p of patches) {
    if (!p || typeof p.stepId !== "string" || typeof p.title !== "string") {
      return { ok: false, error: "Ungültige Änderung." };
    }
    const patch: { title: string; body?: unknown } = { title: p.title.replace(/\s+/g, " ").trim().slice(0, 300) };
    if (typeof p.body === "string") patch.body = mkBody(p.body.slice(0, 2000));
    else if (p.body === null) patch.body = null;
    else if (p.body && typeof p.body === "object") {
      if ((p.body as { type?: unknown }).type !== "doc" || JSON.stringify(p.body).length > 100_000) {
        return { ok: false, error: "Ungültiger Text." };
      }
      patch.body = p.body;
    }
    clean.push({ id: p.stepId, patch });
  }

  // Alle Schritte MÜSSEN zu dieser Anleitung gehören (sonst nichts ändern).
  const supabase = await createClient();
  const ids = [...new Set(clean.map((c) => c.id))];
  const { data: own } = await supabase.from("steps").select("id").eq("tutorial_id", tutorialId).in("id", ids);
  if ((own ?? []).length !== ids.length) return { ok: false, error: "Schritt nicht gefunden." };

  const done: string[] = [];
  for (const c of clean) {
    const { error } = await supabase.from("steps").update(c.patch).eq("id", c.id).eq("tutorial_id", tutorialId);
    if (error) {
      console.error("[texte-ki] Speichern:", error.message);
      break;
    }
    done.push(c.id);
  }
  if (done.length) {
    await invalidateTutorialTags(tutorialId);
    await markTranslationsStale(tutorialId);
    after(async () => {
      for (const id of done) {
        await translateStepDelta(id);
        await ensureStepAudio(id);
      }
    });
    after(() => reindexTutorialIfLive(tutorialId));
  }
  if (done.length < clean.length) {
    // savedIds: diese Schritte SIND gespeichert — der Client übernimmt sie, sonst überschriebe
    // ein späteres Speichern im Panel sie wieder mit dem alten Text.
    return {
      ok: false,
      error: `Nur ${done.length} von ${clean.length} Schritten gespeichert. Bitte erneut versuchen.`,
      savedIds: done,
    };
  }
  return { ok: true, count: done.length };
}
