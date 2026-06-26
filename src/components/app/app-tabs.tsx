"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, BookOpen } from "lucide-react";

const tabs = [
  { href: "/app", label: "Tutorials", icon: Layers, match: (p: string) => p === "/app" || p.startsWith("/app/tutorials") },
  { href: "/app/knowledge", label: "Wissensdatenbank", icon: BookOpen, match: (p: string) => p.startsWith("/app/knowledge") },
];

export function AppTabs() {
  const path = usePathname();
  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-5xl gap-1 px-5">
        {tabs.map((t) => {
          const active = t.match(path);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-ink"
              }`}
            >
              <t.icon className="size-4" /> {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
