import { requireAccount } from "@/lib/account";
import { listRecorderConnections } from "@/lib/recorder";
import { appBaseUrl } from "@/lib/url";
import { EXTENSION_VERSION, EXTENSION_ZIP_URL } from "@/lib/extension-release";
import { RecorderConnect } from "@/components/app/recorder-connect";
import { SettingsHeader } from "@/components/app/settings-ui";

// Einrichtungs-Seite der Steply-Erweiterung für eingeloggte Nutzer (Inhaber/Bearbeiter):
// fehlt die Erweiterung, führt sie in 3 Schritten durch Herunterladen → Laden → Verbinden.
// Alle In-App-Hinweise „Erweiterung installieren“ zeigen hierher (nicht auf /extension, die
// öffentliche Seite mit Marketing-Kopf); /extension leitet eingeloggte Inhaber/Bearbeiter
// sogar selbst hierher um (src/lib/supabase/proxy-session.ts).
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
        lead="Mit der Steply-Erweiterung für Chrome und Edge nehmen Sie Anleitungen direkt im Browser auf – der fertige Entwurf erscheint automatisch bei Ihren Anleitungen."
      />
      <RecorderConnect
        connections={connections}
        appUrl={appBaseUrl()}
        latestVersion={EXTENSION_VERSION}
        zipUrl={EXTENSION_ZIP_URL}
      />
    </div>
  );
}
