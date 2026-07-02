import { redirect } from "next/navigation";

// Umgezogen unter den Tab „Assistent". Alter Deep-Link (mit Artikel-ID) bleibt erhalten.
export default async function ArticleRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/assistent/wissen/${id}`);
}
