import Link from "next/link";
import { requireAccount } from "@/lib/account";
import { createAdminClient } from "@/lib/supabase/admin";
import { appBaseUrl } from "@/lib/url";
import { RecorderConnect } from "@/components/app/recorder-connect";
import { SettingsHeader } from "@/components/app/settings-ui";

export default async function ErweiterungPage() {
  const { account, userId } = await requireAccount();
  // Verbindung ist PRO PERSON (Migration 0037) — nur die eigene zählt. Admin-Client, weil
  // recorder_tokens bewusst keine RLS-Policies hat (Tokens sieht nur der Server).
  const { data: tokenRow } = await createAdminClient()
    .from("recorder_tokens")
    .select("token")
    .eq("account_id", account.id)
    .eq("user_id", userId)
    .maybeSingle();

  return (
    <div className="grid gap-[18px]">
      <SettingsHeader
        group="Integrationen"
        title="Steply-Erweiterung"
        lead={
          <>
            Mit der Steply-Erweiterung für Chrome nehmen Sie Anleitungen direkt im Browser auf
            – der fertige Entwurf erscheint automatisch bei Ihren Anleitungen.{" "}
            <Link href="/extension" target="_blank" className="font-extrabold text-primary hover:underline">
              Mehr zur Erweiterung
            </Link>
          </>
        }
      />
      {/* Nur „gibt es einen Token" geht an den Client — der Token selbst nie. */}
      <RecorderConnect initialHasToken={Boolean(tokenRow?.token)} appUrl={appBaseUrl()} />
    </div>
  );
}
