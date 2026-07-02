// Suspense-Boundary für die öffentlichen Hilfe-Seiten (PPR). Farben kommen aus den
// Brand-Variablen des persistenten Layouts (layout.tsx) — der Skeleton trägt also
// bereits das Kunden-CI, statt Steply-Grau in fremde Designs zu blitzen.
const tint = (pct: number) => ({
  background: `color-mix(in srgb, var(--brand-ink, #101524) ${pct}%, transparent)`,
});

export default function Loading() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="size-11 animate-pulse rounded-xl" style={tint(10)} />
          <div className="space-y-2">
            <div className="h-5 w-40 animate-pulse rounded" style={tint(10)} />
            <div className="h-3 w-28 animate-pulse rounded" style={tint(6)} />
          </div>
        </div>
        <div className="h-12 animate-pulse rounded-xl" style={tint(5)} />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl"
              style={{ ...tint(5), animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
