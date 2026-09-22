// Welle 54 — Headless-Beweis: der eingetippte Wert reist als step.typed_value mit, AUSSER bei
// sensiblen Feldern. Lädt die ECHTE extension/content.js in echtes Chromium (Muster
// test-guide-capture-plus.mjs, chrome-Stub sammelt alle Nachrichten) und prüft je Feld:
//   gesendet:  normales Textfeld, kurzer Chat (contenteditable), langes input (auf 80 gekürzt)
//   NICHT:     type=password, autocomplete cc-*/one-time-code/current-password/new-password,
//              [data-steply-sensitive] (am Feld und am Vorfahren), sensible Beschriftung (IBAN,
//              API-Key als placeholder), langer Rich-Editor/textarea (> 80), Auswahlliste
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
</body></html>`;

let browser;
try {
  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
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
    ok(s && !("typed_value" in s), "Auswahlliste: kein typed_value (nichts getippt)");
  }
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Eingetippter Wert: gesendet nur bei unkritischen Feldern.");
process.exit(failed ? 1 : 0);
