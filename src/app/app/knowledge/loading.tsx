import { PageHeaderSkeleton, RowsSkeleton } from "@/components/app/loading-skeletons";

// Co-located: feuert garantiert beim Tab-Klick auf „Wissensdatenbank" (nicht auf die
// übergeordnete /app/loading.tsx angewiesen).
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <PageHeaderSkeleton />
      <div className="mt-4 h-16 animate-pulse rounded-xl border border-border bg-accent/30" />
      <RowsSkeleton count={4} />
    </main>
  );
}
