/**
 * Sofort-Skeleton der Bibliothek (Design 2a): Sidebar-Spalte + Kartenraster.
 * Der Header kommt aus dem Layout und bleibt stehen.
 */
export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-[230px] shrink-0 flex-col gap-5 border-r-2 border-line px-4 py-5 lg:flex">
        {[3, 5].map((n, g) => (
          <div key={g} className="flex flex-col gap-1.5">
            <div className="mx-2.5 mb-1 h-3 w-20 animate-pulse rounded bg-line-2" />
            {Array.from({ length: n }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-xl bg-line-2/70" />
            ))}
          </div>
        ))}
      </aside>
      <main className="min-w-0 flex-1 px-5 py-5 lg:px-7">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-7 w-44 animate-pulse rounded-md bg-line-2" />
          <div className="h-4 w-24 animate-pulse rounded bg-line-2/70" />
          <div className="ml-auto h-8 w-32 animate-pulse rounded-full bg-line-2/70" />
        </div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-card border-2 border-line bg-card"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="h-[110px] animate-pulse bg-line-2/80" />
              <div className="space-y-2 p-3.5">
                <div className="h-4 w-2/3 animate-pulse rounded bg-line-2" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-line-2/70" />
                <div className="h-5 w-24 animate-pulse rounded-full bg-line-2/60" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
