"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileText, Loader2 } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { ALL_NAV_ITEMS } from "@/components/app/nav-config";
import { searchMyTutorials, type TutorialHit } from "@/app/app/search-actions";

/**
 * ⌘K-Kommando-Palette (Welle 21) — das „moderne Element“ der neuen App-Shell.
 * Öffnet per Ctrl/⌘+K oder Klick aufs Topbar-Suchfeld (steuert `open` von außen).
 *
 * Gruppen:
 *  - „Navigation“: alle Sidebar-Ziele.
 *  - „Aktionen“: „Neues Tutorial“ → navigiert nach /app (öffnet dort NICHT
 *    automatisch den Dialog; siehe Report). „Meine Tutorials“: debounced
 *    Titel-Suche via Server-Action, Auswahl springt in den Editor.
 *
 * cmdk-Filterung ist AUS (`shouldFilter={false}`): Navigation/Aktionen filtern wir
 * selbst gegen die Query, die Tutorial-Treffer kommen bereits gefiltert vom Server.
 */
export function AppCommand({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TutorialHit[]>([]);
  const [searching, startSearch] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Öffnen/Schließen an den Parent durchreichen; beim Schließen frisch zurücksetzen
  // (kein Effect → kein setState-in-Effect-Cascade).
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery("");
        setHits([]);
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  // Global: Ctrl/⌘+K öffnet die Palette (toggelt).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleOpenChange]);

  // Debounced Tutorial-Suche (200 ms). < 2 Zeichen → keine Suche.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: Ergebnisliste leeren, sobald die (externe) Eingabe zu kurz ist, kein Cascade
      setHits([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startSearch(async () => {
        const res = await searchMyTutorials(q);
        setHits(res);
      });
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const go = useCallback(
    (href: string) => {
      handleOpenChange(false);
      router.push(href);
    },
    [handleOpenChange, router],
  );

  const q = query.trim().toLowerCase();
  const navMatches = q
    ? ALL_NAV_ITEMS.filter((i) => i.label.toLowerCase().includes(q))
    : ALL_NAV_ITEMS;
  const actionMatches = "neues tutorial".includes(q) || q === "";

  const nothing =
    navMatches.length === 0 && !actionMatches && hits.length === 0 && !searching;

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      shouldFilter={false}
      title="Befehle & Suche"
      description="Navigieren, Aktionen ausführen oder Tutorials finden."
      className="sm:max-w-lg"
    >
      <CommandInput
        placeholder="Suchen oder Befehl eingeben …"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {nothing && <CommandEmpty>Keine Treffer.</CommandEmpty>}

        {navMatches.length > 0 && (
          <CommandGroup heading="Navigation">
            {navMatches.map((item) => (
              <CommandItem
                key={item.href}
                value={`nav:${item.href}`}
                onSelect={() => go(item.href)}
              >
                <item.icon className="text-muted-foreground" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {actionMatches && (
          <CommandGroup heading="Aktionen">
            <CommandItem value="action:new" onSelect={() => go("/app")}>
              <Plus className="text-muted-foreground" />
              Neues Tutorial
            </CommandItem>
          </CommandGroup>
        )}

        {(searching || hits.length > 0) && (
          <CommandGroup heading="Meine Tutorials">
            {searching && hits.length === 0 && (
              <CommandItem value="tut:loading" disabled>
                <Loader2 className="animate-spin text-muted-foreground" />
                Suche läuft …
              </CommandItem>
            )}
            {hits.map((t) => (
              <CommandItem
                key={t.id}
                value={`tut:${t.id}`}
                onSelect={() => go(`/app/tutorials/${t.id}`)}
              >
                <FileText className="text-muted-foreground" />
                <span className="truncate">{t.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t.status === "published" ? "Veröffentlicht" : "Entwurf"}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
