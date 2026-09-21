import { Crown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Kleines „Business"-Etikett für Funktionen, die erst im Business-Tarif gehen. */
export function BusinessPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-[11px] font-black text-amber-text">
      <Crown className="size-3" /> Business
    </span>
  );
}

/**
 * Bausteine der Einstellungs-Seiten (Welle 50c): Seitenkopf (Gruppe als Brotkrume,
 * H1, Erklärzeile) und Karte (2px-Rahmen, rounded-card). Server-tauglich.
 */
export function SettingsHeader({
  group,
  title,
  lead,
  children,
}: {
  group: string;
  title: string;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid min-w-0 gap-1.5">
        <div className="text-[12.5px] font-extrabold text-muted-foreground">{group}</div>
        <h1 className="text-[26px] font-black leading-tight text-ink">{title}</h1>
        {lead && <p className="max-w-[64ch] text-sm text-ink-2">{lead}</p>}
      </div>
      {children}
    </div>
  );
}

export function SettingsCard({
  title,
  description,
  icon: Icon,
  aside,
  tone = "default",
  className = "",
  children,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** Rechts neben dem Titel (z. B. Badge). */
  aside?: React.ReactNode;
  tone?: "default" | "danger";
  className?: string;
  children?: React.ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`grid gap-3 rounded-card border-2 px-[18px] py-4 ${
        tone === "danger" ? "border-no/25 bg-no-soft/40" : "border-line bg-card"
      } ${className}`}
    >
      {(title || description) && (
        <div className="grid gap-1">
          {title && (
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className={`flex items-center gap-2 text-[15px] font-black ${
                  tone === "danger" ? "text-no" : "text-ink"
                }`}
              >
                {Icon && <Icon className="size-4 text-primary" strokeWidth={2.2} />}
                {title}
              </h2>
              {aside}
            </div>
          )}
          {description && <p className="text-sm text-ink-2">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Feld-Beschriftung im Stil des Entwurfs (12.5px, extrabold, ink-2). */
export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[12.5px] font-extrabold text-ink-2">
      {children}
    </label>
  );
}

/** Einheitliches Textfeld-Styling (2px, rounded-xl) für die Einstellungen. */
export const settingsInputClass =
  "h-10 w-full min-w-0 rounded-xl border-2 border-line bg-card px-3 text-sm font-bold text-ink outline-none transition-colors placeholder:font-semibold placeholder:text-faint focus-visible:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60";
