"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { slugify } from "@/lib/slug";
import { indexTutorial, removeTutorialEmbeddings } from "@/lib/kb";
import { burnBlur, hasBlur } from "@/lib/redact";
import { invalidateTutorialTags } from "@/lib/cache-tags";
import { markTranslationsStale } from "@/lib/translate-stale";
import { translateTutorial, translateTitleDelta } from "@/app/app/actions-translate";
import { ensureTutorialAudio, removeTutorialAudio } from "@/lib/tts";
import { isExtraLang } from "@/lib/i18n-hub";
import { FREE_TUTORIAL_LIMIT, isPro, isBusiness, BUSINESS_REQUIRED } from "@/lib/plan";
import type { Account, Step, StepBranch, Tutorial } from "@/lib/types";

const PRIVATE_BUCKET = "tutorial-images";
const PUBLIC_BUCKET = "tutorial-images-public";

/** Aktive Organisation wechseln (nur wenn der Nutzer dort Mitglied ist). */
export async function setActiveAccount(accountId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: m } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!m) return; // nicht Mitglied -> ignorieren
  // Serverseitig in den User-Metadaten merken -> geräteübergreifend gleich.
  await supabase.auth.updateUser({ data: { active_account_id: accountId } });
  revalidatePath("/", "layout");
}

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

/** Neues Tutorial anlegen (optional in einer Kategorie) und in den Editor springen */
export async function createTutorial(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim() || "Neues Tutorial";
  const categoryId = (String(formData.get("category_id") ?? "") || null) as string | null;
  const { account } = await requireAccount();
  const supabase = await createClient();

  if (await tutorialQuotaReached(supabase, account)) {
    redirect("/app/settings/abo?limit=tutorials");
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

export async function renameTutorial(id: string, title: string) {
  const clean = title.trim();
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
  revalidatePath("/app");
}

export async function deleteTutorial(id: string) {
  const supabase = await createClient();
  await removeTutorialEmbeddings(supabase, id).catch(() => {});
  await invalidateTutorialTags(id); // VOR dem Delete (danach ist der Slug-Lookup weg)
  const { error } = await supabase.from("tutorials").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/app");
}

/** Tiefkopie: Tutorial + Schritte + Branches (mit ID-Remapping) */
export async function duplicateTutorial(id: string) {
  const { account } = await requireAccount();
  const supabase = await createClient();

  if (await tutorialQuotaReached(supabase, account)) {
    redirect("/app/settings/abo?limit=tutorials");
  }

  const { data: src, error: e1 } = await supabase
    .from("tutorials")
    .select("*")
    .eq("id", id)
    .single<Tutorial>();
  if (e1 || !src) throw new Error(e1?.message ?? "Tutorial nicht gefunden");

  const { data: copy, error: e2 } = await supabase
    .from("tutorials")
    .insert({
      account_id: account.id,
      category_id: src.category_id,
      title: `${src.title} (Kopie)`,
      description: src.description,
      status: "draft",
    })
    .select("id")
    .single();
  if (e2 || !copy) throw new Error(e2?.message ?? "Kopie fehlgeschlagen");

  const { data: steps } = await supabase
    .from("steps")
    .select("*")
    .eq("tutorial_id", id)
    .returns<Step[]>();

  if (steps?.length) {
    const idMap = new Map<string, string>();
    for (const s of steps) {
      const { data: ns, error } = await supabase
        .from("steps")
        .insert({
          tutorial_id: copy.id,
          title: s.title,
          body: s.body,
          image_path: s.image_path,
          image_width: s.image_width,
          image_height: s.image_height,
          highlights: s.highlights,
          position: s.position,
          is_decision: s.is_decision,
        })
        .select("id")
        .single();
      if (error || !ns) throw new Error(error?.message ?? "Schritt-Kopie fehlgeschlagen");
      idMap.set(s.id, ns.id);
    }

    const { data: branches } = await supabase
      .from("step_branches")
      .select("*")
      .in(
        "step_id",
        steps.map((s) => s.id),
      )
      .returns<StepBranch[]>();

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
      await supabase.from("step_branches").insert(rows);
    }

    if (src.root_step_id && idMap.get(src.root_step_id)) {
      await supabase
        .from("tutorials")
        .update({ root_step_id: idMap.get(src.root_step_id) })
        .eq("id", copy.id);
    }
  }

  revalidatePath("/app");
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
  const base = slugify(title);
  const { data: existing } = await supabase
    .from("tutorials")
    .select("slug")
    .eq("account_id", accountId)
    .not("slug", "is", null)
    .neq("id", tutorialId);
  const taken = new Set((existing ?? []).map((t) => t.slug));
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

  const admin = createAdminClient();
  for (const s of steps ?? []) {
    if (!s.image_path) continue;
    const { data: blob } = await admin.storage.from(PRIVATE_BUCKET).download(s.image_path);
    if (blob) {
      let buf: Buffer = Buffer.from(await blob.arrayBuffer());
      if (hasBlur(s.highlights)) {
        try {
          buf = await burnBlur(buf, s.highlights);
        } catch (e) {
          // Lieber Abbruch als unredigierte Daten veröffentlichen.
          console.error("Blur-Einbrennen fehlgeschlagen:", e instanceof Error ? e.message : e);
          throw new Error("Veröffentlichen abgebrochen: Die Schwärzung konnte nicht angewendet werden.");
        }
      }
      await admin.storage
        .from(PUBLIC_BUCKET)
        .upload(s.image_path, buf, { upsert: true, contentType: "image/webp" });
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
  const paths = (steps ?? []).map((s) => s.image_path).filter(Boolean) as string[];
  if (paths.length) {
    const admin = createAdminClient();
    await admin.storage.from(PUBLIC_BUCKET).remove(paths);
  }
}

/**
 * Tutorial veröffentlichen (§7 Schritt 7):
 *  - Öffentlich: eindeutigen Slug erzeugen, Bilder in den public Bucket kopieren,
 *    für den Chatbot indizieren, Hub-Caches invalidieren.
 *  - Intern: nur Status=published (= „fürs Team freigegeben") — KEINE public-Bilder,
 *    KEIN Index, KEINE Cache-Invalidierung, KEIN Slug nötig.
 */
export async function publishTutorial(tutorialId: string) {
  const { account } = await requireAccount();
  const supabase = await createClient();

  const { data: tutorial, error } = await supabase
    .from("tutorials")
    .select("id, title, slug, account_id, visibility")
    .eq("id", tutorialId)
    .single<Pick<Tutorial, "id" | "title" | "slug" | "account_id" | "visibility">>();
  if (error || !tutorial) throw new Error(error?.message ?? "Tutorial nicht gefunden");

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
}

/**
 * Sichtbarkeit umschalten (intern ↔ öffentlich). Nur bei PUBLISHED-Tutorials sind
 * Nebenwirkungen nötig; ein Entwurf ändert nur die Spalte:
 *  - → internal: public-Bilder entfernen, Embeddings löschen, Hub-Cache invalidieren.
 *  - → public: Slug sicherstellen, Bilder public kopieren, indizieren, Cache invalidieren.
 */
export async function setTutorialVisibility(
  tutorialId: string,
  visibility: Tutorial["visibility"],
) {
  if (visibility !== "public" && visibility !== "internal") return;
  const { account } = await requireAccount();
  // Interne Tutorials + Schulungsnachweis sind Business (zurück auf öffentlich geht immer).
  if (visibility === "internal" && !isBusiness(account)) throw new Error(BUSINESS_REQUIRED);
  const supabase = await createClient();

  const { data: tutorial, error } = await supabase
    .from("tutorials")
    .select("id, title, slug, account_id, status, visibility")
    .eq("id", tutorialId)
    .single<Pick<Tutorial, "id" | "title" | "slug" | "account_id" | "status" | "visibility">>();
  if (error || !tutorial) throw new Error(error?.message ?? "Tutorial nicht gefunden");
  if (tutorial.visibility === visibility) return; // nichts zu tun

  const isPublished = tutorial.status === "published";

  if (visibility === "internal") {
    // Erst umschalten (RAG-Guard greift danach), dann öffentliche Spuren entfernen.
    const { error: ue } = await supabase
      .from("tutorials")
      .update({ visibility })
      .eq("id", tutorialId);
    if (ue) throw new Error(ue.message);
    if (isPublished) {
      await removePublicImages(supabase, tutorialId).catch((e) =>
        console.error("Public-Bilder entfernen fehlgeschlagen:", e instanceof Error ? e.message : e),
      );
      // Vorlesen: public Bucket darf keine Audios interner Tutorials behalten.
      await removeTutorialAudio(tutorialId);
      await removeTutorialEmbeddings(supabase, tutorialId).catch(() => {});
      await invalidateTutorialTags(tutorialId, { force: true });
    }
  } else {
    // → öffentlich
    let slug = tutorial.slug;
    if (isPublished) {
      slug = await ensureSlug(supabase, account.id, tutorialId, tutorial.title, tutorial.slug);
      await copyImagesToPublic(supabase, tutorialId);
    }
    const { error: ue } = await supabase
      .from("tutorials")
      .update({ visibility, ...(slug ? { slug } : {}) })
      .eq("id", tutorialId);
    if (ue) throw new Error(ue.message);
    if (isPublished) {
      await indexTutorial(supabase, account.id, tutorialId).catch(() => {});
      await invalidateTutorialTags(tutorialId);
      // Wird jetzt öffentlich sichtbar -> ggf. übersetzen (wie beim Publish).
      const { data: acc } = await supabase
        .from("accounts")
        .select("languages")
        .eq("id", account.id)
        .single();
      if (((acc?.languages as string[] | null) ?? []).some(isExtraLang)) {
        after(() =>
          translateTutorial(tutorialId).catch((e) =>
            console.error("Auto-Übersetzung (Sichtbarkeit):", e instanceof Error ? e.message : e),
          ),
        );
      }
      // Wird wieder öffentlich sichtbar -> Vorlese-Audios (neu) erzeugen (Hash-Cache).
      after(() =>
        ensureTutorialAudio(account.id, tutorialId).catch((e) =>
          console.error("Auto-Vorlesen (Sichtbarkeit):", e instanceof Error ? e.message : e),
        ),
      );
    }
  }

  revalidatePath("/app");
}

/** Veröffentlichung zurückziehen: Status = draft, öffentliche Bilder entfernen. */
export async function unpublishTutorial(tutorialId: string) {
  const supabase = await createClient();

  const { data: steps } = await supabase
    .from("steps")
    .select("image_path")
    .eq("tutorial_id", tutorialId)
    .not("image_path", "is", null);

  const paths = (steps ?? []).map((s) => s.image_path).filter(Boolean) as string[];
  if (paths.length) {
    const admin = createAdminClient();
    await admin.storage.from(PUBLIC_BUCKET).remove(paths);
  }

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
