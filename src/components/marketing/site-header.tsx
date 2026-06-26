import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-5">
        <Link href="/">
          <Wordmark size="lg" />
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-ink-2 md:flex">
          <Link href="/#features" className="hover:text-ink">
            Funktionen
          </Link>
          <Link href="/#how" className="hover:text-ink">
            So funktioniert&apos;s
          </Link>
          <Link href="/anleitung" className="hover:text-ink">
            Anleitung
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Anmelden
          </Button>
          <Button size="sm" nativeButton={false} render={<Link href="/signup" />}>
            Kostenlos starten
          </Button>
        </div>
      </div>
    </header>
  );
}
