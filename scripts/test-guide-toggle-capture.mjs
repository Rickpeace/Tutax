// Headless-Regressionstest (v2.18.5): Schalter-/Menue-Zeilen im TradingView-Muster werden als
// Schritt aufgenommen. Richards Bug: im TradingView-Benutzermenue wurden Klicks auf „Dark theme“
// / „Drawings panel“ (Schalter) und die Sprachwahl NICHT aufgenommen. Ursache: die Zeilen sind
// <div role="row" tabindex="-1" aria-checked=…> in einem role="treegrid" — weder Button/Link/
// menuitem noch tabindex>=0 noch cursor:pointer -> der Dead-Click-Filter (interactiveFor) warf
// sie weg. Laedt die ECHTE extension/content.js (+ guide-resolve.js) in Chromium mit der Fixture
// scripts/fixtures/toggle-menu.html und prueft je Variante: genau 1 Schritt, richtiges Label,
// Selektor findet das Element wieder; Negativfaelle (reiner Text, Container-Leerraum) -> 0.
//
// Nutzung:  node scripts/test-guide-toggle-capture.mjs   (kein .env noetig; Playwright aus
//           dem npx-Cache oder STEPLY_PW_DIR)
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXT = path.join(__dirname, "..", "extension");
const CONTENT_JS = readFileSync(path.join(EXT, "content.js"), "utf8");
const RESOLVE_JS = readFileSync(path.join(EXT, "guide-resolve.js"), "utf8");
const FIXTURE = readFileSync(path.join(__dirname, "fixtures", "toggle-menu.html"), "utf8");

// chrome-Stub: sammelt ALLE runtime-Nachrichten (Aufnahme laeuft im guide-Modus).
const STUB = `<script>
  window.__msgs = [];
  window.chrome = {
    runtime: {
      lastError: undefined,
      getManifest: function () { return { version: "test" }; },
      sendMessage: function (m) { window.__msgs.push(JSON.parse(JSON.stringify(m))); return Promise.resolve(undefined); },
      onMessage: { addListener: function () {} },
    },
    storage: {
      local: { get: function (key, cb) { cb({ rec: { startedAt: Date.now(), mode: "guide", nonce: "testnonce123" } }); } },
      onChanged: { addListener: function () {} },
    },
    tabs: { sendMessage: function () {} },
  };
</script>`;

let browser;
try {
  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await ctx.route(/^http:\/\/steply\.test\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: FIXTURE.replace("<head>", "<head>" + STUB),
    }),
  );
  const page = await ctx.newPage();
  await page.goto("http://steply.test/toggle-menu.html", { waitUntil: "load" });
  await page.addScriptTag({ content: RESOLVE_JS });
  await page.addScriptTag({ content: CONTENT_JS });
  await sleep(150);

  const steps = () =>
    page.evaluate(() => window.__msgs.filter((m) => m.type === "steply-guide-step").map((m) => m.step));
  const reset = () => page.evaluate(() => (window.__msgs.length = 0));
  const center = (sel) =>
    page.evaluate((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, sel);
  // Echter Mausklick (pointerdown/mousedown/pointerup/mouseup/click) auf die Mitte von sel.
  const clickAt = async (sel) => {
    const c = await center(sel);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.up();
    await sleep(120);
  };
  // Findet guide-resolve.js das Element ueber den erfassten Selektor wieder?
  const resolvesTo = (selector, id) =>
    page.evaluate(
      ({ selector, id }) => {
        const R = globalThis.SteplyGuideResolve;
        const hit = R.resolveSelector(document, selector);
        const el = hit && hit.el;
        return !!(el && el.nodeType === 1 && (el.id === id || el.closest("#" + id)));
      },
      { selector, id },
    );
  const oneStep = async (name, sel, wantLabel, wantId, extra) => {
    await reset();
    await clickAt(sel);
    const s = await steps();
    ok(s.length === 1, `${name}: genau 1 Schritt (war ${s.length})`);
    if (!s.length) return null;
    ok(s[0].label === wantLabel, `${name}: Label „${wantLabel}“ (war „${s[0].label}“)`);
    ok(s[0].action === "click", `${name}: action click (war ${s[0].action})`);
    if (wantId) {
      const r = await resolvesTo(s[0].selector, wantId);
      ok(r === true, `${name}: Selektor ${JSON.stringify(s[0].selector)} findet #${wantId} wieder (${r})`);
    }
    if (extra) await extra(s[0]);
    return s[0];
  };

  // ---- V1: TradingView-Schalterzeile, Klick auf den Schalter-Knopf bzw. den Text -----------
  await oneStep("V1 „Dark theme“ (Klick auf Schalter)", "#darkThumb", "Dark theme", "dark", async (st) => {
    ok(st.rect && st.rect.w > 0.2, `V1: Markierung umfasst die ganze Zeile (w=${st.rect && st.rect.w})`);
    ok(st.selector && st.selector.role === "row", `V1: selector.role row (war ${st.selector && st.selector.role})`);
  });
  ok((await page.getAttribute("#dark", "aria-checked")) === "true", "V1: Seite hat umgeschaltet (Wirkung unveraendert)");
  await oneStep("V1b „Dark theme“ (Klick auf Text)", "#darkText", "Dark theme", "dark");
  await oneStep("V1c „Drawings panel“", "#drawThumb", "Drawings panel", "draw");

  // ---- V2: einfache TradingView-Zeile ohne Zustand ------------------------------------------
  await oneStep("V2 „Help Center“", "#help", "Help Center", "help");

  // ---- V3: Untermenue per Hover, Auswahl „Deutsch“ -------------------------------------------
  const lc = await center("#langText");
  await page.mouse.move(lc.x, lc.y);
  await sleep(100);
  ok(await page.isVisible("#langSub"), "V3: Untermenue per Hover geoeffnet");
  await oneStep("V3 Sprache „Deutsch“", "#deText", "Deutsch", "de");
  ok((await page.evaluate(() => window.__lang)) === "de", "V3: Seite hat die Sprache gewaehlt");

  // ---- V4: role=menuitemcheckbox, Umschalten + Re-Render auf pointerdown ---------------------
  await oneStep("V4 menuitemcheckbox mit Re-Render", "#v4", "Gitternetz", null);

  // ---- V5: <label for> + input[type=checkbox][role=switch] ----------------------------------
  await oneStep("V5 Label eines Schalters", "#v5label", "Benachrichtigungen", "v5label");
  await oneStep("V5b Schalter selbst", "#v5", "Benachrichtigungen", "v5");

  // ---- V6: Container stoppt Propagation, Toggle per aria-pressed -----------------------------
  await oneStep("V6 aria-pressed hinter stopPropagation", "#v6", "Magnet-Modus", "v6");
  ok((await page.getAttribute("#v6", "aria-pressed")) === "true", "V6: Seite hat umgeschaltet");

  // ---- Regression: normaler Knopf ---------------------------------------------------------------
  await oneStep("Regression Knopf", "#plain", "Speichern", "plain");

  // ---- Negativ: Dead-Click-Filter bleibt wirksam ---------------------------------------------
  for (const [name, sel] of [
    ["Text in Dialog (tabindex=-1)", "#dlgText"],
    ["Trennlinie im Menue-Container (treegrid, tabindex=-1)", "#sep"],
  ]) {
    await reset();
    await clickAt(sel);
    const s = await steps();
    ok(s.length === 0, `Negativ ${name}: kein Schritt (war ${s.length}${s.length ? " „" + s[0].label + "“" : ""})`);
  }
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  if (browser) await browser.close();
}

console.log(failed ? "\nFEHLGESCHLAGEN" : "\nALLE TESTS GRUEN");
process.exit(failed ? 1 : 0);
