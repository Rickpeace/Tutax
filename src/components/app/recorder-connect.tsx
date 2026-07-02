"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/app/copy-field";
import { rotateRecorderToken } from "@/app/app/settings/einbetten/actions";

// „Steply Recorder verbinden": erzeugt/rotiert den Verbindungs-Token und zeigt ihn als
// Kopierfeld. `initialHasToken` (Server) steuert nur die Startbeschriftung — den Wert
// selbst zeigen wir aus Sicherheitsgründen erst NACH dem (Neu-)Erzeugen an; einen
// bestehenden Token lesen wir bewusst nicht ins DOM (er lässt sich jederzeit erneuern).
export function RecorderConnect({ initialHasToken }: { initialHasToken: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasToken, setHasToken] = useState(initialHasToken);

  async function generate() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await rotateRecorderToken();
      if (res.ok) {
        setToken(res.token);
        setHasToken(true);
        toast.success("Verbindungs-Token erstellt. Jetzt in die Extension einfügen.");
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Der Token konnte nicht erzeugt werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {token ? (
        <>
          <CopyField value={token} />
          <p className="text-xs text-muted-foreground">
            Kopieren Sie diesen Token und fügen Sie ihn in der Steply-Recorder-Extension
            unter „Verbindungs-Token“ ein. Aufnahmen landen dann automatisch in Steply –
            ohne Datei-Umweg. Bewahren Sie den Token wie ein Passwort auf.
          </p>
          <Button variant="outline" size="sm" onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Token erneuern
          </Button>
        </>
      ) : (
        <>
          <Button onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            {hasToken ? "Token erneuern" : "Recorder verbinden"}
          </Button>
          {hasToken && (
            <p className="text-xs text-muted-foreground">
              Es ist bereits ein Token aktiv. Beim Erneuern wird der alte Token sofort
              ungültig – die Extension muss dann den neuen Token bekommen.
            </p>
          )}
        </>
      )}
    </div>
  );
}
