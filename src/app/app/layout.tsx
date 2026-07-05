import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  AppHeader,
  TopBell,
  UserMenu,
  TabBar,
  CreateTabTrigger,
} from "@/components/app/app-header";
import { NewTutorialButton } from "@/components/app/new-tutorial-button";
import { requireAccount } from "@/lib/account";
import { checkAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * App-Shell (Design-Handoff 07/2026): 64px-Topnav (Option 2a) für alle
 * /app-Seiten; mobil übernimmt die TabBar (Option 2b) die Navigation.
 *
 * Cache-Components-Disziplin: Das GERÜST (Header, Nav-Pills, Suchfeld)
 * ist statisch; konto-abhängige Teile (Glocke, „Neue Anleitung", Avatar)
 * streamen in eigenen Suspense-Boundaries und teilen sich EINEN
 * requireAccount()-Abruf (per cache() dedupt). AppHeader/TabBar lesen
 * usePathname → eigene Boundaries. Onboarding-Redirect wohnt im Avatar-Slot.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <Suspense fallback={<div className="h-16 border-b-2 border-line bg-card" />}>
        <AppHeader
          bell={
            <Suspense fallback={<div className="size-9" />}>
              <BellSlot />
            </Suspense>
          }
          newAction={
            <Suspense
              fallback={<div className="h-9 w-40 animate-pulse rounded-full bg-line-2" />}
            >
              <NewActionSlot />
            </Suspense>
          }
          userMenu={
            <Suspense
              fallback={<div className="size-[34px] animate-pulse rounded-full bg-line-2" />}
            >
              <UserMenuSlot />
            </Suspense>
          }
        />
      </Suspense>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>

      {/* Platzhalter, damit die mobile TabBar keinen Inhalt verdeckt. */}
      <div className="h-16 lg:hidden" aria-hidden />
      <Suspense fallback={null}>
        <TabBar
          createAction={
            <Suspense fallback={<div className="min-w-16" />}>
              <CreateTabSlot />
            </Suspense>
          }
        />
      </Suspense>
    </div>
  );
}

/** Avatar-Menü (rechts). Enthält den Onboarding-Redirect. */
async function UserMenuSlot() {
  const { account, memberships, email } = await requireAccount();
  if (!account.onboarded) redirect("/onboarding");
  const isAdmin = await checkAdmin();
  return (
    <UserMenu
      accountName={account.name}
      memberships={memberships}
      isAdmin={isAdmin}
      accountSlug={account.slug}
      email={email}
    />
  );
}

/** „＋ Neue Anleitung" (Desktop-Header). */
async function NewActionSlot() {
  const { account } = await requireAccount();
  return <NewTutorialButton accountId={account.id} />;
}

/** „Aufnehmen"-Tab (mobil) öffnet dieselbe Erstell-Weiche. */
async function CreateTabSlot() {
  const { account } = await requireAccount();
  return <NewTutorialButton accountId={account.id} trigger={<CreateTabTrigger />} />;
}

/** Glocke mit offener-Hinweise-Badge. */
async function BellSlot() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { count } = await supabase
    .from("change_alerts")
    .select("id, tutorials!inner(account_id)", { count: "exact", head: true })
    .eq("tutorials.account_id", account.id)
    .eq("status", "open");
  return <TopBell alertCount={count} />;
}
