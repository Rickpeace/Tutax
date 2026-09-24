// Welle 54 — Headless-Beweis: der eingetippte Wert reist als step.typed_value mit, AUSSER bei
// sensiblen Feldern. Lädt die ECHTE extension/content.js in echtes Chromium (Muster
// test-guide-capture-plus.mjs, chrome-Stub sammelt alle Nachrichten) und prüft je Feld:
//   gesendet:  normales Textfeld, kurzer Chat (contenteditable), langes input (auf 80 gekürzt)
//   NICHT:     type=password, autocomplete cc-*/one-time-code/current-password/new-password,
//              [data-steply-sensitive] (am Feld und am Vorfahren), sensible Beschriftung (IBAN,
//              API-Key als placeholder), langer Rich-Editor/textarea (> 80); Audit 24.09.: Steuer-/
//              Personal-Kennungen an Beschriftung ODER Wert (+ Verpixelungsvorschlag), Auswahlliste
//              schickt den Optionstext, <h1> ist nie der Feldname
//   + der geheime Wert taucht in KEINER Nachricht auf (auch nicht in Label/Selektor).
//
// Nutzung:  node scripts/test-guide-typed-capture.mjs   (kein .env; Playwright aus STEPLY_PW_DIR/npx-Cache)
import { createRequire } from "node:module";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolvePlaywright() {
  if (process.env.STEPLY_PW_DIR) {
    const p = path.join(process.env.STEPLY_PW_DIR, "node_modules", "playwright");
    if (existsSync(p)) return require(p);
  }
  try {
    return require("playwright");
  } catch {
    /* npx-Cache */
  }
  const base = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
  const npxDir = path.join(base, "npm-cache", "_npx");
  if (existsSync(npxDir)) {
    for (const d of readdirSync(npxDir)) {
      const p = path.join(npxDir, d, "node_modules", "playwright");
      if (existsSync(p)) return require(p);
    }
  }
  throw new Error("playwright nicht gefunden.");
}

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CONTENT_JS = readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");

const STUB = `<script>
  window.__msgs = [];
  window.chrome = {
    runtime: {
      lastError: undefined,
      getManifest: function () { return { version: "2.18.3" }; },
      sendMessage: function (m) { window.__msgs.push(JSON.parse(JSON.stringify(m))); return Promise.resolve(undefined); },
      onMessage: { addListener: function () {} },
    },
    storage: {
      local: { get: function (key, cb) { cb({ rec: { startedAt: Date.now(), mode: "guide", nonce: "n1" } }); } },
      onChanged: { addListener: function () {} },
    },
    tabs: { sendMessage: function () {} },
  };
</script>`;

const LONG = "Sehr geehrte Damen und Herren, anbei sende ich Ihnen die Unterlagen für das Quartal drei.";
const HTML = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">${STUB}
<style>body{font:14px sans-serif} div,label{display:block;margin:4px 0}</style></head><body>
  <button id="away">Weiter</button>
  <label for="q">Suchbegriff</label><input id="q" type="text">
  <label for="pw">Zugang</label><input id="pw" type="password">
  <label for="cc">Nummer</label><input id="cc" type="text" autocomplete="cc-number">
  <label for="otp">Code</label><input id="otp" type="text" autocomplete="one-time-code">
  <label for="np">Neu</label><input id="np" type="text" autocomplete="section-a new-password">
  <label for="cp">Alt</label><input id="cp" type="text" autocomplete="current-password">
  <label for="opt">Kundennr</label><input id="opt" type="text" data-steply-sensitive>
  <div data-steply-sensitive><label for="inner">Notiz intern</label><input id="inner" type="text"></div>
  <label for="iban">IBAN</label><input id="iban" type="text">
  <input id="key" type="text" placeholder="API-Key">
  <label for="longin">Betreff</label><input id="longin" type="text">
  <label for="ta">Nachricht</label><textarea id="ta"></textarea>
  <div id="chat" contenteditable="true" aria-label="Chat" style="border:1px solid #999;min-height:20px"></div>
  <div id="rich" contenteditable="true" aria-label="Brief" style="border:1px solid #999;min-height:20px"></div>
  <label for="sel">Land</label><select id="sel"><option>DE</option><option>AT</option></select>
  <select id="selnolabel"><option>Bitte wählen</option><option>Monatlich</option></select>
  <label for="selbirth">Geburtsdatum (Jahr)</label><select id="selbirth"><option>1970</option><option>1980</option></select>
  <div id="labelcases">
  <label for="stnr">Steuernummer</label><input id="stnr" type="text">
  <label for="stid">Steuer-ID</label><input id="stid" type="text">
  <label for="idnr">IdNr</label><input id="idnr" type="text">
  <label for="ust">USt-IdNr.</label><input id="ust" type="text">
  <label for="svn">SV-Nummer</label><input id="svn" type="text">
  <label for="rvn">Rentenversicherungsnummer</label><input id="rvn" type="text">
  <label for="kvn">Krankenversicherungsnummer</label><input id="kvn" type="text">
  <label for="geb">Geburtsdatum</label><input id="geb" type="text">
  <label for="pa">Personalausweisnummer</label><input id="pa" type="text">
  <label for="rp">Reisepass</label><input id="rp" type="text">
  <label for="pin">PIN</label><input id="pin" type="text">
  <label for="tan">TAN</label><input id="tan" type="text">
  </div>
  <label for="bestand">Bestand</label><input id="bestand" type="text">
  <label for="nr">Nummer</label><input id="nr" type="text">
  <section id="mandanten">
    <div class="head"><h1>Mandantenliste</h1></div>
    <div class="toolbar"><div class="search"><input id="msearch" type="text" placeholder="Mandant suchen"></div></div>
  </section>
</body></html>`;

let browser;
try {
  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  // Hoch genug, dass alle Felder sichtbar bleiben (Verpixelung erfasst nur Sichtbares).
  const ctx = await browser.newContext({ viewport: { width: 900, height: 2000 } });
  await ctx.route("http://typed.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: HTML }),
  );
  const page = await ctx.newPage();
  await page.goto("http://typed.test/page.html", { waitUntil: "load" });
  await page.addScriptTag({ content: CONTENT_JS });
  await sleep(100);

  const steps = () =>
    page.evaluate(() => window.__msgs.filter((m) => m.type === "steply-guide-step").map((m) => m.step));
  const reset = () => page.evaluate(() => (window.__msgs.length = 0));

  /** Feld anklicken, Wert tippen, per Klick verlassen -> den Eingabe-Schritt zurückgeben. */
  async function typeInto(sel, value) {
    await reset();
    await page.click(sel);
    await page.keyboard.type(value, { delay: 0 });
    await page.click("#away");
    await sleep(60);
    const st = await steps();
    return { step: st.find((s) => s.action === "type"), raw: JSON.stringify(await page.evaluate(() => window.__msgs)) };
  }

  // Liegt im sensitive-Array ein Rechteck genau auf dem Feld des Schritts (step.rect)?
  const coversField = (step) =>
    !!step &&
    Array.isArray(step.sensitive) &&
    step.sensitive.some((r) => Math.abs(r.x - step.rect.x) < 0.002 && Math.abs(r.y - step.rect.y) < 0.002);

  // ---- gesendet ----
  {
    const { step } = await typeInto("#q", "  account  ");
    ok(step && step.typed_value === "account", `Textfeld: Wert gesendet, getrimmt (${step && step.typed_value})`);
    ok(step && step.label === "Suchbegriff", "Textfeld: Label bleibt die Feldbeschriftung (nicht der Wert)");
  }
  {
    const { step } = await typeInto("#longin", "x".repeat(120));
    ok(step && step.typed_value.length === 80 && step.typed_value.endsWith("…"), `Langes input: auf 80 Zeichen gekürzt (${step && step.typed_value.length})`);
  }
  {
    const { step } = await typeInto("#chat", "Kurze Chatnachricht");
    ok(step && step.typed_value === "Kurze Chatnachricht", `Kurzer Rich-Text: Wert gesendet (${step && step.typed_value})`);
  }

  // ---- NICHT gesendet (Wert darf nirgends auftauchen) ----
  const secretCases = [
    ["#pw", "type=password"],
    ["#cc", "autocomplete=cc-number"],
    ["#otp", "autocomplete=one-time-code"],
    ["#np", "autocomplete=new-password"],
    ["#cp", "autocomplete=current-password"],
    ["#opt", "[data-steply-sensitive] am Feld"],
    ["#inner", "[data-steply-sensitive] am Vorfahren"],
    ["#iban", "sensible Beschriftung (IBAN)"],
    ["#key", "sensibler placeholder (API-Key)"],
  ];
  for (const [sel, name] of secretCases) {
    const secret = "Geheim" + sel.slice(1) + "4711";
    const { step, raw } = await typeInto(sel, secret);
    ok(!!step, `${name}: Eingabe-Schritt entsteht trotzdem`);
    ok(step && !("typed_value" in step), `${name}: KEIN typed_value`);
    ok(!raw.includes(secret), `${name}: Wert in keiner Nachricht`);
  }
  {
    const { step, raw } = await typeInto("#rich", LONG);
    ok(step && !("typed_value" in step) && !raw.includes("Quartal drei"), "Langer Rich-Editor (> 80): Wert weggelassen");
  }
  {
    const { step, raw } = await typeInto("#ta", LONG);
    ok(step && !("typed_value" in step) && !raw.includes("Quartal drei"), "Lange textarea (> 80): Wert weggelassen");
  }
  {
    await reset();
    await page.selectOption("#sel", "AT");
    await sleep(60);
    const st = await steps();
    const s = st.find((x) => x.action === "type");
    // Audit 24.09.: die gewählte Option reist als Wert mit (Titel „„AT“ in „Land“ …“).
    ok(s && s.typed_value === "AT" && s.label === "Land", `Auswahlliste: Optionstext als typed_value (${s && s.typed_value} / ${s && s.label})`);
  }
  {
    await reset();
    await page.selectOption("#selnolabel", "Monatlich");
    await sleep(60);
    const s = (await steps()).find((x) => x.action === "type");
    ok(s && !("typed_value" in s), `Auswahlliste ohne Beschriftung (Label = Option): kein doppelter Wert (${s && s.label})`);
  }
  {
    await reset();
    await page.selectOption("#selbirth", "1980");
    await sleep(60);
    const s = (await steps()).find((x) => x.action === "type");
    ok(s && !("typed_value" in s), "Sensible Auswahlliste (Geburtsdatum): kein typed_value");
  }

  // ---- Audit 24.09.: sensible Kennungen an der BESCHRIFTUNG ----
  const labelCases = [
    ["#stnr", "Steuernummer", "143/815/08154"],
    ["#stid", "Steuer-ID", "Wert4711a"],
    ["#idnr", "IdNr", "Wert4711b"],
    ["#ust", "USt-IdNr", "DE123456789"],
    ["#svn", "SV-Nummer", "Wert4711c"],
    ["#rvn", "Rentenversicherungsnummer", "Wert4711d"],
    ["#kvn", "Krankenversicherungsnummer", "Wert4711e"],
    ["#geb", "Geburtsdatum", "01.02.1980"],
    ["#pa", "Personalausweisnummer", "Wert4711f"],
    ["#rp", "Reisepass", "Wert4711g"],
    ["#pin", "PIN", "Wert4711h"],
    ["#tan", "TAN", "Wert4711i"],
  ];
  for (const [sel, name, secret] of labelCases) {
    const { step, raw } = await typeInto(sel, secret);
    ok(step && !("typed_value" in step), `${name}: KEIN typed_value`);
    ok(!raw.includes(secret), `${name}: Wert in keiner Nachricht`);
  }
  {
    // Rechteck-Vorschlag: das Steuernummer-Feld ist sichtbar → steht in sensitive.
    const { step } = await typeInto("#stnr", "x");
    ok(coversField(step), `Steuernummer-Feld: Verpixelungsvorschlag genau für dieses Feld (${step && JSON.stringify(step.sensitive)})`);
  }
  {
    // Kurzwort nur als ganzes Wort: „Bestand“ enthält „tan“, ist aber harmlos.
    const { step } = await typeInto("#bestand", "42 Stück");
    ok(step && step.typed_value === "42 Stück", `„Bestand“ ist nicht sensibel (${step && step.typed_value})`);
  }

  // ---- Audit 24.09.: sensible WERTE unter harmloser Beschriftung („Nummer“) ----
  // Die Beschriftungs-Fälle ausblenden: Die Verpixelung nimmt höchstens 10 Felder (größte zuerst)
  // — sonst fiele das Prüffeld aus der Liste.
  await page.evaluate(() => (document.getElementById("labelcases").style.display = "none"));
  const valueCases = [
    ["143/815/08154", "Steuernummer mit Schrägstrichen"],
    ["12/345/67890", "Steuernummer 2/3/5"],
    ["86095742719", "Steuer-ID 11 Ziffern (gültige Prüfziffer)"],
    ["65 170839 J 003", "SV-Nummer"],
    ["A123456780", "Krankenversichertennummer (gültige Prüfziffer)"],
    ["DE89 3704 0044 0532 0130 00", "IBAN in Gruppen"],
    ["4111 1111 1111 1111", "Kreditkarte (Luhn)"],
  ];
  for (const [secret, name] of valueCases) {
    const { step, raw } = await typeInto("#nr", secret);
    ok(step && !("typed_value" in step), `Wert-Muster ${name}: KEIN typed_value`);
    ok(!raw.includes(secret), `Wert-Muster ${name}: Wert in keiner Nachricht`);
    ok(coversField(step), `Wert-Muster ${name}: Verpixelungsvorschlag genau für dieses Feld`);
    await page.fill("#nr", "");
    await page.click("#away"); // Feld verlassen (sonst zählt das Leeren als nächster Schritt)
  }
  {
    // Harmlose Werte bleiben: Telefonnummer (beginnt mit 0), Datum, kurze Zahl, 12 Ziffern.
    for (const harmless of ["0170 1234567", "24.09.2026", "4711", "123456789012"]) {
      const { step } = await typeInto("#nr", harmless);
      ok(step && step.typed_value === harmless, `Harmloser Wert „${harmless}“ bleibt (${step && step.typed_value})`);
      await page.fill("#nr", "");
      await page.click("#away");
    }
  }

  // ---- Audit 24.09.: Seitenüberschrift (h1) ist nicht der Feldname ----
  {
    const { step } = await typeInto("#msearch", "Müller");
    ok(step && step.label === "Mandant suchen", `Suchfeld unter <h1>: Platzhalter als Feldname (${step && step.label})`);
  }
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Eingetippter Wert: gesendet nur bei unkritischen Feldern.");
process.exit(failed ? 1 : 0);
