// Lokale Hilfe-Seiten-Suche (Runde 4): Umlaute + Wortreihenfolge. Nutzung: node --experimental-strip-types scripts/test-search-match.mjs
const { matchesQuery } = await import("../src/lib/search-match.ts");
const t = ["Übersicht der Gebühren", "Straßenverzeichnis pflegen", "Passwort im Portal ändern"];
const t2 = ["Belege mit dem Smartphone hochladen", "Im Mandantenportal anmelden"];
const cases = [
  ["Ubersicht", true], ["uebersicht", true], ["Übersicht", true], ["gebuehren", true], ["gebühren", true],
  ["strasse", true], ["Straße", true], ["Passwort ändern", true], ["portal passwort", true],
  ["passwort aendern", true], ["rechnung", false], ["portal rechnung", false], ["", true],
  // Synonyme (Runde 5)
  ["kennwort", true], ["login portal", false],
];
for (const [q, want] of [["Handy", true], ["login", true], ["Beleg handy", true], ["Kochrezept", false]]) cases.push([q, want, t2]);
let bad = 0;
for (const [q, want, texts] of cases) {
  const got = matchesQuery(q, texts ?? t);
  console.log(`${got === want ? "✓" : "✗"} „${q}“ → ${got}`);
  if (got !== want) bad++;
}
console.log(bad ? `\n✗ ${bad} falsch.` : "\n✓ Suche: Umlaute + Wortreihenfolge korrekt.");
process.exit(bad ? 1 : 0);
