import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { ArticleEditor } from "@/components/app/article-editor";
import { isPro } from "@/lib/plan";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { account } = await requireAccount();
  // Gate auf der SEITE selbst (PPR-Layout-Gate-Falle: sonst gingen die Daten trotz Sperrkarte im
  // Seiten-Payload mit, Runde 4). Die Sperrkarte zeigt das Layout.
  if (!isPro(account)) return null;
  const supabase = await createClient();
  const { data: article } = await supabase
    .from("kb_articles")
    .select("id, title, body, status")
    .eq("id", id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!article) notFound();

  return <ArticleEditor article={article} accountId={account.id} />;
}
