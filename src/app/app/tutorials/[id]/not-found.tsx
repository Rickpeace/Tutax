import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Fehlende Anleitung im Editor (gelöscht, falsche Adresse, anderes Konto): page.tsx ruft
 * notFound() auf. Diese Datei hält den App-Rahmen (Kopfleiste/Navigation aus /app/layout)
 * statt der globalen 404-Seite ohne Navigation.
 */
export default function TutorialNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-5 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-line-2 text-muted-foreground">
        <FileQuestion className="size-7" aria-hidden />
      </div>
      <h1 className="mt-5 text-[22px] font-black tracking-tight text-ink">
        Diese Anleitung gibt es nicht (mehr)
      </h1>
      <p className="mt-2 text-sm text-ink-2">
        Vielleicht wurde sie gelöscht oder der Link ist nicht vollständig.
      </p>
      <Button className="mt-6" nativeButton={false} render={<Link href="/app" />}>
        Zurück zu Anleitungen
      </Button>
    </main>
  );
}
