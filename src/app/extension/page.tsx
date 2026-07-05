import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Zap,
  Clapperboard,
  Download,
  Plug,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata: Metadata = {
  title: "Steply Recorder installieren",
  description:
    "Die Steply-Recorder-Extension für Chrome: Klick-Anleitungen und Videos aufnehmen und direkt zu Steply hochladen.",
};

// Statische, cachebare Seite (keine dynamischen Daten). Die Versionsnummer lesen wir zur
// BUILD-Zeit aus dem Manifest (Modul-Scope, nicht im Render) — das bleibt statisch und
// zeigt trotzdem immer die echte Version. Fallback, falls die Datei mal fehlt.
function extensionVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), "extension", "manifest.json"), "utf8");
    const v = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof v === "string" ? v : "2.2.0";
  } catch {
    return "2.2.0";
  }
}
const VERSION = extensionVersion();

const ZIP_URL = "/downloads/steply-recorder.zip";

export default function ExtensionPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
        {/* Hero */}
        <div className="inline-flex items-center gap-2 rounded-full border-2 border-line bg-card px-3 py-1 text-xs font-extrabold text-ink-2">
          <Zap className="size-3.5 text-primary" /> Chrome-Extension · v{VERSION}
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-ink sm:text-4xl">
          Steply Recorder
        </h1>
        <p className="mt-3 max-w-xl text-ink-2">
          Nehmen Sie einen Ablauf einmal auf – Steply macht daraus eine fertige
          Klick-Anleitung. Die Extension lebt in der Browser-Seitenleiste und lädt
          Aufnahmen direkt in Ihre Bibliothek.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            nativeButton={false}
            render={<a href={ZIP_URL} download />}
          >
            <Download className="size-4" /> Extension herunterladen (v{VERSION})
          </Button>
          <span className="text-xs font-semibold text-muted-foreground">
            ZIP · für Google Chrome ab Version 114
          </span>
        </div>

        {/* Zwei Modi */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-card border-2 border-line bg-card p-5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
              <Zap className="size-5" />
            </span>
            <div className="mt-3 font-black text-ink">Sofort-Anleitung</div>
            <p className="mt-1 text-sm text-ink-2">
              Klicken statt filmen: Bei jedem Klick entsteht ein Schritt mit Screenshot
              und Markierung. Nach Sekunden liegt der fertige Entwurf in Steply – ganz
              ohne Video.
            </p>
          </div>
          <div className="rounded-card border-2 border-line bg-card p-5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
              <Clapperboard className="size-5" />
            </span>
            <div className="mt-3 font-black text-ink">Video mit Ton</div>
            <p className="mt-1 text-sm text-ink-2">
              Bildschirm-Aufnahme mit Mikrofon vorführen – die KI schreibt Texte und
              erzeugt daraus Schritt für Schritt die Anleitung.
            </p>
          </div>
        </div>

        {/* Installation in 3 Schritten */}
        <h2 className="mt-12 text-xl font-black text-ink">In 3 Schritten installiert</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bis der Chrome Web Store fertig ist, laden Sie die Extension einmal von Hand.
          Das dauert unter einer Minute.
        </p>

        <div className="mt-6 space-y-4">
          <InstallStep
            n={1}
            title="ZIP entpacken"
            desc="Laden Sie die Datei oben herunter und entpacken Sie sie in einen festen Ordner (nicht löschen – Chrome lädt die Extension von dort)."
            illustration={<UnzipArt />}
          />
          <InstallStep
            n={2}
            title="Entwicklermodus einschalten"
            desc="Öffnen Sie chrome://extensions und schalten Sie oben rechts den „Entwicklermodus“ ein."
            illustration={<DevModeArt />}
          />
          <InstallStep
            n={3}
            title="„Entpackt laden“ → Ordner wählen"
            desc="Klicken Sie auf „Entpackt laden“ und wählen Sie den entpackten Ordner. Fertig – das Steply-Symbol erscheint in der Symbolleiste."
            illustration={<LoadUnpackedArt />}
          />
        </div>

        {/* Verbinden-Hinweis */}
        <div className="mt-10 flex items-start gap-3 rounded-card border-2 border-primary/25 bg-accent/40 p-5">
          <Plug className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <div className="font-black text-ink">Zum Schluss: verbinden</div>
            <p className="mt-1 text-sm text-ink-2">
              Damit Aufnahmen automatisch in Ihrer Bibliothek landen, verbinden Sie die
              Extension einmal mit Ihrem Konto: in Steply unter{" "}
              <b className="text-ink">Einstellungen → Einbetten → „Extension verbinden“</b>
              . Ein Klick genügt – kein Token-Kopieren.
            </p>
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href="/app/settings/einbetten" />}
              >
                Zu den Einbetten-Einstellungen <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Web-Store-Hinweis */}
        <div className="mt-6 flex items-start gap-3 rounded-card border-2 border-line bg-line-2/60 p-5">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-ink-2">
            <b className="text-ink">Chrome Web Store in Vorbereitung.</b> Sobald die
            Extension dort verfügbar ist, installieren Sie sie mit einem Klick – inklusive
            <b> automatischer Updates</b>. Bis dahin ist der manuelle Weg oben die saubere
            Zwischenlösung.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function InstallStep({
  n,
  title,
  desc,
  illustration,
}: {
  n: number;
  title: string;
  desc: string;
  illustration: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-card border-2 border-line bg-card p-5 sm:flex-row sm:items-center">
      <div className="flex items-start gap-4 sm:flex-1">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-white shadow-hard">
          {n}
        </span>
        <div>
          <div className="font-black text-ink">{title}</div>
          <p className="mt-1 text-sm text-ink-2">{desc}</p>
        </div>
      </div>
      <div className="shrink-0 self-center sm:self-auto" aria-hidden>
        {illustration}
      </div>
    </div>
  );
}

/* ---- Inline-SVG-Illustrationen (Warm-Palette, keine Screenshots) ---- */

function ArtFrame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="132"
      height="84"
      viewBox="0 0 132 84"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="rounded-lg border-2 border-line bg-background"
    >
      {children}
    </svg>
  );
}

// Schritt 1: ZIP-Archiv, das sich in einen offenen Ordner entpackt.
function UnzipArt() {
  return (
    <ArtFrame>
      {/* Ordner */}
      <path
        d="M20 32h20l5 6h30a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V36a4 4 0 0 1 4-4z"
        fill="#ffe8e2"
        stroke="#ef6a4e"
        strokeWidth="2.5"
      />
      {/* ZIP-Kachel oben rechts */}
      <rect x="86" y="14" width="30" height="38" rx="4" fill="#fff" stroke="#33291f" strokeWidth="2.5" />
      <rect x="97" y="14" width="8" height="6" fill="#33291f" />
      <rect x="97" y="20" width="8" height="6" fill="#f0e7d9" />
      <rect x="97" y="26" width="8" height="6" fill="#33291f" />
      <rect x="97" y="32" width="8" height="6" fill="#f0e7d9" />
      {/* Pfeil hinein */}
      <path d="M84 46l-14 8" stroke="#8a7a63" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 4" />
    </ArtFrame>
  );
}

// Schritt 2: Adressleiste chrome://extensions + Entwicklermodus-Schalter (an).
function DevModeArt() {
  return (
    <ArtFrame>
      {/* Adressleiste */}
      <rect x="16" y="16" width="100" height="16" rx="8" fill="#f7f1e6" stroke="#f0e7d9" strokeWidth="2" />
      <circle cx="26" cy="24" r="2.5" fill="#8a7a63" />
      <rect x="34" y="21" width="60" height="6" rx="3" fill="#b3a48c" />
      {/* Toggle-Zeile */}
      <rect x="16" y="44" width="100" height="26" rx="6" fill="#fff" stroke="#f0e7d9" strokeWidth="2" />
      <rect x="24" y="54" width="42" height="6" rx="3" fill="#6b5e4b" />
      {/* Schalter an (Koralle) */}
      <rect x="80" y="50" width="28" height="14" rx="7" fill="#ef6a4e" />
      <circle cx="101" cy="57" r="5" fill="#fff" />
    </ArtFrame>
  );
}

// Schritt 3: Button „Entpackt laden" + Ordner.
function LoadUnpackedArt() {
  return (
    <ArtFrame>
      {/* Button */}
      <rect x="16" y="20" width="62" height="20" rx="10" fill="#ef6a4e" />
      <rect x="16" y="22" width="62" height="20" rx="10" fill="#ef6a4e" />
      <rect x="26" y="27" width="42" height="6" rx="3" fill="#fff" />
      {/* Cursor */}
      <path d="M52 40l0 14 4-4 3 6 3-1-3-6 6 0z" fill="#33291f" stroke="#fff" strokeWidth="1.5" />
      {/* Ordner */}
      <path
        d="M92 34h10l3 4h12a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H92a3 3 0 0 1-3-3V37a3 3 0 0 1 3-3z"
        fill="#dcf3ef"
        stroke="#118576"
        strokeWidth="2.5"
      />
    </ArtFrame>
  );
}
