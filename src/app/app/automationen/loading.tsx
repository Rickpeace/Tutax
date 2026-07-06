// Co-located: feuert garantiert beim Tab-Klick auf „Automationen“ (cacheComponents).
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <div className="mb-6 space-y-2">
        <div className="h-6 w-48 animate-pulse rounded-md bg-line-2" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-line-2/70" />
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-card border-2 border-line bg-card p-4"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start gap-3">
              <div className="size-9 animate-pulse rounded-xl bg-line-2" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-line-2" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-line-2/70" />
              </div>
            </div>
            <div className="mt-3 h-5 w-24 animate-pulse rounded-full bg-line-2/60" />
          </div>
        ))}
      </div>
    </main>
  );
}
