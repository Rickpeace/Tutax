// Headless-Beweis: Sofort-Anleitung erfasst EINGABE + ENTER (Richards Google-Fund, 21.09.2026).
// Laedt die ECHTE extension/content.js in echtes Chromium (wie test-guide-capture.mjs) und prueft:
//   1) Google-Muster: Suchfeld hat den Fokus SCHON BEIM LADEN (autofocus), bevor die Aufnahme
//      scharf ist -> Tippen + Enter erzeugt trotzdem GENAU einen Eingabe-Schritt mit enter:true,
//      und zwar VOR der Formular-Uebermittlung (danach navigiert die Seite weg).
//   2) Normales Feld: Klick rein, tippen, Enter -> ein Schritt (enter:true), kein Doppel durch blur.
//   3) Mehrzeiliges <textarea> ohne Such-Rolle: Enter = Zeilenumbruch -> KEIN Schritt beim Enter.
//   4) Enter in einem vorbefuellten Feld ohne Aenderung -> Schritt (Absenden ist eine Aktion).
//   5) DATENSCHUTZ: getippter Wert nie im Payload.
//   6) Server (guide.ts): enter wird validiert und ergibt „…und bestätigen Sie mit Enter."
//
// Nutzung:  node scripts/test-guide-enter.mjs   (kein .env noetig)
import { createRequire, register } from "node:module";
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

// chrome-Stub: Schritte UND Formular-Submits landen in EINER Ereignis-Liste (Reihenfolge!).
const STUB = `<script>
  window.__log = [];
  window.chrome = {
    runtime: {
      lastError: undefined,
      getManifest: function () { return { version: "2.16.0" }; },
      sendMessage: function (m) {
        if (m && m.type === "steply-guide-step") { window.__log.push({ ev: "step", step: m.step }); return; }
        if (m && m.type === "steply-guide-retract") { window.__log.push({ ev: "retract", ts: m.ts }); return; }
        return Promise.resolve(undefined);
      },
      onMessage: { addListener: function () {} },
    },
    storage: {
      local: { get: function (key, cb) { cb({ rec: { startedAt: Date.now(), mode: "guide" } }); } },
      onChanged: { addListener: function (fn) { (window.__recListeners = window.__recListeners || []).push(fn); } },
    },
    tabs: { sendMessage: function () {} },
  };
  document.addEventListener("submit", function (e) {
    e.preventDefault(); // echte Seite wuerde hier wegnavigieren
    window.__log.push({ ev: "submit", form: e.target.id });
  });
</script>`;

const HTML = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">${STUB}</head><body>
  <form id="gsearch" role="search" action="/search">
    <textarea id="q" name="q" role="combobox" aria-label="Suche" rows="1" autofocus></textarea>
  </form>
  <form id="plain">
    <label for="city">Stadt</label>
    <input id="city" name="city" type="text">
    <label for="pre">Kundennummer</label>
    <input id="pre" name="pre" type="text" value="4711">
  </form>
  <label for="chat">Nachricht</label>
  <textarea id="chat" name="chat"></textarea>
  <label for="notes">Bemerkung</label>
  <textarea id="notes" name="notes"></textarea>
  <button id="other">Andere Aktion</button>
  <script>
    // Chat (ChatGPT-artig): Enter schickt ab und leert das textarea.
    document.getElementById("chat").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.value = ""; }
    });
    // Google schickt das Suchfeld (ein textarea) per eigenem Skript bei Enter ab.
    document.getElementById("q").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); this.form.requestSubmit(); }
    });
  </script>
</body></html>`;

let browser;
try {
  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.setContent(HTML, { waitUntil: "load" });
  // Google fokussiert das Suchfeld per Skript beim Laden (autofocus greift bei setContent nicht).
  await page.evaluate(() => document.getElementById("q").focus());
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === "q"),
    "Vorbedingung: Suchfeld hat den Fokus schon VOR der Aufnahme (autofocus wie Google)");
  // Content-Script erst JETZT (Aufnahme startet, waehrend das Feld schon fokussiert ist).
  await page.addScriptTag({ content: CONTENT_JS });

  const log = () => page.evaluate(() => window.__log.map((e) =>
    e.ev === "step" ? { ev: "step", ts: e.step.ts, action: e.step.action, label: e.step.label, enter: !!(e.step.interaction && e.step.interaction.enter) } : e));
  // Netto-Schritte: zurueckgenommene (retract) herausrechnen.
  const net = async () => {
    const l = await log();
    const gone = new Set(l.filter((e) => e.ev === "retract").map((e) => e.ts));
    return l.filter((e) => e.ev === "step" && !gone.has(e.ts));
  };
  const raw = () => page.evaluate(() => JSON.stringify(window.__log));
  const reset = () => page.evaluate(() => { window.__log.length = 0; });

  // ---------- 1) Google-Muster ----------
  await page.keyboard.type("steply anleitung");
  await page.keyboard.press("Enter");
  {
    const l = await log();
    const steps = l.filter((e) => e.ev === "step");
    ok(steps.length === 1, `Google: genau 1 Schritt (${steps.length}) ${JSON.stringify(l)}`);
    ok(steps[0]?.action === "type", `Google: Aktion = type (war ${steps[0]?.action})`);
    ok(steps[0]?.enter === true, "Google: Schritt traegt enter:true");
    ok(steps[0]?.label === "Suche", `Google: Label = „Suche" (war „${steps[0]?.label}")`);
    ok(l[0]?.ev === "step" && l.some((e) => e.ev === "submit"),
      `Google: Schritt kommt VOR dem Absenden (${l.map((e) => e.ev).join(",")})`);
    ok(!(await raw()).includes("steply anleitung"), "DATENSCHUTZ: Suchbegriff NICHT im Payload");
  }
  // blur danach darf keinen zweiten Schritt erzeugen
  await page.click("#other");
  {
    const l = await log();
    const types = l.filter((e) => e.ev === "step" && e.action === "type");
    ok(types.length === 1, `Google: kein Doppel-Schritt durch spaeteres Verlassen (${types.length} type)`);
  }

  // ---------- 2) Normales Feld ----------
  await reset();
  await page.click("#city");
  await page.keyboard.type("Berlin");
  await page.keyboard.press("Enter");
  await page.click("#other");
  {
    const l = await log();
    const steps = l.filter((e) => e.ev === "step");
    ok(steps.length === 2 && steps[0].action === "type" && steps[0].enter === true && steps[1].action === "click",
      `Feld: type(enter) dann click (${JSON.stringify(steps)})`);
    ok(steps[0]?.label === "Stadt", `Feld: Label = „Stadt" (war „${steps[0]?.label}")`);
  }

  // ---------- 3) Mehrzeiliges textarea: Enter = Zeilenumbruch ----------
  await reset();
  await page.click("#notes");
  await page.keyboard.type("Zeile 1");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700); // Chat-Probe (400 ms) abwarten
  {
    const n = await net();
    ok(n.length === 0, `Textarea: Enter (Zeilenumbruch) hinterlaesst netto KEINEN Schritt (${JSON.stringify(await log())})`);
  }
  await page.click("#other");
  {
    const steps = await net();
    ok(steps.length === 2 && steps[0].action === "type" && steps[0].enter === false,
      `Textarea: beim Verlassen normaler Eingabe-Schritt ohne enter (${JSON.stringify(steps)})`);
  }

  // ---------- 3b) Chat-textarea: Enter schickt ab (Feld leert sich) -> Schritt bleibt ----------
  await reset();
  await page.click("#chat");
  await page.keyboard.type("Hallo Team");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  {
    const n = await net();
    ok(n.length === 1 && n[0].action === "type" && n[0].enter === true && n[0].label === "Nachricht",
      `Chat-textarea: abgeschickte Nachricht bleibt als Schritt mit enter (${JSON.stringify(await log())})`);
    ok(!(await raw()).includes("Hallo Team"), "DATENSCHUTZ: Chat-Text NICHT im Payload");
  }

  // ---------- 3c) Pause mitten in der Eingabe: offene Eingabe wird noch gemeldet ----------
  await reset();
  await page.click("#city");
  await page.keyboard.type("Hamburg");
  await page.evaluate(() =>
    window.__recListeners.forEach((fn) => fn({ rec: { oldValue: {}, newValue: undefined } }, "local")));
  {
    const n = await net();
    ok(n.length === 1 && n[0].action === "type" && n[0].label === "Stadt",
      `Pause: offene Eingabe wird beim Anhalten gemeldet (${JSON.stringify(n)})`);
  }
  await page.click("#other");
  ok((await net()).length === 1, "Pause: danach keine Schritte mehr (Aufnahme passiv)");
  await page.evaluate(() =>
    window.__recListeners.forEach((fn) =>
      fn({ rec: { newValue: { startedAt: Date.now(), mode: "guide" } } }, "local")));

  // ---------- 4) Vorbefuelltes Feld, nur Enter ----------
  await reset();
  await page.click("#pre");
  await page.keyboard.press("Enter");
  {
    const steps = (await log()).filter((e) => e.ev === "step");
    ok(steps.length === 1 && steps[0].action === "type" && steps[0].enter === true,
      `Nur Enter im vorbefuellten Feld -> 1 Schritt mit enter (${JSON.stringify(steps)})`);
    ok(!(await raw()).includes("4711"), "DATENSCHUTZ: vorbefuellter Wert NICHT im Payload");
  }
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
}

// ---------- 6) Server: enter wird validiert + landet im Vorlagen-Text ----------
try {
  // server-only ist in reinem Node nicht aufloesbar (Next aliased es) -> stubben. Der Pfad-Alias
  // „@/…" (tsconfig paths) wird auf src/….ts abgebildet (guide.ts nutzt @/lib/interaction-text).
  const srcBase = JSON.stringify(new URL("../src/", import.meta.url).href);
  const loader = `export async function resolve(s,c,n){if(s==='server-only'||s==='client-only'){return {url:'data:text/javascript,',shortCircuit:true};}if(s.startsWith('@/')){return n(new URL(s.slice(2)+'.ts',${srcBase}).href,c);}return n(s,c);}`;
  register("data:text/javascript," + encodeURIComponent(loader), import.meta.url);
  const { validateGuideSteps, templateBodyText } = await import("../src/lib/guide.ts");
  const base = { path: "acc/x.webp", label: "Suche", rect: { x: 0, y: 0, w: 0.1, h: 0.1 }, url: "https://www.google.com/", title: "Google", w: 100, h: 100 };
  const out = validateGuideSteps(
    [{ ...base, action: "type", interaction: { enter: true } }, { ...base, action: "click", interaction: { enter: true } }, { ...base, action: "type", interaction: { enter: "ja" } }],
    "acc",
  );
  ok(out[0].interaction?.enter === true, "Server: enter:true bei Eingabe-Schritt uebernommen");
  ok(!out[1].interaction && !out[2].interaction, "Server: enter bei Klick bzw. Nicht-Boolean verworfen");
  const t = templateBodyText(out[0], null);
  ok(t.includes("„Suche“") && t.includes("bestätigen Sie mit Enter"), `Server-Text: „${t}"`);
  const t2 = templateBodyText(out[2], out[0]);
  ok(!t2.includes("Enter"), `Server-Text ohne Enter unveraendert: „${t2}"`);
} catch (e) {
  ok(false, "Server-Teil Fehler: " + (e && e.stack ? e.stack : e));
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Eingabe + Enter wird erfasst.");
process.exit(failed ? 1 : 0);
