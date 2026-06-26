import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/account";
import { OnboardingWizard } from "@/components/app/onboarding-wizard";

export default async function OnboardingPage() {
  const { account } = await requireAccount();
  if (account.onboarded) redirect("/app");

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-background px-5 py-10">
      <OnboardingWizard initialName={account.name} />
    </main>
  );
}
