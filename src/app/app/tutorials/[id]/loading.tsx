/**
 * Sofort-Skeleton für den Editor — Maße wie die echte Seite (page.tsx/Builder), damit beim
 * Laden nichts springt: gleiche Breite (max-w-[1440px]), Kopf (Zurück, Titel, Kurzbeschreibung,
 * Steuerzeile), „N Schritte“ und der Ablauf mittig (max-w-3xl) mit Karten wie im Flow
 * (38px-Vorschaubild, Einfügepunkte dazwischen). Kein Panel rechts: das öffnet sich erst,
 * wenn ein Schritt gewählt wird. Warm-Design: Pulse-Flächen bg-line-2, 2px-Rahmen.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[1440px] flex-1 px-5 py-6" aria-busy="true">
      {/* Kopf */}
      <div className="mb-6">
        <div className="mb-3 h-5 w-20 animate-pulse rounded-full bg-line-2" />
        <div className="h-7 w-80 max-w-full animate-pulse rounded-full bg-line-2" />
        <div className="mt-1.5 h-4 w-96 max-w-full animate-pulse rounded-full bg-line-2/80" />
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <div className="h-7 w-28 animate-pulse rounded-full bg-line-2" />
          <div className="h-8 w-52 animate-pulse rounded-full bg-line-2" />
          <div className="h-7 w-44 animate-pulse rounded-full bg-line-2" />
          <div className="h-7 w-36 animate-pulse rounded-full bg-line-2" />
          <div className="flex items-center gap-2 sm:ml-auto">
            <div className="h-8 w-28 animate-pulse rounded-full bg-line-2" />
            <div className="size-7 animate-pulse rounded-full bg-line-2" />
          </div>
        </div>
      </div>

      {/* „N Schritte“ */}
      <div className="mb-2 h-4 w-20 animate-pulse rounded-full bg-line-2" />

      {/* Ablauf: Karten wie im Flow, dazwischen die Einfügepunkt-Linie (h-9) */}
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border-2 border-line bg-card/40 p-4 sm:p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i}>
              {i > 0 && (
                <div className="flex h-9 justify-center">
                  <span className="h-full w-0.5 bg-line" />
                </div>
              )}
              <div
                className="flex items-center gap-3 rounded-xl border-2 border-line bg-card p-[10px]"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="size-[38px] shrink-0 animate-pulse rounded-lg bg-line-2" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3.5 w-2/5 animate-pulse rounded bg-line-2" />
                  <div className="h-3 w-3/5 animate-pulse rounded bg-line-2/80" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
