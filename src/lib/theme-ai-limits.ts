// Gemeinsame Grenzen der KI-Design-Routen (/api/theme/analyze + /api/theme/extreme).
// Beide teilen sich EINEN Stunden-Zähler pro Person (Vision-Aufrufe kosten).

export const THEME_RUN_KEY = "ai_theme_runs";
export const THEME_RUNS_PER_HOUR = 20;

export const THEME_FORBIDDEN =
  "Nur Inhaber und Bearbeiter der aktiven Organisation können das Design per KI übernehmen.";

export const THEME_RATE_LIMITED =
  "Die KI-Design-Analyse wurde in dieser Stunde schon sehr oft gestartet. Bitte versuchen Sie es später erneut.";
