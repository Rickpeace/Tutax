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

/** Passt die Suchanfrage (alle Wörter, beliebige Reihenfolge) auf einen der Texte? */
export function matchesQuery(query: string, texts: (string | null | undefined)[]): boolean {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = texts.filter(Boolean).join(" \n ");
  const hayBase = base(hay);
  const hayDigraph = digraph(hay);
  return words.every((w) => {
    const b = base(w);
    const d = digraph(w);
    return hayBase.includes(b) || hayDigraph.includes(d) || hayDigraph.includes(b);
  });
}
