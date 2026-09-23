"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertActiveAccount, orgSwitchedError, requireAccount } from "@/lib/account";
import { indexArticle, removeArticleEmbeddings } from "@/lib/kb";
import { withUserErrors, UserError } from "@/lib/action-error";
import { isPro, PRO_REQUIRED } from "@/lib/plan";

// Sicherheitsprüfung 23.09.2026: Jede Änderung ist auf das AKTIVE Konto beschränkt
// (`.eq("account_id", …)`) und bricht bei 0 getroffenen Zeilen ab — erst DANACH laufen die
// Index-Nebenwirkungen mit dem Admin-Client. Vorher konnte eine fremde Artikel-ID den
// Chatbot-Index eines anderen Kontos leeren oder in den eigenen Index kopiert werden.
const NOT_FOUND =
  "Dieser Artikel gehört nicht (mehr) zur aktiven Organisation. Bitte laden Sie die Seite neu.";

export async function createArticle(formData: FormData) {
  const ctx = await requireAccount();
  // Org in einem anderen Tab gewechselt: nichts anlegen, Liste der aktiven Org neu zeigen.
  if (orgSwitchedError(formData.get("accountId"), ctx)) redirect("/app/assistent/wissen");
  // Wissensdatenbank erst ab Pro (Tarifseite) — ohne Pro zeigt die Seite den Tarif-Hinweis.
  if (!isPro(ctx.account)) redirect("/app/assistent/wissen");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kb_articles")
    .insert({ account_id: ctx.account.id, title: "Neuer Artikel", status: "draft" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/app/assistent/wissen");
  redirect(`/app/assistent/wissen/${data.id}`);
}

export const saveArticle = withUserErrors(async function saveArticle(
  expectedAccountId: string,
  id: string,
  title: string,
  body: unknown,
) {
  const ctx = await requireAccount();
  assertActiveAccount(expectedAccountId, ctx);
  if (!isPro(ctx.account)) throw new UserError(PRO_REQUIRED);
  const { account } = ctx;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kb_articles")
    .update({ title: title.trim() || "Ohne Titel", body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("account_id", account.id)
    .select("status");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new UserError(NOT_FOUND);
  // Bei veröffentlichten Artikeln den Chatbot-Index aktualisieren.
  if (data[0].status === "published") {
    await indexArticle(createAdminClient(), account.id, id).catch(() => {});
  }
  revalidatePath("/app/assistent/wissen");
});

export const setArticlePublished = withUserErrors(async function setArticlePublished(
  expectedAccountId: string,
  id: string,
  published: boolean,
) {
  const ctx = await requireAccount();
  assertActiveAccount(expectedAccountId, ctx);
  // Veröffentlichen (= in den Chatbot) erst ab Pro; Zurückziehen geht immer.
  if (published && !isPro(ctx.account)) throw new UserError(PRO_REQUIRED);
  const { account } = ctx;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kb_articles")
    .update({ status: published ? "published" : "draft" })
    .eq("id", id)
    .eq("account_id", account.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new UserError(NOT_FOUND);
  const admin = createAdminClient();
  if (published) await indexArticle(admin, account.id, id).catch(() => {});
  else await removeArticleEmbeddings(admin, account.id, id).catch(() => {});
  revalidatePath("/app/assistent/wissen");
});

export const deleteArticle = withUserErrors(async function deleteArticle(expectedAccountId: string, id: string) {
  const ctx = await requireAccount();
  assertActiveAccount(expectedAccountId, ctx);
  const { account } = ctx;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kb_articles")
    .delete()
    .eq("id", id)
    .eq("account_id", account.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new UserError(NOT_FOUND);
  // Index räumt schon der DB-Trigger (Migration 0040); hier zusätzlich, nur im eigenen Index.
  await removeArticleEmbeddings(createAdminClient(), account.id, id).catch(() => {});
  revalidatePath("/app/assistent/wissen");
  // Kein redirect() hier: der Client navigiert nach Erfolg (sonst faengt sein
  // try/catch den NEXT_REDIRECT und zeigt ihn faelschlich als Fehler-Toast).
});
