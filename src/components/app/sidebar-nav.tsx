"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "@/components/app/nav-config";

/**
 * Sidebar-Navigation (Welle 21). Statisch verdrahtet über NAV_SECTIONS; die aktive
 * Markierung + der Klick-Spinner kommen clientseitig (usePathname / useLinkStatus),
 * damit die Nav im PPR-Shell stehen bleibt und beim Klick sofort reagiert.
 *
 * `onNavigate` schließt (optional) das mobile Sheet nach einem Klick.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <p className="px-3 font-display text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {section.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={item.match}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

/**
 * Ein Nav-Eintrag mit aktivem Indigo-Bälkchen + sofortigem Klick-Spinner.
 * Aktiv-Status wird intern aus dem Pfad bestimmt (`isActive`-Prädikat) — so muss
 * kein `usePathname`-Wert durch Server-Komponenten gereicht werden.
 */
export function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  onNavigate,
  target,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Prädikat gegen den aktuellen Pfad (Default: exakter/Prefix-Match auf href). */
  isActive?: (p: string) => boolean;
  onNavigate?: () => void;
  target?: string;
}) {
  const path = usePathname();
  const active = isActive
    ? isActive(path)
    : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      target={target}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
        active
          ? "bg-accent text-primary before:absolute before:top-1/2 before:left-0 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary before:content-['']"
          : "text-ink-2 hover:bg-muted hover:text-ink",
      )}
    >
      <NavIcon icon={Icon} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** Innerhalb des Links: Spinner statt Icon, solange die Navigation pendelt. */
function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <Loader2 className="size-4 shrink-0 animate-spin" />
  ) : (
    <Icon className="size-4 shrink-0" />
  );
}
