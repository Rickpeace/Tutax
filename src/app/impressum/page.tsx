import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata: Metadata = { title: "Impressum" };

export default function ImpressumPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Impressum</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Platzhalter – bitte vor dem Go-Live durch echte Angaben ersetzen.
        </p>

        <div className="prose mt-8 max-w-none space-y-6 text-ink-2">
          <section>
            <h2 className="font-bold text-ink">Angaben gemäß § 5 TMG</h2>
            <p>
              [Firmenname / Organisationsname]<br />
              [Straße und Hausnummer]<br />
              [PLZ Ort]
            </p>
          </section>
          <section>
            <h2 className="font-bold text-ink">Vertreten durch</h2>
            <p>[Name der vertretungsberechtigten Person]</p>
          </section>
          <section>
            <h2 className="font-bold text-ink">Kontakt</h2>
            <p>
              Telefon: [Telefonnummer]<br />
              E-Mail: [E-Mail-Adresse]
            </p>
          </section>
          <section>
            <h2 className="font-bold text-ink">Registereintrag</h2>
            <p>
              Eintragung im Handelsregister.<br />
              Registergericht: [Amtsgericht]<br />
              Registernummer: [HRB …]
            </p>
          </section>
          <section>
            <h2 className="font-bold text-ink">Umsatzsteuer-ID</h2>
            <p>USt-IdNr. gemäß § 27 a UStG: [DE…]</p>
          </section>
          <section>
            <h2 className="font-bold text-ink">
              Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
            </h2>
            <p>[Name, Anschrift]</p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
