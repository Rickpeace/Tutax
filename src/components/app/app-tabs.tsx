"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Layers, BookOpen, GraduationCap, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const tabs = [
  { href: "/app", label: "Tutorials", icon: Layers, match: (p: string) => p === "/app" || p.startsWith("/app/tutorials") },
  { href: "/app/knowledge", label: "Wissensdatenbank", icon: BookOpen, match: (p: string) => p.startsWith("/app/knowledge") },
  { href: "/app/lernen", label: "Lernen", icon: GraduationCap, match: (p: string) => p.startsWith("/app/lernen") },
];

/** Innerhalb des Links: zeigt beim Klick SOFORT einen Spinner (Pending), bevor die
 *  Navigation durch ist – der Tab reagiert unmittelbar. */
function TabLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  const { pending } = useLinkStatus();
  return (
    <>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />} {label}
    </>
  );
}

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
              <TabLabel icon={t.icon} label={t.label} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
