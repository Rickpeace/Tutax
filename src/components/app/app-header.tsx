"use client";

import { forwardRef, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  Bell,
  LogOut,
  ShieldCheck,
  Check,
  Plus,
  Ellipsis,
  AlertTriangle,
  MessageCircleQuestion,
  UserRound,
  ArrowLeftRight,
  VideoOff,
  X,
} from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AppCommand } from "@/components/app/app-command";
import {
  MAIN_NAV,
  MOBILE_TABS_LEFT,
  MOBILE_TABS_RIGHT,
  SETTINGS_ITEM,
  PROFILE_HREF,
  STEPLY_HELP_HREF,
  STEPLY_HELP_ICON,
  HELP_PAGE_ICON,
  helpPageHref,
  mobileMoreItems,
  type NavItem,
} from "@/components/app/nav-config";
import { cn } from "@/lib/utils";
import { useSwitchAccount } from "@/components/app/account-switcher";
import { MemberModeSync, useMemberMode } from "@/components/app/member-mode";
import { signOut } from "@/app/(auth)/actions";
import type { Membership } from "@/lib/account";
import { dismissVideoJob, useDismissedVideoJobs } from "@/lib/dismissed-video-jobs";
import type { FailedVideoNotice } from "@/components/app/failed-video-notices";
import { ROLE_LABEL, asRole } from "@/lib/roles";

/**
 * Vorladen nur mit bekannter Rolle (Handy-Audit 24.09.): Kopf- und Handy-Leiste sind statisches
 * Gerüst und rendern zuerst ALLE Bereiche — Mitarbeiter luden so /app und /app/automationen vor,
 * obwohl sie dort nicht hindürfen. Die Rolle kennt erst der gestreamte Avatar-Slot (UserMenu);
 * bis dahin (und für Mitarbeiter immer) laden nur „Schulungen“ vor.
 */
let roleKnown = false;
const roleListeners = new Set<() => void>();
function subscribeRole(cb: () => void) {
  roleListeners.add(cb);
  return () => roleListeners.delete(cb);
}
function RoleKnownSync() {
  useEffect(() => {
    if (roleKnown) return;
    roleKnown = true;
    roleListeners.forEach((l) => l());
  }, []);
  return null;
}
/** prefetch-Wert für einen Navigations-Link: undefined = Next-Standard, false = nie. */
function usePrefetchFor(href: string): false | undefined {
  const known = useSyncExternalStore(subscribeRole, () => roleKnown, () => false);
  const member = useMemberMode();
  if (href === "/app/lernen") return undefined;
  return known && !member ? undefined : false;
}

/**
 * App-Shell (Welle 50b, Entwurf „App-Makeover“ Abschnitt 1): 60px-Kopfleiste —
 * Wordmark, Pills Anleitungen · Schulungen · Automationen · KI-Assistent (aktiv =
 * Ink-Pill), rechts Suche (Strg K), „Hilfe-Seite“ (neuer Tab), Glocke als
 * Übersicht (Popover), „+ Neue Anleitung“ und Avatar-Menü. Mobil übernimmt die
 * Leiste unten (Abschnitt 5) die Navigation. Konto-abhängige Teile kommen als
 * gestreamte Server-Slots herein (siehe app/app/layout.tsx).
 */
export function AppHeader({
  bell,
  helpPage,
  newAction,
  userMenu,
}: {
  bell: React.ReactNode;
  helpPage: React.ReactNode;
  newAction: React.ReactNode;
  userMenu: React.ReactNode;
}) {
  const [cmdOpen, setCmdOpen] = useState(false);
  const path = usePathname();
  // Mitarbeiter (nur Schulungen) sehen nur „Schulungen" — siehe member-mode.tsx.
  const member = useMemberMode();
  const nav = member ? MAIN_NAV.filter((i) => i.href === "/app/lernen") : MAIN_NAV;
  const homePrefetch = usePrefetchFor("/app");

  return (
    <>
      <header className="sticky top-0 z-30 flex h-[60px] items-center gap-1.5 border-b-2 border-line bg-card px-4 lg:px-[18px]">
        <Link href="/app" prefetch={homePrefetch} aria-label="Zu den Anleitungen" className="mr-3.5 shrink-0">
          <Wordmark />
        </Link>

        {/* Pill-Navigation (Desktop) — dieselbe Liste wie Handy-Leiste und ⌘K. */}
        <nav aria-label="Hauptbereiche" className="hidden items-center gap-1.5 lg:flex">
          {nav.map((item) => (
            <NavPill key={item.href} item={item} active={item.match(path)} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Such-Pill → ⌘K-Palette */}
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            aria-label="Suchen (Strg K)"
            className="hidden w-[190px] items-center gap-2 rounded-full border-2 border-line bg-card px-3 py-1.5 text-left text-[13px] font-bold text-faint transition-colors hover:border-[#e3d7c2] xl:flex"
          >
            <Search className="size-3.5 shrink-0" />
            <span className="truncate">Suchen</span>
            <kbd className="ml-auto shrink-0 rounded-md bg-line-2 px-[5px] font-sans text-[11px] font-bold text-muted-foreground">
              Strg K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            aria-label="Suchen (Strg K)"
            className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-line-2 xl:hidden"
          >
            <Search className="size-[17px]" />
          </button>

          {helpPage}
          {bell}
          <div className="hidden md:block">{newAction}</div>
          {userMenu}
        </div>
      </header>

      <AppCommand open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  );
}

function NavPill({ item, active }: { item: NavItem; active: boolean }) {
  const prefetch = usePrefetchFor(item.href);
  return (
    <Link
      href={item.href}
      prefetch={prefetch}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full px-[13px] py-[7px] text-[13.5px] font-extrabold transition-colors",
        active ? "bg-ink text-white" : "text-ink-2 hover:bg-line-2 hover:text-ink",
      )}
    >
      {item.label}
    </Link>
  );
}

/** „Hilfe-Seite“: öffnet die öffentliche Hilfe-Seite der Organisation im neuen Tab. */
export function HelpPageButton({ accountSlug }: { accountSlug: string }) {
  return (
    <a
      href={helpPageHref(accountSlug)}
      target="_blank"
      rel="noreferrer"
      aria-label="Hilfe-Seite in neuem Tab öffnen"
      title="Ihre Hilfe-Seite in neuem Tab öffnen"
      className="hidden items-center gap-1.5 rounded-full border-2 border-line bg-card px-3 py-1.5 text-[13px] font-extrabold text-ink transition-colors hover:border-[#e3d7c2] md:flex"
    >
      <HELP_PAGE_ICON className="size-3.5 shrink-0" />
      <span className="hidden lg:inline">Hilfe-Seite</span>
    </a>
  );
}

export type BellAlert = {
  id: string;
  tutorialId: string;
  title: string;
  summary: string;
  /** Vorformatiert auf dem Server (z. B. „vor 2 Tagen“) — keine Hydration-Abweichung. */
  when: string;
};
export type BellGap = { question: string; count: number; when: string };
export type BellFailedVideo = FailedVideoNotice;

/**
 * Glocke (Entwurf Abschnitt 1): öffnet eine Übersicht mit „Aktualität prüfen“
 * (offene change_alerts) und „Offene Fragen“ (unbeantwortete Chat-Fragen), je
 * höchstens 3 Einträge + „Alle“-Link. Zähler = Summe beider Listen.
 * Welle 51: dritter Abschnitt „Fehlgeschlagene Videos“ (nur wenn es welche gibt, max. 3),
 * ausgeblendete (localStorage, geteilt mit der Bibliothek) zählen nicht mit.
 */
export function BellPopover({
  alerts,
  alertTotal,
  gaps,
  gapTotal,
  gapsMore = false,
  failedVideos = [],
}: {
  alerts: BellAlert[];
  alertTotal: number;
  gaps: BellGap[];
  gapTotal: number;
  /** Es gibt mehr offene Fragen als geladen (Anzeige „+“). */
  gapsMore?: boolean;
  /** Gescheiterte Video-Aufträge der letzten 7 Tage (vor dem Ausblenden-Filter). */
  failedVideos?: BellFailedVideo[];
}) {
  const [open, setOpen] = useState(false);
  const dismissed = useDismissedVideoJobs();
  // Bis bekannt ist, was ausgeblendet wurde (Server/erster Render): Fehlschläge nicht zählen.
  const failed = dismissed ? failedVideos.filter((f) => !dismissed.includes(f.id)) : [];
  const total = alertTotal + gapTotal + failed.length;
  const totalLabel = total > 99 ? "99+" : gapsMore ? `${total}+` : String(total);
  const close = () => setOpen(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={total ? `Hinweise (${totalLabel} offen)` : "Hinweise"}
            className={cn(
              "relative grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-line-2",
              open && "bg-line-2",
            )}
          >
            <Bell className="size-[17px]" />
            {total ? (
              <span
                data-testid="bell-count"
                className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-black leading-none text-white"
              >
                {totalLabel}
              </span>
            ) : null}
          </button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[340px] max-w-[calc(100vw-24px)] gap-1 rounded-2xl border-2 border-line bg-card p-2.5 text-ink shadow-[0_16px_36px_rgba(51,41,31,0.16)] ring-0"
      >
        <BellSection title="Aktualität prüfen" href="/app/alerts" onNavigate={close}>
          {alerts.length === 0 ? (
            <BellEmpty>Alles aktuell – keine offenen Hinweise.</BellEmpty>
          ) : (
            alerts.map((a) => (
              <BellNote
                key={a.id}
                href={`/app/tutorials/${a.tutorialId}`}
                onNavigate={close}
                tone="amber"
                icon={<AlertTriangle className="size-3.5" />}
                title={`„${a.title}“ wirkt veraltet`}
                meta={`${a.summary} · ${a.when}`}
              />
            ))
          )}
        </BellSection>
        <BellSection title="Offene Fragen" href="/app/assistent/fragen" onNavigate={close}>
          {gaps.length === 0 ? (
            <BellEmpty>Keine offenen Fragen – der KI-Assistent konnte alles beantworten.</BellEmpty>
          ) : (
            gaps.map((g) => (
              <BellNote
                key={g.question}
                href="/app/assistent/fragen"
                onNavigate={close}
                tone="violet"
                icon={<MessageCircleQuestion className="size-3.5" />}
                title={`„${g.question}“`}
                meta={`${g.count}× gefragt · ${g.when}`}
              />
            ))
          )}
        </BellSection>
        {failed.length > 0 && (
          <BellSection title="Fehlgeschlagene Videos" href="/app" onNavigate={close}>
            {failed.slice(0, 3).map((f) => (
              <div key={f.id} className="flex items-start" data-testid="bell-failed-video">
                <BellNote
                  href="/app"
                  onNavigate={close}
                  tone="red"
                  icon={<VideoOff className="size-3.5" />}
                  title={`„${f.title}“ konnte nicht verarbeitet werden`}
                  meta={`${f.reason[0].toUpperCase()}${f.reason.slice(1)}. Bitte erneut aufnehmen. · ${f.when}`}
                />
                <button
                  type="button"
                  onClick={() => dismissVideoJob(f.id)}
                  aria-label={`Hinweis zu „${f.title}“ ausblenden`}
                  title="Ausblenden"
                  className="mt-1.5 grid size-7 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-line-2 hover:text-ink"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </BellSection>
        )}
      </PopoverContent>
    </Popover>
  );
}

function BellSection({
  title,
  href,
  onNavigate,
  children,
}: {
  title: string;
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="grid gap-1">
      <h4 className="mx-1.5 mt-1 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-[0.08em] text-faint">
        {title}
        <Link
          href={href}
          onClick={onNavigate}
          className="text-xs font-extrabold normal-case tracking-normal text-primary hover:underline"
        >
          Alle
        </Link>
      </h4>
      {children}
    </section>
  );
}

function BellEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{children}</p>;
}

function BellNote({
  href,
  onNavigate,
  tone,
  icon,
  title,
  meta,
}: {
  href: string;
  onNavigate: () => void;
  tone: "amber" | "violet" | "red";
  icon: React.ReactNode;
  title: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex min-w-0 flex-1 items-start gap-2.5 rounded-[10px] p-2 text-[13px] transition-colors hover:bg-line-2"
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-[9px]",
          tone === "amber"
            ? "bg-amber-soft text-amber-text"
            : tone === "red"
              ? "bg-destructive/10 text-destructive"
              : "bg-violet-soft text-violet-text",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <b className="line-clamp-2 block font-extrabold text-ink">{title}</b>
        <span className="line-clamp-2 text-xs font-semibold text-muted-foreground">{meta}</span>
      </span>
    </Link>
  );
}

const menuItemClass =
  "gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-extrabold text-ink focus:bg-line-2 focus:text-ink not-data-[variant=destructive]:focus:**:text-ink";

/**
 * Avatar-Menü (Entwurf Abschnitt 1): Name/E-Mail oben, Organisation wechseln,
 * Mein Profil, Einstellungen, (Admin), Steply-Hilfe, Abmelden. Die eigene
 * Hilfe-Seite hat jetzt einen eigenen Knopf in der Kopfleiste.
 */
export function UserMenu({
  userName,
  email,
  accountId,
  accountName,
  memberships,
  isAdmin,
  member = false,
}: {
  userName: string | null;
  email: string | null;
  accountId: string;
  accountName: string;
  memberships: Membership[];
  isAdmin: boolean;
  /** Rolle „Mitarbeiter" (nur Schulungen): kein Einstellungen-Eintrag. */
  member?: boolean;
}) {
  const { busy, switchTo } = useSwitchAccount();
  const display = userName ?? email ?? accountName;
  const initial = (display.trim()[0] ?? "S").toUpperCase();

  return (
    <>
      <MemberModeSync on={member} />
      {/* Nach MemberModeSync: beide Effekte laufen in dieser Reihenfolge — die Links wissen
          also schon, ob Mitarbeiter, wenn sie erstmals vorladen dürfen. */}
      <RoleKnownSync />
      {/* Mehrere Organisationen: die aktive sichtbar zeigen — sonst legte man leicht Inhalte in der
          falschen Kanzlei an (Runde 5). */}
      {memberships.length > 1 && (
        <span
          className="hidden max-w-[180px] truncate rounded-full bg-line-2 px-2.5 py-1 text-xs font-extrabold text-ink-2 sm:inline-block"
          title={`Aktive Organisation: ${accountName}`}
        >
          {accountName}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Konto-Menü"
              className="ml-1 grid size-8 shrink-0 place-items-center rounded-full bg-teal text-sm font-black text-white transition-transform hover:scale-105"
            >
              {initial}
            </button>
          }
        />
        <DropdownMenuContent
          align="end"
          sideOffset={10}
          className="w-[250px] gap-0.5 rounded-2xl border-2 border-line bg-card p-2 text-ink shadow-[0_16px_36px_rgba(51,41,31,0.16)] ring-0"
        >
          {/* Base UI: GroupLabel MUSS in einer Group stecken. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="mb-1 border-b-2 border-line-2 px-2.5 pb-2.5 pt-2">
              <span className="block truncate text-sm font-black text-ink">{display}</span>
              {email && email !== display && (
                <span className="block truncate text-xs font-semibold text-muted-foreground">
                  {email}
                </span>
              )}
              <span className="mt-0.5 block truncate text-xs font-semibold text-faint">
                {accountName}
              </span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>

          {memberships.length > 1 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                className={cn(
                  menuItemClass,
                  "data-open:bg-line-2 data-open:text-ink data-popup-open:bg-line-2 data-popup-open:text-ink",
                )}
              >
                <ArrowLeftRight className="size-3.5" /> Organisation wechseln
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-52 rounded-2xl border-2 border-line bg-card p-2 ring-0">
                {memberships.map((m) => (
                  <DropdownMenuItem
                    key={m.id}
                    disabled={busy}
                    className={menuItemClass}
                    onClick={() => {
                      if (m.id !== accountId) void switchTo(m.id);
                    }}
                  >
                    <Check
                      className={cn(
                        "size-3.5",
                        m.id === accountId ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{m.name}</span>
                    <span className="ml-auto shrink-0 pl-2 text-[11px] font-bold text-faint">
                      {ROLE_LABEL[asRole(m.role)]}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuItem className={menuItemClass} render={<Link href={PROFILE_HREF} />}>
            <UserRound className="size-3.5" /> Mein Profil
          </DropdownMenuItem>
          {!member && (
            <DropdownMenuItem className={menuItemClass} render={<Link href={SETTINGS_ITEM.href} />}>
              <SETTINGS_ITEM.icon className="size-3.5" /> Einstellungen
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem className={menuItemClass} render={<Link href="/admin" />}>
              <ShieldCheck className="size-3.5" /> Admin
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="mx-1.5 my-1 h-0.5 bg-line-2" />
          <DropdownMenuItem
            className={menuItemClass}
            render={<a href={STEPLY_HELP_HREF} target="_blank" rel="noreferrer" />}
          >
            <STEPLY_HELP_ICON className="size-3.5" /> Steply-Hilfe
          </DropdownMenuItem>
          {/* render = nativer <button> → nativeButton setzen (Base-UI-Warnung). */}
          <DropdownMenuItem
            className={menuItemClass}
            nativeButton
            render={<button type="submit" form="steply-signout" />}
          >
            <LogOut className="size-3.5" /> Abmelden
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Abmelde-Form außerhalb des Menüs (Submit via form-Attribut). */}
      <form id="steply-signout" action={signOut} className="hidden" />
    </>
  );
}

const tabClass = (active: boolean) =>
  cn(
    "flex min-w-0 flex-col items-center gap-[3px] rounded-2xl px-0 py-1 text-[10.5px] font-extrabold tracking-[-0.02em] transition-colors",
    active ? "text-ink" : "text-muted-foreground hover:text-ink-2",
  );

/**
 * Handy-Leiste unten (Entwurf Abschnitt 5): Anleitungen · Schulungen · (Mitte)
 * Neu · Automationen · Mehr. „Neu“ öffnet denselben Dialog wie „+ Neue Anleitung“
 * (Slot vom Server), „Mehr“ öffnet ein Blatt mit dem Selteneren.
 */
export function TabBar({
  createAction,
  more,
}: {
  createAction: React.ReactNode;
  more: React.ReactNode;
}) {
  const path = usePathname();
  const member = useMemberMode();
  const left = member ? MOBILE_TABS_LEFT.filter((i) => i.href === "/app/lernen") : MOBILE_TABS_LEFT;
  const right = member ? [] : MOBILE_TABS_RIGHT;
  // Spalten = tatsächliche Reiter (Audit 24.09.: Mitarbeiter hatten 2 Reiter in 5 Spalten,
  // „Mehr“ stand links der Mitte). Mitarbeiter legen keine Anleitungen an → kein „Neu“.
  const cols = left.length + right.length + (member ? 0 : 1) + 1;
  return (
    <nav
      aria-label="Hauptnavigation"
      data-mobile-tabbar
      className="fixed inset-x-0 bottom-0 z-30 grid items-end border-t-2 border-line bg-card px-0.5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 lg:hidden"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {left.map((item) => (
        <TabLink key={item.href} item={item} active={item.match(path)} />
      ))}
      {!member && createAction}
      {right.map((item) => (
        <TabLink key={item.href} item={item} active={item.match(path)} />
      ))}
      {more}
    </nav>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  const prefetch = usePrefetchFor(item.href);
  return (
    <Link
      href={item.href}
      prefetch={prefetch}
      aria-current={active ? "page" : undefined}
      className={tabClass(active)}
    >
      <item.icon className="size-[19px]" />
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  );
}

/**
 * „Mehr“-Tab + Blatt (Entwurf Abschnitt 5): KI-Assistent, Hilfe-Seite ansehen,
 * Einstellungen, Steply-Hilfe. Als Base-UI-Popover, das volle Breite direkt ÜBER der
 * Leiste aufgeht — die Leiste bleibt sichtbar und „Mehr“ markiert (kein Vollbild-Dialog).
 */
export function MoreTab({ accountSlug }: { accountSlug: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const member = useMemberMode();
  // Mitarbeiter: nur die externen Ziele (Hilfe-Seite ansehen, Steply-Hilfe).
  const items = mobileMoreItems(accountSlug).filter((i) => !member || i.external);
  const activeInside = items.some((i) => i.match(path));

  // Blatt bei Navigation schließen (Pfadwechsel von außen, z. B. Zurück-Taste).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: Blatt mit dem Router-Pfad synchronisieren, kein Cascade
    setOpen(false);
  }, [path]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        render={
          <button type="button" className={tabClass(open || activeInside)}>
            <Ellipsis className="size-[19px]" />
            Mehr
          </button>
        }
      />
      <PopoverPrimitive.Portal>
        {/* sideOffset 10 = Abstand Knopf-Oberkante → Oberkante der Leiste (pt-2 + 2px Rand). */}
        <PopoverPrimitive.Positioner
          side="top"
          align="end"
          sideOffset={10}
          collisionPadding={0}
          className="isolate z-50 lg:hidden"
        >
          <PopoverPrimitive.Popup
            aria-label="Mehr"
            className="grid w-screen gap-0.5 rounded-t-[20px] border-t-2 border-line bg-card p-3 text-ink shadow-[0_-10px_30px_rgba(51,41,31,0.12)] outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-2 data-closed:animate-out data-closed:fade-out-0"
          >
          {items.map((item) => {
            const cls = cn(
              "flex items-center gap-2.5 rounded-[10px] p-2.5 text-sm font-extrabold transition-colors hover:bg-line-2",
              item.match(path) ? "bg-line-2 text-ink" : "text-ink",
            );
            return item.external ? (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className={cls}
                onClick={() => setOpen(false)}
              >
                <item.icon className="size-[19px] text-ink-2" /> {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cls}
                onClick={() => setOpen(false)}
              >
                <item.icon className="size-[19px] text-ink-2" /> {item.label}
              </Link>
            );
          })}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/**
 * Trigger-Optik des „Neu“-Tabs (wird an NewTutorialButton als Base-UI-render
 * übergeben). MUSS eingehende Props (onClick/ref/aria vom DialogTrigger) durchreichen
 * und die ref forwarden — sonst bleibt der mobile Knopf tot (Base UI klont das Element
 * und hängt den Öffnen-Handler an genau diese Props).
 */
export const CreateTabTrigger = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(function CreateTabTrigger(props, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Neue Anleitung"
      {...props}
      className="flex min-w-0 flex-col items-center gap-[3px] px-1 py-1 text-[10.5px] font-extrabold text-primary"
    >
      <span className="-mt-4 grid size-[34px] place-items-center rounded-full bg-primary text-white shadow-[0_3px_0_var(--primary-pressed)]">
        <Plus className="size-3.5" strokeWidth={3} />
      </span>
      Neu
    </button>
  );
});
