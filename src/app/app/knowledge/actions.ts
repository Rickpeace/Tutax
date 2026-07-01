"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { indexArticle, removeArticleEmbeddings } from "@/lib/kb";

export async function createArticle() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kb_articles")
    .insert({ account_id: account.id, title: "Neuer Artikel", status: "draft" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/app/knowledge");
  redirect(`/app/knowledge/${data.id}`);
}

export async function saveArticle(id: string, title: string, body: unknown) {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kb_articles")
    .update({ title: title.trim() || "Ohne Titel", body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("status")
    .single();
  if (error) throw new Error(error.message);
  // Bei veröffentlichten Artikeln den Chatbot-Index aktualisieren.
  if (data?.status === "published") {
    await indexArticle(createAdminClient(), account.id, id).catch(() => {});
  }
  revalidatePath("/app/knowledge");
}

export async function setArticlePublished(id: string, published: boolean) {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { error } = await supabase
    .from("kb_articles")
    .update({ status: published ? "published" : "draft" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  const admin = createAdminClient();
  if (published) await indexArticle(admin, account.id, id).catch(() => {});
  else await removeArticleEmbeddings(admin, id).catch(() => {});
  revalidatePath("/app/knowledge");
}

export async function deleteArticle(id: string) {
  await requireAccount();
  const supabase = await createClient();
  await removeArticleEmbeddings(createAdminClient(), id).catch(() => {});
  const { error } = await supabase.from("kb_articles").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/knowledge");
  // Kein redirect() hier: der Client navigiert nach Erfolg (sonst faengt sein
  // try/catch den NEXT_REDIRECT und zeigt ihn faelschlich als Fehler-Toast).
}
