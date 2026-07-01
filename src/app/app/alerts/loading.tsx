import { PageHeaderSkeleton, RowsSkeleton } from "@/components/app/loading-skeletons";

// Co-located: Sofort-Feedback beim Klick auf die Glocke (Hinweise).
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <PageHeaderSkeleton />
      <RowsSkeleton count={5} />
    </main>
  );
}
