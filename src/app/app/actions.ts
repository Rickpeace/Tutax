"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount, requireTutorialAccess } from "@/lib/account";
import { slugify, fallbackSlug } from "@/lib/slug";
import { removeUnusedPublicCopies } from "@/lib/public-images";
import { GUIDE_TITLE_MAX } from "@/lib/text-limits";
import { indexTutorial, reindexTutorialIfLive, removeTutorialEmbeddings } from "@/lib/kb";
import { burnBlur, unionBlurs } from "@/lib/redact";
import { invalidateTutorialTags, invalidateHubTag } from "@/lib/cache-tags";
import { markTranslationsStale } from "@/lib/translate-stale";
import {
  translateTutorial,
  translateTitleDelta,
  translateAccountCategories,
} from "@/lib/translate-jobs";
import {
  CATEGORY_NAME_MAX,
  CATEGORY_NAME_EMPTY,
  CATEGORY_NAME_TOO_LONG,
  categoryNameKey,
  categoryNameTaken,
  cleanCategoryName,
} from "@/lib/category-name";
import { ensureTutorialAudio, removeTutorialAudio } from "@/lib/tts";
import { isExtraLang } from "@/lib/i18n-hub";
import {
  FREE_TUTORIAL_LIMIT,
  isPro,
  isBusiness,
  BUSINESS_REQUIRED,
  audienceGateError,
} from "@/lib/plan";
import { TUTORIAL_QUOTA_MESSAGE } from "@/lib/tutorial-quota";
import type { Account, Step, StepBranch, Tutorial } from "@/lib/types";
import { withUserErrors, UserError } from "@/lib/action-error";

const PRIVATE_BUCKET = "tutorial-images";
const PUBLIC_BUCKET = "tutorial-images-public";

/**
 * Free-Limit: zählt eigene Tutorials (OHNE Template-Forks — die sind Teil des
 * Template-Features und sollen nicht aufs Limit schlagen). Pro = unbegrenzt.
 */
async function tutorialQuotaReached(
  supabase: Awaited<ReturnType<typeof createClient>>,
  account: Account,
): Promise<boolean> {
  if (isPro(account)) return false;
  const [{ count: total }, { count: forks }] = await Promise.all([
    supabase
      .from("tutorials")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id),
    supabase
      .from("account_templates")
      .select("template_id", { count: "exact", head: true })
      .eq("account_id", account.id)
      .not("forked_tutorial_id", "is", null),
  ]);
  return (total ?? 0) - (forks ?? 0) >= FREE_TUTORIAL_LIMIT;
}

/**
 * Vorab-Prüfung für den Video-Upload im Browser (video-upload.tsx): Free-Limit erreicht? Dann
 * die deutsche Meldung, sonst null — BEVOR das Video hochgeladen und der Auftrag eingereiht
 * wird. Der Video-Worker prüft kurz vor dem Anlegen noch einmal (maßgeblich).
 */
export async function videoUploadQuotaError(): Promise<string | null> {
  const { account } = await requireAccount();
  const supabase = await createClient();
  return (await tutorialQuotaReached(supabase, account)) ? TUTORIAL_QUOTA_MESSAGE : null;
}

/** Neues Tutorial anlegen (optional in einer Kategorie) und in den Editor springen */
export async function createTutorial(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim() || "Neue Anleitung";
  const categoryId = (String(formData.get("category_id") ?? "") || null) as string | null;
  const { account } = await requireAccount();
  const supabase = await createClient();

  if (await tutorialQuotaReached(supabase, account)) {
    redirect("/app/settings/tarif?limit=tutorials");
  }

  const { data, error } = await supabase
    .from("tutorials")
    .insert({ account_id: account.id, title, category_id: categoryId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/app");
  redirect(`/app/tutorials/${data.id}`);
}

/**
 * EIGENE Kategorie löschen (Welle 20; Welle 54: auch mit Anleitungen darin).
 * Sicherheit serverseitig:
 *  - requireAccount(): nur Rollen, die bearbeiten dürfen (Inhaber/Bearbeiter; Mitarbeiter
 *    werden abgewiesen) — Rechteprüfung über canEdit.
 *  - Kategorie muss dem aktiven Konto gehören (globale/Standard-Kategorien mit
 *    account_id = null werden NIE gelöscht — RLS + expliziter Check).
 * Die Anleitungen darin bleiben erhalten: der Fremdschlüssel steht auf „on delete set null“
 * → sie landen unter „Sonstiges“. Danach Anleitungen-Übersicht revalidieren, Hub- und
 * Anleitungs-Caches invalidieren und (Kategorie steckt in den KI-Ausschnitten) veröffentlichte
 * Anleitungen neu indizieren. Rückgabe: wie viele Anleitungen nach „Sonstiges“ gewandert sind.
 */
export const deleteCategory = withUserErrors(async function deleteCategory(categoryId: string): Promise<{ moved: number }> {
  const { account } = await requireAccount();
  const supabase = await createClient();

  // Nur eigene Kategorie (account_id gesetzt + == aktives Konto). Globale ausschließen.
  const { data: cat, error: ce } = await supabase
    .from("categories")
    .select("id, account_id")
    .eq("id", categoryId)
    .maybeSingle();
  if (ce) throw new Error(ce.message);
  if (!cat || cat.account_id !== account.id) {
    throw new UserError("Kategorie kann nicht gelöscht werden.");
  }

  // Betroffene Anleitungen VOR dem Löschen merken (danach ist category_id schon null).
  const { data: affected, error: ae } = await supabase
    .from("tutorials")
    .select("id")
    .eq("account_id", account.id)
    .eq("category_id", categoryId);
  if (ae) throw new Error(ae.message);
  const affectedIds = (affected ?? []).map((t) => t.id as string);

  // .select(): ein von RLS still verweigertes Löschen (0 Zeilen) nicht als Erfolg melden.
  const { data: gone, error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("account_id", account.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!gone?.length) throw new UserError("Kategorie kann nicht gelöscht werden.");

  invalidateHubTag(account.slug);
  for (const id of affectedIds) await invalidateTutorialTags(id);
  if (affectedIds.length) {
    after(async () => {
      for (const id of affectedIds) await reindexTutorialIfLive(id);
    });
  }
  revalidatePath("/app");
  return { moved: affectedIds.length };
});

/**
 * EIGENE Kategorie umbenennen. Sicherheit wie deleteCategory: requireAccount() (nur Rollen
 * mit Bearbeiten-Recht) + Kategorie muss dem aktiven Konto gehören (globale/Standard-
 * Kategorien mit account_id = null nie). Regeln: nicht leer, höchstens CATEGORY_NAME_MAX
 * Zeichen, kein zweiter gleicher Name im Konto (Groß/Klein egal).
 * Folgen: Die Hilfe-Seite hat keine Kategorie-URLs (Gruppen-Überschriften hängen nur am
 * Namen) — es brechen also keine Links; die Kategorie-Farbe leitet sich aus dem Namen ab
 * und kann wechseln. Übersetzte Namen (name_i18n) werden verworfen (Hilfe-Seite zeigt
 * sofort den neuen deutschen Namen) und im Hintergrund neu übersetzt. Der Name steckt in
 * den KI-Ausschnitten → veröffentlichte Anleitungen der Kategorie neu indizieren.
 */
export const renameCategory = withUserErrors(async function renameCategory(
  categoryId: string,
  name: string,
): Promise<{ name: string }> {
  const { account } = await requireAccount();
  const clean = cleanCategoryName(String(name ?? ""));
  if (!clean) throw new UserError(CATEGORY_NAME_EMPTY);
  if (clean.length > CATEGORY_NAME_MAX) throw new UserError(CATEGORY_NAME_TOO_LONG);
  const supabase = await createClient();

  // Nur eigene Kategorie (account_id gesetzt + == aktives Konto). Globale ausschließen.
  const { data: cat, error: ce } = await supabase
    .from("categories")
    .select("id, account_id, name")
    .eq("id", categoryId)
    .maybeSingle();
  if (ce) throw new Error(ce.message);
  if (!cat || cat.account_id !== account.id) {
    throw new UserError("Kategorie kann nicht umbenannt werden.");
  }
  if (cat.name === clean) return { name: clean }; // nichts zu tun

  // Duplikat im selben Konto (Groß/Klein egal, die Kategorie selbst ausgenommen).
  const { data: siblings, error: se } = await supabase
    .from("categories")
    .select("id, name")
    .eq("account_id", account.id);
  if (se) throw new Error(se.message);
  const key = categoryNameKey(clean);
  const taken = (siblings ?? []).find(
    (c) => c.id !== categoryId && categoryNameKey(String(c.name ?? "")) === key,
  );
  if (taken) throw new UserError(categoryNameTaken(String(taken.name)));

  // .select(): ein von RLS still verweigertes Update (0 Zeilen) nicht als Erfolg melden.
  const { data: done, error } = await supabase
    .from("categories")
    .update({ name: clean, name_i18n: null })
    .eq("id", categoryId)
    .eq("account_id", account.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!done?.length) throw new UserError("Kategorie kann nicht umbenannt werden.");

  const { data: affected } = await supabase
    .from("tutorials")
    .select("id")
    .eq("account_id", account.id)
    .eq("category_id", categoryId);
  const affectedIds = (affected ?? []).map((t) => t.id as string);

  invalidateHubTag(account.slug);
  for (const id of affectedIds) await invalidateTutorialTags(id);
  after(async () => {
    for (const id of affectedIds) await reindexTutorialIfLive(id);
    await translateAccountCategories(account.id);
    invalidateHubTag(account.slug); // neue Übersetzungen sichtbar machen
  });
  revalidatePath("/app");
  return { name: clean };
});

export async function renameTutorial(id: string, title: string) {
  await requireTutorialAccess(id);
  // Länge begrenzt (Karten, Suchtreffer, Hilfe-Seite) — gleiche Grenze wie im Formular.
  const clean = title.replace(/\s+/g, " ").trim().slice(0, GUIDE_TITLE_MAX);
  if (!clean) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("tutorials")
    .update({ title: clean, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await invalidateTutorialTags(id);
  await markTranslationsStale(id);
  after(() => translateTitleDelta(id));
  after(() => reindexTutorialIfLive(id)); // Titel steckt in jedem Chatbot-Ausschnitt
  revalidatePath("/app");
}

export async function deleteTutorial(id: string) {
  await requireTutorialAccess(id);
  const { account } = await requireAccount();
  const supabase = await createClient();
  await removeTutorialEmbeddings(supabase, id).catch(() => {});
  await invalidateTutorialTags(id); // VOR dem Delete (danach ist der Slug-Lookup weg)
  // Bildpfade VOR dem Delete merken: danach die öffentlichen Kopien entfernen, die keine andere
  // veröffentlichte Anleitung mehr nutzt (Sicherheitsprüfung Welle 51, H2).
  const { data: goneSteps } = await supabase
    .from("steps")
    .select("image_path")
    .eq("tutorial_id", id)
    .not("image_path", "is", null);
  // SCHUTZRIEGEL (Incident 06.07.): NUR eigene Tutorials. Der Plattform-Admin hat via
  // RLS-Policy „admin manage template tutorials" auch Löschrecht auf GLOBALE Templates
  // (account_id NULL) — ohne diese Scopung konnte ein (Bulk-)Löschen in der Bibliothek
  // versehentlich die Standard-Vorlagen aller Kunden treffen. Vorlagen löscht
  // ausschließlich /admin über deleteTemplate.
  const { error } = await supabase
    .from("tutorials")
    .delete()
    .eq("id", id)
    .eq("account_id", account.id);
  if (error) throw new Error(error.message);
  await removeUnusedPublicCopies(
    (goneSteps ?? []).map((s) => s.image_path as string | null),
    { exceptTutorialId: id },
  ).catch((e) => console.error("Öffentliche Bilder nicht entfernt:", e instanceof Error ? e.message : e));
  revalidatePath("/app");
}

/** Tiefkopie: Tutorial + Schritte + Branches (mit ID-Remapping) */
export async function duplicateTutorial(id: string) {
  await requireTutorialAccess(id);
  const { account } = await requireAccount();
  const supabase = await createClient();

  if (await tutorialQuotaReached(supabase, account)) {
    redirect("/app/settings/tarif?limit=tutorials");
  }

  const { data: src, error: e1 } = await supabase
    .from("tutorials")
    .select("*")
    .eq("id", id)
    .single<Tutorial>();
  if (e1 || !src) throw new Error(e1?.message ?? "Anleitung nicht gefunden");

  const { data: copy, error: e2 } = await supabase
    .from("tutorials")
    .insert({
      account_id: account.id,
      category_id: src.category_id,
      title: `${src.title} (Kopie)`,
      description: src.description,
      status: "draft",
      // Live-Führung/Extension-Matching: für welche Websites die Anleitung gilt.
      site_domains: src.site_domains ?? [],
    })
    .select("id")
    .single();
  if (e2 || !copy) throw new Error(e2?.message ?? "Kopie fehlgeschlagen");

  try {
    await copyStepsInto(supabase, id, copy.id, src.root_step_id);
  } catch (e) {
    // Keine halbe Kopie stehen lassen (Schritte/Branches hängen per Cascade an der Anleitung).
    await supabase.from("tutorials").delete().eq("id", copy.id).eq("account_id", account.id);
    throw e;
  }

  revalidatePath("/app");
}

// Schritt-Spalten, die eine Kopie mitnimmt: Inhalt UND Live-Führungs-/Automations-Daten
// (Selektor, Seiten-URL, Bedingung, Sprung, Bedienart, Datei-Brücke, Video-Zeitpunkt).
// Bewusst NICHT: audio_path/audio_hash (öffentliche MP3 der Quelle — die Kopie ist Entwurf und
// erzeugt ihr Vorlesen beim Veröffentlichen selbst; ein geteilter Pfad würde beim Löschen der
// Kopie das Audio der Quelle mit entfernen) und chapter_id (gehört zur Quell-Anleitung).
const COPIED_STEP_COLUMNS = [
  "title",
  "body",
  "image_path",
  "image_width",
  "image_height",
  "highlights",
  "position",
  "is_decision",
  "page_url",
  "selector",
  "condition",
  "jump", // verweist per to_position (nicht per ID) — Positionen werden 1:1 kopiert
  "interaction",
  "file_meta",
  "video_time",
] as const;

/** Tiefkopie der Schritte + Branches (neue IDs, Verweise umgemappt); wirft bei jedem Fehler. */
async function copyStepsInto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fromTutorialId: string,
  toTutorialId: string,
  rootStepId: string | null,
) {
  const { data: steps, error: se } = await supabase
    .from("steps")
    .select("*")
    .eq("tutorial_id", fromTutorialId)
    .returns<Step[]>();
  if (se) throw new Error(se.message);
  if (!steps?.length) return;

  const idMap = new Map<string, string>(steps.map((s) => [s.id, crypto.randomUUID()]));
  const stepRows = steps.map((s) => {
    const row: Record<string, unknown> = { id: idMap.get(s.id), tutorial_id: toTutorialId };
    // Nur Spalten, die die Quelle wirklich hat (bleibt heil, falls eine Migration noch fehlt).
    for (const col of COPIED_STEP_COLUMNS) if (col in s) row[col] = (s as Record<string, unknown>)[col];
    return row;
  });
  const { error: ie } = await supabase.from("steps").insert(stepRows);
  if (ie) throw new Error(ie.message);

  const { data: branches, error: be } = await supabase
    .from("step_branches")
    .select("*")
    .in(
      "step_id",
      steps.map((s) => s.id),
    )
    .returns<StepBranch[]>();
  if (be) throw new Error(be.message);

  if (branches?.length) {
    const rows = branches.map((b) => ({
      step_id: idMap.get(b.step_id)!,
      label: b.label,
      color: b.color,
      target_step_id: b.target_step_id
        ? (idMap.get(b.target_step_id) ?? null)
        : null,
      position: b.position,
    }));
    const { error } = await supabase.from("step_branches").insert(rows);
    if (error) throw new Error(error.message);
  }

  if (rootStepId && idMap.get(rootStepId)) {
    const { error } = await supabase
      .from("tutorials")
      .update({ root_step_id: idMap.get(rootStepId) })
      .eq("id", toTutorialId);
    if (error) throw new Error(error.message);
  }
}

/**
 * Eindeutigen Slug pro Account sicherstellen. Gibt einen vorhandenen Slug unverändert
 * zurück, sonst leitet er aus dem Titel einen freien ab.
 */
async function ensureSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  tutorialId: string,
  title: string,
  currentSlug: string | null,
): Promise<string> {
  if (currentSlug) return currentSlug;
  // Titel ohne Buchstaben/Zahlen (z. B. „###“) ergibt keinen Slug mehr -> stabile
  // Ersatz-Adresse aus der Kennung, damit die Anleitung trotzdem einen Link bekommt.
  const base = slugify(title) || fallbackSlug("anleitung", tutorialId);
  // Belegt sind eigene Slugs UND die Slugs veröffentlichter Standard-Vorlagen: beide teilen
  // sich den Adressraum /h/<konto>/<slug>. Sonst verdeckte die eigene Anleitung eine
  // (später) aktivierte Vorlage — zwei Hub-Karten mit derselben Adresse, eine unerreichbar.
  const [{ data: existing }, { data: templates }] = await Promise.all([
    supabase
      .from("tutorials")
      .select("slug")
      .eq("account_id", accountId)
      .not("slug", "is", null)
      .neq("id", tutorialId),
    supabase
      .from("tutorials")
      .select("slug")
      .eq("is_template", true)
      .eq("status", "published")
      .not("slug", "is", null),
  ]);
  const taken = new Set([...(existing ?? []), ...(templates ?? [])].map((t) => t.slug));
  let slug = base;
  let n = 1;
  while (taken.has(slug)) slug = `${base}-${++n}`;
  return slug;
}

/**
 * Schritt-Bilder vom privaten in den öffentlichen Bucket kopieren.
 * WICHTIG: Blur-Markierungen werden dabei IN DIE PIXEL gebrannt — der Filter im
 * Viewer ist nur Optik; ohne Einbrennen läge das unredigierte Original öffentlich.
 */
async function copyImagesToPublic(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tutorialId: string,
): Promise<void> {
  const { data: steps } = await supabase
    .from("steps")
    .select("image_path, highlights")
    .eq("tutorial_id", tutorialId)
    .not("image_path", "is", null);

  // Welle 51a: Schritte können sich ein Bild teilen („Bild in neuen Schritt übernehmen“, auch
  // Duplikate). Die öffentliche Kopie gibt es je Pfad nur einmal -> je Pfad EINMAL kopieren und
  // die Vereinigung ALLER Verpixelungen der Schritte mit diesem Bild einbrennen (RLS: eigene).
  const paths = [...new Set((steps ?? []).map((s) => s.image_path).filter(Boolean) as string[])];
  const blursByPath = new Map<string, unknown[]>();
  if (paths.length) {
    const { data: sharing } = await supabase
      .from("steps")
      .select("image_path, highlights")
      .in("image_path", paths);
    for (const s of [...(steps ?? []), ...(sharing ?? [])]) {
      if (!s.image_path) continue;
      const list = blursByPath.get(s.image_path) ?? [];
      list.push(s.highlights);
      blursByPath.set(s.image_path, list);
    }
  }

  const admin = createAdminClient();
  for (const path of paths) {
    const { data: blob } = await admin.storage.from(PRIVATE_BUCKET).download(path);
    if (blob) {
      let buf: Buffer = Buffer.from(await blob.arrayBuffer());
      const blurs = unionBlurs(blursByPath.get(path) ?? []);
      if (blurs.length) {
        try {
          buf = await burnBlur(buf, blurs);
        } catch (e) {
          // Lieber Abbruch als unredigierte Daten veröffentlichen.
          console.error("Blur-Einbrennen fehlgeschlagen:", e instanceof Error ? e.message : e);
          throw new UserError("Veröffentlichen abgebrochen: Die Verpixelung konnte nicht angewendet werden.");
        }
      }
      const { error: upErr } = await admin.storage
        .from(PUBLIC_BUCKET)
        .upload(path, buf, { upsert: true, contentType: "image/webp", cacheControl: "60" });
      if (upErr) throw new UserError("Veröffentlichen abgebrochen: Ein Bild konnte nicht hochgeladen werden.");
    }
  }
}

/** Öffentliche Bild-Kopien eines Tutorials entfernen (Wechsel zu intern / unpublish). */
async function removePublicImages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tutorialId: string,
): Promise<void> {
  const { data: steps } = await supabase
    .from("steps")
    .select("image_path")
    .eq("tutorial_id", tutorialId)
    .not("image_path", "is", null);
  // Nur Kopien entfernen, die keine ANDERE veröffentlichte Anleitung nutzt (geteilte Pfade, M1).
  await removeUnusedPublicCopies(
    (steps ?? []).map((s) => s.image_path as string | null),
    { exceptTutorialId: tutorialId },
  );
}

/**
 * Tutorial veröffentlichen (§7 Schritt 7):
 *  - Öffentlich: eindeutigen Slug erzeugen, Bilder in den public Bucket kopieren,
 *    für den Chatbot indizieren, Hub-Caches invalidieren.
 *  - Intern: nur Status=published (= „fürs Team freigegeben") — KEINE public-Bilder,
 *    KEIN Index, KEINE Cache-Invalidierung, KEIN Slug nötig.
 */
export const publishTutorial = withUserErrors(async function publishTutorial(tutorialId: string) {
  await requireTutorialAccess(tutorialId);
  const { account } = await requireAccount();
  const supabase = await createClient();

  const { data: tutorial, error } = await supabase
    .from("tutorials")
    .select("id, title, slug, account_id, visibility")
    .eq("id", tutorialId)
    .single<Pick<Tutorial, "id" | "title" | "slug" | "account_id" | "visibility">>();
  if (error || !tutorial) throw new Error(error?.message ?? "Anleitung nicht gefunden");

  // Letzte Sperre gegen leere Anleitungen (Editor und Karte sperren schon in der Oberfläche):
  // eine Anleitung ohne Schritte darf NIE veröffentlicht werden — sonst steht auf der
  // Hilfe-Seite bzw. in den Schulungen ein leerer Eintrag. Rechteprüfungen bleiben unverändert.
  const { count: stepCount } = await supabase
    .from("steps")
    .select("id", { count: "exact", head: true })
    .eq("tutorial_id", tutorialId);
  if ((stepCount ?? 0) === 0) {
    throw new UserError(
      "Diese Anleitung hat noch keine Schritte. Legen Sie zuerst einen Schritt an, dann können Sie veröffentlichen.",
    );
  }

  // Interne Tutorials: „veröffentlichen" bedeutet nur fürs Team freigeben.
  if (tutorial.visibility === "internal") {
    const { error: ue } = await supabase
      .from("tutorials")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", tutorialId);
    if (ue) throw new Error(ue.message);
    revalidatePath("/app");
    return { internal: true as const };
  }

  const slug = await ensureSlug(supabase, account.id, tutorialId, tutorial.title, tutorial.slug);
  await copyImagesToPublic(supabase, tutorialId);

  const { error: ue } = await supabase
    .from("tutorials")
    .update({ status: "published", slug, published_at: new Date().toISOString() })
    .eq("id", tutorialId);
  if (ue) throw new Error(ue.message);

  // Für den Chatbot indizieren (no-op ohne OPENAI_API_KEY)
  await indexTutorial(supabase, account.id, tutorialId).catch(() => {});

  await invalidateTutorialTags(tutorialId); // öffentliche /h-Caches sofort aktualisieren

  // Mehrsprachigkeit (Welle 13): sind Zusatzsprachen aktiv, das frisch veröffentlichte
  // Tutorial im Hintergrund voll übersetzen — via after(), damit der Publish schnell
  // bleibt. Nur öffentlicher Pfad (interne Tutorials sieht niemand -> nicht übersetzen).
  const { data: acc } = await supabase
    .from("accounts")
    .select("languages")
    .eq("id", account.id)
    .single();
  const hasLangs = ((acc?.languages as string[] | null) ?? []).some(isExtraLang);
  if (hasLangs) {
    after(() =>
      translateTutorial(tutorialId).catch((e) =>
        console.error("Auto-Übersetzung beim Publish:", e instanceof Error ? e.message : e),
      ),
    );
  }

  // Vorlesen (Welle 14): Schritt-Audios beim Veröffentlichen erzeugen — via after(),
  // damit der Publish schnell bleibt. Hash-Cache verhindert Doppelkosten; nur DE (v1).
  // Nur öffentlicher Pfad (interne Tutorials sieht niemand -> kein Audio).
  after(() =>
    ensureTutorialAudio(account.id, tutorialId).catch((e) =>
      console.error("Auto-Vorlesen beim Publish:", e instanceof Error ? e.message : e),
    ),
  );

  revalidatePath("/app");
  return { slug, accountSlug: account.slug };
});

type VisibilityTutorial = Pick<
  Tutorial,
  "id" | "title" | "slug" | "account_id" | "status" | "visibility"
>;

/**
 * Kern der Sichtbarkeits-Umschaltung (intern ↔ öffentlich) — die sicherheitskritischen
 * Nebenwirkungen an EINER Stelle, damit setTutorialVisibility UND setTutorialAudience
 * (Welle 20) exakt dasselbe tun. Erwartet das bereits geladene Tutorial; ändert nur,
 * wenn sich die Sichtbarkeit wirklich unterscheidet. Nur bei PUBLISHED-Tutorials sind
 * Nebenwirkungen nötig (ein Entwurf ändert nur die Spalte):
 *  - → internal: public-Bilder entfernen, Audio/Embeddings löschen, Hub-Cache invalidieren.
 *  - → public: Slug sicherstellen, Bilder public kopieren, indizieren, übersetzen, TTS.
 */
async function applyVisibilityChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  account: Account,
  tutorial: VisibilityTutorial,
  visibility: Tutorial["visibility"],
): Promise<void> {
  if (tutorial.visibility === visibility) return; // nichts zu tun
  const isPublished = tutorial.status === "published";

  if (visibility === "internal") {
    // Erst umschalten (RAG-Guard greift danach), dann öffentliche Spuren entfernen.
    const { error: ue } = await supabase
      .from("tutorials")
      .update({ visibility })
      .eq("id", tutorial.id);
    if (ue) throw new Error(ue.message);
    if (isPublished) {
      await removePublicImages(supabase, tutorial.id).catch((e) =>
        console.error("Public-Bilder entfernen fehlgeschlagen:", e instanceof Error ? e.message : e),
      );
      // Vorlesen: public Bucket darf keine Audios interner Tutorials behalten.
      await removeTutorialAudio(tutorial.id);
      await removeTutorialEmbeddings(supabase, tutorial.id).catch(() => {});
      await invalidateTutorialTags(tutorial.id, { force: true });
    }
  } else {
    // → öffentlich
    let slug = tutorial.slug;
    if (isPublished) {
      slug = await ensureSlug(supabase, account.id, tutorial.id, tutorial.title, tutorial.slug);
      await copyImagesToPublic(supabase, tutorial.id);
    }
    const { error: ue } = await supabase
      .from("tutorials")
      .update({ visibility, ...(slug ? { slug } : {}) })
      .eq("id", tutorial.id);
    if (ue) throw new Error(ue.message);
    if (isPublished) {
      await indexTutorial(supabase, account.id, tutorial.id).catch(() => {});
      await invalidateTutorialTags(tutorial.id);
      // Wird jetzt öffentlich sichtbar -> ggf. übersetzen (wie beim Publish).
      const { data: acc } = await supabase
        .from("accounts")
        .select("languages")
        .eq("id", account.id)
        .single();
      if (((acc?.languages as string[] | null) ?? []).some(isExtraLang)) {
        after(() =>
          translateTutorial(tutorial.id).catch((e) =>
            console.error("Auto-Übersetzung (Sichtbarkeit):", e instanceof Error ? e.message : e),
          ),
        );
      }
      // Wird wieder öffentlich sichtbar -> Vorlese-Audios (neu) erzeugen (Hash-Cache).
      after(() =>
        ensureTutorialAudio(account.id, tutorial.id).catch((e) =>
          console.error("Auto-Vorlesen (Sichtbarkeit):", e instanceof Error ? e.message : e),
        ),
      );
    }
  }
}

/**
 * Sichtbarkeit umschalten (intern ↔ öffentlich). Dünner Wrapper um
 * applyVisibilityChange (Gate + Laden + revalidate).
 */
export async function setTutorialVisibility(
  tutorialId: string,
  visibility: Tutorial["visibility"],
) {
  await requireTutorialAccess(tutorialId);
  if (visibility !== "public" && visibility !== "internal") return;
  const { account } = await requireAccount();
  // Interne Tutorials + Schulungsnachweis sind Business (zurück auf öffentlich geht immer).
  if (visibility === "internal" && !isBusiness(account)) throw new UserError(BUSINESS_REQUIRED);
  const supabase = await createClient();

  const { data: tutorial, error } = await supabase
    .from("tutorials")
    .select("id, title, slug, account_id, status, visibility")
    .eq("id", tutorialId)
    .single<VisibilityTutorial>();
  if (error || !tutorial) throw new Error(error?.message ?? "Anleitung nicht gefunden");

  await applyVisibilityChange(supabase, account, tutorial, visibility);
  revalidatePath("/app");
}

/**
 * Zielgruppe eines Tutorials setzen (Welle 20, Häkchen statt Entweder-Oder):
 *  - publicOn=true  ⇒ visibility='public'  (auf der Hilfe-Seite sichtbar);
 *                     in_lernen = lernenOn  (zusätzlich im Team-Lernbereich, mit Nachweis).
 *  - publicOn=false ⇒ visibility='internal' (nur Team, Lernen implizit immer an);
 *                     in_lernen wird auf false zurückgesetzt (bei intern bedeutungslos).
 * Mappt intern auf die bestehende, sicherheitskritische Sichtbarkeits-Logik
 * (Publish-Nebenwirkungen, Business-Gate für intern) und setzt zusätzlich in_lernen.
 * „Beide aus" gibt es nicht — die UI verhindert das; hier fällt publicOn=false immer
 * auf internal (= Team sichtbar), also nie „nirgends sichtbar".
 */
export const setTutorialAudience = withUserErrors(async function setTutorialAudience(
  tutorialId: string,
  audience: { publicOn: boolean; lernenOn: boolean },
) {
  await requireTutorialAccess(tutorialId);
  const { account } = await requireAccount();
  const targetVisibility: Tutorial["visibility"] = audience.publicOn ? "public" : "internal";
  // Business-Gate: intern („nur Team“) ist Business. Öffentlich geht immer.
  if (targetVisibility === "internal" && !isBusiness(account)) throw new UserError(BUSINESS_REQUIRED);
  const supabase = await createClient();

  const { data: tutorial, error } = await supabase
    .from("tutorials")
    .select("id, title, slug, account_id, status, visibility, in_lernen")
    .eq("id", tutorialId)
    .single<VisibilityTutorial & { in_lernen: boolean | null }>();
  if (error || !tutorial) throw new Error(error?.message ?? "Anleitung nicht gefunden");

  // Pro-Gate (Tarifseite: „Schulungen mit Schulungsnachweis“ ab Pro) — nur beim
  // Einschalten; bestehende Schulungen bleiben, Abwählen geht immer (lib/plan.ts).
  const gate = audienceGateError(account, tutorial, audience);
  if (gate) throw new UserError(gate);

  // Zuerst die Sichtbarkeit über die geteilte Logik umschalten (falls nötig).
  await applyVisibilityChange(supabase, account, tutorial, targetVisibility);

  // in_lernen setzen: nur bei öffentlich relevant; intern impliziert Lernen ohnehin.
  const nextInLernen = audience.publicOn ? audience.lernenOn : false;
  const { error: le } = await supabase
    .from("tutorials")
    .update({ in_lernen: nextInLernen })
    .eq("id", tutorialId);
  if (le) throw new Error(le.message);

  revalidatePath("/app");
  return { visibility: targetVisibility, inLernen: nextInLernen };
});

/** Veröffentlichung zurückziehen: Status = draft, öffentliche Bilder entfernen. */
export async function unpublishTutorial(tutorialId: string) {
  await requireTutorialAccess(tutorialId);
  const supabase = await createClient();

  const { data: steps } = await supabase
    .from("steps")
    .select("image_path")
    .eq("tutorial_id", tutorialId)
    .not("image_path", "is", null);

  // Nur Kopien entfernen, die keine ANDERE veröffentlichte Anleitung nutzt (geteilte Pfade, M1).
  await removeUnusedPublicCopies(
    (steps ?? []).map((s) => s.image_path as string | null),
    { exceptTutorialId: tutorialId },
  );

  const { error } = await supabase
    .from("tutorials")
    .update({ status: "draft" })
    .eq("id", tutorialId);
  if (error) throw new Error(error.message);

  // Vorlesen: zurückgezogenes Tutorial darf keine Audios im public Bucket behalten.
  await removeTutorialAudio(tutorialId);
  await removeTutorialEmbeddings(supabase, tutorialId).catch(() => {});

  // force: Status ist gerade eben draft geworden — Cache trotzdem sofort räumen.
  await invalidateTutorialTags(tutorialId, { force: true });
  revalidatePath("/app");
}
