import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, Settings, Bell, ShieldCheck, LogOut } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { AppTabs } from "@/components/app/app-tabs";
import { AccountSwitcher } from "@/components/app/account-switcher";
import { requireAccount } from "@/lib/account";
import { checkAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { account, email, memberships } = await requireAccount();
  if (!account.onboarded) redirect("/onboarding");

  const supabase = await createClient();
  const { count: alertCount } = await supabase
    .from("change_alerts")
    .select("id, tutorials!inner(account_id)", { count: "exact", head: true })
    .eq("tutorials.account_id", account.id)
    .eq("status", "open");
  const isAdmin = await checkAdmin();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-5">
          <Link href="/app">
            <Wordmark />
          </Link>
          <span className="hidden text-line sm:inline">/</span>
          <AccountSwitcher
            currentId={account.id}
            currentName={account.name}
            memberships={memberships}
          />
          <div className="ml-auto flex items-center gap-2">
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href="/admin" />}
              >
                <ShieldCheck className="size-4" />
                <span className="hidden sm:inline">Admin</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              render={<Link href="/app/alerts" aria-label="Hinweise" />}
            >
              <span className="relative">
                <Bell className="size-4" />
                {alertCount ? (
                  <span className="absolute -right-1.5 -top-1.5 flex min-w-3.5 items-center justify-center rounded-full bg-no px-1 text-[9px] font-bold text-white">
                    {alertCount}
                  </span>
                ) : null}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              render={<Link href="/app/settings" aria-label="Einstellungen" />}
            >
              <Settings className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/h/${account.slug}`} target="_blank" />}
            >
              <ExternalLink className="size-4" />
              <span className="hidden sm:inline">Hilfe-Seite</span>
            </Button>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {email}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm" aria-label="Abmelden">
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Abmelden</span>
              </Button>
            </form>
          </div>
        </div>
      </header>
      <AppTabs />
      {children}
    </div>
  );
}
