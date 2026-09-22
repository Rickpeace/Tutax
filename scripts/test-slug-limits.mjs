// Einheiten-Test ohne Netz und ohne Browser: Adress-Ableitung (lib/slug.ts) und die
// Längen-Grenzen frei eingegebener Texte (lib/text-limits.ts).
//
// Hintergrund (QA-Befund 09/2026): slugify() endete auf `|| "tutorial"`. Die Eingabe
// „###“ in Einstellungen → Adresse & Teilen wurde dadurch still zu „tutorial“ — die
// bisherige Adresse war weg und der Name global belegt. Jetzt kommt ein LEERER String
// zurück; wer eine Adresse BRAUCHT, bildet sich mit fallbackSlug() eine stabile.
//
// Nutzung:  node --experimental-strip-types scripts/test-slug-limits.mjs
import { slugify, fallbackSlug, SLUG_UNUSABLE } from "../src/lib/slug.ts";
import {
  ORG_NAME_MAX,
  GUIDE_TITLE_MAX,
  GUIDE_DESCRIPTION_MAX,
  AUTOMATION_TITLE_MAX,
  ORG_NAME_TOO_LONG,
} from "../src/lib/text-limits.ts";

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const eq = (got, want, m) => ok(got === want, `${m} (erwartet „${want}“, bekommen „${got}“)`);

console.log("--- slugify: normale Eingaben ---");
eq(slugify("Muster GmbH"), "muster-gmbh", "Leerzeichen werden zu Bindestrichen");
eq(slugify("Müller & Söhne"), "mueller-soehne", "Umlaute werden ausgeschrieben");
eq(slugify("Straße 1"), "strasse-1", "ß wird zu ss");
eq(slugify("  --Hallo--  "), "hallo", "Bindestriche außen fallen weg");
eq(slugify("Café Crème"), "cafe-creme", "Akzente werden entfernt");
eq(slugify("ABC 123"), "abc-123", "Großbuchstaben werden klein");

console.log("\n--- slugify: nichts Verwertbares -> LEER (kein Ersatzwert) ---");
for (const junk of ["###", "", "   ", "!!!", "---", "€£¥", "...", "?!", "\n\t"]) {
  eq(slugify(junk), "", `„${junk.replace(/\n/g, "\\n").replace(/\t/g, "\\t")}“ ergibt keine Adresse`);
}
ok(slugify("###") !== "tutorial", "Der alte stille Ersatzwert ist weg");

console.log("\n--- slugify: Länge ---");
const long = slugify("A".repeat(200));
ok(long.length <= 60, `Adresse wird auf 60 Zeichen gekürzt (${long.length})`);
const cut = slugify("ab " + "c".repeat(200));
ok(!cut.endsWith("-"), `Nach dem Kürzen kein Bindestrich am Ende („${cut.slice(-8)}“)`);

console.log("\n--- fallbackSlug: stabile Ersatz-Adresse ---");
const id = "9f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f";
eq(fallbackSlug("anleitung", id), "anleitung-9f1c2d3e", "Ersatz-Adresse aus Kennung");
eq(fallbackSlug("anleitung", id), fallbackSlug("anleitung", id), "Gleiche Kennung -> gleiche Adresse");
ok(
  fallbackSlug("anleitung", id) !== fallbackSlug("anleitung", "11111111-2222-3333-4444-555555555555"),
  "Verschiedene Kennungen -> verschiedene Adressen",
);
eq(slugify(fallbackSlug("anleitung", id)), fallbackSlug("anleitung", id), "Ersatz-Adresse ist selbst slug-tauglich");
eq(fallbackSlug("###", id), "eintrag-9f1c2d3e", "Auch ein unbrauchbares Präfix ergibt eine Adresse");

console.log("\n--- Meldungen ---");
ok(/Buchstaben oder Zahlen/i.test(SLUG_UNUSABLE), `Meldung nennt den Ausweg („${SLUG_UNUSABLE}“)`);
ok(/höchstens/i.test(ORG_NAME_TOO_LONG), `Längen-Meldung ist verständlich („${ORG_NAME_TOO_LONG}“)`);
ok(ORG_NAME_TOO_LONG.includes(String(ORG_NAME_MAX)), "Längen-Meldung nennt die Grenze");

console.log("\n--- Grenzen sind gesetzt ---");
ok(ORG_NAME_MAX === 80, `Name der Organisation: ${ORG_NAME_MAX} Zeichen`);
ok(GUIDE_TITLE_MAX === 120, `Titel einer Anleitung: ${GUIDE_TITLE_MAX} Zeichen`);
ok(GUIDE_DESCRIPTION_MAX === 160, `Kurzbeschreibung: ${GUIDE_DESCRIPTION_MAX} Zeichen`);
ok(AUTOMATION_TITLE_MAX === 120, `Name einer Automation: ${AUTOMATION_TITLE_MAX} Zeichen`);

console.log(failed ? "\n✗ FEHLGESCHLAGEN" : "\n✓ alle Prüfungen bestanden");
process.exit(failed ? 1 : 0);
