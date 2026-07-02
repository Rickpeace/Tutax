// Suspense-Boundary für die Auth-Seiten (lesen searchParams -> dynamisch unter PPR).
export default function Loading() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="h-6 w-44 animate-pulse rounded-md bg-line-2" />
      <div className="mt-6 space-y-3">
        <div className="h-10 animate-pulse rounded-lg bg-line-2/70" />
        <div className="h-10 animate-pulse rounded-lg bg-line-2/70" />
        <div className="h-10 animate-pulse rounded-lg bg-line-2" />
      </div>
    </div>
  );
}
