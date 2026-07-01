/** Sofort-Skeleton für den Builder (Zwei-Spalten-Layout), damit der Editor beim Öffnen
 *  nicht als weiße Wartefläche erscheint. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
      <div className="h-4 w-24 animate-pulse rounded bg-line-2/70" />
      <div className="mt-3 h-8 w-72 animate-pulse rounded-md bg-line-2" />
      <div className="mt-6 flex items-start gap-6">
        <div className="min-w-0 flex-1 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border border-border bg-card"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
        <div className="hidden h-[70vh] w-[440px] shrink-0 animate-pulse rounded-2xl border border-border bg-card lg:block xl:w-[520px]" />
      </div>
    </main>
  );
}
