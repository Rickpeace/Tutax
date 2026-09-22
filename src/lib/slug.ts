/**
 * URL-tauglichen Slug aus beliebigem Text (mit deutschen Umlauten).
 *
 * WICHTIG (QA-Befund 09/2026): Es gibt KEINEN stillen Ersatzwert mehr. Bleibt nichts
 * Verwertbares übrig (Eingabe „###“), kommt ein LEERER String zurück — der Aufrufer
 * entscheidet, ob er ablehnt (Einstellungen → Adresse & Teilen) oder eine eigene,
 * stabile Ersatz-Adresse bildet (fallbackSlug). Früher wurde daraus überall „tutorial“:
 * die bisherige Adresse war weg und der Name „tutorial“ global belegt.
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/**
 * Stabile Ersatz-Adresse, wenn aus dem Text nichts Verwertbares wird. Leitet sich aus
 * einer vorhandenen Kennung (UUID) ab -> für dieselbe Sache immer dieselbe Adresse und
 * ohne Kollisionsgefahr mit anderen Einträgen.
 */
export function fallbackSlug(prefix: string, id: string): string {
  const short = id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "1";
  return `${slugify(prefix) || "eintrag"}-${short}`;
}

/** Meldung, wenn aus der Eingabe keine Adresse wird (Formular + Server sagen dasselbe). */
export const SLUG_UNUSABLE = "Bitte Buchstaben oder Zahlen verwenden.";
