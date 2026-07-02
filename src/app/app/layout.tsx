import Link from "next/link";
import { Suspense } from "react";
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

/**
 * Layout-Shell ist STATISCH (Cache Components/PPR): Header-Rahmen + Tabs zeichnen
 * sofort; die auth-abhängigen Inhalte (Konto, Glocke, Admin) streamen in einer
 * eigenen Suspense-Boundary nach. Ohne diese Trennung würde jedes uncached Read
 * im Layout die komplette Route blockieren (Build-Error unter cacheComponents).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-5">
          <Link href="/app">
            <Wordmark />
          </Link>
          <Suspense
            fallback={<div className="ml-2 h-5 w-40 animate-pulse rounded bg-line-2/70" />}
          >
            <HeaderContent />
          </Suspense>
        </div>
      </header>
      {/* usePathname macht die Tabs auf dynamischen Routen request-abhängig -> eigene Boundary */}
      <Suspense fallback={<div className="h-[42px] border-b border-border bg-card" />}>
        <AppTabs />
      </Suspense>
      {children}
    </div>
  );
}

/*
 * Hinweis: Die Seiten unter /app rufen selbst requireAccount() auf (per React cache()
 * dedupliziert) — die Zugriffskontrolle liegt also bei jeder Seite + RLS, nicht nur im
 * Layout. Der Onboarding-Redirect wandert in den Header-Stream (unkritisch: eigene Daten).
 */

/** Dynamischer Header-Teil: braucht Session + DB (streamt in die statische Shell). */
async function HeaderContent() {
  const { account, email, memberships } = await requireAccount();
  if (!account.onboarded) redirect("/onboarding");

  const supabase = await createClient();
  // Nicht-kritische Layout-Daten (Glocken-Badge + Admin-Flag) parallel statt seriell.
  const [alertRes, isAdmin] = await Promise.all([
    supabase
      .from("change_alerts")
      .select("id, tutorials!inner(account_id)", { count: "exact", head: true })
      .eq("tutorials.account_id", account.id)
      .eq("status", "open"),
    checkAdmin(),
  ]);
  const alertCount = alertRes.count;

  return (
    <>
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
        <span className="hidden text-xs text-muted-foreground sm:inline">{email}</span>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm" aria-label="Abmelden">
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Abmelden</span>
          </Button>
        </form>
      </div>
    </>
  );
}
