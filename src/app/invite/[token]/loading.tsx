// Suspense-Boundary für die Einladungs-Seite (dynamisch: Token-Lookup + Session).
export default function Loading() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mx-auto h-5 w-40 animate-pulse rounded bg-line-2" />
        <div className="mt-4 h-10 animate-pulse rounded-lg bg-line-2/70" />
        <div className="mt-2 h-10 animate-pulse rounded-lg bg-line-2/70" />
      </div>
    </div>
  );
}
