"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-16 text-center">
      <Link href="/" aria-label="Zur Startseite">
        <Wordmark size="lg" />
      </Link>
      <h1 className="mt-10 text-2xl font-bold text-ink">
        Da ist etwas schiefgelaufen
      </h1>
      <p className="mt-3 max-w-md text-ink-2">
        Wir konnten diese Seite gerade nicht laden. Bitte versuchen Sie es erneut –
        oft hilft das schon.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" onClick={() => reset()}>
          Erneut versuchen
        </Button>
        <Button
          size="lg"
          variant="outline"
          nativeButton={false}
          render={<Link href="/" />}
        >
          Zur Startseite
        </Button>
      </div>
    </main>
  );
}
