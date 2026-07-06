import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { isBusiness } from "@/lib/plan";
import { isExtraLang, type ExtraLang } from "@/lib/i18n-hub";
import { OnboardingWizard } from "@/components/app/onboarding-wizard";

export default async function OnboardingPage() {
  const { account } = await requireAccount();
  if (account.onboarded) redirect("/app");

  // Sprach-Sektion im Onboarding (Welle 30): aktuelle Sprachen + Tarif fürs Gating.
  const supabase = await createClient();
  const { data: acc } = await supabase
    .from("accounts")
    .select("languages")
    .eq("id", account.id)
    .single();
  const languages = ((acc?.languages as string[] | null) ?? []).filter(
    isExtraLang,
  ) as ExtraLang[];

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-background px-5 py-10">
      <OnboardingWizard
        initialName={account.name}
        isBusiness={isBusiness(account)}
        initialLanguages={languages}
      />
    </main>
  );
}
