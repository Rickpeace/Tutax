// Status-Chip für Automationen-Läufe (Welle 36). Reine Darstellung (server- wie
// clientseitig nutzbar) — mappt den Lauf-Status auf Label + warme Token-Farben.

const RUN_STATUS: Record<string, { label: string; className: string }> = {
  running: { label: "Läuft", className: "bg-blue-soft text-blue-text" },
  success: { label: "Erfolgreich", className: "bg-teal-soft text-teal-text" },
  aborted: { label: "Abgebrochen", className: "bg-amber-soft text-amber-text" },
  failed: { label: "Fehlgeschlagen", className: "bg-accent text-accent-foreground" },
};

export function RunStatusBadge({ status }: { status: string }) {
  const s = RUN_STATUS[status] ?? {
    label: status,
    className: "bg-secondary text-ink-2",
  };
  return (
    <span className={`rounded-full px-2.5 py-[3px] font-extrabold ${s.className}`}>
      {s.label}
    </span>
  );
}
