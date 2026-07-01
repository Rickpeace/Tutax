import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-16 text-center">
      <Link href="/" aria-label="Zur Startseite">
        <Wordmark size="lg" />
      </Link>
      <p className="mt-10 font-display text-6xl font-bold tracking-tight text-ink">404</p>
      <h1 className="mt-4 text-2xl font-bold text-ink">Seite nicht gefunden</h1>
      <p className="mt-3 max-w-md text-ink-2">
        Diese Seite existiert nicht (mehr). Möglicherweise wurde sie verschoben
        oder der Link ist nicht ganz vollständig.
      </p>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Sind Sie über einen Hilfe-Link hierher gekommen? Prüfen Sie den Link oder
        fragen Sie die Organisation, von der Sie ihn erhalten haben.
      </p>
      <Button
        size="lg"
        nativeButton={false}
        className="mt-8"
        render={<Link href="/" />}
      >
        Zur Startseite
      </Button>
    </main>
  );
}
