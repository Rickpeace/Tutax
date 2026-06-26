import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata: Metadata = { title: "Datenschutz" };

const sections = [
  {
    h: "1. Verantwortlicher",
    p: "Verantwortlich für die Datenverarbeitung ist [Firmenname, Anschrift, E-Mail]. Bei Fragen zum Datenschutz erreichen Sie uns unter [E-Mail].",
  },
  {
    h: "2. Welche Daten wir verarbeiten",
    p: "Kontodaten (E-Mail, Name der Kanzlei), von Ihnen hochgeladene Inhalte (Screenshots, Texte) sowie technische Zugriffsdaten. Veröffentlichte Hilfeseiten sind ohne Personenbezug abrufbar.",
  },
  {
    h: "3. Zweck und Rechtsgrundlage",
    p: "Die Verarbeitung erfolgt zur Bereitstellung des Dienstes (Art. 6 Abs. 1 lit. b DSGVO) sowie zur Wahrung berechtigter Interessen an einem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO).",
  },
  {
    h: "4. Hosting & Auftragsverarbeiter",
    p: "Datenbank, Authentifizierung und Datei-Speicher: Supabase (EU-Region). Hosting der Anwendung: Vercel (EU). Mit allen Subprozessoren bestehen Auftragsverarbeitungsverträge (AVV). Es findet keine Übermittlung in Drittländer ohne geeignete Garantien statt.",
  },
  {
    h: "5. Cookies & Analyse",
    p: "Der öffentliche Viewer setzt keine Tracking-Cookies. Für die Anmeldung werden technisch notwendige Sitzungs-Cookies verwendet. Analyse erfolgt – sofern aktiv – ohne Personenbezug.",
  },
  {
    h: "6. Speicherdauer",
    p: "Daten werden gespeichert, solange Ihr Konto besteht, und nach Löschung des Kontos innerhalb angemessener Fristen entfernt.",
  },
  {
    h: "7. Ihre Rechte",
    p: "Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie ein Beschwerderecht bei einer Aufsichtsbehörde.",
  },
];

export default function DatenschutzPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Datenschutz</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Platzhalter-Datenschutzerklärung – bitte juristisch prüfen und anpassen.
        </p>
        <div className="mt-8 space-y-6">
          {sections.map((s) => (
            <section key={s.h}>
              <h2 className="font-bold text-ink">{s.h}</h2>
              <p className="mt-1 text-ink-2">{s.p}</p>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
