import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  AppHeader,
  BellPopover,
  HelpPageButton,
  UserMenu,
  TabBar,
  MoreTab,
  CreateTabTrigger,
} from "@/components/app/app-header";
import { NewTutorialButton } from "@/components/app/new-tutorial-button";
import { ContentUpdatedRefresh } from "@/components/app/content-updated-refresh";
import { NEW_TUTORIAL_EVENT } from "@/components/app/nav-config";
import { getCurrentUser, requireAccount } from "@/lib/account";
import { checkAdmin } from "@/lib/admin";
import { canEdit } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { loadOpenGaps } from "@/lib/gaps";
import { relativeDe } from "@/lib/format";
import { userDisplayName } from "@/lib/user-name";
import { failedVideoSince, toFailedVideoJob } from "@/lib/video-failure";
import { videoAllowed } from "@/lib/plan";

/**
 * App-Shell (Welle 50b): 60px-Kopfleiste für alle /app-Seiten; mobil übernimmt
 * die Leiste unten die Navigation.
 *
 * Cache-Components-Disziplin: Das GERÜST (Header, Nav-Pills, Suchfeld)
 * ist statisch; konto-abhängige Teile (Hilfe-Seite, Glocke, „Neue Anleitung",
 * Avatar, „Neu"/„Mehr" mobil) streamen in eigenen Suspense-Boundaries und teilen
 * sich EINEN requireAccount()-Abruf (per cache() dedupt). AppHeader/TabBar lesen
 * usePathname → eigene Boundaries. Onboarding-Redirect wohnt im Avatar-Slot.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // flex-1 (Body ist flex-col): füllt den Viewport, damit die Höhenkette bis
    // zur Bibliotheks-Sidebar durchreicht — sonst endet deren border-r beim Inhalt.
    <div className="flex flex-1 flex-col">
      {/* Extension-Uploads erscheinen ohne F5 (client-only, rendert nichts). */}
      <ContentUpdatedRefresh />
      <Suspense fallback={<div className="h-[60px] border-b-2 border-line bg-card" />}>
        <AppHeader
          helpPage={
            <Suspense fallback={null}>
              <HelpPageSlot />
            </Suspense>
          }
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
              fallback={<div className="ml-1 size-8 animate-pulse rounded-full bg-line-2" />}
            >
              <UserMenuSlot />
            </Suspense>
          }
        />
      </Suspense>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>

      {/* Platzhalter, damit die mobile Leiste keinen Inhalt verdeckt. */}
      <div className="h-[72px] lg:hidden" aria-hidden />
      <Suspense fallback={null}>
        <TabBar
          createAction={
            <Suspense fallback={<div />}>
              <CreateTabSlot />
            </Suspense>
          }
          more={
            <Suspense fallback={<div />}>
              <MoreSlot />
            </Suspense>
          }
        />
      </Suspense>
    </div>
  );
}

/** Avatar-Menü (rechts). Enthält den Onboarding-Redirect. */
async function UserMenuSlot() {
  const [{ account, memberships, email, role }, user, isAdmin] = await Promise.all([
    requireAccount({ allowMember: true }),
    getCurrentUser(),
    checkAdmin(),
  ]);
  // Einrichtung ist Sache der Inhalte-Pfleger; Mitarbeiter nie dorthin schicken (sonst
  // Schleife: /onboarding weist Mitarbeiter wieder ab).
  if (!account.onboarded && canEdit(role)) redirect("/onboarding");
  return (
    <UserMenu
      userName={userDisplayName(user?.user_metadata)}
      email={email}
      accountId={account.id}
      accountName={account.name}
      memberships={memberships}
      isAdmin={isAdmin}
      member={!canEdit(role)}
    />
  );
}

/** „Hilfe-Seite“-Knopf (braucht den Konto-Slug). */
async function HelpPageSlot() {
  const { account } = await requireAccount({ allowMember: true });
  return <HelpPageButton accountSlug={account.slug} />;
}

/** „＋ Neue Anleitung" (Desktop-Header). Hört auch auf die ⌘K-Aktion. */
async function NewActionSlot() {
  const { account, role } = await requireAccount({ allowMember: true });
  if (!canEdit(role)) return null; // Mitarbeiter erstellen nichts
  return <NewTutorialButton accountId={account.id} openOnEvent={NEW_TUTORIAL_EVENT} videoAllowed={videoAllowed(account)} />;
}

/** „Neu"-Tab (mobil) öffnet dieselbe Erstell-Weiche. */
async function CreateTabSlot() {
  const { account, role } = await requireAccount({ allowMember: true });
  if (!canEdit(role)) return <div />; // Platz in der 5er-Leiste halten
  return <NewTutorialButton accountId={account.id} trigger={<CreateTabTrigger />} videoAllowed={videoAllowed(account)} />;
}

/** „Mehr"-Tab (mobil) — braucht den Konto-Slug für „Hilfe-Seite ansehen“. */
async function MoreSlot() {
  const { account } = await requireAccount({ allowMember: true });
  return <MoreTab accountSlug={account.slug} />;
}

type BellAlertRow = {
  id: string;
  summary: string | null;
  detected_at: string;
  tutorial_id: string;
  tutorials: { title: string | null } | null;
};

/**
 * Glocke: je die 3 neuesten offenen Hinweise („Aktualität prüfen“) und die 3
 * häufigsten offenen Fragen + Gesamtzahlen. Beide Abfragen parallel; Zeitangaben
 * werden hier (Server) formatiert, damit der Client nichts neu berechnet.
 * Welle 51: dazu gescheiterte Video-Aufträge der letzten 7 Tage (10 laden — der Client
 * filtert die im Browser ausgeblendeten heraus und zeigt höchstens 3).
 */
async function BellSlot() {
  const { account, role } = await requireAccount({ allowMember: true });
  if (!canEdit(role)) return null; // Hinweise/Fragen/Videos betreffen nur Inhalte-Pfleger
  const supabase = await createClient();
  const [{ data: alertRows, count: alertCount }, gaps, { data: failedRows }] = await Promise.all([
    supabase
      .from("change_alerts")
      .select("id, summary, detected_at, tutorial_id, tutorials!inner(title, account_id)", {
        count: "exact",
      })
      .eq("tutorials.account_id", account.id)
      .eq("status", "open")
      .order("detected_at", { ascending: false })
      .limit(3),
    // Wie „Offene Fragen“ (bis 25) — Zähler = Anzahl dieser Liste.
    // 26 laden, 25 anzeigen: so erkennt die Glocke „mehr als 25“ (Anzeige „25+“).
    loadOpenGaps(account.id, 26),
    supabase
      .from("video_jobs")
      .select("id, title, error, created_at, updated_at")
      .eq("account_id", account.id)
      .eq("status", "failed")
      .eq("kind", "create")
      .gte("updated_at", failedVideoSince())
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);
  const alerts = ((alertRows ?? []) as unknown as BellAlertRow[]).map((a) => ({
    id: a.id,
    tutorialId: a.tutorial_id,
    title: a.tutorials?.title?.trim() || "Anleitung",
    summary: a.summary?.trim() || "Bitte prüfen",
    when: relativeDe(a.detected_at),
  }));
  return (
    <BellPopover
      alerts={alerts}
      alertTotal={alertCount ?? alerts.length}
      gaps={gaps.slice(0, 3).map((g) => ({
        question: g.question,
        count: g.count,
        when: relativeDe(g.lastAt),
      }))}
      gapTotal={Math.min(gaps.length, 25)}
      gapsMore={gaps.length > 25}
      failedVideos={(failedRows ?? []).map((r) => {
        const f = toFailedVideoJob(r);
        return { ...f, when: relativeDe(f.at) };
      })}
    />
  );
}
