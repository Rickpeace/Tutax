import type { Metadata } from "next";
import Link from "next/link";
import { Zap, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ExtensionSetupSteps } from "@/components/extension-setup-steps";
import { EXTENSION_VERSION, EXTENSION_ZIP_URL } from "@/lib/extension-release";

export const metadata: Metadata = {
  title: "Steply-Erweiterung installieren",
  description:
    "Die Steply-Erweiterung für Chrome und Microsoft Edge: Klick-Anleitungen und Videos aufnehmen und direkt zu Steply hochladen.",
};

// Öffentliche Seite (statisch, keine dynamischen Daten). Eingeloggte Inhaber/Bearbeiter sehen
// sie nie: der Proxy leitet sie auf die Einrichtung IN der App um (Einstellungen →
// Steply-Erweiterung, src/lib/supabase/proxy-session.ts). Hier landen Ausgeloggte und
// Mitarbeiter. Dieselben 3 Schritte wie in der App (ExtensionSetupSteps, Browser-Erkennung);
// Schritt 3 „Verbinden“ geht nur angemeldet → Knopf „Anmelden und verbinden“.
const LOGIN_AND_CONNECT = "/login?next=" + encodeURIComponent("/app/settings/erweiterung");

export default function ExtensionPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
        <div className="inline-flex items-center gap-2 rounded-full border-2 border-line bg-card px-3 py-1 text-xs font-extrabold text-ink-2">
          <Zap className="size-3.5 text-primary" /> Für Google Chrome und Microsoft Edge
          {EXTENSION_VERSION ? ` · v${EXTENSION_VERSION}` : ""}
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-ink sm:text-4xl">
          Steply-Erweiterung einrichten
        </h1>
        <p className="mt-3 max-w-xl text-ink-2">
          Nehmen Sie eine Aufgabe einmal im Browser auf – als Klick-Anleitung mit Screenshots
          oder als Video mit Ton. Die Einrichtung dauert unter einer Minute.
        </p>

        <div className="mt-8">
          <ExtensionSetupSteps
            version={EXTENSION_VERSION}
            zipUrl={EXTENSION_ZIP_URL}
            connectReady
            connect={
              <div className="grid gap-3">
                <p className="text-sm text-ink-2">
                  Damit Aufnahmen automatisch bei Ihren Anleitungen landen, verbinden Sie die
                  Erweiterung einmal mit Ihrem Konto: in Steply anmelden →{" "}
                  <b className="text-ink">Einstellungen → Steply-Erweiterung → „Jetzt verbinden“</b>.
                  Ein Klick genügt – kein Code-Kopieren.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button nativeButton={false} render={<Link href={LOGIN_AND_CONNECT} />}>
                    <LogIn className="size-4" /> Anmelden und verbinden
                  </Button>
                  <Link href="/signup" className="text-sm font-extrabold text-primary hover:underline">
                    Noch kein Konto? Kostenlos starten
                  </Link>
                </div>
              </div>
            }
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
