"use client";

/** Einheitlicher „Auf Hilfe-Seite"-Schalter (eigene Tutorials + Standard-Anleitungen). */
export function HelpToggle({
  on,
  onToggle,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className="flex items-center gap-2 text-xs font-medium text-ink-2 disabled:opacity-50"
      title="Auf der Hilfe-Seite zeigen"
      aria-pressed={on}
    >
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-line"}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
      <span className="hidden sm:inline">Auf Hilfe-Seite</span>
    </button>
  );
}
