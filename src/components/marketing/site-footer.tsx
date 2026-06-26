import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <Wordmark size="lg" />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Klickbare Hilfe-Anleitungen für Steuerkanzleien – im eigenen CI, ohne
            Webdesigner.
          </p>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Produkt
          </div>
          <ul className="mt-3 space-y-2 text-sm text-ink-2">
            <li><Link href="/#features" className="hover:text-primary">Funktionen</Link></li>
            <li><Link href="/anleitung" className="hover:text-primary">Anleitung</Link></li>
            <li><Link href="/signup" className="hover:text-primary">Kostenlos starten</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Rechtliches
          </div>
          <ul className="mt-3 space-y-2 text-sm text-ink-2">
            <li><Link href="/impressum" className="hover:text-primary">Impressum</Link></li>
            <li><Link href="/datenschutz" className="hover:text-primary">Datenschutz</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Konto
          </div>
          <ul className="mt-3 space-y-2 text-sm text-ink-2">
            <li><Link href="/login" className="hover:text-primary">Anmelden</Link></li>
            <li><Link href="/signup" className="hover:text-primary">Registrieren</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line-2 py-5 text-center text-xs text-muted-foreground">
        © {2026} Tutax · DSGVO-konform, Hosting in der EU
      </div>
    </footer>
  );
}
