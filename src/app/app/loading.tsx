/**
 * Sofort-Skeleton für den App-Bereich. Erscheint bei der Navigation (z. B. Klick auf
 * „Tutorials"/„Wissensdatenbank") augenblicklich, während die Server-Component im
 * Hintergrund lädt – kein „Klick → lange nichts" mehr.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-44 animate-pulse rounded-md bg-line-2" />
          <div className="h-4 w-60 animate-pulse rounded bg-line-2/70" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded-md bg-line-2" />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-border bg-card"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    </main>
  );
}
