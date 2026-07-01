"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { slugify } from "@/lib/slug";
import { indexTutorial, removeTutorialEmbeddings } from "@/lib/kb";
import type { Step, StepBranch, Tutorial } from "@/lib/types";

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
  const cookieStore = await cookies();
  cookieStore.set("active_account", accountId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

/** Neues Tutorial anlegen (optional in einer Kategorie) und in den Editor springen */
export async function createTutorial(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim() || "Neues Tutorial";
  const categoryId = (String(formData.get("category_id") ?? "") || null) as string | null;
  const { account } = await requireAccount();
  const supabase = await createClient();

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
  revalidatePath("/app");
}

export async function deleteTutorial(id: string) {
  const supabase = await createClient();
  await removeTutorialEmbeddings(supabase, id).catch(() => {});
  const { error } = await supabase.from("tutorials").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/app");
}

/** Tiefkopie: Tutorial + Schritte + Branches (mit ID-Remapping) */
export async function duplicateTutorial(id: string) {
  const { account } = await requireAccount();
  const supabase = await createClient();

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
 * Tutorial veröffentlichen (§7 Schritt 7):
 *  - eindeutigen Slug pro Account erzeugen,
 *  - Schritt-Bilder vom privaten in den öffentlichen Bucket kopieren,
 *  - Status = published.
 */
export async function publishTutorial(tutorialId: string) {
  const { account } = await requireAccount();
  const supabase = await createClient();

  const { data: tutorial, error } = await supabase
    .from("tutorials")
    .select("id, title, slug, account_id")
    .eq("id", tutorialId)
    .single<Pick<Tutorial, "id" | "title" | "slug" | "account_id">>();
  if (error || !tutorial) throw new Error(error?.message ?? "Tutorial nicht gefunden");

  // Slug bestimmen (nur falls noch keiner)
  let slug = tutorial.slug;
  if (!slug) {
    const base = slugify(tutorial.title);
    const { data: existing } = await supabase
      .from("tutorials")
      .select("slug")
      .eq("account_id", account.id)
      .not("slug", "is", null);
    const taken = new Set((existing ?? []).map((t) => t.slug));
    slug = base;
    let n = 1;
    while (taken.has(slug)) slug = `${base}-${++n}`;
  }

  // Bilder in den public Bucket kopieren (download privat -> upload public)
  const { data: steps } = await supabase
    .from("steps")
    .select("image_path")
    .eq("tutorial_id", tutorialId)
    .not("image_path", "is", null);

  const admin = createAdminClient();
  for (const s of steps ?? []) {
    if (!s.image_path) continue;
    const { data: blob } = await admin.storage.from(PRIVATE_BUCKET).download(s.image_path);
    if (blob) {
      await admin.storage
        .from(PUBLIC_BUCKET)
        .upload(s.image_path, blob, { upsert: true, contentType: "image/webp" });
    }
  }

  const { error: ue } = await supabase
    .from("tutorials")
    .update({ status: "published", slug, published_at: new Date().toISOString() })
    .eq("id", tutorialId);
  if (ue) throw new Error(ue.message);

  // Für den Chatbot indizieren (no-op ohne OPENAI_API_KEY)
  await indexTutorial(supabase, account.id, tutorialId).catch(() => {});

  revalidatePath("/app");
  return { slug, accountSlug: account.slug };
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

  await removeTutorialEmbeddings(supabase, tutorialId).catch(() => {});

  revalidatePath("/app");
}
