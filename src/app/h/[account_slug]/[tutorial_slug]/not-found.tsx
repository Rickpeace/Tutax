"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchX } from "lucide-react";

/**
 * Anleitung gibt es (nicht mehr) — aber die Hilfe-Seite der Kanzlei schon (Runde 5, Mandanten-Test):
 * vorher landeten alte/falsche Links auf der Steply-404 mit Knöpfen zum Steply-Login. Diese Seite
 * rendert INNERHALB des /h-Layouts (Kanzlei-Farben) und führt zurück zu „Alle Anleitungen“.
 * Client-Komponente, weil not-found keine params bekommt — der Konto-Slug kommt aus dem Pfad.
 */
export default function TutorialNotFound() {
  const pathname = usePathname() ?? "";
  const accountSlug = pathname.split("/")[2] ?? "";
  const hubHref = accountSlug ? `/h/${accountSlug}` : "/";
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-5 py-12 text-center">
      <div
        className="mb-4 grid size-14 place-items-center rounded-full"
        style={{ background: "color-mix(in srgb, var(--brand-accent, #ef6a4e) 14%, transparent)" }}
      >
        <SearchX className="size-7" style={{ color: "var(--brand-accent-strong, var(--brand-accent, #b8452d))" }} />
      </div>
      <h1 className="text-xl font-bold" style={{ color: "var(--brand-ink)" }}>
        Diese Anleitung gibt es hier nicht (mehr)
      </h1>
      <p className="mt-2 text-sm" style={{ color: "color-mix(in srgb, var(--brand-ink) 72%, transparent)" }}>
        Vielleicht wurde sie umbenannt oder zusammengelegt. Alle aktuellen Anleitungen finden Sie auf der
        Hilfe-Seite – dort können Sie auch suchen.
      </p>
      <Link
        href={hubHref}
        className="mt-6 inline-flex items-center rounded-full px-5 py-2.5 text-sm font-bold"
        style={{ background: "var(--brand-accent, #b8452d)", color: "var(--brand-accent-fg, #fff)" }}
      >
        Alle Anleitungen ansehen
      </Link>
    </main>
  );
}
