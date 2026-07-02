// Co-located: Sofort-Feedback beim Tab-Klick auf „Kontakt & Eskalation". Der Rahmen
// (Kopf + Unternavigation) kommt aus dem Assistent-Layout — hier nur der Formular-Skeleton.
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-24 w-full animate-pulse rounded-2xl border border-border bg-card" />
      <div className="h-40 w-full animate-pulse rounded-2xl border border-border bg-card" />
      <div className="h-40 w-full animate-pulse rounded-2xl border border-border bg-card" />
    </div>
  );
}
