"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid,
  Users,
  Palette,
  Link2,
  Languages,
  MessageCircle,
  Puzzle,
  CreditCard,
  UserRound,
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemberMode } from "@/components/app/member-mode";

type SettingsLink = { href: string; label: string; icon: LucideIcon };
type SettingsGroup = { label: string; links: SettingsLink[] };

/**
 * Struktur der Einstellungen (Welle 50c, Entwurf „App-Makeover" Abschnitt 2).
 * Routen sind verbindlich — andere Stellen (Extension-Seite, KI-Assistent, E-Mails)
 * verlinken sie direkt. Alte Routen (/branding, /einbetten, /konto, /abo) leiten um.
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Arbeitsbereich",
    links: [
      { href: "/app/settings/allgemein", label: "Allgemein", icon: LayoutGrid },
      { href: "/app/settings/team", label: "Team", icon: Users },
    ],
  },
  {
    label: "Hilfe-Seite",
    links: [
      { href: "/app/settings/aussehen", label: "Aussehen", icon: Palette },
      { href: "/app/settings/teilen", label: "Adresse & Teilen", icon: Link2 },
      { href: "/app/settings/sprachen", label: "Sprachen & Vorlesen", icon: Languages },
    ],
  },
  {
    label: "KI-Assistent",
    links: [{ href: "/app/settings/chat", label: "Chat auf Ihrer Website", icon: MessageCircle }],
  },
  {
    label: "Integrationen",
    links: [{ href: "/app/settings/erweiterung", label: "Steply-Erweiterung", icon: Puzzle }],
  },
  {
    label: "Abrechnung",
    links: [{ href: "/app/settings/tarif", label: "Tarif", icon: CreditCard }],
  },
  {
    label: "Persönlich",
    links: [{ href: "/app/settings/profil", label: "Mein Profil", icon: UserRound }],
  },
];

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

/** Mitarbeiter (nur Schulungen) sehen nur „Persönlich" (Profil). */
function useGroups(): SettingsGroup[] {
  const member = useMemberMode();
  return member ? SETTINGS_GROUPS.filter((g) => g.label === "Persönlich") : SETTINGS_GROUPS;
}

/** Desktop: linke Seitenleiste mit Gruppen-Überschriften. */
export function SettingsSidebar() {
  const path = usePathname();
  const groups = useGroups();
  return (
    <nav aria-label="Einstellungen" className="grid content-start gap-3.5">
      {groups.map((g) => (
        <div key={g.label}>
          <h5 className="mb-1 ml-2.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-faint">
            {g.label}
          </h5>
          {g.links.map((l) => {
            const active = isActive(path, l.href);
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[13px] font-extrabold transition-colors ${
                  active
                    ? "bg-card text-ink shadow-[0_1px_3px_rgba(51,41,31,0.10)]"
                    : "text-ink-2 hover:bg-card/60 hover:text-ink"
                }`}
              >
                <Icon className="size-3.5 shrink-0" strokeWidth={2.2} />
                {l.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * Mobil: eine Auswahl oben (natives Select → OS-Auswahlliste mit Gruppen). Kein
 * horizontales Scrollen, egal wie viele Bereiche es gibt.
 */
export function SettingsMobileNav() {
  const path = usePathname();
  const router = useRouter();
  const groups = useGroups();
  const current = groups.flatMap((g) => g.links).find((l) => isActive(path, l.href));
  const Icon = current?.icon ?? LayoutGrid;
  return (
    <label className="relative flex items-center gap-2.5 rounded-full border-2 border-line bg-card py-2 pl-3.5 pr-10 text-sm font-extrabold text-ink">
      <span className="sr-only">Bereich der Einstellungen wählen</span>
      <Icon className="size-4 shrink-0 text-primary" strokeWidth={2.2} />
      <span className="truncate">{current?.label ?? "Einstellungen"}</span>
      <ChevronDown className="pointer-events-none absolute right-3.5 size-4 text-muted-foreground" />
      <select
        aria-label="Bereich der Einstellungen"
        value={current?.href ?? ""}
        onChange={(e) => router.push(e.target.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      >
        {!current && <option value="">Einstellungen</option>}
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.links.map((l) => (
              <option key={l.href} value={l.href}>
                {l.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
