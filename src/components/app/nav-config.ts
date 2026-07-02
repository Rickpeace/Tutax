import {
  Layers,
  GraduationCap,
  BookOpen,
  MessageCircleQuestion,
  LifeBuoy,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Zentrale Navigations-Definition der App-Shell (Welle 21). Sidebar (Server) und
 * ⌘K-Palette (Client) teilen sich diese Liste, damit „was ist ein Ziel“ nur an
 * EINER Stelle steht. `match` bleibt clientseitig (usePathname) für die aktive
 * Markierung.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** true → aktiv, gegeben der aktuelle Pfad. */
  match: (p: string) => boolean;
};

export type NavSection = { label: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Inhalte",
    items: [
      {
        href: "/app",
        label: "Tutorials",
        icon: Layers,
        match: (p) => p === "/app" || p.startsWith("/app/tutorials"),
      },
      {
        href: "/app/lernen",
        label: "Lernen",
        icon: GraduationCap,
        match: (p) => p.startsWith("/app/lernen"),
      },
    ],
  },
  {
    label: "Assistent",
    items: [
      {
        href: "/app/assistent/wissen",
        label: "Wissensdatenbank",
        icon: BookOpen,
        match: (p) => p.startsWith("/app/assistent/wissen") || p.startsWith("/app/knowledge"),
      },
      {
        href: "/app/assistent/fragen",
        label: "Offene Fragen",
        icon: MessageCircleQuestion,
        match: (p) => p.startsWith("/app/assistent/fragen"),
      },
      {
        href: "/app/assistent/eskalation",
        label: "Kontakt & Eskalation",
        icon: LifeBuoy,
        match: (p) => p.startsWith("/app/assistent/eskalation"),
      },
    ],
  },
];

/** Einstellungen steht separat (unterer, sticky Bereich der Sidebar). */
export const SETTINGS_ITEM: NavItem = {
  href: "/app/settings",
  label: "Einstellungen",
  icon: Settings,
  match: (p) => p.startsWith("/app/settings"),
};

/** Flache Liste aller Navigations-Ziele (für die ⌘K-Palette). */
export const ALL_NAV_ITEMS: NavItem[] = [
  ...NAV_SECTIONS.flatMap((s) => s.items),
  SETTINGS_ITEM,
];
