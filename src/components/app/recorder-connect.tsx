"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  KeyRound,
  RefreshCw,
  Plug,
  CheckCircle2,
  Download,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/app/copy-field";
import { rotateRecorderToken } from "@/app/app/settings/einbetten/actions";

// „Steply Recorder verbinden" (Welle 25): Ein-Klick-Pairing statt Token-Kopieren.
//
// SICHERHEIT (in Kommentaren dokumentiert, weil hier der Vertrag beginnt):
//   1. Pairing startet NUR auf Klick des Nutzers auf DIESER Seite (kein Auto-Trigger).
//   2. Wir posten den Token per window.postMessage NUR an location.origin (Origin-Bindung);
//      content.js akzeptiert ihn ebenfalls nur bei event.source===window && gleichem Origin.
//   3. Der Token wird VOR dem Speichern von der Extension gegen /api/recorder/me validiert
//      (background.js). Erst bei 200 wird gespeichert.
//   4. Die Extension meldet den Kontonamen zurueck; wir zeigen „Verbunden mit X" -> eine
//      Fehlbindung an das falsche Konto faellt sofort auf. Der Token steht nie in einer URL.
//
// Extension-Erkennung: content.js setzt frueh das DOM-Attribut data-steply-recorder=version
// (isolated world -> nur das DOM ist geteilt, window-Variablen NICHT). Wir lesen es nach Mount.
export function RecorderConnect({
  initialHasToken,
  appUrl,
}: {
  initialHasToken: boolean;
  /** Echte App-Basis-URL — nur noch fuer den manuellen Fallback relevant. */
  appUrl: string;
}) {
  // Extension installiert? null = wird noch geprueft.
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [version, setVersion] = useState("");

  // Pairing-Zustand.
  const [pairing, setPairing] = useState(false);
  const [pairedAccount, setPairedAccount] = useState<string | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);

  // Manueller Fallback (Token kopieren) — eingeklappt.
  const [showManual, setShowManual] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasToken, setHasToken] = useState(initialHasToken);

  // DOM-Marker nach Mount lesen (+ kurze Nachkontrollen, falls die Extension gerade erst
  // installiert wurde oder das Content-Script minimal spaeter dran ist).
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      if (cancelled) return true;
      const v = document.documentElement.getAttribute("data-steply-recorder");
      if (v != null) {
        setInstalled(true);
        setVersion(v);
        return true;
      }
      return false;
    };
    // setState ASYNCHRON planen (kein synchrones setState im Effekt-Body): erste Pruefung
    // + zwei Nachkontrollen, falls die Extension gerade erst installiert wurde.
    const t0 = setTimeout(() => {
      if (!read()) setInstalled(false);
    }, 0);
    const t1 = setTimeout(read, 500);
    const t2 = setTimeout(read, 1500);
    return () => {
      cancelled = true;
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const pair = useCallback(async () => {
    if (pairing) return;
    setPairing(true);
    setPairError(null);
    setPairedAccount(null);

    // 1) Frischen Verbindungs-Token erzeugen. Den bestehenden lesen wir bewusst NIE ins DOM
    //    (Sicherheit); deshalb rotieren wir hier und uebergeben den frischen Token direkt.
    let freshToken: string;
    try {
      const res = await rotateRecorderToken();
      if (!res.ok) {
        setPairError(res.error);
        setPairing(false);
        return;
      }
      freshToken = res.token;
      setHasToken(true);
    } catch {
      setPairError("Der Token konnte nicht erzeugt werden.");
      setPairing(false);
      return;
    }

    // 2) Pairing anstossen + auf die Rueckmeldung der Extension warten (mit Timeout).
    const origin = window.location.origin;
    const result = await new Promise<{
      ok: boolean;
      account?: string;
      error?: string;
    }>((resolve) => {
      let done = false;
      const onMsg = (e: MessageEvent) => {
        if (e.source !== window || e.origin !== origin) return;
        const d = e.data;
        if (!d || d.__steply !== true || d.type !== "steply-pair-result") return;
        if (done) return;
        done = true;
        window.removeEventListener("message", onMsg);
        clearTimeout(timer);
        resolve({ ok: !!d.ok, account: d.account, error: d.error });
      };
      window.addEventListener("message", onMsg);
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener("message", onMsg);
        resolve({
          ok: false,
          error:
            "Die Extension hat nicht geantwortet. Bitte oeffnen Sie die Seitenleiste einmal und versuchen Sie es erneut.",
        });
      }, 12000);
      window.postMessage(
        { __steply: true, type: "steply-pair", token: freshToken, appUrl: origin },
        origin,
      );
    });

    if (result.ok) {
      setPairedAccount(result.account || "");
      toast.success(
        "Extension verbunden" +
          (result.account ? " mit " + result.account : "") +
          ".",
      );
    } else {
      setPairError(result.error || "Verbindung fehlgeschlagen.");
    }
    setPairing(false);
  }, [pairing]);

  async function generateManual() {
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
    <div className="space-y-4">
      {/* --- Ein-Klick-Verbinden --- */}
      {installed === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Extension wird gesucht …
        </p>
      ) : installed === false ? (
        <div className="rounded-xl border border-border bg-accent/40 p-4">
          <p className="text-sm text-ink-2">
            <b className="text-ink">Extension noch nicht installiert.</b> Installieren
            Sie den Steply Recorder – danach verbinden Sie ihn hier mit einem Klick.
          </p>
          <div className="mt-3">
            <Button nativeButton={false} render={<Link href="/extension" target="_blank" />}>
              <Download className="size-4" /> Extension installieren
            </Button>
          </div>
        </div>
      ) : pairedAccount !== null ? (
        <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-accent/50 p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-bold text-ink">
              Verbunden{pairedAccount ? " mit " + pairedAccount : ""}.
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Die Extension lädt Aufnahmen ab jetzt direkt hierher hoch. Öffnen Sie die
              Seitenleiste (Extension-Symbol) und legen Sie los.
            </p>
          </div>
        </div>
      ) : (
        <div>
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-line-2 px-2.5 py-1 text-xs font-bold text-ink">
              <CheckCircle2 className="size-3.5 text-primary" /> Installiert
              {version ? " (v" + version + ")" : ""}
            </span>
          </p>
          <div className="mt-3">
            <Button onClick={pair} disabled={pairing}>
              {pairing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plug className="size-4" />
              )}
              Extension verbinden
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Verbindet diesen Browser mit Steply. Der Token wird sicher übertragen und
            vorher geprüft – ohne Kopieren.
          </p>
          {pairError && (
            <p className="mt-2 text-sm font-semibold text-destructive">{pairError}</p>
          )}
        </div>
      )}

      {/* --- Manueller Fallback (eingeklappt) --- */}
      <div className="border-t border-line-2 pt-3">
        <button
          type="button"
          onClick={() => setShowManual((s) => !s)}
          className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-ink"
        >
          <ChevronDown
            className={"size-3.5 transition-transform " + (showManual ? "rotate-180" : "")}
          />
          Token manuell kopieren (Fallback)
        </button>
        {showManual && (
          <div className="mt-3 space-y-3">
            {token ? (
              <>
                <CopyField value={token} />
                <p className="text-xs text-muted-foreground">
                  In der Extension unter „Verbindungs-Token“ einfügen. Bewahren Sie den
                  Token wie ein Passwort auf.
                </p>
                <CopyField value={appUrl} />
                <p className="text-xs text-muted-foreground">
                  Diese Adresse in der Extension unter „Steply-App-URL“ eintragen.
                </p>
                <Button variant="outline" size="sm" onClick={generateManual} disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Token erneuern
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={generateManual} disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  {hasToken ? "Token erneuern" : "Token erzeugen"}
                </Button>
                {hasToken && (
                  <p className="text-xs text-muted-foreground">
                    Es ist bereits ein Token aktiv. Beim Erneuern wird der alte sofort
                    ungültig – die Extension braucht dann den neuen Token.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
