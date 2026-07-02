// Co-located: Sofort-Feedback beim Öffnen eines Wissensartikels. Der Rahmen (Kopf +
// Unternavigation) kommt aus dem Assistent-Layout — hier nur der Editor-Skeleton.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 h-5 w-40 animate-pulse rounded bg-line-2/70" />
      <div className="mb-4 flex items-center gap-3">
        <div className="h-9 w-36 animate-pulse rounded-md bg-line-2" />
        <div className="ml-auto h-9 w-24 animate-pulse rounded-md bg-line-2" />
      </div>
      <div className="mb-3 h-11 w-full animate-pulse rounded-md bg-line-2" />
      <div className="h-64 w-full animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}
