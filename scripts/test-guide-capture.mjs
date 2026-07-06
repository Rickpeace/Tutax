// Headless-Beweis der content.js-Erfassungslogik (Welle 24), OHNE Netz/Server. Laedt die
// ECHTE extension/content.js in eine Mini-HTML-Seite (styled-components-artiges <style>-
// Kind, label->input, contenteditable, password, select, generierte id) in echtem Chromium
// und prueft:
//   1) Label-Hygiene: <style>-CSS laeuft NICHT ins Label (Richards Bug „…{background…").
//   2) Editierbarkeit: Klick auf <label> loest die Kontrolle auf -> KEIN Klick-Schritt;
//      contenteditable + password + select gelten als editierbar.
//   3) Blur-Reihenfolge: Tippen + direkt Klick -> Eingabe-Schritt VOR Klick-Schritt.
//   4) Datenschutz: getippte Werte (auch Passwoerter) landen NIE im Schritt/Label.
//   5) Selektor-Vorbau: { css, text, role }; generierte id (":r7:") wird NICHT als #id
//      genutzt; stabile id schon.
//
// Nutzung:  node scripts/test-guide-capture.mjs   (kein .env noetig)
// Playwright wird lokal ODER aus dem npx-Cache aufgeloest (Browser: ms-playwright-Cache).
import { createRequire } from "node:module";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolvePlaywright() {
  try {
    return require("playwright");
  } catch {
    /* nicht lokal installiert -> npx-Cache absuchen */
  }
  const base = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
  const npxDir = path.join(base, "npm-cache", "_npx");
  if (existsSync(npxDir)) {
    for (const d of readdirSync(npxDir)) {
      const p = path.join(npxDir, d, "node_modules", "playwright");
      if (existsSync(p)) return require(p);
    }
  }
  throw new Error("playwright nicht gefunden (weder lokal noch im npx-Cache).");
}

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

const CONTENT_JS = readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");

// Mini-Seite: Der Inline-<script>-Stub definiert chrome + __sent VOR dem Content-Script,
// damit content.js sich fuer den guide-Modus „scharf" schaltet und Schritte in __sent legt.
const HTML = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><style>
  body{font-family:sans-serif;padding:20px} button,input,select,#ce{display:block;margin:12px 0}
  #ce{border:1px solid #888;min-height:24px;padding:4px}
</style><script>
  window.__sent = [];
  window.__pairCalls = []; // Welle 25: zaehlt weitergereichte steply-pair-Nachrichten
  window.__openPanelCalls = 0; // v2.2.1: zaehlt steply-open-panel-Weiterleitungen
  window.__recordIntoCalls = []; // Welle 27: zaehlt weitergereichte steply-record-into-Nachrichten
  window.chrome = {
    runtime: {
      lastError: undefined,
      getManifest: function () { return { version: "2.2.0" }; },
      sendMessage: function (m) {
        if (m && m.type === "steply-guide-step") { window.__sent.push(m.step); return; }
        if (m && m.type === "steply-open-panel") { window.__openPanelCalls++; return; }
        if (m && m.type === "steply-record-into") { window.__recordIntoCalls.push(m); return; }
        if (m && m.type === "steply-pair") {
          window.__pairCalls.push(m);
          return Promise.resolve({ ok: true, account: "Testkonto" });
        }
        return Promise.resolve(undefined);
      },
      onMessage: { addListener: function () {} },
    },
    storage: {
      local: { get: function (key, cb) { cb({ rec: { startedAt: Date.now(), mode: "guide" } }); } },
      onChanged: { addListener: function () {} },
    },
    tabs: { sendMessage: function () {} },
  };
</script></head><body>
  <button id="scbtn" class="MagqMc ZFiwCf"><style>.MagqMc{background-color:#2c2e35;border:1px solid #000;color:#fff}.ZFiwCf{padding:6px 10px}</style>Weiter</button>

  <label for="email">E-Mail-Adresse</label>
  <input id="email" name="email" type="text">

  <div id="ce" contenteditable="true" aria-label="Notiz">start</div>

  <label>Passwort <input id="pw" type="password" name="passwort" placeholder="Passwort"></label>

  <select id="land" name="land">
    <option value="">Bitte waehlen</option>
    <option value="de">Deutschland</option>
    <option value="at">Oesterreich</option>
  </select>

  <label for="note">Notizfeld</label>
  <input id="note" name="note" type="text">

  <button id="save" name="save">Speichern</button>

  <button id=":r7:">Generierte ID</button>

  <div>
    <div>Telefon</div>
    <input id="tel" type="text" placeholder="+49 ...">
  </div>
  <input id="ort" type="text" placeholder="Ort">

  <section id="deadcard" style="border:1px solid #ccc;padding:12px">
    <h3>Eskalation</h3>
    <p id="deadtext">Nur erklaerender Text - diese Karte ist NICHT klickbar.</p>
  </section>
  <div id="card" style="cursor:pointer;border:1px solid #ccc;padding:12px">
    <span id="cardInner">Karte oeffnen</span>
  </div>
  <input id="esc" type="checkbox"><label for="esc">Eskalation aktivieren</label>
  <div>
    <div>Lautstaerke</div>
    <input id="vol" type="range" min="0" max="10" value="3">
  </div>

  <a id="ytcard" href="#" aria-label="I Tested the Cheapest Path to 96GB of VRAM for local AI by TechGuy 19 minutes 314,159 views" style="display:block;border:1px solid #ccc;padding:10px;text-decoration:none;color:inherit">
    <h3 style="margin:0">I Tested the Cheapest Path to 96GB of VRAM</h3>
    <span>TechGuy · 19 minutes · 314,159 views</span>
  </a>
</body></html>`;

let browser;
try {
  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  await page.setContent(HTML, { waitUntil: "load" });
  // Echtes Content-Script injizieren (IIFE liest den rec-Zustand sofort -> guide-Modus).
  await page.addScriptTag({ content: CONTENT_JS });
  ok(await page.evaluate(() => window.__steplyRecorderInstalled === true), "content.js installiert + guide-Modus scharf");

  const sent = () => page.evaluate(() => window.__sent.map((s) => ({ action: s.action, label: s.label, selector: s.selector, hasRect: !!s.rect })));
  const sentRaw = () => page.evaluate(() => JSON.stringify(window.__sent));
  const reset = () => page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); window.__sent.length = 0; });

  // ---------- 1) Label-Hygiene: <style>-CSS NICHT im Label ----------
  await reset();
  await page.click("#scbtn");
  {
    const s = await sent();
    ok(s.length === 1 && s[0].action === "click", `styled-Button: genau 1 Klick-Schritt (${s.length})`);
    const lbl = s[0]?.label || "";
    ok(lbl === "Weiter", `Label = „Weiter" (kein CSS-Text) (war „${lbl}")`);
    ok(!/[{}]|background-color|MagqMc/.test(lbl), "Label enthaelt KEINEN CSS-/Klassen-Text");
    ok(s[0]?.selector?.css === "#scbtn", `selector.css = „#scbtn" (war „${s[0]?.selector?.css}")`);
    ok(s[0]?.selector?.role === "button", "selector.role = button");
  }

  // ---------- 2) Klick auf <label> -> Kontrolle aufgeloest, KEIN Klick-Schritt ----------
  await reset();
  await page.click('label[for="email"]');
  {
    const s = await sent();
    ok(s.length === 0, `Klick auf <label> erzeugt KEINEN Schritt (Feld-Klick-Rauschen weg) (${s.length})`);
  }

  // ---------- 3) Tippen + direkt Klick -> Eingabe-Schritt VOR Klick-Schritt ----------
  // (email ist durch den Label-Klick bereits fokussiert.)
  await page.fill("#email", "hallo@example.test");
  await page.click("#save");
  {
    const s = await sent();
    ok(s.length === 2, `Eingabe + Klick -> 2 Schritte (${s.length})`);
    ok(s[0]?.action === "type" && s[1]?.action === "click", `Reihenfolge: type VOR click (${s.map((x) => x.action).join(",")})`);
    ok(s[0]?.label === "E-Mail-Adresse", `Eingabe-Label aus <label> = „E-Mail-Adresse" (war „${s[0]?.label}")`);
    ok(s[1]?.label === "Speichern", `Klick-Label = „Speichern" (war „${s[1]?.label}")`);
    ok(s[0]?.selector?.css === "#email" && s[0]?.selector?.role === "textbox", `email selector { #email, textbox } (war ${JSON.stringify(s[0]?.selector)})`);
    const raw = await sentRaw();
    ok(!raw.includes("hallo@example.test"), "DATENSCHUTZ: getippter Wert NICHT im Schritt-Payload");
  }

  // ---------- 4) contenteditable: editierbar, Label aus aria-label ----------
  await reset();
  await page.click("#ce");
  await page.keyboard.type("XYZ");
  await page.click("#save");
  {
    const s = await sent();
    ok(s.length === 2 && s[0].action === "type" && s[1].action === "click", `contenteditable: type dann click (${s.map((x) => x.action).join(",")})`);
    ok(s[0]?.label === "Notiz", `contenteditable-Label aus aria-label = „Notiz" (war „${s[0]?.label}")`);
  }

  // ---------- 5) Passwort: Label NIE aus Feldinhalt; Wert nie im Payload ----------
  await reset();
  await page.fill("#pw", "GeheimesPasswort123");
  await page.click("#save");
  {
    const s = await sent();
    ok(s.length === 2 && s[0].action === "type", "password: Eingabe-Schritt erzeugt");
    ok(s[0]?.label === "Passwort", `password-Label = „Passwort" (Label des <label>, kein Wert) (war „${s[0]?.label}")`);
    const raw = await sentRaw();
    ok(!raw.includes("GeheimesPasswort123"), "DATENSCHUTZ: Passwort NICHT im Payload");
  }

  // ---------- 6) blur-only (Tab, ohne folgenden Klick) -> Eingabe-Schritt ----------
  await reset();
  await page.focus("#note");
  await page.keyboard.type("hi");
  await page.keyboard.press("Tab");
  {
    const s = await sent();
    ok(s.length === 1 && s[0].action === "type", `blur via Tab -> genau 1 Eingabe-Schritt (${s.length})`);
    ok(s[0]?.label === "Notizfeld", `blur-Label aus <label> = „Notizfeld" (war „${s[0]?.label}")`);
  }

  // ---------- 7) native <select>: change -> Eingabe-Schritt (gewaehlte Option als Label) ----------
  await reset();
  await page.selectOption("#land", "de");
  {
    const s = await sent();
    ok(s.length === 1 && s[0].action === "type", `select change -> 1 Eingabe-Schritt (${s.length})`);
    ok(s[0]?.label === "Deutschland", `select-Label = gewaehlte Option „Deutschland" (war „${s[0]?.label}")`);
  }

  // ---------- 8) Selektor: generierte id (":r7:") wird NICHT als #id genutzt ----------
  await reset();
  await page.locator('[id=":r7:"]').click();
  {
    const s = await sent();
    const css = s[0]?.selector?.css || "";
    ok(s.length === 1, `generierte-id-Button: 1 Klick-Schritt (${s.length})`);
    ok(!css.includes(":r7:") && !css.startsWith("#"), `generierte id NICHT als #id verwendet -> nth-Pfad (war „${css}")`);
    ok(s[0]?.selector?.role === "button", "selector.role = button");
  }
  // ---------- 9) Sichtbare Feldueberschrift schlaegt Platzhalter (Richards Telefon-Fall) ----------
  await reset();
  await page.fill("#tel", "01762");
  await page.keyboard.press("Tab");
  {
    const s = await sent();
    ok(s.length === 1 && s[0].action === "type", `Telefon-Feld: 1 Eingabe-Schritt (${s.length})`);
    ok(s[0]?.label === "Telefon", `Ueberschrift daneben schlaegt Platzhalter: „Telefon" statt „+49 ..." (war „${s[0]?.label}")`);
    const raw = await sentRaw();
    ok(!raw.includes("01762"), "DATENSCHUTZ: getippte Nummer NICHT im Payload");
  }

  // ---------- 10) Ohne Ueberschrift in der Naehe bleibt der Platzhalter das Label ----------
  await reset();
  await page.fill("#ort", "Berlin");
  await page.keyboard.press("Tab");
  {
    const s = await sent();
    ok(s.length === 1 && s[0].action === "type", `Ort-Feld: 1 Eingabe-Schritt (${s.length})`);
    ok(s[0]?.label === "Ort", `Platzhalter-Fallback intakt: „Ort" (war „${s[0]?.label}") - Nachbar-Button/Feld-Container NICHT als Ueberschrift missbraucht`);
  }
  // ---------- 11) Dead-Click: passive Karte/Absatz erzeugt KEINEN Schritt ----------
  await reset();
  await page.click("#deadtext");
  await page.click("#deadcard");
  {
    const s = await sent();
    ok(s.length === 0, `Klick auf nicht-interaktive Karte/Text -> 0 Schritte (${s.length})`);
  }

  // ---------- 12) cursor:pointer-Karte IST klickbar; Widget-Grenze = ganze Karte ----------
  await reset();
  await page.click("#cardInner");
  {
    const s = await sent();
    ok(s.length === 1 && s[0].action === "click", `pointer-Karte: 1 Klick-Schritt (${s.length})`);
    ok(s[0]?.label === "Karte oeffnen", `pointer-Karte: Label „Karte oeffnen" (war „${s[0]?.label}")`);
    ok(s[0]?.selector?.css === "#card", `pointer-Karte: aeusserstes pointer-Element als Grenze -> #card (war „${s[0]?.selector?.css}")`);
  }

  // ---------- 13) Checkbox: Label aus zugehoerigem <label>, nicht „input" ----------
  await reset();
  await page.click("#esc");
  {
    const s = await sent();
    ok(s.length === 1 && s[0].action === "click", `Checkbox: 1 Klick-Schritt (${s.length})`);
    ok(s[0]?.label === "Eskalation aktivieren", `Checkbox-Label = „Eskalation aktivieren" (war „${s[0]?.label}")`);
  }

  // ---------- 14) Schieberegler: Schritt via change (gedrosselt), Label aus Ueberschrift ----------
  await reset();
  await page.click("#vol"); // pointerdown erzeugt keinen Schritt; der Klick setzt den Wert -> change
  await page.keyboard.press("ArrowRight"); // weiteres change im Drossel-Fenster -> KEIN Extra-Schritt
  {
    const s = await sent();
    ok(s.length === 1 && s[0].action === "type", `Schieberegler: genau 1 Schritt via change trotz Nachjustieren (${s.length})`);
    ok(s[0]?.label === "Lautstaerke", `Schieberegler-Label = „Lautstaerke" (war „${s[0]?.label}")`);
  }

  // ---------- 15) Erkennungs-Marker (Welle 25): data-steply-recorder gesetzt ----------
  {
    const marker = await page.evaluate(() =>
      document.documentElement.getAttribute("data-steply-recorder")
    );
    ok(marker === "2.2.0", `data-steply-recorder = „2.2.0" (aus getManifest) (war „${marker}")`);
  }

  // ---------- 15b) Grosse Link-Kachel: Ueberschrift schlaegt Metadaten-Label ----------
  await reset();
  await page.click("#ytcard");
  {
    const s = await sent();
    ok(s.length === 1 && s[0].action === "click", `Video-Kachel: 1 Klick-Schritt (${s.length})`);
    const lbl = s[0]?.label || "";
    ok(lbl === "I Tested the Cheapest Path to 96GB of VRAM", `Kachel-Label = Ueberschrift ohne Metadaten (war „${lbl}")`);
    ok(!/minutes|views/.test(lbl), "Laufzeit/Views NICHT im Label");
  }

  // ---------- 16) Pairing-Filter (Welle 25) ----------
  const pairCount = () => page.evaluate(() => window.__pairCalls.length);
  const resetPair = () => page.evaluate(() => { window.__pairCalls.length = 0; });

  // (a) Gueltige Nachricht: echtes postMessage (source===window), __steply-Flag, gleicher
  //     origin -> chrome.runtime.sendMessage("steply-pair") wird ausgeloest (Stub zaehlt).
  await resetPair();
  await page.evaluate(() =>
    window.postMessage({ __steply: true, type: "steply-pair", token: "tok-123" }, "*")
  );
  await page.waitForTimeout(80);
  {
    const n = await pairCount();
    ok(n === 1, `gueltiges postMessage -> sendMessage("steply-pair") ausgeloest (${n})`);
    const last = await page.evaluate(() => window.__pairCalls[0] || null);
    ok(
      last && last.type === "steply-pair" && last.token === "tok-123",
      `weitergereicht mit Token (war ${JSON.stringify(last)})`
    );
  }

  // (b) Fehlendes __steply-Flag -> NICHT ausgeloest.
  await resetPair();
  await page.evaluate(() =>
    window.postMessage({ type: "steply-pair", token: "x" }, "*")
  );
  await page.waitForTimeout(80);
  ok((await pairCount()) === 0, "postMessage OHNE __steply-Flag -> NICHT ausgeloest");

  // (c) event.source !== window (synthetisches Event mit source=null) -> NICHT ausgeloest.
  await resetPair();
  await page.evaluate(() => {
    const ev = new MessageEvent("message", {
      data: { __steply: true, type: "steply-pair", token: "x" },
      origin: location.origin,
      source: null,
    });
    window.dispatchEvent(ev);
  });
  await page.waitForTimeout(30);
  ok((await pairCount()) === 0, "event.source!==window (source=null) -> NICHT ausgeloest");

  // ---------- 17) Seitenleiste-oeffnen-Weiterleitung (v2.2.1) ----------
  // Gueltiges postMessage -> sendMessage("steply-open-panel"); ohne __steply-Flag -> nicht.
  await page.evaluate(() =>
    window.postMessage({ __steply: true, type: "steply-open-panel" }, "*")
  );
  await page.waitForTimeout(80);
  ok(
    (await page.evaluate(() => window.__openPanelCalls)) === 1,
    "steply-open-panel: gueltig -> an background weitergereicht"
  );
  await page.evaluate(() => window.postMessage({ type: "steply-open-panel" }, "*"));
  await page.waitForTimeout(80);
  ok(
    (await page.evaluate(() => window.__openPanelCalls)) === 1,
    "steply-open-panel OHNE __steply-Flag -> NICHT weitergereicht"
  );

  // ---------- 18) Aufnahme-Anker-Filter (Welle 27): steply-record-into ----------
  const recordCount = () => page.evaluate(() => window.__recordIntoCalls.length);
  const resetRecord = () => page.evaluate(() => { window.__recordIntoCalls.length = 0; });
  const UUID_A = "11111111-1111-4111-8111-111111111111";
  const UUID_B = "22222222-2222-4222-8222-222222222222";
  const UUID_C = "33333333-3333-4333-8333-333333333333";

  // (a) Gueltig (afterStepId): __steply, echte source, gleicher origin -> weitergereicht
  //     mit sauberem { tutorialId, anchor: { afterStepId } }.
  await resetRecord();
  await page.evaluate(({ t, a }) =>
    window.postMessage(
      { __steply: true, type: "steply-record-into", target: { tutorialId: t, anchor: { afterStepId: a } }, label: "nach Schritt 3" },
      "*"
    ), { t: UUID_A, a: UUID_B });
  await page.waitForTimeout(80);
  {
    const n = await recordCount();
    ok(n === 1, `gueltiges record-into (afterStepId) -> weitergereicht (${n})`);
    const last = await page.evaluate(() => window.__recordIntoCalls[0] || null);
    ok(
      last && last.type === "steply-record-into" &&
        last.target && last.target.tutorialId === UUID_A &&
        last.target.anchor && last.target.anchor.afterStepId === UUID_B &&
        !("branchId" in last.target.anchor) &&
        last.label === "nach Schritt 3",
      `record-into afterStepId sauber weitergereicht (war ${JSON.stringify(last)})`
    );
  }

  // (a2) Gueltig (branchId): der andere Anker-Typ kommt ebenfalls durch.
  await resetRecord();
  await page.evaluate(({ t, b }) =>
    window.postMessage(
      { __steply: true, type: "steply-record-into", target: { tutorialId: t, anchor: { branchId: b } }, label: "Ast Ja" },
      "*"
    ), { t: UUID_A, b: UUID_C });
  await page.waitForTimeout(80);
  {
    const last = await page.evaluate(() => window.__recordIntoCalls[0] || null);
    ok(
      (await recordCount()) === 1 && last && last.target.anchor.branchId === UUID_C && !("afterStepId" in last.target.anchor),
      `record-into branchId sauber weitergereicht (war ${JSON.stringify(last)})`
    );
  }

  // (b) Fehlendes __steply-Flag -> NICHT weitergereicht.
  await resetRecord();
  await page.evaluate(({ t, a }) =>
    window.postMessage({ type: "steply-record-into", target: { tutorialId: t, anchor: { afterStepId: a } } }, "*"),
    { t: UUID_A, a: UUID_B });
  await page.waitForTimeout(80);
  ok((await recordCount()) === 0, "record-into OHNE __steply-Flag -> NICHT weitergereicht");

  // (c) event.source !== window (synthetisches Event) -> NICHT weitergereicht.
  await resetRecord();
  await page.evaluate(({ t, a }) => {
    const ev = new MessageEvent("message", {
      data: { __steply: true, type: "steply-record-into", target: { tutorialId: t, anchor: { afterStepId: a } } },
      origin: location.origin,
      source: null,
    });
    window.dispatchEvent(ev);
  }, { t: UUID_A, a: UUID_B });
  await page.waitForTimeout(30);
  ok((await recordCount()) === 0, "record-into mit source!==window -> NICHT weitergereicht");

  // (d) Kaputtes target (kein anchor) -> NICHT weitergereicht (content.js kehrt frueh zurueck).
  await resetRecord();
  await page.evaluate(({ t }) =>
    window.postMessage({ __steply: true, type: "steply-record-into", target: { tutorialId: t } }, "*"),
    { t: UUID_A });
  await page.waitForTimeout(80);
  ok((await recordCount()) === 0, "record-into ohne anchor -> NICHT weitergereicht");

  // ---------- 19) Auto-Schwaerzung (Welle 28): sensitive-Rechtecke sichtbarer Felder ----------
  // Frische, isolierte Seite (deterministisch): ein Passwortfeld, ein „API-Key"-beschriftetes
  // Feld und ein [data-steply-sensitive]-Element (alle sichtbar) plus ein UNSICHTBARES
  // Passwortfeld. Beim Klick-Schritt muss der Payload `sensitive` GENAU die drei sichtbaren
  // tragen (normiert 0..1, geklemmt) - Feld-WERTE tauchen NIRGENDS auf.
  {
    const page2 = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    const HTML2 = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><style>
      body{font-family:sans-serif;margin:0;padding:16px} input,button,div{display:block;margin:8px 0}
      .hid{display:none}
    </style><script>
      window.__sent = [];
      window.chrome = {
        runtime: {
          lastError: undefined,
          getManifest: function(){ return { version: "2.4.0" }; },
          sendMessage: function(m){ if (m && m.type === "steply-guide-step") { window.__sent.push(m.step); } return Promise.resolve(undefined); },
          onMessage: { addListener: function(){} },
        },
        storage: {
          local: { get: function(key, cb){ cb({ rec: { startedAt: Date.now(), mode: "guide" } }); } },
          onChanged: { addListener: function(){} },
        },
        tabs: { sendMessage: function(){} },
      };
    </script></head><body>
      <button id="go">Weiter</button>
      <label for="pw2">Passwort</label>
      <input id="pw2" type="password" name="pw2" value="TOPSECRET123">
      <label for="apikey">API-Key</label>
      <input id="apikey" type="text" name="apikey" value="sk-LEAKME-000">
      <div data-steply-sensitive id="secretbox">Kundennummer 4711</div>
      <input id="hiddenpw" type="password" class="hid" value="INVISIBLE-SECRET">
    </body></html>`;
    await page2.setContent(HTML2, { waitUntil: "load" });
    await page2.addScriptTag({ content: CONTENT_JS });
    await page2.click("#go");
    const step = await page2.evaluate(() => window.__sent[0] || null);
    const raw2 = await page2.evaluate(() => JSON.stringify(window.__sent));
    ok(!!step && step.action === "click", "Auto-Schwaerzung: Klick-Schritt erzeugt");
    const sens = (step && step.sensitive) || [];
    ok(
      Array.isArray(sens) && sens.length === 3,
      `sensitive enthaelt GENAU die 3 sichtbaren (Passwort, API-Key, data-attr) (war ${sens.length})`,
    );
    ok(
      sens.every(
        (r) =>
          typeof r.x === "number" && typeof r.y === "number" &&
          typeof r.w === "number" && typeof r.h === "number" &&
          r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 &&
          r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001,
      ),
      "sensitive: alle Rechtecke normiert 0..1 + geklemmt",
    );
    ok(
      sens.every((r) => Object.keys(r).sort().join(",") === "h,w,x,y"),
      "sensitive: NUR Geometrie (x,y,w,h) - keine weiteren Felder",
    );
    ok(
      !raw2.includes("TOPSECRET123") && !raw2.includes("sk-LEAKME-000") && !raw2.includes("INVISIBLE-SECRET"),
      "DATENSCHUTZ: KEIN Feldwert im Payload (auch nicht des unsichtbaren Feldes)",
    );
    ok(sens.length === 3, "unsichtbares Passwortfeld ausgeschlossen (3, nicht 4)");
    await page2.close();
  }
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ content.js-Erfassung (Label/Editierbarkeit/blur/Selektor) verifiziert.");
process.exit(failed ? 1 : 0);
