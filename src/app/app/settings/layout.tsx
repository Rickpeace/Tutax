import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsNav } from "@/components/app/settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/app" />}>
        <ChevronLeft className="size-4" /> Dashboard
      </Button>
      <h1 className="mt-3 text-xl font-bold text-ink">Einstellungen</h1>
      <SettingsNav />
      <div className="mt-6">{children}</div>
    </main>
  );
}
