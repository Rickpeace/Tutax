"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  KeyRound,
  RefreshCw,
  Plug,
  Check,
  Download,
  ChevronDown,
  Puzzle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/app/copy-field";
import { rotateRecorderToken } from "@/app/app/settings/einbetten/actions";

// Steply-Erweiterung verbinden (Welle 25 Ein-Klick-Pairing; Welle 50c neue Optik:
// Status-Karte + genau EIN nächster Schritt + „Code manuell eingeben" eingeklappt).
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
// Ob die Erweiterung in DIESEM Browser schon einen gueltigen Token hat, kann die Seite nicht
// sehen — nur, ob das Konto einen aktiven Token hat (initialHasToken).
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

  // Manueller Fallback (Code kopieren) — eingeklappt.
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
      setPairError("Der Verbindungs-Code konnte nicht erzeugt werden.");
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
            "Die Steply-Erweiterung hat nicht geantwortet. Bitte öffnen Sie ihre Seitenleiste einmal und versuchen Sie es erneut.",
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
        "Steply-Erweiterung verbunden" + (result.account ? " mit " + result.account : "") + ".",
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
        toast.success("Verbindungs-Code erstellt. Jetzt in die Erweiterung einfügen.");
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Der Verbindungs-Code konnte nicht erzeugt werden.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Status + EIN nächster Schritt ----
  type Tone = "ok" | "todo" | "wait";
  let tone: Tone;
  let title: string;
  let sub: React.ReactNode;
  let action: React.ReactNode = null;
  const v = version ? `Version ${version}` : "Installiert";

  if (installed === null) {
    tone = "wait";
    title = "Steply-Erweiterung wird gesucht …";
    sub = "Einen Moment bitte.";
  } else if (installed === false) {
    tone = "todo";
    title = "Noch nicht installiert";
    sub = "Installieren Sie die Steply-Erweiterung für Chrome – danach verbinden Sie sie hier mit einem Klick.";
    action = (
      <Button nativeButton={false} render={<Link href="/extension" target="_blank" />}>
        <Download className="size-4" /> Erweiterung installieren
      </Button>
    );
  } else if (pairedAccount !== null) {
    tone = "ok";
    title = "Installiert und verbunden";
    sub = `${v}${pairedAccount ? ` · verbunden mit ${pairedAccount}` : ""}`;
  } else if (!hasToken) {
    tone = "todo";
    title = "Installiert – noch nicht verbunden";
    sub = `${v} · Verbinden Sie die Erweiterung mit Ihrem Konto, damit Aufnahmen direkt hier landen.`;
    action = (
      <Button onClick={pair} disabled={pairing}>
        {pairing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
        Jetzt verbinden
      </Button>
    );
  } else {
    tone = "ok";
    title = "Installiert";
    sub = `${v} · Ihr Konto hat eine aktive Verbindung. Klappt das Hochladen in diesem Browser nicht, verbinden Sie neu – andere Browser müssen danach ebenfalls neu verbunden werden.`;
    action = (
      <Button variant="outline" onClick={pair} disabled={pairing}>
        {pairing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        Neu verbinden
      </Button>
    );
  }

  const iconBox =
    tone === "ok"
      ? "bg-teal-soft text-teal-text"
      : tone === "todo"
        ? "bg-amber-soft text-amber-text"
        : "bg-line-2 text-muted-foreground";

  return (
    <div className="grid gap-[18px]">
      <section
        data-testid="extension-status"
        data-state={tone}
        className="grid gap-3 rounded-card border-2 border-line bg-card px-[18px] py-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${iconBox}`}>
            {tone === "wait" ? (
              <Loader2 className="size-[18px] animate-spin" />
            ) : tone === "ok" ? (
              <Check className="size-[18px]" strokeWidth={2.6} />
            ) : (
              <Puzzle className="size-[18px]" strokeWidth={2.2} />
            )}
          </span>
          <div className="min-w-0 flex-1 basis-60">
            <b className="block font-black text-ink">{title}</b>
            <span className="text-[12.5px] text-muted-foreground">{sub}</span>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {pairError && (
          <p role="alert" className="rounded-xl bg-no-soft px-3 py-2 text-sm font-bold text-no">
            {pairError}
          </p>
        )}
      </section>

      {/* --- Manueller Fallback (eingeklappt) --- */}
      <div className="text-[13px] text-ink-2">
        <button
          type="button"
          aria-expanded={showManual}
          onClick={() => setShowManual((s) => !s)}
          className="flex items-center gap-1.5 text-left font-extrabold text-ink-2 transition-colors hover:text-ink"
        >
          <ChevronDown
            className={"size-4 shrink-0 transition-transform " + (showManual ? "rotate-180" : "-rotate-90")}
          />
          Code manuell eingeben (falls die automatische Verbindung nicht klappt)
        </button>
        {showManual && (
          <div className="mt-3 grid gap-3 rounded-card border-2 border-line bg-card px-[18px] py-4">
            {token ? (
              <>
                <div className="grid gap-1.5">
                  <span className="text-[12.5px] font-extrabold text-ink-2">Verbindungs-Code</span>
                  <CopyField value={token} />
                  <p className="text-xs text-muted-foreground">
                    In der Erweiterung unter „Verbindungs-Token“ einfügen. Bewahren Sie den Code
                    wie ein Passwort auf.
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <span className="text-[12.5px] font-extrabold text-ink-2">Steply-Adresse</span>
                  <CopyField value={appUrl} />
                  <p className="text-xs text-muted-foreground">
                    In der Erweiterung unter „Steply-App-URL“ eintragen.
                  </p>
                </div>
                <div>
                  <Button variant="outline" size="sm" onClick={generateManual} disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                    Code erneuern
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Erzeugen Sie einen Verbindungs-Code und fügen Sie ihn in der Seitenleiste der
                  Erweiterung ein.
                </p>
                <div>
                  <Button variant="outline" size="sm" onClick={generateManual} disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                    {hasToken ? "Neuen Code erzeugen" : "Code erzeugen"}
                  </Button>
                </div>
                {hasToken && (
                  <p className="text-xs text-muted-foreground">
                    Es ist bereits ein Code aktiv. Ein neuer Code macht den alten sofort ungültig –
                    verbundene Erweiterungen brauchen dann den neuen.
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
