/** Wiederverwendbare Skeletons für co-located loading.tsx (Sofort-Feedback bei Navigation). */

export function PageHeaderSkeleton() {
  return (
    // Maße wie PageHeader (H1 26px + Erklärzeile), damit beim Laden nichts springt.
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-2">
        <div className="h-8 w-52 animate-pulse rounded-lg bg-line-2" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded bg-line-2/70" />
      </div>
      <div className="h-9 w-32 animate-pulse rounded-full bg-line-2" />
    </div>
  );
}

export function RowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mt-6 space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-xl border border-border bg-card"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="mt-6 space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-2xl border border-border bg-card"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}
