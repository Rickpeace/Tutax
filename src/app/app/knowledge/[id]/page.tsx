import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { ArticleEditor } from "@/components/app/article-editor";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data: article } = await supabase
    .from("kb_articles")
    .select("id, title, body, status")
    .eq("id", id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!article) notFound();

  return <ArticleEditor article={article} />;
}
