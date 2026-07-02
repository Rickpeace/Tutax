import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/admin";
import { Button } from "@/components/ui/button";

/**
 * WICHTIG (PPR): Das Admin-Gate muss die children UMSCHLIESSEN (nicht parallel
 * streamen) — sonst könnten Admin-Inhalte rausgehen, bevor der redirect greift.
 */
async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin(); // redirect("/app") für Nicht-Admins — VOR dem Rendern der Kinder
  return <>{children}</>;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-ink text-white">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-5">
          <span className="font-display text-base font-bold tracking-tight">Steply</span>
          <span className="rounded bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            Admin
          </span>
          <nav className="ml-2 flex gap-4 text-sm font-medium text-white/70">
            <Link href="/admin" className="hover:text-white">Templates</Link>
            <Link href="/admin/alerts" className="hover:text-white">Hinweise</Link>
          </nav>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            className="ml-auto text-white hover:bg-white/10 hover:text-white"
            render={<Link href="/app" />}
          >
            Zur App
          </Button>
        </div>
      </header>
      <Suspense
        fallback={
          <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
            <div className="h-6 w-52 animate-pulse rounded-md bg-line-2" />
          </main>
        }
      >
        <AdminGate>{children}</AdminGate>
      </Suspense>
    </div>
  );
}
