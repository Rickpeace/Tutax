import { PageHeaderSkeleton, CardsSkeleton } from "@/components/app/loading-skeletons";

// Co-located: Sofort-Feedback für die Einstellungs-Seiten (unter der Settings-Sub-Nav).
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
      <PageHeaderSkeleton />
      <CardsSkeleton count={3} />
    </div>
  );
}
