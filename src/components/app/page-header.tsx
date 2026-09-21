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
  sub,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Unter-Kopf innerhalb einer Seite (h2, 19px) — gleicher Stil, eine Stufe kleiner. */
  sub?: boolean;
}) {
  const Heading = sub ? "h2" : "h1";
  return (
    <div className={cn(sub ? "mb-3" : "mb-6", "flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Heading
            className={cn("font-black leading-tight text-ink", sub ? "text-[19px]" : "text-[26px]")}
          >
            {title}
          </Heading>
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
