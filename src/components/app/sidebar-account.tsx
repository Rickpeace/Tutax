"use client";

import Link from "next/link";
import { Bell, ShieldCheck, LogOut, CircleHelp, ExternalLink, Settings } from "lucide-react";
import { AccountSwitcher } from "@/components/app/account-switcher";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/app/sidebar-nav";
import { signOut } from "@/app/(auth)/actions";
import type { Membership } from "@/lib/account";

/**
 * Dynamische Sidebar-Bausteine (Welle 21). Client-Komponenten mit rein
 * serialisierbaren Props (E-Mail/Slug/Admin/Memberships) — so lassen sie sich
 * sowohl in der Desktop-Sidebar (server-gestreamt) als auch im mobilen Sheet
 * (mit onNavigate-Callback) einsetzen, ohne den Datenabruf zu duplizieren
 * (requireAccount ist pro Request via cache() dedupt).
 */

/** Konto-Umschalter (oben, unter der Wordmark). */
export function SidebarAccount({
  accountId,
  accountName,
  memberships,
}: {
  accountId: string;
  accountName: string;
  memberships: Membership[];
}) {
  return (
    <AccountSwitcher
      currentId={accountId}
      currentName={accountName}
      memberships={memberships}
      full
    />
  );
}

/** Glocke mit Badge (Topbar rechts). */
export function TopbarBell({ alertCount }: { alertCount: number | null }) {
  return (
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
  );
}

/**
 * Unterer, sticky Sidebar-Bereich: Einstellungen + (Admin), Steply-Hilfe,
 * „Hilfe-Seite öffnen“, Trennlinie, User-Zeile (E-Mail + Abmelden).
 */
export function SidebarBottom({
  isAdmin,
  accountSlug,
  email,
}: {
  isAdmin: boolean;
  accountSlug: string;
  email: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <NavLink href="/app/settings" label="Einstellungen" icon={Settings} />
      {isAdmin && <NavLink href="/admin" label="Admin" icon={ShieldCheck} />}
      {/* Externe Ziele: eigene Doku + öffentliche Hilfe-Seite (neuer Tab). */}
      <a
        href="/h/steply"
        target="_blank"
        rel="noreferrer"
        className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-muted hover:text-ink"
      >
        <CircleHelp className="size-4 shrink-0" />
        <span className="truncate">Steply-Hilfe</span>
      </a>

      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        className="mt-1 w-full justify-start"
        render={
          <Link href={`/h/${accountSlug}`} target="_blank" rel="noreferrer" />
        }
      >
        <ExternalLink className="size-4" />
        Hilfe-Seite öffnen
      </Button>

      <div className="my-2 h-px bg-line-2" />

      <div className="flex items-center gap-2 px-1">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={email ?? undefined}>
          {email}
        </span>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="icon-sm" aria-label="Abmelden">
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
