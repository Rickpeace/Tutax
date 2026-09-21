import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Einheitlicher Seitenkopf der Bereichsseiten (Anleitungen, Schulungen,
 * Automationen, KI-Assistent, Aktualität prüfen): H1 in 26px/Black, optional eine
 * kurze Erklärzeile darunter, eine Meta-Angabe neben dem Titel (z. B. Anzahl) und
 * Aktionen rechts. Reine Darstellung — server- wie clientseitig nutzbar.
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[26px] font-black leading-tight text-ink">{title}</h1>
          {meta ? (
            <span className="text-[13px] font-bold text-faint">{meta}</span>
          ) : null}
        </div>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm font-semibold text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
