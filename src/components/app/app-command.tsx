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
  CommandShortcut,
} from "@/components/ui/command";
import { useMemberMode } from "@/components/app/member-mode";
import {
  MAIN_NAV,
  ASSISTENT_TABS,
  HINWEISE_ITEM,
  SETTINGS_ITEM,
  HELP_PAGE_ICON,
  NEW_TUTORIAL_EVENT,
  type NavItem,
} from "@/components/app/nav-config";
import { searchMyTutorials, type TutorialHit } from "@/app/app/search-actions";

type CmdEntry = {
  id: string;
  label: string;
  icon: NavItem["icon"];
  /** Kleiner Hinweis rechts (z. B. Oberbereich „KI-Assistent“). */
  hint?: string;
  keywords?: string[];
  run: () => void;
};

/** Trifft die Eingabe Beschriftung, Oberbereich oder Suchwörter? */
function matches(e: CmdEntry, q: string): boolean {
  if (!q) return true;
  const hay = [e.label, e.hint ?? "", ...(e.keywords ?? [])].join(" ").toLowerCase();
  return hay.includes(q);
}

/**
 * ⌘K-Palette. Öffnet per Strg/⌘+K oder Klick aufs Suchfeld in der Kopfleiste
 * (steuert `open` von außen).
 *
 * Gruppen:
 *  - „Navigation“: aus nav-config (dieselbe Quelle wie Pills + Handy-Leiste) —
 *    Anleitungen, Schulungen, Automationen, KI-Assistent (+ Unterseiten), Hinweise,
 *    Einstellungen, Hilfe-Seite (neuer Tab).
 *  - „Aktionen“: „Neue Anleitung“ öffnet den Erstell-Dialog der Kopfleiste
 *    (Ereignis NEW_TUTORIAL_EVENT). Eine eigene „Neue Automation“-Route gibt es
 *    nicht (Automationen entstehen aus einer Anleitung) — daher kein Eintrag.
 *  - „Meine Anleitungen“: debounced Titel-Suche via Server-Action.
 *
 * cmdk-Filterung ist AUS (`shouldFilter={false}`): Navigation/Aktionen filtern wir
 * selbst gegen die Eingabe, die Anleitungs-Treffer kommen gefiltert vom Server.
 */
export function AppCommand({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const member = useMemberMode();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TutorialHit[]>([]);
  const [searching, startSearch] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Zähler je Suche: nur die JÜNGSTE Antwort darf die Treffer setzen. Sonst schrieb eine noch
  // laufende Suche ihre Treffer nach dem Leeren/Schließen zurück (alte Treffer beim Öffnen).
  // Nur im Such-Effekt benutzt (jede Eingabe-Änderung, auch das Leeren beim Schließen).
  const searchSeq = useRef(0);

  // Öffnen/Schließen an den Parent durchreichen; beim Schließen frisch zurücksetzen
  // (kein Effect → kein setState-in-Effect-Cascade).
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery(""); // → Such-Effekt läuft neu und verwirft noch laufende Antworten
        setHits([]);
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  // Global: Strg/⌘+K öffnet die Palette (toggelt).
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

  // Debounced Anleitungs-Suche (200 ms). < 2 Zeichen → keine Suche.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    // Mitarbeiter durchsuchen keine Anleitungs-Bibliothek (nur Schulungen).
    const seq = ++searchSeq.current;
    if (q.length < 2 || member) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: Ergebnisliste leeren, sobald die (externe) Eingabe zu kurz ist, kein Cascade
      setHits([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startSearch(async () => {
        const res = await searchMyTutorials(q);
        if (seq === searchSeq.current) setHits(res);
      });
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, member]);

  const go = useCallback(
    (href: string) => {
      handleOpenChange(false);
      router.push(href);
    },
    [handleOpenChange, router],
  );

  const navEntry = (item: NavItem, hint?: string): CmdEntry => ({
    id: `nav:${item.href}:${item.label}`,
    label: item.label,
    icon: item.icon,
    hint,
    keywords: item.keywords,
    run: () => go(item.href),
  });

  const navEntries: CmdEntry[] = member
    ? [navEntry(MAIN_NAV.find((i) => i.href === "/app/lernen") ?? MAIN_NAV[0])]
    : [
    ...MAIN_NAV.flatMap((item) =>
      item.label === "KI-Assistent"
        ? [navEntry(item), ...ASSISTENT_TABS.map((t) => navEntry(t, "KI-Assistent"))]
        : [navEntry(item)],
    ),
    navEntry(HINWEISE_ITEM),
    navEntry(SETTINGS_ITEM),
    {
      id: "nav:hilfe-seite",
      label: "Hilfe-Seite",
      icon: HELP_PAGE_ICON,
      hint: "neuer Tab",
      keywords: ["öffentlich", "kunden", "ansehen"],
      run: () => {
        handleOpenChange(false);
        window.open("/app/hilfe-seite", "_blank", "noopener");
      },
    },
  ];

  const actionEntries: CmdEntry[] = member
    ? []
    : [
    {
      id: "action:new-tutorial",
      label: "Neue Anleitung",
      icon: Plus,
      keywords: ["erstellen", "anlegen", "aufnehmen"],
      run: () => {
        handleOpenChange(false);
        window.dispatchEvent(new Event(NEW_TUTORIAL_EVENT));
      },
    },
  ];

  const q = query.trim().toLowerCase();
  const navMatches = navEntries.filter((e) => matches(e, q));
  const actionMatches = actionEntries.filter((e) => matches(e, q));

  const nothing =
    navMatches.length === 0 && actionMatches.length === 0 && hits.length === 0 && !searching;

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      shouldFilter={false}
      title="Suchen"
      description="Bereiche öffnen, Aktionen ausführen oder Anleitungen finden."
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
            {navMatches.map((e) => (
              <CommandItem key={e.id} value={e.id} onSelect={e.run}>
                <e.icon className="text-muted-foreground" />
                {e.label}
                {e.hint && (
                  <CommandShortcut className="tracking-normal">{e.hint}</CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {actionMatches.length > 0 && (
          <CommandGroup heading="Aktionen">
            {actionMatches.map((e) => (
              <CommandItem key={e.id} value={e.id} onSelect={e.run}>
                <e.icon className="text-muted-foreground" />
                {e.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(searching || hits.length > 0) && (
          <CommandGroup heading="Meine Anleitungen">
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
                <CommandShortcut className="tracking-normal">
                  {t.status === "published" ? "Veröffentlicht" : "Entwurf"}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
