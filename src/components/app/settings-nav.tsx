"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/app/settings/branding", label: "Branding" },
  { href: "/app/settings/einbetten", label: "Einbetten" },
  { href: "/app/settings/konto", label: "Konto" },
  { href: "/app/settings/abo", label: "Abo" },
];

export function SettingsNav() {
  const path = usePathname();
  return (
    <div className="mt-4 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => {
        const active = path === t.href;
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
