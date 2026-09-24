"use client";

import { useState } from "react";
import { Check, Copy, Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBrowserKind, type BrowserKind } from "@/lib/use-recorder-extension";

/**
 * Einrichtung der Steply-Erweiterung in 3 Schritten (Herunterladen → Im Browser laden →
 * Verbinden). Geteilt zwischen der In-App-Seite (Einstellungen → Steply-Erweiterung) und der
 * öffentlichen Seite /extension. Der Browser wird am User-Agent erkannt (Chrome/Edge, sonst
 * Chrome) und NUR dessen Anleitung gezeigt; „Anderer Browser?“ klappt die andere auf.
 *
 * `detected` = Erweiterung in diesem Browser erkannt → Schritte 1–2 sind erledigt, Schritt 3
 * ist dran. Den Inhalt von Schritt 3 liefert der Aufrufer (In-App: „Jetzt verbinden“,
 * öffentlich: „Anmelden und verbinden“).
 */
export function ExtensionSetupSteps({
  version,
  zipUrl,
  detected = false,
  connect,
  connectReady = false,
}: {
  version: string;
  zipUrl: string;
  detected?: boolean;
  /** Inhalt von Schritt 3. */
  connect: React.ReactNode;
  /** Schritt 3 ist auch vor der Erkennung ausführbar (öffentlich: „Anmelden“) → nicht ausgegraut. */
  connectReady?: boolean;
}) {
  const kind = useBrowserKind();
  const [downloaded, setDownloaded] = useState(false);
  const current = detected ? 3 : downloaded ? 2 : 1;

  return (
    <div className="grid gap-4" data-testid="extension-setup" data-step={current} data-browser={kind}>
      {/* Fortschritt */}
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3 text-[12.5px] font-extrabold text-muted-foreground">
          <span>Schritt {current} von 3</span>
          <span>{kind === "edge" ? "Microsoft Edge" : "Google Chrome"}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={"h-1.5 rounded-full " + (n <= current ? "bg-primary" : "bg-line")}
            />
          ))}
        </div>
      </div>

      <ol className="grid gap-3">
        <Step n={1} title="Herunterladen" current={current}>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              nativeButton={false}
              variant={current === 1 ? "default" : "outline"}
              render={<a href={zipUrl} download onClick={() => setDownloaded(true)} />}
            >
              <Download className="size-4" /> Steply-Erweiterung herunterladen
            </Button>
            <span className="text-xs font-semibold text-muted-foreground">
              ZIP{version ? ` · Version ${version}` : ""}
            </span>
          </div>
          <p className="mt-2 text-sm text-ink-2">
            Entpacken Sie die ZIP-Datei in einen festen Ordner (Rechtsklick → „Alle extrahieren“).
            Den Ordner danach nicht löschen – der Browser lädt die Erweiterung von dort.
          </p>
        </Step>

        <Step n={2} title="Im Browser laden" current={current}>
          <LoadInstructions kind={kind} />
        </Step>

        <Step n={3} title="Verbinden" current={current} alwaysOpen dim={!connectReady}>
          {connect}
        </Step>
      </ol>

      <p className="text-xs text-muted-foreground" data-testid="webstore-hint">
        Bald auch im Chrome Web Store – dann mit einem Klick und automatischen Updates.
      </p>
    </div>
  );
}

function Step({
  n,
  title,
  current,
  alwaysOpen = false,
  dim = true,
  children,
}: {
  n: number;
  title: string;
  current: number;
  alwaysOpen?: boolean;
  /** Kommende Schritte ausgrauen (Standard). */
  dim?: boolean;
  children: React.ReactNode;
}) {
  // 1–2 gelten erst mit erkannter Erweiterung als erledigt (Download allein beweist nichts).
  const done = current === 3 && n < 3;
  const upcoming = n > current && dim;
  // Bis die Erweiterung erkannt ist, bleiben Schritt 1 und 2 offen (wer schon heruntergeladen
  // hat, macht direkt bei 2 weiter). Danach sind sie eingeklappt und abgehakt.
  const open = alwaysOpen || !done;

  return (
    <li
      data-testid={`setup-step-${n}`}
      data-state={done ? "done" : n === current ? "current" : upcoming ? "upcoming" : "open"}
      className={
        "grid gap-3 rounded-card border-2 bg-card px-[18px] py-4 " +
        (n === current ? "border-primary/40" : "border-line")
      }
    >
      <div className="flex items-center gap-3">
        <span
          className={
            "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-black " +
            (done
              ? "bg-teal-soft text-teal-text"
              : n === current
                ? "bg-primary text-white"
                : "bg-line-2 text-muted-foreground")
          }
        >
          {done ? <Check className="size-4" strokeWidth={2.8} /> : n}
        </span>
        <b className={"font-black " + (upcoming ? "text-muted-foreground" : "text-ink")}>{title}</b>
        {done && <span className="ml-auto text-xs font-extrabold text-teal-text">Erledigt</span>}
      </div>
      {open && <div className={"min-w-0 sm:pl-11 " + (upcoming ? "opacity-70" : "")}>{children}</div>}
    </li>
  );
}

const BROWSER: Record<
  BrowserKind,
  { name: string; address: string; devMode: string; loadLabel: string }
> = {
  chrome: {
    name: "Google Chrome",
    address: "chrome://extensions",
    devMode: "oben rechts",
    // So heißt der Knopf im deutschen Chrome (Runde 5; vorher „Entpackt laden“).
    loadLabel: "Entpackte Erweiterung laden",
  },
  edge: {
    name: "Microsoft Edge",
    address: "edge://extensions",
    devMode: "links in der Seitenleiste",
    loadLabel: "Entpackte Erweiterung laden",
  },
};

function LoadInstructions({ kind }: { kind: BrowserKind }) {
  const [showOther, setShowOther] = useState(false);
  const other: BrowserKind = kind === "edge" ? "chrome" : "edge";
  return (
    <div className="grid gap-3">
      <BrowserSteps kind={kind} />
      <div>
        <button
          type="button"
          aria-expanded={showOther}
          onClick={() => setShowOther((s) => !s)}
          className="flex items-center gap-1 text-[13px] font-extrabold text-ink-2 transition-colors hover:text-ink"
        >
          <ChevronDown
            className={"size-4 shrink-0 transition-transform " + (showOther ? "rotate-180" : "-rotate-90")}
          />
          Anderer Browser?
        </button>
        {showOther && (
          <div className="mt-2 grid gap-2 rounded-xl bg-line-2/60 px-3 py-3" data-testid="other-browser">
            <b className="text-sm font-black text-ink">So geht es in {BROWSER[other].name}</b>
            <BrowserSteps kind={other} />
          </div>
        )}
      </div>
    </div>
  );
}

function BrowserSteps({ kind }: { kind: BrowserKind }) {
  const b = BROWSER[kind];
  return (
    <ol className="grid list-decimal gap-2 pl-5 text-sm text-ink-2 marker:font-extrabold marker:text-ink-2">
      <li>
        Neuen Tab öffnen und diese Adresse in die Adresszeile einfügen:
        <AddressCopy address={b.address} />
      </li>
      <li>
        <b className="text-ink">„Entwicklermodus“</b> {b.devMode} einschalten.
      </li>
      <li>
        <b className="text-ink">„{b.loadLabel}“</b> klicken und den entpackten Ordner wählen.
        Fertig! Steply finden Sie jetzt über das Puzzle-Symbol oben rechts in der Browser-Leiste.
        Tipp: Dort bei Steply auf die Stecknadel klicken – dann steht das Steply-Symbol immer
        sichtbar in der Leiste, und ein Klick darauf öffnet die Seitenleiste zum Aufnehmen.
      </li>
    </ol>
  );
}

// Browser-interne Adressen (chrome://, edge://) sind als Link nicht klickbar → zum Kopieren.
function AddressCopy({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Zwischenablage gesperrt – Adresse bleibt markierbar */
    }
  }
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-2">
      <code
        data-testid="browser-address"
        className="select-all rounded-lg border-2 border-line bg-background px-2.5 py-1 font-mono text-[13px] font-bold text-ink"
      >
        {address}
      </code>
      <button
        type="button"
        onClick={copy}
        className="flex h-8 items-center gap-1.5 rounded-full border-2 border-line bg-card px-3 text-[13px] font-extrabold text-ink-2 transition-colors hover:border-[#e3d7c2] hover:text-ink"
      >
        {copied ? (
          <>
            <Check className="size-3.5 text-yes" /> Kopiert
          </>
        ) : (
          <>
            <Copy className="size-3.5" /> Kopieren
          </>
        )}
      </button>
    </span>
  );
}
