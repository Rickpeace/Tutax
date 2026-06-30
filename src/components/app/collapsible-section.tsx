"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Einklappbare Sektion für das Dashboard (Tutorials nach Kategorie).
 * Der Toggle ist ein eigener Button, damit eine optionale Aktion (z. B.
 * "Neues Tutorial") im Header anklickbar bleibt, ohne ein-/auszuklappen.
 * Der zuletzt gewählte Zustand wird – falls `storageKey` gesetzt ist –
 * in `localStorage` gemerkt. Standardmäßig offen.
 */
export function CollapsibleSection({
  title,
  count,
  storageKey,
  defaultOpen = true,
  action,
  icon,
  variant = "primary",
  children,
}: {
  title: ReactNode;
  count?: number;
  storageKey?: string;
  defaultOpen?: boolean;
  action?: ReactNode;
  icon?: ReactNode;
  variant?: "primary" | "sub";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // localStorage erst nach dem Mount lesen, damit Server- und erstes
  // Client-Rendering identisch sind (keine Hydration-Mismatches).
  useEffect(() => {
    if (!storageKey) return;
    try {
      const v = localStorage.getItem(storageKey);
      if (v !== null) setOpen(v === "1");
    } catch {
      /* localStorage nicht verfügbar – Standard beibehalten */
    }
  }, [storageKey]);

  const toggle = () =>
    setOpen((o) => {
      const next = !o;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, next ? "1" : "0");
        } catch {
          /* ignorieren */
        }
      }
      return next;
    });

  const isPrimary = variant === "primary";

  return (
    <section>
      <div
        className={
          isPrimary
            ? "mb-3 flex items-center justify-between gap-3 border-b border-line-2 pb-1.5"
            : "mb-2 flex items-center justify-between gap-3"
        }
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
            aria-hidden
          />
          {icon}
          {isPrimary ? (
            <h2 className="flex items-center gap-2 truncate text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {title}
              {typeof count === "number" && (
                <span className="rounded-full bg-line-2 px-1.5 text-[11px] font-bold text-muted-foreground">
                  {count}
                </span>
              )}
            </h2>
          ) : (
            <h3 className="flex items-center gap-2 truncate text-xs font-bold uppercase tracking-wide text-muted-foreground/80">
              {title}
              {typeof count === "number" && (
                <span className="rounded-full bg-line-2 px-1.5 text-[10px] font-bold text-muted-foreground">
                  {count}
                </span>
              )}
            </h3>
          )}
        </button>
        {action}
      </div>
      {open && children}
    </section>
  );
}
