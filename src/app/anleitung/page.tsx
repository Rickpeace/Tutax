import type { Metadata } from "next";
import Link from "next/link";
import {
  UserPlus,
  PencilLine,
  GitBranch,
  ScanSearch,
  Palette,
  Send,
  Link2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata: Metadata = { title: "Anleitung" };

const steps = [
  {
    icon: UserPlus,
    t: "1. Konto erstellen",
    d: "Registrieren Sie sich mit E-Mail. Beim ersten Login richten wir gemeinsam Ihre Hilfeseite ein (Name & Adresse).",
  },
  {
    icon: PencilLine,
    t: "2. Tutorial aufbauen",
    d: "Klicken Sie „Neues Tutorial“ und fügen Sie Schritte hinzu. Mit dem „+“ zwischen den Karten setzen Sie neue Schritte genau dort ein, wo sie hingehören.",
  },
  {
    icon: GitBranch,
    t: "3. Verzweigungen anlegen",
    d: "Machen Sie einen Schritt zur Frage und fügen Sie Antworten (z. B. „Ja“/„Nein“) hinzu, die zum passenden Folgeschritt führen.",
  },
  {
    icon: ScanSearch,
    t: "4. Screenshots & Highlights",
    d: "Bild hochladen oder Foto aufnehmen, zuschneiden, dann Rechteck/Kreis/Pfeil setzen. Mit der Lupe vergrößern Sie das wichtige Element, mit Blur schwärzen Sie sensible Daten.",
  },
  {
    icon: Palette,
    t: "5. Branding setzen",
    d: "Unter Einstellungen → Branding legen Sie Logo und Farben fest. So sieht Ihre Hilfeseite aus wie Ihre Organisation.",
  },
  {
    icon: Send,
    t: "6. Veröffentlichen",
    d: "Über das ⋯-Menü der Tutorial-Karte „Veröffentlichen“. Das Tutorial erscheint dann auf Ihrer Hilfeseite.",
  },
  {
    icon: Link2,
    t: "7. Verlinken",
    d: "Kopieren Sie unter Einstellungen → Einbetten Ihren Hilfeseiten-Link und setzen Sie ihn als Menüpunkt „Hilfe“ auf Ihre Website. Fertig.",
  },
];

export default function AnleitungPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          So nutzen Sie Steply
        </h1>
        <p className="mt-2 text-muted-foreground">
          In wenigen Minuten zur ersten veröffentlichten Anleitung.
        </p>

        {/* Dogfooding: unsere eigene Hilfe läuft auf Steply — bester Beweis + echte Doku. */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-accent/40 p-4">
          <p className="text-sm text-ink-2">
            <b className="text-ink">Alle Funktionen als klickbare Anleitungen</b> — auf
            unserer eigenen Steply-Hilfe-Seite (natürlich mit Steply gebaut).
          </p>
          <Button size="sm" nativeButton={false} render={<Link href="/h/steply" target="_blank" />}>
            Steply-Hilfe öffnen <ArrowRight className="size-4" />
          </Button>
        </div>

        <div className="mt-10 space-y-4">
          {steps.map((s) => (
            <div key={s.t} className="flex gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                <s.icon className="size-5" />
              </div>
              <div>
                <div className="font-bold text-ink">{s.t}</div>
                <p className="mt-1 text-sm text-ink-2">{s.d}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-accent/40 p-6">
          <div className="flex-1">
            <div className="font-bold text-ink">Bereit?</div>
            <p className="text-sm text-ink-2">Erstellen Sie Ihr Konto und legen Sie los.</p>
          </div>
          <Button nativeButton={false} render={<Link href="/signup" />}>
            Kostenlos starten <ArrowRight className="size-4" />
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
