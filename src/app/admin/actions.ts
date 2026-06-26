"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAdmin } from "@/lib/admin";
import { slugify } from "@/lib/slug";

async function ensureAdmin() {
  if (!(await checkAdmin())) throw new Error("Kein Admin-Zugriff");
}

/** Neues globales Template anlegen und im Builder öffnen. */
export async function createTemplate(formData: FormData) {
  await ensureAdmin();
  const title = String(formData.get("title") ?? "").trim() || "Neues Template";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tutorials")
    .insert({ account_id: null, is_template: true, title, status: "draft" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  redirect(`/app/tutorials/${data.id}`);
}

/** Template veröffentlichen (Slug eindeutig unter Templates). */
export async function publishTemplate(id: string) {
  await ensureAdmin();
  const admin = createAdminClient();
  const { data: t } = await admin.from("tutorials").select("title, slug").eq("id", id).single();
  if (!t) throw new Error("Nicht gefunden");

  let slug = t.slug as string | null;
  if (!slug) {
    const base = slugify(t.title);
    const { data: existing } = await admin
      .from("tutorials")
      .select("slug")
      .eq("is_template", true)
      .not("slug", "is", null);
    const taken = new Set((existing ?? []).map((x) => x.slug));
    slug = base;
    let n = 1;
    while (taken.has(slug)) slug = `${base}-${++n}`;
  }
  const { error } = await admin
    .from("tutorials")
    .update({ status: "published", slug, published_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function unpublishTemplate(id: string) {
  await ensureAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("tutorials").update({ status: "draft" }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function deleteTemplate(id: string) {
  await ensureAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("tutorials").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}
