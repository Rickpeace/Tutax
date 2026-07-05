"use client";

/** Einheitlicher „Auf Hilfe-Seite"-Schalter (eigene Tutorials + Standard-Anleitungen). */
export function HelpToggle({
  on,
  onToggle,
  disabled,
  label = "Auf Hilfe-Seite",
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className="flex items-center gap-2 text-xs font-semibold text-ink-2 disabled:opacity-50"
      title={label}
      aria-pressed={on}
    >
      {/* Label VOR dem Regler: rechtsbündig ausgerichtete Schalter sitzen so in
          jeder Karte an derselben Position, egal wie lang der Text ist. */}
      <span className="hidden sm:inline">{label}</span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-[#e3d7c2]"}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}
