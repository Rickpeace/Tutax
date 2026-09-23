// Status-Chip für Automationen-Läufe (Welle 36). Reine Darstellung (server- wie
// clientseitig nutzbar) — mappt den Lauf-Status auf Label + warme Token-Farben.

const RUN_STATUS: Record<string, { label: string; className: string }> = {
  running: { label: "Läuft", className: "bg-blue-soft text-blue-text" },
  success: { label: "Erfolgreich", className: "bg-teal-soft text-teal-text" },
  aborted: { label: "Abgebrochen", className: "bg-amber-soft text-amber-text" },
  failed: { label: "Fehlgeschlagen", className: "bg-accent text-accent-foreground" },
};

/**
 * Ein Lauf, der nach so langer Zeit noch „running“ ist, hat sich nie zurückgemeldet (z. B.
 * Seitenleiste/Browser geschlossen, bevor v2.19.2 das Ende meldete) — er läuft sicher nicht mehr.
 */
export const STALE_RUN_MS = 60 * 60 * 1000;

/** Anzeige-Status: „running“ älter als STALE_RUN_MS gilt als „aborted“ (Abgebrochen). */
export function effectiveRunStatus(
  status: string,
  startedAt: string | null | undefined,
  now: number = Date.now(),
): string {
  if (status !== "running" || !startedAt) return status;
  const t = Date.parse(startedAt);
  return Number.isFinite(t) && now - t > STALE_RUN_MS ? "aborted" : status;
}

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
