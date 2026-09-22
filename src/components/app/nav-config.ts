import {
  BookOpen,
  GraduationCap,
  Zap,
  MessageCircle,
  Library,
  MessageCircleQuestion,
  LifeBuoy,
  Bell,
  Settings,
  ExternalLink,
  CircleHelp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * EINE Quelle für die Navigation der App (Welle 50b): Kopfleisten-Pills, die
 * Handy-Leiste unten, das „Mehr“-Blatt, die Reiter im KI-Assistenten und die
 * ⌘K-Palette lesen alle aus dieser Datei — „was ist ein Ziel und wie heißt es“
 * steht damit nur an EINER Stelle (Begriffsliste: Anleitungen, Schulungen,
 * Automationen, KI-Assistent, Hilfe-Seite).
 *
 * `match` läuft clientseitig (usePathname) für die aktive Markierung.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** true → aktiv, gegeben der aktuelle Pfad. */
  match: (p: string) => boolean;
  /** Zusätzliche Suchwörter für die ⌘K-Palette. */
  keywords?: string[];
};

/** Unterseiten des KI-Assistenten (Reiter auf der Seite + Unterpunkte in ⌘K). */
export const ASSISTENT_TABS: NavItem[] = [
  {
    href: "/app/assistent/wissen",
    label: "Wissensdatenbank",
    icon: Library,
    // Auch auf Unterpfaden (z. B. /app/assistent/wissen/<id>) aktiv.
    match: (p) => p.startsWith("/app/assistent/wissen") || p.startsWith("/app/knowledge"),
    keywords: ["wissen", "artikel", "import"],
  },
  {
    href: "/app/assistent/fragen",
    label: "Offene Fragen",
    icon: MessageCircleQuestion,
    match: (p) => p.startsWith("/app/assistent/fragen"),
    keywords: ["fragen", "lücken", "chat"],
  },
  {
    href: "/app/assistent/eskalation",
    label: "Persönlicher Kontakt",
    icon: LifeBuoy,
    match: (p) => p.startsWith("/app/assistent/eskalation"),
    keywords: ["kontakt", "eskalation", "ansprechpartner", "weiterleitung"],
  },
];

const ANLEITUNGEN: NavItem = {
  href: "/app",
  label: "Anleitungen",
  icon: BookOpen,
  match: (p) =>
    p === "/app" || p.startsWith("/app/tutorials") || p.startsWith("/app/preview"),
  keywords: ["bibliothek", "übersicht"],
};
const SCHULUNGEN: NavItem = {
  href: "/app/lernen",
  label: "Schulungen",
  icon: GraduationCap,
  match: (p) => p.startsWith("/app/lernen"),
  keywords: ["lernen", "nachweis", "team", "intern"],
};
const AUTOMATIONEN: NavItem = {
  href: "/app/automationen",
  label: "Automationen",
  icon: Zap,
  match: (p) => p.startsWith("/app/automationen"),
  keywords: ["ablauf", "ausführen"],
};
const KI_ASSISTENT: NavItem = {
  href: "/app/assistent/wissen",
  label: "KI-Assistent",
  icon: MessageCircle,
  match: (p) => p.startsWith("/app/assistent") || p.startsWith("/app/knowledge"),
  keywords: ["chat", "assistent"],
};

/** Hauptbereiche = Pills in der Kopfleiste (Desktop). */
export const MAIN_NAV: NavItem[] = [ANLEITUNGEN, SCHULUNGEN, AUTOMATIONEN, KI_ASSISTENT];

/** Handy-Leiste unten: links/rechts der Mitte (Mitte = „Neu“, rechts außen = „Mehr“). */
export const MOBILE_TABS_LEFT: NavItem[] = [ANLEITUNGEN, SCHULUNGEN];
export const MOBILE_TABS_RIGHT: NavItem[] = [AUTOMATIONEN];

export const HINWEISE_ITEM: NavItem = {
  href: "/app/alerts",
  label: "Hinweise",
  icon: Bell,
  match: (p) => p.startsWith("/app/alerts"),
  keywords: ["aktualität prüfen", "veraltet", "glocke"],
};

export const SETTINGS_ITEM: NavItem = {
  href: "/app/settings",
  label: "Einstellungen",
  icon: Settings,
  match: (p) => p.startsWith("/app/settings"),
  keywords: ["konto", "team", "aussehen", "profil"],
};

export const PROFILE_HREF = "/app/settings/profil";
export const STEPLY_HELP_HREF = "/h/steply";

/** Öffentliche Hilfe-Seite der Organisation (öffnet in neuem Tab). */
export function helpPageHref(accountSlug: string): string {
  return `/h/${accountSlug}`;
}

/** Externe Ziele (neuer Tab) — Icons zentral, damit alle Stellen gleich aussehen. */
export const HELP_PAGE_ICON = ExternalLink;
export const STEPLY_HELP_ICON = CircleHelp;

/**
 * Seltenes für das „Mehr“-Blatt auf dem Handy (in dieser Reihenfolge):
 * KI-Assistent, Hilfe-Seite ansehen, Einstellungen, Steply-Hilfe.
 */
export function mobileMoreItems(accountSlug: string): (NavItem & { external?: boolean })[] {
  return [
    KI_ASSISTENT,
    {
      href: helpPageHref(accountSlug),
      label: "Hilfe-Seite ansehen",
      icon: HELP_PAGE_ICON,
      match: () => false,
      external: true,
    },
    SETTINGS_ITEM,
    {
      href: STEPLY_HELP_HREF,
      label: "Steply-Hilfe",
      icon: STEPLY_HELP_ICON,
      match: () => false,
      external: true,
    },
  ];
}

/**
 * Globales Ereignis „Neue Anleitung öffnen“ (⌘K-Aktion). Der Knopf in der
 * Kopfleiste hört darauf und öffnet denselben Dialog wie ein Klick.
 */
export const NEW_TUTORIAL_EVENT = "steply:new-tutorial";
