import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { isBusiness } from "@/lib/plan";
import { isExtraLang, type ExtraLang } from "@/lib/i18n-hub";
import { OnboardingWizard } from "@/components/app/onboarding-wizard";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ erneut?: string }>;
}) {
  const { account } = await requireAccount();
  // „Einrichtung erneut zeigen“ (Einstellungen → Allgemein) öffnet den Assistenten auch für
  // bereits eingerichtete Organisationen — ohne den Organisations-Merker zurückzusetzen.
  const { erneut } = await searchParams;
  if (account.onboarded && erneut !== "1") redirect("/app");

  // Sprach-Sektion im Onboarding (Welle 30): aktuelle Sprachen + Tarif fürs Gating.
  // Website aus einer früheren Einrichtung vorbelegen (sonst stand das Feld beim erneuten
  // Durchlauf leer da, obwohl die Adresse gespeichert ist).
  const supabase = await createClient();
  const [{ data: acc }, { data: theme }] = await Promise.all([
    supabase.from("accounts").select("languages").eq("id", account.id).single(),
    supabase.from("themes").select("source_url").eq("account_id", account.id).maybeSingle(),
  ]);
  const languages = ((acc?.languages as string[] | null) ?? []).filter(
    isExtraLang,
  ) as ExtraLang[];

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-background px-5 py-10">
      <OnboardingWizard
        accountId={account.id}
        initialName={account.name}
        isBusiness={isBusiness(account)}
        initialLanguages={languages}
        initialWebsite={(theme?.source_url as string | null) ?? ""}
      />
    </main>
  );
}
