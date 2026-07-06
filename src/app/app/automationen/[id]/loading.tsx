// Co-located: feuert garantiert beim Öffnen einer Automation (cacheComponents).
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
      <div className="h-4 w-32 animate-pulse rounded bg-line-2/70" />
      <div className="mt-4 h-8 w-2/3 animate-pulse rounded-md bg-line-2" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-card border-2 border-line bg-card"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    </main>
  );
}
