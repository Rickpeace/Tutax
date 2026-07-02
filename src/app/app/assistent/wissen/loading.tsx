import { PageHeaderSkeleton, RowsSkeleton } from "@/components/app/loading-skeletons";

// Co-located: feuert garantiert beim Tab-Klick auf „Wissensdatenbank" (nicht auf die
// übergeordnete /app/loading.tsx angewiesen). Der Rahmen (Kopf + Unternavigation)
// kommt aus dem Assistent-Layout — hier nur der Inhalts-Skeleton.
export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="mt-4 h-16 animate-pulse rounded-xl border border-border bg-accent/30" />
      <RowsSkeleton count={4} />
    </>
  );
}
