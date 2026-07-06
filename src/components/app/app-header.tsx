"use client";

import { forwardRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  Bell,
  LogOut,
  ShieldCheck,
  CircleHelp,
  ExternalLink,
  Check,
  Settings,
  Layers,
  GraduationCap,
  BookOpen,
} from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppCommand } from "@/components/app/app-command";
import { cn } from "@/lib/utils";
import { setActiveAccount } from "@/app/app/actions";
import { signOut } from "@/app/(auth)/actions";
import type { Membership } from "@/lib/account";

/**
 * App-Shell (Design-Handoff 07/2026, Option 2a): 64px-Topnav — Wordmark,
 * Pill-Navigation (aktiv = Ink-Pill), Such-Pill (⌘K), Glocke, Primär-Aktion
 * „＋ Neue Anleitung" und Avatar-Menü. Mobil (Option 2b) übernimmt die
 * TabBar unten die Navigation; der Header zeigt nur Logo + Suche + Avatar.
 * Konto-abhängige Teile (Glocke, Aktion, Avatar) kommen als Server-Slots.
 */
export function AppHeader({
  bell,
  newAction,
  userMenu,
}: {
  bell: React.ReactNode;
  newAction: React.ReactNode;
  userMenu: React.ReactNode;
}) {
  const [cmdOpen, setCmdOpen] = useState(false);
  const path = usePathname();

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b-2 border-line bg-card px-4 lg:gap-6 lg:px-7">
        <Link href="/app" aria-label="Zur Bibliothek" className="shrink-0">
          <Wordmark size="lg" />
        </Link>

        {/* Pill-Navigation (Desktop) */}
        <nav className="hidden items-center gap-1.5 text-sm font-bold lg:flex">
          <NavPill
            href="/app"
            label="Bibliothek"
            active={
              path === "/app" ||
              path.startsWith("/app/tutorials") ||
              path.startsWith("/app/preview")
            }
          />
          <NavPill
            href="/app/lernen"
            label="Lernen"
            active={path.startsWith("/app/lernen")}
          />
          <NavPill
            href="/app/automationen"
            label="Automationen"
            active={path.startsWith("/app/automationen")}
          />
          <NavPill
            href="/app/assistent/wissen"
            label="Assistent"
            active={
              path.startsWith("/app/assistent") || path.startsWith("/app/knowledge")
            }
          />
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:gap-3">
          {/* Such-Pill → ⌘K-Palette */}
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            aria-label="Suchen und Befehle (⌘K)"
            className="hidden w-[200px] items-center gap-2 rounded-full border-2 border-line bg-card px-4 py-2 text-left text-[13.5px] font-semibold text-faint transition-colors hover:border-[#e3d7c2] md:flex"
          >
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full border-2 border-faint"
            />
            <span className="truncate">Suchen …</span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground md:hidden"
            onClick={() => setCmdOpen(true)}
            aria-label="Suchen (⌘K)"
          >
            <Search className="size-4" />
          </Button>

          {bell}
          <div className="hidden md:block">{newAction}</div>
          {userMenu}
        </div>
      </header>

      <AppCommand open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  );
}

function NavPill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full px-4 py-2 transition-colors",
        active
          ? "bg-ink text-background"
          : "text-muted-foreground hover:bg-secondary hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
}

/** Glocke mit Hinweis-Badge (Server-Slot liefert den Zähler). */
export function TopBell({ alertCount }: { alertCount: number | null }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      nativeButton={false}
      className="text-muted-foreground"
      render={<Link href="/app/alerts" aria-label="Hinweise" />}
    >
      <span className="relative">
        <Bell className="size-4" />
        {alertCount ? (
          <span className="absolute -right-1.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black leading-4 text-white">
            {alertCount}
          </span>
        ) : null}
      </span>
    </Button>
  );
}

/** Avatar-Menü: Organisation wechseln, Einstellungen, Admin, Hilfe, Abmelden. */
export function UserMenu({
  accountName,
  memberships,
  isAdmin,
  accountSlug,
  email,
}: {
  accountName: string;
  memberships: Membership[];
  isAdmin: boolean;
  accountSlug: string;
  email: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const initial = (accountName?.trim()[0] ?? "S").toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Konto-Menü"
              className="grid size-[34px] shrink-0 place-items-center rounded-full bg-teal text-xs font-extrabold text-white transition-transform hover:scale-105"
            >
              {initial}
            </button>
          }
        />
        <DropdownMenuContent align="end" sideOffset={10} className="min-w-56">
          {/* Base UI: GroupLabel MUSS in einer Group stecken. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <span className="block truncate font-bold text-ink">{accountName}</span>
              {email && (
                <span className="block truncate text-xs font-semibold text-muted-foreground">
                  {email}
                </span>
              )}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          {memberships.length > 1 && (
            <>
              <DropdownMenuSeparator />
              {memberships.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  disabled={busy}
                  onClick={async () => {
                    if (m.name === accountName) return;
                    setBusy(true);
                    await setActiveAccount(m.id);
                    window.location.assign("/app");
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      m.name === accountName ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{m.name}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/app/settings" />}>
            <Settings className="size-4" /> Einstellungen
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem render={<Link href="/admin" />}>
              <ShieldCheck className="size-4" /> Admin
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            render={<a href="/h/steply" target="_blank" rel="noreferrer" />}
          >
            <CircleHelp className="size-4" /> Steply-Hilfe
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<a href={`/h/${accountSlug}`} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink className="size-4" /> Hilfe-Seite öffnen
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* render = nativer <button> → nativeButton setzen (Base-UI-Warnung). */}
          <DropdownMenuItem
            variant="destructive"
            nativeButton
            render={<button type="submit" form="steply-signout" />}
          >
            <LogOut className="size-4" /> Abmelden
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Abmelde-Form außerhalb des Menüs (Submit via form-Attribut). */}
      <form id="steply-signout" action={signOut} className="hidden" />
    </>
  );
}

/**
 * Mobile Tab-Bar (Design 2b): Bibliothek · Aufnehmen (Erstell-Aktion als
 * Slot) · Lernen · Assistent. Das Layout reserviert Platz darunter.
 */
export function TabBar({ createAction }: { createAction: React.ReactNode }) {
  const path = usePathname();
  const tabClass = (active: boolean) =>
    cn(
      "flex min-w-16 flex-col items-center gap-1 rounded-2xl px-3 py-1.5 text-[10px]",
      active ? "font-extrabold text-ink" : "font-bold text-faint hover:text-ink-2",
    );
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t-2 border-line bg-background px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-2 lg:hidden"
    >
      <Link
        href="/app"
        className={tabClass(path === "/app" || path.startsWith("/app/tutorials"))}
      >
        <Layers className="size-5" />
        Bibliothek
      </Link>
      {createAction}
      <Link href="/app/lernen" className={tabClass(path.startsWith("/app/lernen"))}>
        <GraduationCap className="size-5" />
        Lernen
      </Link>
      <Link
        href="/app/assistent/wissen"
        className={tabClass(
          path.startsWith("/app/assistent") || path.startsWith("/app/knowledge"),
        )}
      >
        <BookOpen className="size-5" />
        Assistent
      </Link>
    </nav>
  );
}

/**
 * Trigger-Optik des „Aufnehmen"-Tabs (wird an NewTutorialButton als Base-UI-render
 * übergeben). MUSS eingehende Props (onClick/ref/aria vom DialogTrigger) durchreichen
 * und die ref forwarden — sonst bleibt der mobile Knopf tot (Base UI klont das Element
 * und hängt den Öffnen-Handler an genau diese Props). Genau das war der Bug: der
 * Trigger rannte die Props ins Leere, mobil passierte beim Tippen nichts.
 */
export const CreateTabTrigger = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(function CreateTabTrigger(props, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className="flex min-w-16 flex-col items-center gap-1 rounded-2xl px-3 py-1.5 text-[10px] font-extrabold text-primary"
    >
      <span className="grid size-5 place-items-center rounded-full bg-primary text-[13px] font-black leading-none text-white shadow-[0_2px_0_var(--primary-pressed)]">
        +
      </span>
      Aufnehmen
    </button>
  );
});
