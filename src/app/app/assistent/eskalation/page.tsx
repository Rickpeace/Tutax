import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { EscalationForm } from "@/components/app/escalation-form";
import { isPro } from "@/lib/plan";

export default async function EskalationPage() {
  const { account } = await requireAccount();
  // Gate auf der SEITE selbst (PPR-Layout-Gate-Falle: sonst gingen die Daten trotz Sperrkarte im
  // Seiten-Payload mit, Runde 4). Die Sperrkarte zeigt das Layout.
  if (!isPro(account)) return null;
  const supabase = await createClient();
  const { data: acc } = await supabase
    .from("accounts")
    .select("escalation")
    .eq("id", account.id)
    .single();

  return <EscalationForm accountId={account.id} initial={acc?.escalation ?? {}} accountName={account.name} />;
}
