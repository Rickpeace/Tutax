// Lokale Suche der Hilfe-Seite (Runde 4): Umlaut-Schreibweisen und Wortreihenfolge egal.
// „Ubersicht“, „uebersicht“ und „Übersicht“ finden dasselbe, „strasse“ findet „Straße“,
// „portal passwort“ findet „Passwort im Portal ändern“. Clientsicher (keine Imports).

const DIGRAPH: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };
/** Kombinierende Akzentzeichen (nach NFD-Zerlegung). */
const COMBINING = /[̀-ͯ]/g;

/** Grundform: klein, ß→ss, Akzente/Umlaute weg (ü→u). */
function base(s: string): string {
  return s.toLowerCase().replace(/ß/g, "ss").normalize("NFD").replace(COMBINING, "");
}

/** Umschreibung: klein, ä→ae, ö→oe, ü→ue, ß→ss, übrige Akzente weg. */
function digraph(s: string): string {
  return s
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => DIGRAPH[c] ?? c)
    .normalize("NFD")
    .replace(COMBINING, "");
}

/**
 * Alltagswörter, die Mandanten statt der Fachbegriffe tippen (Runde 5: „Handy“ fand „Smartphone“
 * nicht, „Login“ nicht „Anmelden“). Klein halten — jede Gruppe gilt in beide Richtungen.
 */
const SYNONYMS: string[][] = [
  ["handy", "smartphone", "mobil", "telefon"],
  ["login", "anmelden", "anmeldung", "einloggen"],
  ["passwort", "kennwort", "pin"],
  ["hochladen", "upload", "senden", "schicken"],
  ["beleg", "rechnung", "quittung"],
  ["email", "e-mail", "mail"],
];

function variants(word: string): string[] {
  const b = base(word);
  const group = SYNONYMS.find((g) => g.some((s) => b.startsWith(s) || s.startsWith(b) && b.length >= 4));
  return group ? [word, ...group] : [word];
}

/** Passt die Suchanfrage (alle Wörter, beliebige Reihenfolge) auf einen der Texte? */
export function matchesQuery(query: string, texts: (string | null | undefined)[]): boolean {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = texts.filter(Boolean).join(" \n ");
  const hayBase = base(hay);
  const hayDigraph = digraph(hay);
  return words.every((w) =>
    variants(w).some((v) => {
      const b = base(v);
      const d = digraph(v);
      return hayBase.includes(b) || hayDigraph.includes(d) || hayDigraph.includes(b);
    }),
  );
}
