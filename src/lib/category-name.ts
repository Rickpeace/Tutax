// Kategorienamen: eine Regel für Anlegen (Editor-Auswahl, Sofort-Anleitung) und Umbenennen.
// Bewusst ohne "server-only" — der Umbenennen-Dialog prüft dieselbe Länge schon im Browser.

/** Höchstlänge eines Kategorienamens (Zeichen, nach dem Säubern). */
export const CATEGORY_NAME_MAX = 60;

/** Steuerzeichen raus, Leerraum zusammenfassen, außen trimmen (ohne zu kappen). */
export function cleanCategoryName(raw: string): string {
  return raw.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
}

/** Vergleichsschlüssel für „gibt es schon“ (Groß/Klein egal). */
export function categoryNameKey(name: string): string {
  return cleanCategoryName(name).toLocaleLowerCase("de-DE");
}

/** Fehlermeldungen (Server + Dialog sagen dasselbe). */
export const CATEGORY_NAME_EMPTY = "Bitte einen Namen eingeben.";
export const CATEGORY_NAME_TOO_LONG = `Der Name darf höchstens ${CATEGORY_NAME_MAX} Zeichen lang sein.`;
export const categoryNameTaken = (name: string) =>
  `Eine Kategorie „${name}“ gibt es schon. Bitte einen anderen Namen wählen.`;
