// Lokale Hilfe-Seiten-Suche (Runde 4): Umlaute + Wortreihenfolge. Nutzung: node --experimental-strip-types scripts/test-search-match.mjs
const { matchesQuery } = await import("../src/lib/search-match.ts");
const t = ["Übersicht der Gebühren", "Straßenverzeichnis pflegen", "Passwort im Portal ändern"];
const cases = [
  ["Ubersicht", true], ["uebersicht", true], ["Übersicht", true], ["gebuehren", true], ["gebühren", true],
  ["strasse", true], ["Straße", true], ["Passwort ändern", true], ["portal passwort", true],
  ["passwort aendern", true], ["rechnung", false], ["portal rechnung", false], ["", true],
];
let bad = 0;
for (const [q, want] of cases) {
  const got = matchesQuery(q, t);
  console.log(`${got === want ? "✓" : "✗"} „${q}“ → ${got}`);
  if (got !== want) bad++;
}
console.log(bad ? `\n✗ ${bad} falsch.` : "\n✓ Suche: Umlaute + Wortreihenfolge korrekt.");
process.exit(bad ? 1 : 0);
