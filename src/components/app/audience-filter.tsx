"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Globe, Lock, LayoutGrid } from "lucide-react";
import type { Tutorial } from "@/lib/types";

export type AudienceFilter = "all" | "kunden" | "team";

const Ctx = createContext<AudienceFilter>("all");
const SetterCtx = createContext<(f: AudienceFilter) => void>(() => {});

/** Client-State-Provider für die Zielgruppen-Filter-Chips (Welle 20). */
export function AudienceFilterProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<AudienceFilter>("all");
  return (
    <SetterCtx.Provider value={setFilter}>
      <Ctx.Provider value={filter}>{children}</Ctx.Provider>
    </SetterCtx.Provider>
  );
}

/** Passt ein Tutorial zum aktiven Filter? Öffentlich-mit-in_lernen zählt zu beiden. */
export function matchesAudience(
  filter: AudienceFilter,
  t: Pick<Tutorial, "visibility" | "in_lernen">,
): boolean {
  if (filter === "all") return true;
  const isKunden = t.visibility === "public";
  const isTeam = t.visibility === "internal" || (t.visibility === "public" && t.in_lernen);
  return filter === "kunden" ? isKunden : isTeam;
}

/** In TutorialCard: aktuellen Filter lesen. */
export function useAudienceFilter(): AudienceFilter {
  return useContext(Ctx);
}

/**
 * Dezente Chip-Reihe „Alle | Kunden | Team" über der Tutorial-Liste. Reiner
 * Client-State (kein URL-Param) — filtert die Karten nach Zielgruppe.
 */
export function AudienceFilterChips() {
  const filter = useContext(Ctx);
  const setFilter = useContext(SetterCtx);
  const chips: { key: AudienceFilter; label: string; icon: ReactNode }[] = [
    { key: "all", label: "Alle", icon: <LayoutGrid className="size-3.5" /> },
    { key: "kunden", label: "Kunden", icon: <Globe className="size-3.5" /> },
    { key: "team", label: "Team", icon: <Lock className="size-3.5" /> },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-card p-0.5 text-sm">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => setFilter(c.key)}
          aria-pressed={filter === c.key}
          className={`inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 transition-colors ${
            filter === c.key
              ? "bg-accent font-medium text-ink"
              : "text-muted-foreground hover:text-ink"
          }`}
        >
          {c.icon} {c.label}
        </button>
      ))}
    </div>
  );
}
