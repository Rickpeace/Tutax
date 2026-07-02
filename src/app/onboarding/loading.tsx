// Suspense-Boundary fürs Onboarding (dynamisch: Session + Konto).
export default function Loading() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="h-6 w-56 animate-pulse rounded-md bg-line-2" />
      <div className="mt-6 h-40 animate-pulse rounded-2xl border border-border bg-card" />
    </div>
  );
}
