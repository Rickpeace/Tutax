"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  // Wissensdatenbank ist auch auf Unterpfaden (z. B. /app/assistent/wissen/<id>) aktiv.
  {
    href: "/app/assistent/wissen",
    label: "Wissensdatenbank",
    match: (p: string) => p.startsWith("/app/assistent/wissen"),
  },
  {
    href: "/app/assistent/fragen",
    label: "Offene Fragen",
    match: (p: string) => p === "/app/assistent/fragen",
  },
  {
    href: "/app/assistent/eskalation",
    label: "Kontakt & Eskalation",
    match: (p: string) => p === "/app/assistent/eskalation",
  },
];

export function AssistentNav() {
  const path = usePathname();
  return (
    <div className="mt-4 flex gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain border-b border-border [touch-action:pan-x]">
      {tabs.map((t) => {
        const active = t.match(path);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
