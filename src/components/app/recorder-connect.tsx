"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/app/copy-field";
import {
  disconnectRecorderConnection,
  rotateRecorderToken,
} from "@/app/app/settings/einbetten/actions";
import type { RecorderConnection } from "@/lib/recorder";
import { dateLongDe, relativeDe } from "@/lib/format";
import { ExtensionSetupSteps } from "@/components/extension-setup-steps";
import { isNewerVersion, useBrowserKind, useRecorderExtension } from "@/lib/use-recorder-extension";

// Welche Verbindung gehört zu DIESEM Browser? Die Seite kann den Token der Erweiterung nicht
// sehen — wir merken uns nach erfolgreichem Verbinden die (nicht geheime) Kennung lokal.
const THIS_BROWSER_KEY = "steply.recorderConnectionId";
function readThisBrowserId(): string | null {
  try {
    return localStorage.getItem(THIS_BROWSER_KEY);
  } catch {
    return null;
  }
}
function writeThisBrowserId(id: string | null) {
  try {
    if (id) localStorage.setItem(THIS_BROWSER_KEY, id);
    else localStorage.removeItem(THIS_BROWSER_KEY);
  } catch {
    /* privater Modus o. ä. — dann eben ohne „dieser Browser" */
  }
}

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
// Ob die Erweiterung in DIESEM Browser einen gueltigen Token hat, kann die Seite nicht direkt
// sehen. Seit Migration 0041 hat jede Person mehrere Verbindungen (eine je Browser); nach dem
// Verbinden merken wir uns die Kennung lokal (THIS_BROWSER_KEY) und erkennen so „dieser Browser".
export function RecorderConnect({
  connections,
  appUrl,
  latestVersion,
  zipUrl,
}: {
  /** Verbindungen der Person in diesem Konto (ohne Token). */
  connections: RecorderConnection[];
  /** Echte App-Basis-URL — nur noch fuer den manuellen Fallback relevant. */
  appUrl: string;
  /** Aktuell ausgelieferte Version (public/downloads/steply-recorder.json). */
  latestVersion: string;
  /** ZIP der Steply-Erweiterung. */
  zipUrl: string;
}) {
  // Steply-Erweiterung installiert? null = wird noch geprüft. Solange nicht erkannt, prüft die
  // Seite alle 2 s nach (Einrichtung läuft gerade) und springt dann selbst zu „Verbinden“.
  const { installed, version } = useRecorderExtension({ poll: true });
  const browser = useBrowserKind();

  // Pairing-Zustand.
  const [pairing, setPairing] = useState(false);
  const [pairedAccount, setPairedAccount] = useState<string | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);

  // Manueller Fallback (Code kopieren) — eingeklappt.
  const [showManual, setShowManual] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  // Kennung des zuletzt IN DIESER SITZUNG erzeugten manuellen Codes. „Neuen Code erzeugen“
  // ersetzt genau diesen (und nur, solange er nie benutzt wurde) — sonst sammelten sich
  // bei jedem Klick dauerhaft gültige, nie eingelöste Verbindungen an.
  const [manualId, setManualId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [thisBrowserId, setThisBrowserId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const router = useRouter();
  const hasToken = connections.length > 0;
  const thisBrowserConnected = !!thisBrowserId && connections.some((c) => c.id === thisBrowserId);

  // „Dieser Browser“ aus localStorage — nach Mount und asynchron (kein setState im Effekt-Body).
  useEffect(() => {
    const t = setTimeout(() => setThisBrowserId(readThisBrowserId()), 0);
    return () => clearTimeout(t);
  }, []);

  const pair = useCallback(async () => {
    if (pairing) return;
    setPairing(true);
    setPairError(null);
    setPairedAccount(null);

    // 1) Frischen Verbindungs-Token erzeugen. Den bestehenden lesen wir bewusst NIE ins DOM
    //    (Sicherheit); deshalb rotieren wir hier und uebergeben den frischen Token direkt.
    //    Jede Verbindung ist eine eigene Zeile (eine je Browser) — andere Browser bleiben verbunden.
    let freshToken: string;
    let freshId: string | null;
    try {
      const res = await rotateRecorderToken();
      if (!res.ok) {
        setPairError(res.error);
        setPairing(false);
        return;
      }
      freshToken = res.token;
      freshId = res.id;
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
      // Die Erweiterung dieses Browsers nutzt jetzt den neuen Token -> seine bisherige
      // Verbindung ist verwaist und wird aufgeräumt (andere Browser bleiben unberührt).
      const previous = readThisBrowserId();
      if (freshId) {
        writeThisBrowserId(freshId);
        setThisBrowserId(freshId);
        if (previous && previous !== freshId) {
          await disconnectRecorderConnection(previous).catch(() => null);
        }
      }
      setPairedAccount(result.account || "");
      toast.success(
        "Steply-Erweiterung verbunden" + (result.account ? " mit " + result.account : "") + ".",
      );
    } else {
      // Nicht verbunden -> die eben angelegte Verbindung wieder entfernen (keine Leichen).
      if (freshId) await disconnectRecorderConnection(freshId).catch(() => null);
      setPairError(result.error || "Verbindung fehlgeschlagen.");
    }
    router.refresh();
    setPairing(false);
  }, [pairing, router]);

  async function disconnect(c: RecorderConnection) {
    if (!c.id || removing) return;
    setRemoving(c.id);
    try {
      const res = await disconnectRecorderConnection(c.id);
      if (res.ok) {
        if (c.id === thisBrowserId) {
          writeThisBrowserId(null);
          setThisBrowserId(null);
          setPairedAccount(null);
        }
        toast.success(`Verbindung „${c.label || "Browser"}“ getrennt.`);
      } else {
        toast.error(res.error);
      }
      router.refresh();
    } catch {
      toast.error("Die Verbindung konnte nicht getrennt werden.");
    } finally {
      setRemoving(null);
    }
  }

  async function generateManual() {
    if (busy) return;
    setBusy(true);
    try {
      // Vorgänger nur dann zum Ersetzen anbieten, wenn er laut Liste noch nie genutzt
      // wurde. Der Server prüft das zusätzlich selbst (last_used_at is null).
      const prev = manualId;
      const prevRow = prev ? connections.find((c) => c.id === prev) : undefined;
      const replaceUnusedId = prev && (!prevRow || !prevRow.lastUsedAt) ? prev : null;
      const res = await rotateRecorderToken({ manual: true, replaceUnusedId });
      if (res.ok) {
        setToken(res.token);
        setManualId(res.id);
        router.refresh();
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
    // Wird unten als Einrichtung in 3 Schritten gezeigt (showSetup).
    tone = "todo";
    title = "Noch nicht installiert";
    sub = "";
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
  } else if (thisBrowserConnected) {
    tone = "ok";
    title = "Installiert – verbunden";
    sub = `${v} · Dieser Browser ist mit Ihrem Konto verbunden. Klappt das Hochladen nicht, verbinden Sie ihn neu – andere Browser bleiben verbunden.`;
    action = (
      <Button variant="outline" onClick={pair} disabled={pairing}>
        {pairing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        Neu verbinden
      </Button>
    );
  } else {
    // Es gibt Verbindungen, aber ob DIESER Browser dazugehört, wissen wir nicht sicher (z. B.
    // vor dem Update verbunden). Verbinden schadet nie: andere Browser bleiben verbunden.
    tone = "ok";
    title = "Installiert";
    sub = `${v} · Ist dieser Browser unten nicht dabei oder klappt das Hochladen hier nicht, verbinden Sie ihn – andere Browser bleiben verbunden.`;
    action = (
      <Button variant="outline" onClick={pair} disabled={pairing}>
        {pairing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
        Diesen Browser verbinden
      </Button>
    );
  }

  const iconBox =
    tone === "ok"
      ? "bg-teal-soft text-teal-text"
      : tone === "todo"
        ? "bg-amber-soft text-amber-text"
        : "bg-line-2 text-muted-foreground";

  // --- Verbundene Browser (eine Verbindung je Browser/Gerät, Migration 0041) ---
  const connectionList = (
    <section
      data-testid="recorder-connections"
      className="grid gap-2 rounded-card border-2 border-line bg-card px-[18px] py-4"
    >
      <b className="font-black text-ink">Ihre verbundenen Browser</b>
      <ul className="grid gap-2">
        {connections.map((c, i) => (
          <li
            key={c.id ?? `legacy-${i}`}
            data-testid="recorder-connection"
            data-connection-id={c.id ?? ""}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-line-2/60 px-3 py-2"
          >
            <div className="min-w-0 flex-1 basis-52">
              <span className="block font-extrabold text-ink">
                {c.label || "Browser"}
                {c.id && c.id === thisBrowserId && (
                  <span className="ml-2 rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-extrabold text-teal-text">
                    dieser Browser
                  </span>
                )}
              </span>
              <span className="text-[12.5px] text-muted-foreground" suppressHydrationWarning>
                {c.createdAt ? `verbunden am ${dateLongDe(c.createdAt)}` : "verbunden"}
                {" · "}
                {c.lastUsedAt ? `zuletzt genutzt ${relativeDe(c.lastUsedAt)}` : "noch nicht genutzt"}
              </span>
            </div>
            {c.id && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnect(c)}
                disabled={removing !== null}
                aria-label={`${c.label || "Browser"} trennen`}
              >
                {removing === c.id ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}
                Trennen
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Jeder Browser hat eine eigene Verbindung. „Trennen“ macht nur diese eine ungültig –
        die Erweiterung dort muss dann neu verbunden werden.
      </p>
    </section>
  );

  // --- Manueller Fallback (eingeklappt) ---
  const manualFallback = (
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
                In der Erweiterung unter „Verbindungs-Code“ einfügen. Bewahren Sie den Code
                wie ein Passwort auf.
              </p>
            </div>
            <div className="grid gap-1.5">
              <span className="text-[12.5px] font-extrabold text-ink-2">Steply-Adresse</span>
              <CopyField value={appUrl} />
              <p className="text-xs text-muted-foreground">
                In der Erweiterung unter „Steply-Adresse“ eintragen.
              </p>
            </div>
            <div>
              <Button variant="outline" size="sm" onClick={generateManual} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Neuen Code erzeugen
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Der neue Code ersetzt den hier eben erzeugten, solange dieser noch nicht
              eingelöst wurde. Bereits verbundene Browser bleiben verbunden.
            </p>
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
                Code erzeugen
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Jeder Code ist eine eigene Verbindung – bereits verbundene Browser bleiben
              verbunden.
            </p>
          </>
        )}
      </div>
    )}
  </div>
  );

  // --- Update (Erweiterungs-Menü „Update installieren“ führt über /extension hierher) ---
  const updateAvailable =
    installed === true && !!version && !!latestVersion && isNewerVersion(latestVersion, version);
  const updateNotice = updateAvailable ? (
    <section
      data-testid="extension-update"
      className="grid gap-3 rounded-card border-2 border-primary/25 bg-accent/40 px-[18px] py-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <b className="block font-black text-ink">Update verfügbar: Version {latestVersion}</b>
          <span className="text-[12.5px] text-ink-2">
            ZIP herunterladen, in den bisherigen Ordner entpacken (vorhandene Dateien ersetzen),
            dann unter{" "}
            <code className="font-mono font-bold text-ink">
              {browser === "edge" ? "edge://extensions" : "chrome://extensions"}
            </code>{" "}
            bei der Steply-Erweiterung auf „Neu laden“ klicken.
          </span>
        </div>
        <Button nativeButton={false} render={<a href={zipUrl} download />}>
          <Download className="size-4" /> Update herunterladen
        </Button>
      </div>
    </section>
  ) : null;

  // Einrichtung in 3 Schritten: solange die Erweiterung fehlt – und direkt danach, bis dieser
  // erste Browser verbunden ist (Schritt 3 „Jetzt verbinden“). Sonst die Status-Karte.
  const showSetup =
    installed === false || (installed === true && !hasToken && pairedAccount === null);

  if (showSetup) {
    const detected = installed === true;
    return (
      <div className="grid gap-[18px]">
        <section data-testid="extension-status" data-state="todo" className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-soft text-amber-text">
              <Puzzle className="size-[18px]" strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1 basis-60">
              <h2 className="text-lg font-black leading-tight text-ink">In 3 Schritten einrichten</h2>
              <b className="text-[12.5px] font-extrabold text-muted-foreground">
                {detected ? "Installiert – noch nicht verbunden" : "Noch nicht installiert"}
              </b>
            </div>
          </div>
          <ExtensionSetupSteps
            version={latestVersion}
            zipUrl={zipUrl}
            detected={detected}
            connect={
              detected ? (
                <div className="grid gap-3">
                  <p className="text-sm text-ink-2">
                    Steply-Erweiterung erkannt{version ? ` (Version ${version})` : ""}. Verbinden Sie
                    sie jetzt mit Ihrem Konto – ein Klick genügt, kein Code-Kopieren.
                  </p>
                  <div>
                    <Button onClick={pair} disabled={pairing}>
                      {pairing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
                      Jetzt verbinden
                    </Button>
                  </div>
                  {pairError && (
                    <p role="alert" className="rounded-xl bg-no-soft px-3 py-2 text-sm font-bold text-no">
                      {pairError}
                    </p>
                  )}
                </div>
              ) : (
                <p className="flex items-start gap-2 text-sm text-ink-2" data-testid="extension-waiting">
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
                  <span>
                    Sobald die Steply-Erweiterung geladen ist, erkennt diese Seite sie von selbst
                    und es geht hier weiter – ohne Neuladen.
                  </span>
                </p>
              )
            }
          />
        </section>
        {connections.length > 0 && connectionList}
        {manualFallback}
      </div>
    );
  }

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

      {connections.length > 0 && connectionList}
      {updateNotice}
      {manualFallback}
    </div>
  );
}
