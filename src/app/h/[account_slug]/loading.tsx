// Suspense-Boundary für die öffentlichen Hilfe-Seiten (PPR): neutraler Skeleton,
// bis die (gecachten) Kontodaten da sind. Deckt Hub, Tutorial-Seite und Chat-Frame ab.
export default function Loading() {
  return (
    <main className="min-h-screen bg-[#f6f7fe]">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="size-11 animate-pulse rounded-xl bg-black/10" />
          <div className="space-y-2">
            <div className="h-5 w-40 animate-pulse rounded bg-black/10" />
            <div className="h-3 w-28 animate-pulse rounded bg-black/5" />
          </div>
        </div>
        <div className="h-12 animate-pulse rounded-xl bg-white shadow-sm" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-white shadow-sm"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
