export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
      <div className="mb-3 h-4 w-20 animate-pulse rounded bg-line-2" />
      <div className="mb-4 h-6 w-64 animate-pulse rounded-md bg-line-2" />
      <div className="h-96 w-full animate-pulse rounded-xl border border-border bg-card" />
    </main>
  );
}
