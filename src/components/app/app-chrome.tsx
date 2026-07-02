"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, PanelLeft } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { AppCommand } from "@/components/app/app-command";

/**
 * Interaktive App-Shell (Welle 21): schlanke Topbar (Such-Attrappe + Hamburger +
 * Glocke) und das mobile Sidebar-Sheet + die ⌘K-Palette. Das statische Nav-Gerüst
 * kommt aus dem Layout; die konto-abhängigen, gestreamten Teile werden als Props
 * hereingereicht: `bell` (Glocke) sowie — nur fürs mobile Sheet — `mobileAccountZone`
 * (AccountSwitcher) und `mobileBottomZone` (Einstellungen/Admin/Hilfe/E-Mail/Abmelden).
 * Diese mobilen Zonen sind jeweils in eine eigene Suspense-Boundary gehüllt (im
 * Layout), teilen sich aber den per cache() dedupten requireAccount()-Abruf mit der
 * Desktop-Sidebar — es wird also nicht doppelt geladen.
 */
export function AppChrome({
  bell,
  mobileAccountZone,
  mobileBottomZone,
}: {
  bell: ReactNode;
  mobileAccountZone: ReactNode;
  mobileBottomZone: ReactNode;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const path = usePathname();

  // Mobiles Sheet nach jeder Navigation schließen (Pfadwechsel).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: Sheet auf externen Router-Pfadwechsel schließen (Synchronisierung mit der Navigation), kein Cascade
    setSheetOpen(false);
  }, [path]);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border bg-card/80 px-3 backdrop-blur lg:px-6">
        {/* Hamburger nur mobil — öffnet die Sidebar als Sheet. */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={() => setSheetOpen(true)}
          aria-label="Menü öffnen"
        >
          <PanelLeft className="size-4" />
        </Button>

        {/* Wordmark nur mobil (Desktop hat sie in der Sidebar). */}
        <Link href="/app" className="lg:hidden" aria-label="Zur Übersicht">
          <Wordmark />
        </Link>

        {/* Such-Feld-Attrappe → öffnet die ⌘K-Palette. */}
        <button
          type="button"
          onClick={() => setCmdOpen(true)}
          aria-label="Suchen und Befehle (⌘K)"
          className="ml-auto flex h-8 w-full max-w-xs items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-ring/60 hover:text-ink-2"
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate">Suchen …</span>
          <kbd className="ml-auto hidden shrink-0 rounded border border-border bg-muted px-1.5 font-sans text-[10px] font-medium text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </button>

        {bell}
      </header>

      {/* Mobile Sidebar als Sheet von links. Inhalt identisch zur Desktop-Sidebar. */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="w-60 p-0 sm:max-w-60">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">
            <div className="flex flex-col gap-3 border-b border-border p-4">
              <Link href="/app" onClick={() => setSheetOpen(false)}>
                <Wordmark />
              </Link>
              {mobileAccountZone}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <SidebarNav onNavigate={() => setSheetOpen(false)} />
            </div>
            <div className="border-t border-border p-3">{mobileBottomZone}</div>
          </div>
        </SheetContent>
      </Sheet>

      <AppCommand open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  );
}
