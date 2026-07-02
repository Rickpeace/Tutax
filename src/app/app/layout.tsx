import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import { SidebarNav } from "@/components/app/sidebar-nav";
import {
  SidebarAccount,
  SidebarBottom,
  TopbarBell,
} from "@/components/app/sidebar-account";
import { AppChrome } from "@/components/app/app-chrome";
import { requireAccount } from "@/lib/account";
import { checkAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * App-Shell (Welle 21): linksbündige Sidebar (Desktop ≥1024px) + schlanke Topbar +
 * ⌘K-Palette. Mobil wird die Sidebar zum Sheet (Hamburger in der Topbar).
 *
 * Cache-Components-Disziplin: Das GERÜST (Grid, Wordmark, Nav-Items, Topbar-Suchfeld)
 * ist STATISCH und zeichnet sofort — die Nav flackert nicht. Alle konto-abhängigen
 * Teile (AccountSwitcher, Admin-Flag, Hilfe-Seiten-Slug, E-Mail, Glocke) streamen in
 * Suspense-Boundaries nach; sie teilen sich EINEN requireAccount()-Abruf (pro Request
 * via cache() dedupt), auch wenn sie an mehreren Stellen (Desktop-Sidebar + mobiles
 * Sheet + Topbar) erscheinen. Ohne diese Trennung würde jedes uncached Read die ganze
 * Route blockieren (Build-Error unter cacheComponents). Der Onboarding-Redirect bleibt
 * im gestreamten Konto-Teil.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full lg:grid lg:grid-cols-[240px_1fr]">
      {/* Desktop-Sidebar (fix links, volle Höhe). */}
      <aside className="sticky top-0 hidden h-svh flex-col border-r border-border bg-card lg:flex">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4">
          <Link href="/app" aria-label="Zur Übersicht">
            <Wordmark />
          </Link>
          <Suspense
            fallback={<div className="h-8 w-full animate-pulse rounded-md bg-line-2/70" />}
          >
            <SidebarAccountSlot />
          </Suspense>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {/* usePathname macht die Nav request-abhängig → eigene Boundary. Das
              Skelett hat exakt die Nav-Maße, damit nichts springt. */}
          <Suspense fallback={<NavSkeleton />}>
            <SidebarNav />
          </Suspense>
        </div>

        <div className="border-t border-border px-3 py-3">
          <Suspense
            fallback={<div className="h-28 w-full animate-pulse rounded-md bg-line-2/60" />}
          >
            <SidebarBottomSlot />
          </Suspense>
        </div>
      </aside>

      {/* Content-Spalte: Topbar (interaktiv) + Seite. */}
      <div className="flex min-w-0 flex-col">
        {/* AppChrome liest usePathname → eigene Boundary. Fallback = leere Topbar. */}
        <Suspense fallback={<div className="h-12 border-b border-border bg-card/80" />}>
          <AppChrome
            bell={
              <Suspense fallback={<div className="size-7" />}>
                <BellSlot />
              </Suspense>
            }
            mobileAccountZone={
              <Suspense
                fallback={<div className="h-8 w-full animate-pulse rounded-md bg-line-2/70" />}
              >
                <MobileAccountSlot />
              </Suspense>
            }
            mobileBottomZone={
              <Suspense
                fallback={<div className="h-28 w-full animate-pulse rounded-md bg-line-2/60" />}
              >
                <MobileBottomSlot />
              </Suspense>
            }
          />
        </Suspense>
        {children}
      </div>
    </div>
  );
}

/** Nav-Skelett (gleiche Maße wie SidebarNav), damit der Wechsel nicht springt. */
function NavSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      {[2, 3].map((n, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="mx-3 h-3 w-16 animate-pulse rounded bg-line-2/70" />
          <div className="flex flex-col gap-0.5">
            {Array.from({ length: n }).map((_, j) => (
              <div key={j} className="h-8 w-full animate-pulse rounded-lg bg-line-2/50" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/*
 * Hinweis: Die Seiten unter /app rufen selbst requireAccount() auf (per React cache()
 * dedupliziert) — die Zugriffskontrolle liegt also bei jeder Seite + RLS, nicht nur im
 * Layout. Der Onboarding-Redirect wandert in den Konto-Stream (unkritisch: eigene Daten).
 */

/** Konto-Umschalter (Sidebar oben). Enthält den Onboarding-Redirect. */
async function SidebarAccountSlot() {
  const { account, memberships } = await requireAccount();
  if (!account.onboarded) redirect("/onboarding");
  return (
    <SidebarAccount
      accountId={account.id}
      accountName={account.name}
      memberships={memberships}
    />
  );
}
const MobileAccountSlot = SidebarAccountSlot;

/** Unterer Sidebar-Bereich (Einstellungen/Admin/Hilfe/E-Mail/Abmelden). */
async function SidebarBottomSlot() {
  const { account, email } = await requireAccount();
  const isAdmin = await checkAdmin();
  return (
    <SidebarBottom isAdmin={isAdmin} accountSlug={account.slug} email={email} />
  );
}
const MobileBottomSlot = SidebarBottomSlot;

/** Glocke mit offener-Hinweise-Badge (Topbar rechts). */
async function BellSlot() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { count } = await supabase
    .from("change_alerts")
    .select("id, tutorials!inner(account_id)", { count: "exact", head: true })
    .eq("tutorials.account_id", account.id)
    .eq("status", "open");
  return <TopbarBell alertCount={count} />;
}
