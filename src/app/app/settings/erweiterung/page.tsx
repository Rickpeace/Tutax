import Link from "next/link";
import { requireAccount } from "@/lib/account";
import { listRecorderConnections } from "@/lib/recorder";
import { appBaseUrl } from "@/lib/url";
import { RecorderConnect } from "@/components/app/recorder-connect";
import { SettingsHeader } from "@/components/app/settings-ui";

export default async function ErweiterungPage() {
  const { account, userId } = await requireAccount();
  // Verbindungen sind PRO PERSON (Migration 0037), seit 0041 eine je Browser/Gerät — nur die
  // eigenen zählen. Server-Helfer mit Admin-Client, weil recorder_tokens bewusst keine
  // RLS-Policies hat. An den Client gehen nur Kennung/Name/Zeiten — der Token selbst NIE.
  const connections = await listRecorderConnections(account.id, userId);

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
      <RecorderConnect connections={connections} appUrl={appBaseUrl()} />
    </div>
  );
}
