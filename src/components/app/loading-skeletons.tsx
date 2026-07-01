/** Wiederverwendbare Skeletons für co-located loading.tsx (Sofort-Feedback bei Navigation). */

export function PageHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-2">
        <div className="h-6 w-44 animate-pulse rounded-md bg-line-2" />
        <div className="h-4 w-64 animate-pulse rounded bg-line-2/70" />
      </div>
      <div className="h-9 w-32 animate-pulse rounded-md bg-line-2" />
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
