import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata: Metadata = { title: "Datenschutz" };

const sections = [
  {
    h: "1. Verantwortlicher",
    p: "Verantwortlich für die Datenverarbeitung ist [ANGABE FOLGT — Betreiber: Firmenname, Anschrift, E-Mail]. Bei Fragen zum Datenschutz erreichen Sie uns unter [ANGABE FOLGT — Betreiber: E-Mail].",
  },
  {
    h: "2. Welche Daten wir verarbeiten",
    p: "Kontodaten (E-Mail, Name der Organisation), von Ihnen hochgeladene Inhalte (Screenshots, Texte) sowie technische Zugriffsdaten. Veröffentlichte Hilfeseiten sind ohne Personenbezug abrufbar.",
  },
  {
    h: "3. Zweck und Rechtsgrundlage",
    p: "Die Verarbeitung erfolgt zur Bereitstellung des Dienstes (Art. 6 Abs. 1 lit. b DSGVO) sowie zur Wahrung berechtigter Interessen an einem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO).",
  },
  {
    h: "4. Hosting & Auftragsverarbeiter",
    p: "Datenbank, Authentifizierung und Datei-Speicher: Supabase (EU-Region). Hosting der Anwendung: Vercel (EU-Region). Mit diesen Subprozessoren bestehen Auftragsverarbeitungsverträge (AVV) nach Art. 28 DSGVO.",
  },
  {
    h: "5. KI-Funktionen & Übermittlung in Drittländer",
    p: "Für KI-gestützte Funktionen (Hilfe-Chat auf den veröffentlichten Seiten sowie die KI-Erstellung von Tutorials) nutzen wir OpenAI als Auftragsverarbeiter. Dabei werden die jeweiligen Eingaben und Inhalte an OpenAI, L.L.C. (USA) übermittelt und dort verarbeitet. Diese Übermittlung in ein Drittland stützt sich auf die EU-Standardvertragsklauseln sowie das EU-US Data Privacy Framework. Über die API übermittelte Inhalte werden nach Zusicherung von OpenAI nicht zum Training der Modelle verwendet. Bitte geben Sie im Hilfe-Chat keine personenbezogenen oder vertraulichen Daten ein.",
  },
  {
    h: "6. Cookies & Analyse",
    p: "Der öffentliche Viewer setzt keine Tracking-Cookies. Für die Anmeldung werden technisch notwendige Sitzungs-Cookies verwendet. Analyse erfolgt – sofern aktiv – ohne Personenbezug.",
  },
  {
    h: "7. Speicherdauer",
    p: "Daten werden gespeichert, solange Ihr Konto besteht, und nach Löschung des Kontos innerhalb angemessener Fristen entfernt.",
  },
  {
    h: "8. Ihre Rechte",
    p: "Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie ein Beschwerderecht bei einer Aufsichtsbehörde.",
  },
];

export default function DatenschutzPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Datenschutz</h1>
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
