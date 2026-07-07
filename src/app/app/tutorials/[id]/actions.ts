"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { burnBlur, hasBlur } from "@/lib/redact";
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
} from "@/app/app/actions-translate";
import { ensureStepAudio, removeStepAudio } from "@/lib/tts";
import { YES } from "@/lib/builder/constants";
import { normalizeDomain, mergeDomains } from "@/lib/site-domains";
import { validateStepCondition } from "@/lib/guide";

// Hinweis: Diese Builder-Actions persistieren NUR (kein revalidatePath).
// Die UI führt der Client optimistisch & sofort; der Server speichert im
// Hintergrund. IDs für Inserts kommen vom Client (crypto.randomUUID), damit
// das Einfügen ohne Roundtrip sichtbar ist.

/** Neuen Schritt anlegen (Client liefert id + Verdrahtung). */
export async function addStep(
  tutorialId: string,
  step: { id: string; title: string; position: number },
  setRoot: boolean,
  wire: { branchId: string; fromStepId: string } | null,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("steps").insert({
    id: step.id,
    tutorial_id: tutorialId,
    title: step.title,
    position: step.position,
    is_decision: false,
  });
  if (error) throw new Error(error.message);

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
    if (be) throw new Error(be.message);
  }
  await invalidateTutorialTags(tutorialId); // nur wirksam, wenn veröffentlicht
  await markTranslationsStale(tutorialId); // neuer Schritt -> Übersetzungen unvollständig
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
  const supabase = await createClient();
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("steps").update(patch).eq("id", stepId);
  if (error) throw new Error(error.message);

  // Ist das Tutorial VERÖFFENTLICHT und Bild/Markierungen haben sich geändert,
  // muss die öffentliche Bild-Kopie nachgezogen werden — inkl. eingebranntem Blur.
  // Sonst bliebe z. B. eine nachträglich geschwärzte Stelle öffentlich lesbar.
  if ("image_path" in patch || "highlights" in patch) {
    await refreshPublicImage(stepId).catch((e) =>
      console.error("Public-Bild-Refresh fehlgeschlagen:", e instanceof Error ? e.message : e),
    );
  }
  await invalidateStepTags(stepId); // nur wirksam, wenn veröffentlicht
  // Nur Text-Änderungen entwerten Übersetzungen (Bild/Markierungen sind sprachneutral).
  if ("title" in patch || "body" in patch) {
    await markTranslationsStaleByStep(stepId); // sofort veraltet …
    after(() => translateStepDelta(stepId)); // … und im Hintergrund nachziehen (Delta-Sync)
    // Vorlesen: Text geändert -> Audio nachziehen (nur published+public, Hash-Cache
    // vermeidet Doppelkosten). ensureStepAudio wirft nicht -> stört den Save nie.
    after(() => ensureStepAudio(stepId));
  }
}

/** Öffentliche Kopie des Schritt-Bilds neu erzeugen (Blur eingebrannt). */
async function refreshPublicImage(stepId: string) {
  const supabase = await createClient();
  // RLS-sichtbarer Read: liefert nur Schritte aus eigenen Tutorials.
  const { data: step } = await supabase
    .from("steps")
    .select("image_path, highlights, tutorials!inner(status, visibility)")
    .eq("id", stepId)
    .maybeSingle();
  if (!step) return;
  const tut = Array.isArray(step.tutorials) ? step.tutorials[0] : step.tutorials;
  // Nur öffentliche, veröffentlichte Tutorials haben eine public Bild-Kopie.
  if (tut?.status !== "published" || tut?.visibility !== "public") return;

  const admin = createAdminClient();
  if (!step.image_path) return; // Bild entfernt -> unpublish räumt public auf
  const { data: blob } = await admin.storage.from("tutorial-images").download(step.image_path);
  if (!blob) return;
  let buf: Buffer = Buffer.from(await blob.arrayBuffer());
  if (hasBlur(step.highlights)) buf = await burnBlur(buf, step.highlights);
  await admin.storage
    .from("tutorial-images-public")
    .upload(step.image_path, buf, { upsert: true, contentType: "image/webp" });
}

/** Frage an/aus. Server spiegelt exakt die optimistische Client-Logik. */
export async function setDecision(stepId: string, isDecision: boolean) {
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
  const supabase = await createClient();
  const { error } = await supabase.from("step_branches").insert(branch);
  if (error) throw new Error(error.message);
  await invalidateStepTags(branch.step_id);
  await markTranslationsStaleByStep(branch.step_id);
  if (branch.label?.trim()) after(() => translateBranchDelta(branch.id));
}

export async function updateBranch(
  branchId: string,
  patch: { label?: string; target_step_id?: string | null; color?: string | null },
) {
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
  const supabase = await createClient();

  // Vorlese-Audio des Schritts VOR dem Delete aus dem public Bucket räumen (danach
  // ist der Pfad weg; der DB-Row-Delete wird durch das Nullen nicht behindert).
  const { data: victim } = await supabase
    .from("steps")
    .select("id, audio_path")
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
  await invalidateTutorialTags(tutorialId);
  await markTranslationsStale(tutorialId); // Schritt entfernt -> Übersetzungen veraltet
}

/**
 * Wurzel-Schritt eines Tutorials setzen (Schritt-Umordnen: wenn der bisherige
 * Startschritt getauscht wird, wird der Nachbar zur neuen Wurzel). Additiv —
 * persistiert nur, die UI führt optimistisch.
 */
export async function setRootStep(tutorialId: string, stepId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tutorials")
    .update({ root_step_id: stepId })
    .eq("id", tutorialId);
  if (error) throw new Error(error.message);
  await invalidateTutorialTags(tutorialId);
}

/** Kategorie anlegen (§7.3, „on the fly" aus der Combobox). */
export async function createCategory(name: string): Promise<{ id: string; name: string }> {
  const clean = name.trim();
  if (!clean) throw new Error("Name fehlt");
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
}

/** Tutorial-Titel ändern. */
export async function setTutorialTitle(tutorialId: string, title: string) {
  const clean = title.trim();
  if (!clean) throw new Error("Titel fehlt");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tutorials")
    .update({ title: clean })
    .eq("id", tutorialId);
  if (error) throw new Error(error.message);
  await invalidateTutorialTags(tutorialId);
  await markTranslationsStale(tutorialId);
  after(() => translateTitleDelta(tutorialId));
}

/**
 * Kurzbeschreibung des Tutorials (Untertitel auf der Hilfe-Seiten-Karte + Suchtreffer).
 * Leer = entfernen (Karte zeigt dann nur den Titel). Richards Fund 06.07.: Das Feld
 * wurde auf /h angezeigt, war aber im Builder nirgends editierbar (nur Seeds setzten es).
 * Auto-Sync (Welle 29): wie setTutorialTitle stößt die Beschreibung jetzt die Delta-
 * Übersetzung an (translateTitleDelta übersetzt Titel + Beschreibung zusammen), damit die
 * EN/PL/TR-Hub-Karten die übersetzte Beschreibung zeigen statt der deutschen.
 */
export async function setTutorialDescription(tutorialId: string, description: string) {
  const clean = description.replace(/\s+/g, " ").trim().slice(0, 160);
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
 * Auto-Schwärzung (Welle 28): Wie viele Schritte tragen noch UNGEPRÜFTE automatische
 * Schwärzungen (Highlight vom Typ „blur“ mit `suggested:true`)? Dient dem UI-Gate vor
 * dem Veröffentlichen im Builder-Header — rein informativ, blockiert NICHT. RLS-sicher:
 * liefert nur Schritte aus eigenen Tutorials.
 */
export async function countUnreviewedBlurSteps(tutorialId: string): Promise<number> {
  const supabase = await createClient();
  const { data: steps } = await supabase
    .from("steps")
    .select("highlights")
    .eq("tutorial_id", tutorialId);
  let n = 0;
  for (const s of steps ?? []) {
    const hs = Array.isArray(s.highlights) ? s.highlights : [];
    if (
      hs.some(
        (h) => h && typeof h === "object" && (h as { suggested?: unknown }).suggested === true,
      )
    ) {
      n++;
    }
  }
  return n;
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
  const supabase = await createClient();
  const { error } = await supabase
    .from("tutorials")
    .update({ category_id: categoryId })
    .eq("id", tutorialId);
  if (error) throw new Error(error.message);
  await invalidateTutorialTags(tutorialId);
}
