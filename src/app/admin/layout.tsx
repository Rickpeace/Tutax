import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { Button } from "@/components/ui/button";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
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
      {children}
    </div>
  );
}
