// Welle 54 — Schritt-Texte der Sofort-Anleitung OHNE Füllsatz + eingetippter Wert (Server-Teil).
// OHNE Datenbank/Netz. Prüft:
//   D) einfacher Klick / Eingabe ohne Enter → LEERER Erklärtext; Text nur, wenn er etwas hinzufügt
//      (Seitenwechsel, Hover, Varianten, Datei, Enter, fehlende Beschriftung); mkBody("") sauber.
//   E) validateTypedValue: nur Eingabe-Schritte, Strings, Steuer-/Formatzeichen raus, ≤80,
//      sensible Beschriftung → verworfen; Titel/Text-Vorlagen mit/ohne Wert, zitat-sicher gekürzt.
//
// Nutzung:  node scripts/test-guide-typed-value.mjs
import { register } from "node:module";

const srcBase = JSON.stringify(new URL("../src/", import.meta.url).href);
const loader = `export async function resolve(s,c,n){if(s==='server-only'||s==='client-only'){return {url:'data:text/javascript,',shortCircuit:true};}if(s.startsWith('@/')){return n(new URL(s.slice(2)+'.ts',${srcBase}).href,c);}return n(s,c);}`;
register("data:text/javascript," + encodeURIComponent(loader), import.meta.url);

const { validateGuideSteps, validateTypedValue, templateTitle, templateBodyText, mkBody } = await import(
  "../src/lib/guide.ts"
);

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const eq = (a, b, m) => ok(a === b, `${m}: ${JSON.stringify(a)}${a === b ? "" : ` (erwartet ${JSON.stringify(b)})`}`);
const quotesPaired = (s) => (s.match(/„/g) || []).length === (s.match(/“/g) || []).length;

const base = { path: "acc/x.webp", rect: { x: 0, y: 0, w: 0.1, h: 0.1 }, url: "https://app.example/", title: "App", w: 100, h: 100 };
const step = (over) => validateGuideSteps([{ ...base, label: "Speichern", action: "click", ...over }], "acc")[0];

// ── D) Kein Fülltext ─────────────────────────────────────────────────────────
{
  const click = step({});
  eq(templateTitle(click, 0), "Klicken Sie auf „Speichern“", "Klick: Titel");
  eq(templateBodyText(click, click), "", "Klick ohne Seitenwechsel: leerer Text");
  const other = { ...click, title: "Start" };
  eq(templateBodyText(click, other), "Auf der Seite „App“: Klicken Sie auf „Speichern“.", "Klick mit Seitenwechsel: Kontext");
  eq(templateBodyText(step({ label: "" }), click), "Klicken Sie auf die markierte Stelle.", "Klick ohne Beschriftung: Hinweis bleibt");
  const dl = step({ file_meta: { role: "download", filename: "a.pdf" } });
  eq(templateBodyText(dl, dl), "Klicken Sie auf „Speichern“ — dabei wird eine Datei heruntergeladen.", "Download: Hinweis");
  const up = step({ file_meta: { role: "upload", filename: "a.pdf" } });
  eq(templateBodyText(up, up), "Legen Sie die Datei „a.pdf“ in dieses Feld.", "Upload: Hinweis");
  const right = step({ interaction: { variant: "right" } });
  eq(templateBodyText(right, right), "Klicken Sie mit der rechten Maustaste auf „Speichern“.", "Rechtsklick: Text bleibt");
  const hov = step({ interaction: { hover: { text: "Datei" }, hoverLabel: "Datei" } });
  ok(templateBodyText(hov, hov).startsWith("Fahren Sie mit der Maus über „Datei“"), "Hover: Text bleibt");
  const typeNoEnter = step({ action: "type", label: "Suche" });
  eq(templateBodyText(typeNoEnter, typeNoEnter), "", "Eingabe ohne Wert, ohne Enter: leerer Text");
  const typeHover = step({ action: "type", label: "Suche", interaction: { hover: { text: "Mehr" }, hoverLabel: "Mehr" } });
  eq(templateBodyText(typeHover, typeHover), "Fahren Sie zuerst mit der Maus über „Mehr“.", "Hover + Eingabe ohne Enter: nur Hover-Satz");
  eq(templateBodyText(step({ action: "type", label: "" }), click), "Füllen Sie das markierte Feld aus.", "Eingabe ohne Beschriftung: Hinweis");
  const empty = mkBody("");
  ok(
    empty.type === "doc" && empty.content.length === 1 && empty.content[0].content.length === 0,
    "mkBody(\"\"): gültiges Doc mit leerem Absatz",
  );
}

// ── E) Wert-Validierung ─────────────────────────────────────────────────────
{
  eq(validateTypedValue("  account  ", "type", "Suche"), "account", "trim");
  eq(validateTypedValue("a\u0000b​c\nd", "type", "Suche"), "a b c d", "Steuer-/Formatzeichen raus");
  eq(validateTypedValue("x", "click", "Suche"), undefined, "nur bei Eingabe-Schritten");
  eq(validateTypedValue(42, "type", "Suche"), undefined, "nur Strings");
  eq(validateTypedValue("   ", "type", "Suche"), undefined, "leer → weg");
  const long = "x".repeat(200);
  const lv = validateTypedValue(long, "type", "Notiz");
  ok(lv.length === 80 && lv.endsWith("…"), `≤80 Zeichen (${lv.length})`);
  for (const lbl of ["Passwort", "API-Key", "IBAN", "Kreditkartennummer", "PIN", "TAN", "Einmal-Code", "One-time code", "CVC"]) {
    eq(validateTypedValue("geheim123", "type", lbl), undefined, `sensible Beschriftung „${lbl}“ → Wert verworfen`);
  }
  eq(validateTypedValue("Berlin", "type", "Pinnwand-Titel"), "Berlin", "„Pinnwand“ ist nicht sensibel (PIN nur als Wort)");
  // Durch validateGuideSteps: Klick-Schritt verliert typed_value, Eingabe behält ihn.
  const [c, t] = validateGuideSteps(
    [
      { ...base, label: "Los", action: "click", typed_value: "abc" },
      { ...base, label: "Search query", action: "type", typed_value: "account" },
    ],
    "acc",
  );
  ok(!("typed_value" in c), "Klick-Schritt: typed_value verworfen");
  eq(t.typed_value, "account", "Eingabe-Schritt: typed_value übernommen");
  const [pw] = validateGuideSteps([{ ...base, label: "Passwort", action: "type", typed_value: "hunter2" }], "acc");
  ok(!("typed_value" in pw), "Passwort-Feld: Server verwirft den Wert (zweites Netz)");
}

// ── E) Titel/Text mit und ohne Wert ─────────────────────────────────────────
{
  const withBoth = step({ action: "type", label: "Search query", typed_value: "account" });
  eq(templateTitle(withBoth, 0), "„account“ in „Search query“ eingeben", "Titel: Wert + Label");
  eq(templateBodyText(withBoth, withBoth), "", "Text: Wert ohne Enter → leer (Titel reicht)");
  const enter = step({ action: "type", label: "Search query", typed_value: "account", interaction: { enter: true } });
  eq(templateBodyText(enter, enter), "Geben Sie „account“ ein und bestätigen Sie mit Enter.", "Text: Wert + Enter");
  const noLabel = step({ action: "type", label: "", typed_value: "account" });
  eq(templateTitle(noLabel, 2), "„account“ eingeben", "Titel: Wert ohne Label");
  // Auswahlliste (Erweiterungs-Audit 24.09.): gewählte Option = Beschriftung = Wert.
  const choice = step({ action: "type", label: "Option 2", typed_value: "Option 2", selector: { css: "#dropdown", role: "combobox", text: "Option 2" } });
  eq(templateTitle(choice, 0), "„Option 2“ auswählen", "Titel: Auswahlliste");
  const combo = step({ action: "type", label: "Stadt", typed_value: "Berlin", selector: { css: "#city", role: "combobox" } });
  eq(templateTitle(combo, 0), "„Berlin“ in „Stadt“ eingeben", "Titel: Such-Combobox bleibt Eingabe");
  const noValue = step({ action: "type", label: "Search query" });
  eq(templateTitle(noValue, 0), "Feld „Search query“ ausfüllen", "Titel: ohne Wert");
  const ctx = step({ action: "type", label: "Search query", typed_value: "account" });
  eq(templateBodyText(ctx, { ...ctx, title: "Start" }), "Auf der Seite „App“: Geben Sie „account“ ein.", "Text: Wert + Seitenwechsel");

  const longV = step({
    action: "type",
    label: "Beschreibung des Mandanten für die Buchhaltung",
    typed_value: "Quartalsabschluss für die Mustermann GmbH und Co. KG",
  });
  const lt = templateTitle(longV, 0);
  ok(lt.length <= 60 && quotesPaired(lt) && lt.endsWith("“ eingeben"), `Titel lang, zitat-sicher gekürzt: ${lt}`);
  const longOnly = step({ action: "type", label: "", typed_value: "x ".repeat(39) + "ende" });
  const lo = templateTitle(longOnly, 0);
  ok(lo.length <= 60 && quotesPaired(lo) && lo.endsWith("…“ eingeben"), `Titel nur langer Wert: ${lo}`);
  const longLabel = step({ action: "type", label: "Ein sehr langes Feld-Label, das kaum noch in den Titel passt" });
  const ll = templateTitle(longLabel, 0);
  ok(ll.length <= 60 && quotesPaired(ll) && ll.startsWith("Feld „"), `Titel ohne Wert, langes Label: ${ll}`);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Schritt-Texte + eingetippter Wert verifiziert.");
process.exit(failed ? 1 : 0);
