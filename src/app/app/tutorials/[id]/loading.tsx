/**
 * Sofort-Skeleton für den Builder (Zwei-Spalten-Layout), damit der Editor beim
 * Öffnen nicht als leere Wartefläche erscheint. Warm-Design: kräftige
 * Pulse-Flächen (bg-line-2) mit 2px-Borders — auf dem Creme-Hintergrund
 * sichtbar, gestaffelte Animation wie in der Bibliothek.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
      {/* Zurück-Link + Titelzeile */}
      <div className="h-4 w-28 animate-pulse rounded-full bg-line-2" />
      <div className="mt-3 flex items-center gap-3">
        <div className="h-8 w-72 animate-pulse rounded-full bg-line-2" />
        <div className="ml-auto hidden h-9 w-36 animate-pulse rounded-full bg-line-2 sm:block" />
      </div>

      <div className="mt-6 flex items-start gap-6">
        {/* Ablauf links: Schritt-Karten mit Thumb-Platzhalter */}
        <div className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-3xl space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-card border-2 border-line bg-card p-3"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="size-12 shrink-0 animate-pulse rounded-lg bg-line-2" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-line-2" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-line-2/80" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Editor-Panel rechts (angedockt ab lg) */}
        <div className="hidden w-[440px] shrink-0 overflow-hidden rounded-card border-2 border-line bg-card lg:block xl:w-[520px]">
          <div className="h-10 border-b-2 border-line bg-line-2/50" />
          <div className="space-y-3 p-4">
            <div className="aspect-video w-full animate-pulse rounded-xl bg-line-2" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-line-2" />
            <div className="h-20 w-full animate-pulse rounded-xl bg-line-2/80" />
            <div className="h-9 w-40 animate-pulse rounded-full bg-line-2" />
          </div>
        </div>
      </div>
    </main>
  );
}
