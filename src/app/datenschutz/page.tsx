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
    p: "Kontodaten (E-Mail, Name der Organisation), von Ihnen hochgeladene Inhalte (Screenshots, Texte) sowie technische Zugriffsdaten. Veröffentlichte Hilfe-Seiten sind ohne Personenbezug abrufbar.",
  },
  {
    h: "3. Zweck und Rechtsgrundlage",
    p: "Die Verarbeitung erfolgt zur Bereitstellung des Dienstes (Art. 6 Abs. 1 lit. b DSGVO) sowie zur Wahrung berechtigter Interessen an einem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO).",
  },
  {
    h: "4. Hosting & Auftragsverarbeiter",
    p: "Datenbank, Authentifizierung und Datei-Speicher: Supabase (Rechenzentrum in der EU, Irland). Hosting und Auslieferung der Anwendung: Vercel Inc. (USA). Verarbeitung von Bildschirm-Videos zu Anleitungen: Server bei Hetzner Online GmbH (Deutschland). Versand von E-Mails (Einladungen, Benachrichtigungen): Resend (USA). Mit diesen Dienstleistern bestehen bzw. werden Auftragsverarbeitungsverträge (AVV) nach Art. 28 DSGVO geschlossen.",
  },
  {
    h: "5. KI-Funktionen & Übermittlung in Drittländer",
    p: "Für KI-gestützte Funktionen (Hilfe-Chat auf den veröffentlichten Seiten, KI-Erstellung und -Überarbeitung von Anleitungen, Übersetzung, Transkription von Videos) nutzen wir OpenAI als Auftragsverarbeiter. Für das Vorlesen von Anleitungen nutzen wir ElevenLabs. Für die Übernahme Ihres Designs (CI) wird ein Bildschirmfoto der von Ihnen angegebenen Website über thum.io erstellt. Dabei werden die jeweiligen Eingaben und Inhalte an diese Anbieter in den USA übermittelt und dort verarbeitet. Diese Übermittlung in ein Drittland stützt sich auf die EU-Standardvertragsklauseln bzw. das EU-US Data Privacy Framework. Über die API übermittelte Inhalte werden nach Zusicherung von OpenAI nicht zum Training der Modelle verwendet. Bitte geben Sie im Hilfe-Chat keine personenbezogenen oder vertraulichen Daten ein.",
  },
  {
    h: "6. Cookies, Schriften & Analyse",
    p: "Der öffentliche Viewer setzt keine Tracking-Cookies. Für die Anmeldung werden technisch notwendige Sitzungs-Cookies verwendet. Hat eine Organisation für ihre Hilfe-Seite eine eigene Schrift gewählt, wird diese von Google Fonts (Google Ireland Ltd.) geladen; dabei wird Ihre IP-Adresse an Google übermittelt. Analyse erfolgt – sofern aktiv – ohne Personenbezug.",
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
