import Link from "next/link";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { appBaseUrl } from "@/lib/url";
import { RecorderConnect } from "@/components/app/recorder-connect";
import { SettingsHeader } from "@/components/app/settings-ui";

export default async function ErweiterungPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data: tokenRow } = await supabase
    .from("accounts")
    .select("recorder_token")
    .eq("id", account.id)
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
      <RecorderConnect initialHasToken={Boolean(tokenRow?.recorder_token)} appUrl={appBaseUrl()} />
    </div>
  );
}
