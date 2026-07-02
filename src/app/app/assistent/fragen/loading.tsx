import { RowsSkeleton } from "@/components/app/loading-skeletons";

// Co-located: Sofort-Feedback beim Tab-Klick auf „Offene Fragen". Der Rahmen (Kopf +
// Unternavigation) kommt aus dem Assistent-Layout — hier nur der Inhalts-Skeleton.
export default function Loading() {
  return (
    <>
      <div className="space-y-2">
        <div className="h-6 w-40 animate-pulse rounded-md bg-line-2" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-line-2/70" />
      </div>
      <RowsSkeleton count={5} />
    </>
  );
}
