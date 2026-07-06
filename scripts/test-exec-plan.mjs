// Pure Node-Tests für extension/exec-plan.js (Welle 36b, Automationen-Ausführ-Engine).
// KEIN Browser, KEIN Netz, KEINE npm-Pakete — das Modul ist pur (UMD via module.exports).
// Deckt ab: buildRunPlan (Reihenfolge, Wert-Auflösung, Pflichtfeld-Fehler, Datenschutz der
// Fehlermeldung), needsNavigation (Host/Pfad), redactDetail (Token/Werte schwärzen).
//
// Nutzung:  node scripts/test-exec-plan.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildRunPlan, needsNavigation, redactDetail, submitOutcome, submitBounced } = require("../extension/exec-plan.js");

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

// ══════════ buildRunPlan ══════════
{
  const automation = {
    id: "a1",
    title: "Belege laden",
    site_domains: ["datev.de"],
    params: [
      { key: "user", label: "Benutzer", type: "text", required: true },
      { key: "pass", label: "Passwort", type: "secret", required: true },
      { key: "note", label: "Notiz", type: "text", required: false },
    ],
  };
  // Absichtlich UNSORTIERT (position 2,0,1) — buildRunPlan muss ordnen.
  const steps = [
    { id: "s2", position: 2, title: "Absenden", action: "click", selector: { css: "#go" }, page_url: "https://datev.de/x" },
    { id: "s0", position: 0, title: "Benutzer", action: "fill", selector: { css: "#u" }, page_url: "https://datev.de/login", param_key: "user" },
    { id: "s1", position: 1, title: "Passwort", action: "fill", selector: { css: "#p" }, page_url: "https://datev.de/login", param_key: "pass", imageUrl: "x.webp" },
  ];
  const values = { user: "richard", pass: "geheim", note: "" };
  const plan = buildRunPlan(automation, steps, values);

  ok(plan.length === 3, "buildRunPlan: drei Aktionen");
  ok(plan[0].title === "Benutzer" && plan[1].title === "Passwort" && plan[2].title === "Absenden", "buildRunPlan: nach position sortiert");
  ok(plan[0].index === 0 && plan[2].index === 2, "buildRunPlan: index gesetzt");
  ok(plan[0].total === 3, "buildRunPlan: total gesetzt");
  ok(plan[0].value === "richard" && plan[1].value === "geheim", "buildRunPlan: Werte aufgelöst (aus values)");
  ok(!("value" in plan[2]), "buildRunPlan: Schritt ohne param_key hat keinen value");
  ok(plan[1].imageUrl === "x.webp" && plan[0].imageUrl === null, "buildRunPlan: imageUrl durchgereicht (sonst null)");
  ok(plan[0].param_key === "user" && plan[2].param_key === null, "buildRunPlan: param_key durchgereicht");
}

// Pflichtfeld fehlt → wirft; Meldung enthält den Schlüssel/Label, aber NIE einen Wert.
{
  const automation = { id: "a", params: [{ key: "pass", label: "Passwort", type: "secret", required: true }] };
  let threw = false;
  let msg = "";
  try {
    buildRunPlan(automation, [{ id: "s", position: 0, action: "fill", param_key: "pass" }], {});
  } catch (e) {
    threw = true;
    msg = e.message;
  }
  ok(threw, "buildRunPlan: fehlender Pflicht-Parameter wirft");
  ok(msg.includes("Passwort"), "buildRunPlan: Fehlermeldung nennt das Label");
  ok(!msg.toLowerCase().includes("geheim"), "buildRunPlan: Fehlermeldung enthält keinen Wert");
}

// Leerer String zählt als fehlend (required); optionaler leerer Wert ist ok.
{
  const automation = { id: "a", params: [{ key: "u", label: "U", required: true }, { key: "n", label: "N", required: false }] };
  let threw = false;
  try {
    buildRunPlan(automation, [], { u: "", n: "" });
  } catch (e) {
    threw = true;
  }
  ok(threw, "buildRunPlan: leerer Pflicht-Wert zählt als fehlend");
  ok(buildRunPlan(automation, [], { u: "x", n: "" }).length === 0, "buildRunPlan: gefülltes Pflichtfeld + leeres Optional → ok");
}

// Ohne Parameter/ohne Steps robust.
ok(buildRunPlan(null, null, null).length === 0, "buildRunPlan: alles null → leere Liste");
ok(buildRunPlan({ id: "a" }, [{ id: "s", position: 0, action: "click" }], {}).length === 1, "buildRunPlan: Automation ohne params → ok");

// ══════════ needsNavigation ══════════
{
  const step = (u) => ({ page_url: u });
  ok(needsNavigation("https://datev.de/login", step("https://datev.de/login")) === false, "needsNavigation: gleicher Host+Pfad → false");
  ok(needsNavigation("https://datev.de/login", step("https://datev.de/login?x=1#y")) === false, "needsNavigation: nur Query/Hash anders → false");
  ok(needsNavigation("https://datev.de/login/", step("https://datev.de/login")) === false, "needsNavigation: nachlaufender Slash egal → false");
  ok(needsNavigation("https://datev.de/login", step("https://datev.de/belege")) === true, "needsNavigation: anderer Pfad → true");
  ok(needsNavigation("https://datev.de/login", step("https://elster.de/login")) === true, "needsNavigation: anderer Host → true");
  ok(needsNavigation("https://datev.de/x", step("")) === false, "needsNavigation: kein page_url → false");
  ok(needsNavigation("https://datev.de/x", step("kein url")) === false, "needsNavigation: unparsebares Ziel → false");
  ok(needsNavigation("about:blank", step("https://datev.de/login")) === true, "needsNavigation: unbekannter aktueller Ort → true");
  ok(needsNavigation("https://DATEV.de/login", step("https://datev.de/login")) === false, "needsNavigation: Host case-insensitiv → false");
}

// ══════════ redactDetail ══════════
{
  ok(redactDetail(null) === "", "redactDetail: null → ''");
  ok(redactDetail("Schritt 4: Stelle nicht gefunden") === "Schritt 4: Stelle nicht gefunden", "redactDetail: harmloser Text bleibt (kurze Zahl bleibt)");
  ok(redactDetail("Kontakt richard@petrasch.com fehlt") === "Kontakt *** fehlt", "redactDetail: E-Mail geschwärzt");
  ok(redactDetail("Nummer 1234567890 abgelehnt") === "Nummer *** abgelehnt", "redactDetail: lange Ziffernkette geschwärzt");
  ok(redactDetail("Token sk-abc123XYZ890def eingesetzt") === "Token *** eingesetzt", "redactDetail: gemischtes Token geschwärzt");
  ok(redactDetail("IBAN DE44500105175407324931 falsch") === "IBAN *** falsch", "redactDetail: IBAN geschwärzt");
  ok(redactDetail("Hash deadbeefdeadbeefcafe stimmt nicht") === "Hash *** stimmt nicht", "redactDetail: langer Hex-Block geschwärzt");
  // Normale deutsche Wörter (auch längere) bleiben unangetastet.
  ok(redactDetail("Automatisierung abgeschlossen") === "Automatisierung abgeschlossen", "redactDetail: normale Wörter bleiben");
}

// ══════════ submitOutcome / submitBounced (Welle 38, Ehrlichkeits-Netz) ══════════
{
  const LOGIN = "https://app.steply.de/login";
  const ev = (...e) => e;

  // Richards Kaltstart-Bounce: Voll-Reload (loading→complete) zurück auf /login (mit ?next).
  const bounced = ev(
    { status: "loading" },
    { url: "https://app.steply.de/login?next=%2Fapp" },
    { status: "complete" },
  );
  ok(submitOutcome(LOGIN, bounced) === "bounced", "submitOutcome: Voll-Reload auf selben Pfad → bounced");
  ok(submitBounced(LOGIN, bounced) === true, "submitBounced: Bounce → true");

  // Erfolg per React-Client-Navigation: Pfad wechselt zu /app, KEIN Reload-Zyklus.
  const left = ev({ url: "https://app.steply.de/app" });
  ok(submitOutcome(LOGIN, left) === "left", "submitOutcome: Pfadwechsel (Client-Nav) → left");
  ok(submitBounced(LOGIN, left) === false, "submitBounced: Pfadwechsel → false");

  // Erfolg per Voll-Reload, der aber auf einen NEUEN Pfad landet (nativer POST → /app): left.
  const reloadAway = ev({ status: "loading" }, { url: "https://app.steply.de/app" }, { status: "complete" });
  ok(submitOutcome(LOGIN, reloadAway) === "left", "submitOutcome: Reload auf ANDEREN Pfad → left (Erfolg schlägt Bounce)");

  // Query/Hash-Wechsel allein ist KEIN Pfadwechsel (gleiche Seite) → kein „left".
  const sameQuery = ev({ status: "loading" }, { url: "https://app.steply.de/login?x=1" }, { status: "complete" });
  ok(submitOutcome(LOGIN, sameQuery) === "bounced", "submitOutcome: nur Query anders + Reload → bounced (selber Pfad)");

  // Flüchtige Zwischen-URL zählt nicht — maßgeblich ist die ZULETZT bekannte URL.
  const transient = ev(
    { status: "loading" },
    { url: "https://app.steply.de/app" },            // Zwischenschritt der Redirect-Kette
    { url: "https://app.steply.de/login?next=%2Fapp" }, // finaler Bounce zurück
    { status: "complete" },
  );
  ok(submitOutcome(LOGIN, transient) === "bounced", "submitOutcome: finale URL entscheidet (flüchtiges /app ignoriert) → bounced");

  // Kein Reload, kein Pfadwechsel (z. B. inline-Fehler auf gleicher Seite) → pending (nicht blockieren).
  ok(submitOutcome(LOGIN, ev()) === "pending", "submitOutcome: nichts passiert → pending");
  ok(submitOutcome(LOGIN, ev({ status: "loading" })) === "pending", "submitOutcome: nur loading, kein complete → pending");
  ok(submitBounced(LOGIN, ev()) === false, "submitBounced: pending → false (advance, kein Fehlalarm)");

  // Lone „complete" ohne vorangehendes „loading" ist KEIN Reload-Zyklus.
  ok(submitOutcome(LOGIN, ev({ status: "complete" })) === "pending", "submitOutcome: complete ohne loading → pending");

  // Unbekannter Ausgangs-Pfad (leere prevUrl) → nie bounced (nichts beweisbar).
  ok(submitOutcome("", bounced) === "pending", "submitOutcome: prevUrl unbekannt → pending (nie fälschlich bounced)");

  // Anderer Host + Reload = Pfadwechsel → left.
  const otherHost = ev({ status: "loading" }, { url: "https://elster.de/login" }, { status: "complete" });
  ok(submitOutcome(LOGIN, otherHost) === "left", "submitOutcome: anderer Host → left");

  // Robust gegen kaputte events.
  ok(submitOutcome(LOGIN, null) === "pending", "submitOutcome: events null → pending");
}

console.log(failed ? "\n✗ exec-plan Tests fehlgeschlagen." : "\n✓ exec-plan: buildRunPlan/needsNavigation/redactDetail/submitOutcome verifiziert.");
process.exitCode = failed ? 1 : 0;
