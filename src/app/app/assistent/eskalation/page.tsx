import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { EscalationForm } from "@/components/app/escalation-form";

export default async function EskalationPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data: acc } = await supabase
    .from("accounts")
    .select("escalation")
    .eq("id", account.id)
    .single();

  return <EscalationForm initial={acc?.escalation ?? {}} />;
}
