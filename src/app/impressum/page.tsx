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

        <div className="prose mt-8 max-w-none space-y-6 text-ink-2">
          <section>
            <h2 className="font-bold text-ink">Angaben gemäß § 5 TMG</h2>
            <p>
              [ANGABE FOLGT — Betreiber: Firmenname / Organisationsname]<br />
              [ANGABE FOLGT — Betreiber: Straße und Hausnummer]<br />
              [ANGABE FOLGT — Betreiber: PLZ Ort]
            </p>
          </section>
          <section>
            <h2 className="font-bold text-ink">Vertreten durch</h2>
            <p>[ANGABE FOLGT — Betreiber: vertretungsberechtigte Person]</p>
          </section>
          <section>
            <h2 className="font-bold text-ink">Kontakt</h2>
            <p>
              Telefon: [ANGABE FOLGT — Betreiber]<br />
              E-Mail: [ANGABE FOLGT — Betreiber]
            </p>
          </section>
          <section>
            <h2 className="font-bold text-ink">Registereintrag</h2>
            <p>
              Eintragung im Handelsregister.<br />
              Registergericht: [ANGABE FOLGT — Betreiber]<br />
              Registernummer: [ANGABE FOLGT — Betreiber]
            </p>
          </section>
          <section>
            <h2 className="font-bold text-ink">Umsatzsteuer-ID</h2>
            <p>USt-IdNr. gemäß § 27 a UStG: [ANGABE FOLGT — Betreiber]</p>
          </section>
          <section>
            <h2 className="font-bold text-ink">
              Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
            </h2>
            <p>[ANGABE FOLGT — Betreiber: Name, Anschrift]</p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
