"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ASSISTENT_TABS } from "@/components/app/nav-config";
import { cn } from "@/lib/utils";

/**
 * Reiter im KI-Assistenten als Pills (gleicher Stil wie die Kopfleiste: aktiv =
 * Ink-Pill, sonst 2px-Rahmen). Ziele kommen aus nav-config (eine Quelle mit ⌘K).
 */
export function AssistentNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Bereiche des KI-Assistenten"
      className="-mx-5 flex gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-5 pb-1 [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden"
    >
      {ASSISTENT_TABS.map((t) => {
        const active = t.match(path);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 px-3.5 py-1.5 text-[13px] font-extrabold transition-colors",
              active
                ? "border-ink bg-ink text-white"
                : "border-line bg-card text-ink-2 hover:border-[#e3d7c2] hover:text-ink",
            )}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
