import { redirect } from "next/navigation";

// Welle 50c: „Abo“ heißt jetzt „Tarif“. Alte URL bleibt als Weiterleitung erhalten —
// inkl. Query (z. B. ?limit=tutorials aus älteren Links/Mails).
export default async function AboRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const q = qs.toString();
  redirect(q ? `/app/settings/tarif?${q}` : "/app/settings/tarif");
}
