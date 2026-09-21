// Co-located: Sofort-Feedback für die Einstellungs-Seiten (rechts neben der Seitenleiste).
export default function Loading() {
  return (
    <div className="grid gap-[18px]">
      <div className="grid gap-2">
        <div className="h-3.5 w-24 animate-pulse rounded bg-line-2" />
        <div className="h-7 w-52 animate-pulse rounded-md bg-line-2" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-line-2/70" />
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-card border-2 border-line bg-card"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}
