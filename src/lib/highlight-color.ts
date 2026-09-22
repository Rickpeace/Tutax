// Markierungsfarben (Welle 51a, Kundenwunsch „Rahmen in der Firmenfarbe“).
//
// Eine Markierung (Rechteck/Kreis/Pfeil) in der STANDARD-Farbe erscheint beim Anzeigen in der
// Akzentfarbe des Kunden (`--brand-accent`, gesetzt über brandStyle() auf /h und in der Vorschau).
// Bewusst gewählte andere Farben bleiben, wie der Autor sie gesetzt hat. Es werden KEINE Daten
// umgeschrieben — die Entscheidung fällt allein beim Rendern.
//
// Als „Standard“ gelten:
//   - keine Farbe gespeichert (ältere Markierungen),
//   - #ef6a4e: Standard der Sofort-Anleitung (GUIDE_HIGHLIGHT_COLOR) und neues Editor-Feld „Firmenfarbe“,
//   - #111827: bisherige Voreinstellung des Editors (erstes Farbfeld, wurde nie bewusst gewählt).
// Wer im Editor bewusst Dunkel will, bekommt jetzt #33291f (Tinte) — das bleibt dunkel.
// Clientsicher (kein server-only), damit Editor und Viewer dieselbe Regel nutzen.

/** Gespeicherter Wert für „Standard / Firmenfarbe“. */
export const DEFAULT_HIGHLIGHT_COLOR = "#ef6a4e";

const DEFAULT_SET = new Set([DEFAULT_HIGHLIGHT_COLOR, "#111827"]);

export function isDefaultHighlightColor(color: string | null | undefined): boolean {
  if (!color) return true;
  return DEFAULT_SET.has(color.trim().toLowerCase());
}

/** CSS-Farbe für Strich/Pfeilspitze: Standard ⇒ Kunden-Akzent (Fallback Koralle). */
export function markColor(color: string | null | undefined): string {
  return isDefaultHighlightColor(color) ? `var(--brand-accent, ${DEFAULT_HIGHLIGHT_COLOR})` : color!;
}

/** Stabiler Schlüssel je Farbe für SVG-Marker-IDs (Pfeilspitzen). */
export function markColorKey(color: string | null | undefined): string {
  return isDefaultHighlightColor(color) ? "default" : color!.replace(/[^a-zA-Z0-9]/g, "");
}
