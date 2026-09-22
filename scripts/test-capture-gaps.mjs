// Lueckenbericht der SOFORT-AUFNAHME (Produktinhaber-Frage: "Welche wichtigen Bedienvorgaenge
// erfasst die Sofort-Aufnahme NICHT?").
//
// Laedt die ECHTE extension/content.js (+ guide-resolve.js) headless in Chromium, fuehrt je
// Muster ECHTE Maus-/Tastatur-Ereignisse aus und liest ALLE Panel-Nachrichten
// (steply-guide-step/-patch/-retract) mit. Jede Nachricht traegt zusaetzlich eine PROBE: den
// Seitenzustand GENAU in dem Moment, in dem der Schritt gemeldet wird — das ist der Moment, in
// dem das Panel den Screenshot macht. Damit ist der "Screenshot-Zeitpunkt" pruefbar, ohne echte
// Screenshots zu brauchen.
//
// Der Standardlauf ist ein BERICHT: Luecken sind KEIN Fehler, sie werden als "nicht"/"teilweise"
// ausgewiesen. `--strict` prueft nur die Muster, die heute unterstuetzt SIND (erwartet: erfasst)
// und faellt bei Regression durch.
//
// Nutzung:  node scripts/test-capture-gaps.mjs [--strict] [--only=<id-teilstring>]
//           (kein .env noetig; Playwright aus dem npx-Cache oder STEPLY_PW_DIR)
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

const STRICT = process.argv.includes("--strict");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);

const EXT = path.join(__dirname, "..", "extension");
const CONTENT_JS = readFileSync(path.join(EXT, "content.js"), "utf8");
const RESOLVE_JS = readFileSync(path.join(EXT, "guide-resolve.js"), "utf8");
const FIX = (name) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

// chrome-Stub. Schickt jede Nachricht per exposeBinding nach Node (ueberlebt Seitenwechsel)
// und haengt den Seitenzustand im Meldemoment an (= Screenshot-Moment im Panel).
//
// storage.local ist bewusst ECHT nachgebaut (Welle 55): es lebt in NODE und ueberlebt damit
// Seitenwechsel — genau wie chrome.storage.local im Browser. Nur so laesst sich der
// Seitenwechsel-Schritt (L1) pruefen: content.js braucht dafuer rec.startedAt (war die Seite
// schon vor dem Aufnahmestart offen?) und guideLastStepAt (folgt der Wechsel auf einen Klick?).
const STUB = `
  window.chrome = {
    runtime: {
      lastError: undefined,
      getManifest: function () { return { version: "test" }; },
      sendMessage: function (m) {
        try {
          var rec = JSON.parse(JSON.stringify(m));
          rec.__url = location.pathname;
          try { rec.__probe = (typeof window.__probe === "function") ? window.__probe() : null; }
          catch (e) { rec.__probe = "probe-fehler"; }
          if (window.__steplySink) window.__steplySink(rec);
        } catch (e) { /* egal */ }
        return Promise.resolve(undefined);
      },
      onMessage: { addListener: function () {} },
    },
    storage: {
      local: {
        get: function (keys, cb) {
          Promise.resolve(window.__steplyStoreGet ? window.__steplyStoreGet() : {})
            .then(function (all) { cb(all || {}); })
            .catch(function () { cb({}); });
        },
        set: function (obj) {
          try { if (window.__steplyStoreSet) window.__steplyStoreSet(JSON.parse(JSON.stringify(obj))); }
          catch (e) { /* egal */ }
          return Promise.resolve();
        },
        remove: function () { return Promise.resolve(); },
      },
      onChanged: { addListener: function () {} },
    },
    tabs: { sendMessage: function () {} },
  };
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
let strictFailed = false;

function fmtStep(s) {
  const bits = [`action=${s.action}`, `label=${JSON.stringify(s.label || "")}`];
  const sel = s.selector || {};
  bits.push(`css=${JSON.stringify(sel.css || "")}`);
  if (sel.role) bits.push(`role=${sel.role}`);
  if (sel.shadow) bits.push(`shadow=${JSON.stringify(sel.shadow)}`);
  if (s.typed_value != null) bits.push(`typed_value=${JSON.stringify(s.typed_value)}`);
  if (s.interaction) bits.push(`interaction=${JSON.stringify(s.interaction)}`);
  if (s.fileMeta) bits.push(`fileMeta=${JSON.stringify(s.fileMeta)}`);
  const r = s.rect || {};
  bits.push(`rect=${[r.x, r.y, r.w, r.h].map((n) => (typeof n === "number" ? n.toFixed(3) : "?")).join("/")}`);
  if (s.__probe) bits.push(`zustand_beim_screenshot=${JSON.stringify(s.__probe)}`);
  return bits.join(" ");
}

const MARK = { erfasst: "[OK ] erfasst", teilweise: "[~  ] teilweise", nicht: "[!! ] NICHT erfasst" };

let browser;
try {
  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });

  const sink = [];
  await ctx.exposeBinding("__steplySink", (_src, msg) => {
    sink.push(msg);
  });

  // Der „chrome.storage.local"-Inhalt lebt hier in Node (ueberlebt Seitenwechsel).
  // rec.startedAt liegt standardmaessig in der ZUKUNFT-Naehe (= „die Seite war schon offen,
  // als die Aufnahme startete") — dann entsteht beim Laden KEIN Seitenwechsel-Schritt, und
  // alle Bestandsmuster verhalten sich unveraendert. navMode(true) datiert den Start
  // zurueck und simuliert damit „die Aufnahme lief schon, als diese Seite geladen wurde".
  const store = {}; // alles ausser rec (z. B. guideLastStepAt)
  let navStart = 0; // 0 = aus: rec.startedAt ist IMMER „gerade eben"
  const navMode = (on) => {
    navStart = on ? Date.now() - 60000 : 0;
    delete store.guideLastStepAt;
  };
  await ctx.exposeBinding("__steplyStoreGet", () =>
    Object.assign({}, store, {
      rec: { startedAt: navStart || Date.now(), mode: "guide", nonce: "testnonce123" },
    }),
  );
  await ctx.exposeBinding("__steplyStoreSet", (_src, obj) => {
    Object.assign(store, obj || {});
  });
  await ctx.addInitScript({ content: STUB });

  const PAGES = {
    "/controls.html": FIX("capture-controls.html"),
    "/keyboard.html": FIX("capture-keyboard.html"),
    "/scroll-nav.html": FIX("capture-scroll-nav.html"),
    "/widgets.html": FIX("capture-widgets.html"),
    "/zweite.html": `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Zweite Seite</title></head>
<body style="margin:0;font:14px sans-serif"><h1>Zweite Seite</h1><button id="z">Weiter</button>
<script>window.__probe=function(){return {url:location.pathname};};<\/script></body></html>`,
    "/uebersicht": `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Uebersicht</title></head><body>Uebersicht</body></html>`,
  };

  await ctx.route(/^http:\/\/steply\.test\//, (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/datei.csv") {
      return route.fulfill({ status: 200, contentType: "text/csv", body: "a;b\n1;2\n" });
    }
    const body = PAGES[u.pathname];
    if (!body) return route.fulfill({ status: 404, contentType: "text/html", body: "<h1>404</h1>" });
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
  });

  const page = await ctx.newPage();
  const dialogs = [];
  page.on("dialog", async (d) => {
    dialogs.push(d.type());
    await d.accept(d.type() === "prompt" ? "Testname" : undefined);
  });

  // Content-Script nach jedem Laden erneut "impfen" (im echten Browser macht das das Manifest).
  async function arm(p) {
    const t = p || page;
    await t.addScriptTag({ content: RESOLVE_JS });
    await t.addScriptTag({ content: CONTENT_JS });
    // Der Aufnahmezustand kommt jetzt asynchron ueber die storage-Bruecke nach Node — ein
    // Tick mehr, damit content.js „recording" gesetzt hat, bevor der Test klickt.
    await sleep(220);
  }
  async function open(p) {
    await page.goto("http://steply.test" + p, { waitUntil: "load" });
    await arm();
  }

  const reset = () => {
    sink.length = 0;
  };
  const allSteps = () =>
    sink
      .filter((m) => m.type === "steply-guide-step" && m.step)
      .map((m) => Object.assign({}, m.step, { __probe: m.__probe, __url: m.__url }));
  const patchesOf = () => sink.filter((m) => m.type === "steply-guide-patch");
  const retractsOf = () => sink.filter((m) => m.type === "steply-guide-retract");
  const liveSteps = () => {
    const gone = new Set(retractsOf().map((r) => r.ts));
    const patched = patchesOf();
    return allSteps()
      .filter((s) => !gone.has(s.ts))
      .map((s) => {
        const p = patched.filter((x) => x.ts === s.ts);
        if (!p.length) return s;
        return Object.assign({}, s, { interaction: Object.assign({}, s.interaction, ...p.map((x) => x.interaction)) });
      });
  };

  const center = async (sel, p) =>
    (p || page).evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, sel);

  const clickAt = async (sel, opts) => {
    const c = await center(sel);
    if (!c) throw new Error("Element nicht gefunden: " + sel);
    await page.mouse.click(c.x, c.y, opts || {});
    await sleep(160);
  };
  const clickXY = async (x, y, opts) => {
    await page.mouse.click(x, y, opts || {});
    await sleep(160);
  };

  // Findet guide-resolve.js das Element ueber den erfassten Selektor wieder?
  const resolves = (selector) =>
    page.evaluate((sel) => {
      try {
        const R = globalThis.SteplyGuideResolve;
        if (!R) return "resolver-fehlt";
        if (!sel) return "kein-selektor";
        const hit = R.resolveSelector(document, sel);
        const el = hit && hit.el;
        if (!el || el.nodeType !== 1) return "nicht-gefunden";
        return el.id ? "#" + el.id : el.tagName.toLowerCase();
      } catch (e) {
        return "fehler";
      }
    }, selector || null);

  // ---- Fall ausfuehren --------------------------------------------------------------------
  // supported: so verhaelt sich die Aufnahme HEUTE laut Code/Bestandstests. In --strict werden
  // nur diese Faelle geprueft (verify muss "erfasst" liefern).
  async function testCase({ id, muster, supported, verify, run, note }) {
    if (ONLY && !id.includes(ONLY)) return null;
    reset();
    let err = null;
    try {
      await run();
    } catch (e) {
      err = e;
    }
    await sleep(120);
    const live = liveSteps();
    const all = allSteps();
    let verdict = "nicht";
    let detail = "";
    if (err) {
      verdict = "nicht";
      detail = "Testfehler: " + err.message;
    } else {
      const v = await verify({ live, all, patches: patchesOf(), retracts: retractsOf(), msgs: sink.slice() });
      verdict = (v && v.verdict) || "nicht";
      detail = (v && v.detail) || "";
    }
    results.push({ id, muster, verdict, detail, supported: !!supported });
    console.log(`\n-- ${id}  ${muster}`);
    console.log(`   ${MARK[verdict] || verdict}${detail ? " -- " + detail : ""}`);
    if (note) console.log(`   Hinweis: ${note}`);
    for (const s of live) console.log(`   * ${fmtStep(s)}`);
    const dropped = all.length - live.length;
    if (dropped > 0) console.log(`   (${dropped} Schritt(e) wieder zurueckgenommen)`);
    if (STRICT && supported && verdict !== "erfasst") {
      console.log("   FEHLER (strict): unterstuetzter Fall verhaelt sich nicht wie erwartet");
      strictFailed = true;
    }
    return { live, all };
  }

  const one = (r, fn) => {
    if (r.live.length !== 1) {
      return { verdict: r.live.length === 0 ? "nicht" : "teilweise", detail: `${r.live.length} Schritte statt 1` };
    }
    return fn ? fn(r.live[0]) : { verdict: "erfasst" };
  };

  // =========================================================================================
  console.log("\n===== 1) Formular-Bedienelemente =====");
  await open("/controls.html");

  await testCase({
    id: "1.1-select-tastatur",
    muster: "Natives <select>: Option per Tastatur waehlen",
    supported: true,
    run: async () => {
      await page.focus("#sel");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await sleep(150);
      await clickAt("#cb3text");
    },
    verify: async (r) => {
      const hit = r.live.filter((s) => (s.selector || {}).css === "#sel");
      if (!hit.length) return { verdict: "nicht", detail: "kein Schritt fuer die Auswahl" };
      const s = hit[hit.length - 1];
      const good = s.action === "type" && /GmbH|UG|Einzelunternehmen|Rechtsform/.test(s.label || "");
      return { verdict: good ? "erfasst" : "teilweise", detail: `label=${JSON.stringify(s.label)} aufgeloest=${await resolves(s.selector)}` };
    },
  });

  await testCase({
    id: "1.2-select-maus",
    muster: "Natives <select>: Option per Maus waehlen",
    supported: true,
    note: "Das aufgeklappte Menue eines <select> zeichnet der BROWSER, nicht die Seite - ein Klick darin erzeugt nie ein DOM-Ereignis. Erfasst wird der change.",
    run: async () => {
      await page.selectOption("#sel", "ek");
      await sleep(150);
      await clickAt("#cb3text");
    },
    verify: async (r) => {
      const hit = r.live.filter((s) => (s.selector || {}).css === "#sel");
      return hit.length
        ? { verdict: "erfasst", detail: `label=${JSON.stringify(hit[0].label)}` }
        : { verdict: "nicht" };
    },
  });

  await testCase({
    id: "1.3-datalist",
    muster: "<datalist>-Vorschlag uebernehmen",
    supported: true,
    note: "Die Vorschlagsliste selbst ist Browser-UI; erfasst wird der uebernommene Wert.",
    run: async () => {
      await clickAt("#dl");
      await page.type("#dl", "Finanzamt Hamburg", { delay: 5 });
      await sleep(80);
      await clickAt("#cb3text");
    },
    verify: async (r) => {
      const hit = r.live.filter((s) => (s.selector || {}).css === "#dl");
      if (!hit.length) return { verdict: "nicht" };
      const s = hit[hit.length - 1];
      return { verdict: s.action === "type" ? "erfasst" : "teilweise", detail: `typed_value=${JSON.stringify(s.typed_value)}` };
    },
  });

  for (const [id, sel, val, muster] of [
    ["1.4-date", "#dt", "2026-03-31", "<input type=date> ausfuellen"],
    ["1.5-time", "#tm", "09:30", "<input type=time> ausfuellen"],
    ["1.6-number", "#num", "4711", "<input type=number> ausfuellen"],
  ]) {
    await testCase({
      id,
      muster,
      supported: true,
      run: async () => {
        await page.fill(sel, val);
        await sleep(80);
        await clickAt("#cb3text");
      },
      verify: async (r) => {
        const hit = r.live.filter((s) => (s.selector || {}).css === sel);
        if (!hit.length) return { verdict: "nicht" };
        const s = hit[0];
        return {
          verdict: s.typed_value ? "erfasst" : "teilweise",
          detail: `label=${JSON.stringify(s.label)} typed_value=${JSON.stringify(s.typed_value)}`,
        };
      },
    });
  }

  await testCase({
    id: "1.7-color",
    muster: "<input type=color>: Farbe waehlen",
    supported: true,
    note: "Der Farbwaehler ist ein Betriebssystem-Fenster; erfasst wird (wie beim Schieberegler) die GEWAEHLTE Farbe beim change.",
    run: async () => {
      await clickAt("#col");
      await page.evaluate(() => {
        const el = document.getElementById("col");
        el.value = "#ff0066";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await sleep(150);
      await clickAt("#cb3text");
    },
    verify: async (r) => {
      const hit = r.live.filter((s) => (s.selector || {}).css === "#col");
      if (!hit.length) return { verdict: "nicht", detail: "weder Klick noch Wert erfasst" };
      const withValue = hit.filter((s) => s.action === "type");
      return withValue.length
        ? { verdict: "erfasst", detail: `label=${JSON.stringify(withValue[0].label)} Farbe beim Screenshot=${withValue[0].__probe && withValue[0].__probe.col}` }
        : { verdict: "teilweise", detail: "nur der Klick auf das Feld; die gewaehlte Farbe fehlt im Schritt" };
    },
  });

  await testCase({
    id: "1.8-range",
    muster: "Schieberegler (input type=range) ziehen",
    supported: true,
    run: async () => {
      const c = await center("#rng");
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await page.mouse.move(c.x + 60, c.y, { steps: 8 });
      await page.mouse.up();
      await sleep(300);
    },
    verify: async (r) => {
      const hit = r.live.filter((s) => (s.selector || {}).css === "#rng");
      if (!hit.length) return { verdict: "nicht" };
      const s = hit[hit.length - 1];
      return {
        verdict: s.action === "type" ? "erfasst" : "teilweise",
        detail: `Wert beim Screenshot: ${s.__probe && s.__probe.rng}, label=${JSON.stringify(s.label)}`,
      };
    },
  });

  await testCase({
    id: "1.9-datei-dialog",
    muster: "Datei ueber den Datei-Dialog waehlen",
    supported: true,
    note: "Der Datei-Dialog selbst ist ein Betriebssystem-Fenster (nie aufnehmbar). Erfasst wird der Knopf-Klick, der in den Datei-Schritt gefaltet wird.",
    run: async () => {
      await clickAt("#fil");
      await page.setInputFiles("#fil", {
        name: "beleg.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 test"),
      });
      await sleep(250);
    },
    verify: async (r) => {
      const up = r.live.filter((s) => s.fileMeta);
      if (!up.length) return { verdict: "nicht" };
      return { verdict: up[0].foldPrevClick ? "erfasst" : "teilweise", detail: `foldPrevClick=${up[0].foldPrevClick}` };
    },
  });

  for (const [id, sel, muster] of [
    ["2.1-checkbox-labelfor", "#cb1", "Kontrollkaestchen mit <label for> (Klick auf das Kaestchen)"],
    ["2.2-checkbox-labelklick", "label[for=cb1]", "Klick auf das Label eines Kontrollkaestchens"],
    ["2.3-checkbox-umschliessend", "#cb2", "Kontrollkaestchen in umschliessendem <label>"],
    ["2.4-checkbox-ohne-label", "#cb3", "Kontrollkaestchen OHNE Label"],
    ["2.5-radio", "#r1", "Radio-Knopf mit Label"],
    ["2.6-switch-liste", "#sw", "Schalter (role=switch) in einer Liste"],
  ]) {
    await testCase({
      id,
      muster,
      supported: true,
      run: async () => {
        await clickAt(sel);
      },
      verify: async (r) =>
        one(r, async (s) => {
          const lbl = (s.label || "").trim();
          const hasLabel = lbl.length > 1 && !/^(input|div|span|label)$/i.test(lbl);
          const css = (s.selector || {}).css || "";
          const stable = !/nth-of-type/.test(css);
          const found = await resolves(s.selector);
          return {
            verdict: hasLabel && stable && found !== "nicht-gefunden" ? "erfasst" : "teilweise",
            detail: `label=${JSON.stringify(s.label)} css=${JSON.stringify(css)} wiedergefunden=${found}`,
          };
        }),
    });
  }

  await testCase({
    id: "2.7-checkbox-leertaste",
    muster: "Kontrollkaestchen per LEERTASTE umschalten (reine Tastatur)",
    supported: true,
    run: async () => {
      await page.focus("#cb1");
      await page.keyboard.press("Space");
      await sleep(250);
    },
    verify: async (r) =>
      one(r, async (s) => ({ verdict: "erfasst", detail: `label=${JSON.stringify(s.label)}` })),
  });

  // =========================================================================================
  console.log("\n===== 2) Reine Tastatur, Markieren, Zwischenablage, Rechtsklick =====");
  await open("/keyboard.html");

  for (const [id, sel, key, muster] of [
    ["3.1-tab-enter-knopf", "#kb1", "Enter", "Tab zum Knopf, dann Enter"],
    ["3.2-tab-space-knopf", "#kb1", "Space", "Tab zum Knopf, dann Leertaste"],
    ["3.3-tab-enter-link", "#kb2", "Enter", "Tab zum Link, dann Enter"],
    ["3.4-tab-enter-divbutton", "#kb3", "Enter", "Tab zu einem eigenen Knopf (div role=button), dann Enter"],
  ]) {
    await testCase({
      id,
      muster,
      supported: true,
      run: async () => {
        await page.focus(sel);
        await page.keyboard.press(key);
        await sleep(250);
      },
      verify: async (r) =>
        one(r, async (s) => ({
          verdict: s.action === "click" && s.label ? "erfasst" : "teilweise",
          detail: `label=${JSON.stringify(s.label)} css=${JSON.stringify((s.selector || {}).css)}`,
        })),
    });
  }

  await testCase({
    id: "3.4b-leertaste-scrollt",
    muster: "Leertaste ohne Bedienelement im Fokus (scrollt nur)",
    supported: true,
    note: "Gegenprobe zur Tastatur-Bedienung: hier darf KEIN Schritt entstehen.",
    run: async () => {
      await page.evaluate(() => document.getElementById("para").focus());
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press("Space");
      await sleep(250);
    },
    verify: async (r) =>
      r.live.length === 0
        ? { verdict: "erfasst", detail: "kein Schritt (korrekt)" }
        : { verdict: "teilweise", detail: `${r.live.length} ueberfluessige(r) Schritt(e)` },
  });

  await testCase({
    id: "3.5-pfeiltasten-listbox",
    muster: "Pfeiltasten in einer Listbox (Auswahl wechseln)",
    supported: true,
    note: "Welle 55 (L4): mehrere Pfeiltastendruecke ergeben EINEN Schritt auf den zuletzt gewaehlten Eintrag.",
    run: async () => {
      await page.focus("#lb");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await sleep(600);
    },
    verify: async (r) =>
      one(r, async (s) => ({
        verdict: s.action === "click" && s.label ? "erfasst" : "teilweise",
        detail: `label=${JSON.stringify(s.label)} css=${JSON.stringify((s.selector || {}).css)} (ein Schritt fuer beide Pfeiltasten)`,
      })),
  });

  await testCase({
    id: "3.5b-pfeiltasten-ohne-menue",
    muster: "Pfeiltasten ausserhalb von Menue/Liste (Gegenprobe: kein Schritt)",
    supported: true,
    note: "Schutz vor Schritt-Flut: nur Menues/Listen zaehlen, blosses Blaettern nicht.",
    run: async () => {
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await sleep(600);
    },
    verify: async (r) =>
      r.live.length === 0
        ? { verdict: "erfasst", detail: "kein Schritt (korrekt)" }
        : { verdict: "teilweise", detail: `${r.live.length} ueberfluessige(r) Schritt(e)` },
  });

  await testCase({
    id: "3.6-pfeiltasten-menue",
    muster: "Menue per Pfeiltaste oeffnen, Eintrag per Enter waehlen",
    supported: true,
    note: "Welle 55 (L4): erst das OEFFNEN (Schritt auf den Menue-Knopf), dann die Auswahl per Enter.",
    run: async () => {
      await page.focus("#mtrig");
      await page.keyboard.press("ArrowDown");
      await sleep(150);
      await page.keyboard.press("Enter");
      await sleep(400);
    },
    verify: async (r) => {
      if (!r.live.length) return { verdict: "nicht" };
      if (r.live.length === 1) {
        return { verdict: "teilweise", detail: `nur „${r.live[0].label}“ - der Schritt zum Oeffnen des Menues fehlt` };
      }
      const opener = (r.live[0].selector || {}).css === "#mtrig";
      return {
        verdict: opener ? "erfasst" : "teilweise",
        detail: r.live.map((s) => s.label).join(" -> "),
      };
    },
  });

  await testCase({
    id: "3.7-escape",
    muster: "Escape schliesst ein Overlay",
    supported: false,
    note: "Bewusst ausgeschlossen - fuer eine Anleitung ('mit Esc schliessen') aber oft relevant.",
    run: async () => {
      await clickAt("#ovtrig");
      reset();
      await page.keyboard.press("Escape");
      await sleep(250);
    },
    verify: async (r) => (r.live.length ? { verdict: "erfasst" } : { verdict: "nicht" }),
  });

  await testCase({
    id: "4.1-text-markieren",
    muster: "Text mit der Maus markieren",
    supported: false,
    run: async () => {
      const box = await page.evaluate(() => {
        const r = document.getElementById("para").getBoundingClientRect();
        return { x1: r.left + 5, y1: r.top + r.height / 2, x2: r.left + 220, y2: r.top + r.height / 2 };
      });
      await page.mouse.move(box.x1, box.y1);
      await page.mouse.down();
      await page.mouse.move(box.x2, box.y2, { steps: 10 });
      await page.mouse.up();
      await sleep(250);
    },
    verify: async (r) =>
      r.live.length
        ? { verdict: "teilweise", detail: "Es entstand ein Schritt, aber er beschreibt kein Markieren" }
        : { verdict: "nicht", detail: "Markieren erzeugt nie einen Schritt" },
  });

  await testCase({
    id: "4.2-kopieren-einfuegen-im-feld",
    muster: "Strg+C / Strg+V zwischen zwei Eingabefeldern",
    supported: true,
    note: "Bewusst KEIN Kuerzel-Schritt - der eingefuegte Text erscheint als normaler Eingabe-Schritt.",
    run: async () => {
      await clickAt("#src");
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Control+c");
      await clickAt("#dst");
      await page.keyboard.press("Control+v");
      await sleep(200);
      await clickAt("#para");
      await sleep(200);
    },
    verify: async (r) => {
      const keys = r.live.filter((s) => s.interaction && s.interaction.variant === "key");
      if (keys.length) return { verdict: "teilweise", detail: "Tastenkuerzel faelschlich als Schritt erfasst" };
      const typed = r.live.filter((s) => s.action === "type" && (s.selector || {}).css === "#dst");
      if (!typed.length) return { verdict: "nicht", detail: "Einfuegen erzeugte keinen Eingabe-Schritt" };
      return { verdict: "erfasst", detail: `Eingabe-Schritt typed_value=${JSON.stringify(typed[0].typed_value)}` };
    },
  });

  await testCase({
    id: "4.3-kopieren-ausserhalb",
    muster: "Strg+C ausserhalb eines Feldes (markierten Text kopieren)",
    supported: false,
    run: async () => {
      await page.evaluate(() => {
        const r = document.createRange();
        r.selectNodeContents(document.getElementById("para"));
        const s = document.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      });
      reset();
      await page.keyboard.press("Control+c");
      await sleep(250);
    },
    verify: async (r) => {
      const keys = r.live.filter((s) => s.interaction && s.interaction.variant === "key");
      if (!keys.length) return { verdict: "nicht" };
      return {
        verdict: "teilweise",
        detail: `Schritt '${keys[0].interaction.key}' ohne Bezug zum markierten Text (label=${JSON.stringify(keys[0].label)})`,
      };
    },
  });

  await testCase({
    id: "4.4-ausschneiden",
    muster: "Strg+X (Ausschneiden) in einem Feld",
    supported: true,
    run: async () => {
      await clickAt("#src");
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Control+x");
      await sleep(200);
      await clickAt("#para");
      await sleep(200);
    },
    verify: async (r) => {
      const keys = r.live.filter((s) => s.interaction && s.interaction.variant === "key");
      if (keys.length) return { verdict: "teilweise", detail: "Strg+X faelschlich als Kuerzel-Schritt" };
      const typed = r.live.filter((s) => s.action === "type");
      return typed.length
        ? { verdict: "erfasst", detail: "als Eingabe-Schritt (Feld jetzt leer)" }
        : { verdict: "nicht", detail: "kein Schritt fuer das geleerte Feld" };
    },
  });

  await testCase({
    id: "4.5-rechtsklick-eigenes-menue",
    muster: "Rechtsklick mit EIGENEM Kontextmenue der Web-App",
    supported: true,
    run: async () => {
      await clickAt("#ownctx", { button: "right" });
      await sleep(300);
    },
    verify: async (r) =>
      one(r, async (s) => ({
        verdict: s.interaction && s.interaction.variant === "right" ? "erfasst" : "teilweise",
        detail: `label=${JSON.stringify(s.label)} interaction=${JSON.stringify(s.interaction)}`,
      })),
  });

  await testCase({
    id: "4.6-rechtsklick-browsermenue",
    muster: "Rechtsklick OHNE eigenes Menue (Browser-Kontextmenue)",
    supported: true,
    note: "Das Browser-Menue laesst sich nicht abspielen - der Schritt wird darum absichtlich zurueckgenommen.",
    run: async () => {
      await clickAt("#browserctx", { button: "right" });
      await sleep(300);
    },
    verify: async (r) =>
      r.live.length === 0 && r.retracts.length > 0
        ? { verdict: "erfasst", detail: "Schritt korrekt zurueckgenommen (Browser-Grenze)" }
        : { verdict: "teilweise", detail: `${r.live.length} Schritt(e) geblieben, ${r.retracts.length} zurueckgenommen` },
  });

  // =========================================================================================
  console.log("\n===== 3) Scrollen, Seitenwechsel, neue Tabs =====");
  await open("/scroll-nav.html");

  await testCase({
    id: "5.1-klick-weit-unten",
    muster: "Klick auf ein Element weit unten (nach Scrollen)",
    supported: true,
    run: async () => {
      await page.evaluate(() => document.getElementById("deep").scrollIntoView({ block: "center" }));
      await sleep(250);
      reset();
      await clickAt("#deep");
    },
    verify: async (r) =>
      one(r, async (s) => {
        const rect = s.rect || {};
        const inView = rect.y > 0 && rect.y < 1 && rect.h > 0;
        return {
          verdict: inView ? "erfasst" : "teilweise",
          detail: `Markierung im sichtbaren Fenster: ${inView} (y=${rect.y}), scrollY beim Screenshot=${s.__probe && s.__probe.scrollY}`,
        };
      }),
  });

  await testCase({
    id: "5.2-sticky-kopfzeile",
    muster: "Knopf in einer sticky Kopfzeile (mitten im Scrollen)",
    supported: true,
    run: async () => {
      await clickAt("#stickybtn");
    },
    verify: async (r) => one(r, async (s) => ({ verdict: (s.rect || {}).h > 0 ? "erfasst" : "teilweise", detail: `rect.y=${(s.rect || {}).y}` })),
  });

  await testCase({
    id: "5.3-fixed-leiste",
    muster: "Knopf in einer position:fixed-Fussleiste",
    supported: true,
    run: async () => {
      await clickAt("#fixedbtn");
    },
    verify: async (r) => one(r, async (s) => ({ verdict: (s.rect || {}).h > 0 ? "erfasst" : "teilweise", detail: `rect.y=${(s.rect || {}).y}` })),
  });

  await testCase({
    id: "5.4-scroll-container",
    muster: "Knopf in einem eigenen scrollbaren Container",
    supported: true,
    run: async () => {
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        document.getElementById("inbox").scrollIntoView({ block: "center" });
      });
      await sleep(300);
      reset();
      await clickAt("#inbox");
    },
    verify: async (r) =>
      one(r, async (s) => ({
        verdict: (s.rect || {}).h > 0 ? "erfasst" : "teilweise",
        detail: `rect=${JSON.stringify(s.rect)} wiedergefunden=${await resolves(s.selector)}`,
      })),
  });

  await testCase({
    id: "5.5-nachladen",
    muster: "Unendliches Nachladen: Klick auf eine nachgeladene Zeile",
    supported: true,
    run: async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(500);
      const n = await page.evaluate(() => document.querySelectorAll("#list button").length);
      if (n < 6) throw new Error("nichts nachgeladen (" + n + " Zeilen)");
      // NICHT die letzte Zeile: die fixe Fussleiste liegt darueber.
      await page.evaluate(() => document.querySelector("#list li:nth-child(8) button").scrollIntoView({ block: "center" }));
      await sleep(250);
      reset();
      await clickAt("#list li:nth-child(8) button");
    },
    verify: async (r) =>
      one(r, async (s) => ({
        verdict: "erfasst",
        detail: `label=${JSON.stringify(s.label)} css=${JSON.stringify((s.selector || {}).css)} (Positionsselektor - bei anderer Zeilenzahl nicht stabil)`,
      })),
  });

  await testCase({
    id: "5.6-nur-scrollen",
    muster: "Nur scrollen (ohne Klick)",
    supported: false,
    run: async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(200);
      reset();
      await page.mouse.wheel(0, 900);
      await sleep(400);
    },
    verify: async (r) => (r.live.length ? { verdict: "erfasst" } : { verdict: "nicht", detail: "Scrollen erzeugt nie einen Schritt" }),
  });

  await testCase({
    id: "6.1-spa-route",
    muster: "SPA-Routenwechsel per History-API (pushState) nach Klick",
    supported: true,
    note: "Der KLICK wird erfasst; der Routenwechsel selbst ist kein eigener Schritt.",
    run: async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(200);
      reset();
      await clickAt("#spa");
      await sleep(350);
    },
    verify: async (r) =>
      one(r, async (s) => ({
        verdict: "erfasst",
        detail: `Screenshot-Moment: url=${s.__probe && s.__probe.url} (vor dem Routenwechsel - gewollt)`,
      })),
  });

  // Ab hier laeuft die Aufnahme SCHON, waehrend die Seiten geladen werden (navMode) — nur so
  // koennen Seitenwechsel-Schritte entstehen (sonst gilt „die Seite war vorher schon offen").
  navMode(true);

  await testCase({
    id: "6.2-zurueck-knopf",
    muster: "Zurueck-Knopf des Browsers",
    supported: true,
    note: "Welle 55 (L1): die Seite sieht den Klick nie — erkannt wird die ANKUNFT (navigation type back_forward bzw. pageshow aus dem bfcache).",
    run: async () => {
      await open("/scroll-nav.html");
      await page.goto("http://steply.test/zweite.html", { waitUntil: "load" });
      await arm();
      // Abstand > 1,5 s: sonst gilt der Wechsel als FOLGE des vorigen Schritts (gewollt).
      await sleep(1800);
      reset();
      await page.goBack({ waitUntil: "load" }).catch(() => {});
      await arm();
      await sleep(900);
    },
    verify: async (r) => {
      const nav = r.live.filter((s) => s.interaction && s.interaction.variant === "nav");
      if (!nav.length) return { verdict: "nicht" };
      const s = nav[0];
      const ok = s.interaction.nav === "back" && !s.selector;
      return {
        verdict: ok ? "erfasst" : "teilweise",
        detail: `nav=${s.interaction.nav} ohne Selektor=${!s.selector} Seite beim Screenshot=${JSON.stringify(s.__url)}`,
      };
    },
  });

  await testCase({
    id: "6.3-neu-laden",
    muster: "Seite neu laden (F5)",
    supported: true,
    note: "Welle 55 (L1): Schritt „Seite neu laden“, Screenshot zeigt die NEU geladene Seite.",
    run: async () => {
      await open("/scroll-nav.html");
      await sleep(1800);
      reset();
      await page.reload({ waitUntil: "load" }).catch(() => {});
      await arm();
      await sleep(900);
    },
    verify: async (r) => {
      const nav = r.live.filter((s) => s.interaction && s.interaction.variant === "nav");
      if (!nav.length) return { verdict: "nicht" };
      const s = nav[0];
      return {
        verdict: s.interaction.nav === "reload" && !s.selector ? "erfasst" : "teilweise",
        detail: `nav=${s.interaction.nav} ohne Selektor=${!s.selector}`,
      };
    },
  });

  await testCase({
    id: "6.3b-adressleiste",
    muster: "Neue Seite ohne Klick ansteuern (Adressleiste/Weiterleitung)",
    supported: true,
    note: "Welle 55 (L1): Schritt „Weiter zu ‚Zweite Seite‘“ — sonst klafft in der Anleitung ein Sprung.",
    run: async () => {
      await sleep(1800);
      reset();
      await page.goto("http://steply.test/zweite.html", { waitUntil: "load" });
      await arm();
      await sleep(900);
    },
    verify: async (r) => {
      const nav = r.live.filter((s) => s.interaction && s.interaction.variant === "nav");
      if (!nav.length) return { verdict: "nicht" };
      const s = nav[0];
      return {
        verdict: s.interaction.nav === "goto" && !s.selector ? "erfasst" : "teilweise",
        detail: `nav=${s.interaction.nav} title=${JSON.stringify(s.title)}`,
      };
    },
  });

  await testCase({
    id: "6.3c-klick-dann-wechsel",
    muster: "Klick auf einen Link: KEIN zweiter Schritt fuer den Seitenwechsel",
    supported: true,
    note: "Gegenprobe zu L1: folgt der Wechsel binnen 1,5 s auf einen erfassten Schritt, ist er dessen Folge.",
    run: async () => {
      await open("/scroll-nav.html");
      await sleep(1800);
      reset();
      await clickAt("#timernav");
      await page.waitForURL("**/zweite.html", { timeout: 4000 }).catch(() => {});
      await arm();
      await sleep(900);
    },
    verify: async (r) => {
      const nav = r.live.filter((s) => s.interaction && s.interaction.variant === "nav");
      const click = r.live.filter((s) => (s.selector || {}).css === "#timernav");
      if (!click.length) return { verdict: "nicht", detail: "der Klick selbst fehlt" };
      return nav.length
        ? { verdict: "teilweise", detail: `ueberfluessiger Seitenwechsel-Schritt (${nav.length})` }
        : { verdict: "erfasst", detail: "nur der Klick — kein Doppel-Schritt" };
    },
  });

  navMode(false);

  await testCase({
    id: "6.4-weiterleitung-ohne-klick",
    muster: "Seitenwechsel per Timer/Weiterleitung nach einem Klick",
    supported: true,
    note: "Der ausloesende Klick wird erfasst; das Ankommen auf der Zielseite ist kein eigener Schritt.",
    run: async () => {
      await open("/scroll-nav.html");
      reset();
      await clickAt("#timernav");
      await page.waitForURL("**/zweite.html", { timeout: 4000 }).catch(() => {});
      await sleep(300);
      await arm();
    },
    verify: async (r) => {
      const hit = r.live.filter((s) => (s.selector || {}).css === "#timernav");
      if (!hit.length) return { verdict: "nicht" };
      const nachher = r.live.length > hit.length;
      return {
        verdict: "erfasst",
        detail: `Klick erfasst; Schritte nach dem Seitenwechsel: ${nachher ? "ja" : "keine (Zielseite erzeugt keinen Schritt)"}`,
      };
    },
  });

  await testCase({
    id: "7.1-neuer-tab",
    muster: "Link mit target=_blank (neuer Tab)",
    supported: true,
    note: "Der Klick im Ausgangs-Tab wird erfasst. Ob im NEUEN Tab weiter aufgenommen wird, entscheidet panel.js (guideExtraTabs ueber openerTabId) - hier nicht simulierbar.",
    run: async () => {
      await open("/scroll-nav.html");
      reset();
      const [popup] = await Promise.all([ctx.waitForEvent("page", { timeout: 4000 }).catch(() => null), clickAt("#blank")]);
      await sleep(300);
      if (popup) await popup.close().catch(() => {});
    },
    verify: async (r) =>
      one(r, async (s) => ({ verdict: "erfasst", detail: `label=${JSON.stringify(s.label)}` })),
  });

  await testCase({
    id: "7.2-window-open",
    muster: "window.open aus JavaScript",
    supported: true,
    run: async () => {
      reset();
      const [popup] = await Promise.all([ctx.waitForEvent("page", { timeout: 4000 }).catch(() => null), clickAt("#winopen")]);
      await sleep(300);
      if (popup) await popup.close().catch(() => {});
    },
    verify: async (r) => one(r, async (s) => ({ verdict: "erfasst", detail: `label=${JSON.stringify(s.label)}` })),
  });

  await testCase({
    id: "7.3-download",
    muster: "Klick auf einen Download-Link",
    supported: true,
    note: "Der Klick wird erfasst; die Datei selbst und das Download-Fenster des Browsers nicht.",
    run: async () => {
      reset();
      await clickAt("#dl");
      await sleep(300);
    },
    verify: async (r) => one(r, async (s) => ({ verdict: "erfasst", detail: `label=${JSON.stringify(s.label)}` })),
  });

  // =========================================================================================
  console.log("\n===== 4) Widgets, Dialoge, Canvas, Shadow DOM =====");
  await open("/widgets.html");

  await testCase({
    id: "8.1-shadow-offen",
    muster: "Knopf in einem OFFENEN Shadow DOM",
    supported: true,
    run: async () => {
      const c = await page.evaluate(() => {
        const r = document.getElementById("sopen").shadowRoot.getElementById("sb").getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await clickXY(c.x, c.y);
    },
    verify: async (r) =>
      one(r, async (s) => ({
        verdict: s.label && (s.selector || {}).shadow ? "erfasst" : "teilweise",
        detail: `label=${JSON.stringify(s.label)} shadow=${JSON.stringify((s.selector || {}).shadow)}`,
      })),
  });

  await testCase({
    id: "8.2-shadow-geschlossen",
    muster: "Knopf in einem GESCHLOSSENEN Shadow DOM",
    supported: true,
    note: "Browser-Grenze bleibt: der Knopf ist unsichtbar. Welle 55 (L6) erfasst darum einen Schritt MIT Klickpunkt-Markierung und OHNE Selektor -> nicht automatisierbar.",
    run: async () => {
      const c = await center("#sclosed");
      await clickXY(c.x, c.y);
    },
    verify: async (r) =>
      one(r, async (s) => {
        const spot = s.interaction && s.interaction.variant === "spot";
        const rc = s.rect || {};
        return {
          verdict: spot && !s.selector ? "erfasst" : "teilweise",
          detail: `variant=${s.interaction && s.interaction.variant} ohne Selektor=${!s.selector} Markierung=${(rc.w * rc.h).toFixed(5)} (Klickpunkt)`,
        };
      }),
  });

  await testCase({
    id: "8.3-canvas",
    muster: "Klick auf eine Canvas-Oberflaeche (Google-Docs-Muster)",
    supported: true,
    note: "In Canvas-Oberflaechen gibt es kein DOM-Element pro Knopf - ein Selektor kann dort nie mehr als 'die Zeichenflaeche' sein.",
    run: async () => {
      const r = await page.evaluate(() => {
        const b = document.getElementById("cv").getBoundingClientRect();
        return { x: b.left + 60, y: b.top + 36 };
      });
      await clickXY(r.x, r.y);
    },
    verify: async (r) =>
      one(r, async (s) => {
        const spot = s.interaction && s.interaction.variant === "spot";
        return {
          verdict: spot && !s.selector ? "erfasst" : "teilweise",
          detail: `variant=${s.interaction && s.interaction.variant} ohne Selektor=${!s.selector} rect=${JSON.stringify(s.rect)} (Markierung am Klickpunkt)`,
        };
      }),
  });

  await testCase({
    id: "8.3b-leerflaeche",
    muster: "Klick auf eine echte Leerflaeche (Gegenprobe: kein Schritt)",
    supported: true,
    note: "Der Dead-Click-Filter muss bleiben — sonst entstuende aus jedem Fehlklick ein Schritt.",
    run: async () => {
      await page.mouse.click(1080, 8);
      await sleep(250);
    },
    verify: async (r) =>
      r.live.length === 0
        ? { verdict: "erfasst", detail: "kein Schritt (korrekt)" }
        : { verdict: "teilweise", detail: `${r.live.length} ueberfluessige(r) Schritt(e)` },
  });

  await testCase({
    id: "8.4-svg-knopf",
    muster: "SVG-Element als Knopf (role=button)",
    supported: true,
    run: async () => {
      await clickAt("#svgbtn");
    },
    verify: async (r) =>
      one(r, async (s) => ({
        verdict: s.label && s.label.length > 1 ? "erfasst" : "teilweise",
        detail: `label=${JSON.stringify(s.label)} css=${JSON.stringify((s.selector || {}).css)} wiedergefunden=${await resolves(s.selector)}`,
      })),
  });

  await testCase({
    id: "8.5-svg-ohne-rolle",
    muster: "Klickbares SVG OHNE Rolle/Label (z. B. Icon-Grafik)",
    supported: false,
    run: async () => {
      await clickAt("#svgcircle");
    },
    verify: async (r) => {
      if (!r.live.length) return { verdict: "nicht", detail: "kein Schritt (kein Label, keine Rolle, kein pointer-Cursor)" };
      const s = r.live[0];
      return {
        verdict: s.label ? "erfasst" : "teilweise",
        detail: `label=${JSON.stringify(s.label)} css=${JSON.stringify((s.selector || {}).css)}`,
      };
    },
  });

  await testCase({
    id: "9.1-hover-tooltip",
    muster: "Hover-Tooltip ohne Klick",
    supported: false,
    run: async () => {
      const c = await center("#hov");
      await page.mouse.move(c.x, c.y);
      await sleep(400);
    },
    verify: async (r) => (r.live.length ? { verdict: "erfasst" } : { verdict: "nicht", detail: "reines Hovern erzeugt nie einen Schritt" }),
  });

  await testCase({
    id: "9.2-doppelklick-tabelle",
    muster: "Doppelklick zum Bearbeiten in einer GEWOEHNLICHEN Tabellenzelle",
    supported: true,
    note: "Welle 55 (L7): Doppelklicks IN Tabellenzellen (td/gridcell/cell) werden nachgereicht — bewusst nur dort, damit ein Doppelklick auf Fliesstext (Wort markieren) keinen Schritt erzeugt.",
    run: async () => {
      const c = await center("#cell");
      await page.mouse.dblclick(c.x, c.y);
      await sleep(400);
    },
    verify: async (r) => {
      const dbl = r.live.filter((s) => s.interaction && s.interaction.variant === "double");
      if (!dbl.length) return { verdict: r.live.length ? "teilweise" : "nicht", detail: `${r.live.length} Schritt(e), kein 'double'` };
      return { verdict: "erfasst", detail: `label=${JSON.stringify(dbl[0].label)}` };
    },
  });

  await testCase({
    id: "9.2b-doppelklick-bedienbare-zelle",
    muster: "Doppelklick auf eine BEDIENBARE Zelle (tabindex)",
    supported: true,
    note: "Gegenprobe zu 9.2: sobald die Zelle fokussierbar/bedienbar ist, greift die Doppelklick-Erkennung.",
    run: async () => {
      const c = await center("#cell2");
      await page.mouse.dblclick(c.x, c.y);
      await sleep(400);
    },
    verify: async (r) => {
      const dbl = r.live.filter((s) => s.interaction && s.interaction.variant === "double");
      return dbl.length
        ? { verdict: "erfasst", detail: `label=${JSON.stringify(dbl[0].label)}` }
        : { verdict: r.live.length ? "teilweise" : "nicht", detail: `${r.live.length} Schritt(e), kein 'double'` };
    },
  });

  await testCase({
    id: "9.3-contenteditable",
    muster: "Inline-Bearbeitung (contenteditable)",
    supported: true,
    run: async () => {
      await clickAt("#rte");
      await page.keyboard.press("Control+a");
      await page.keyboard.type("Neuer Text 2026", { delay: 5 });
      await sleep(150);
      await clickAt("#hov");
      await sleep(250);
    },
    verify: async (r) => {
      const t = r.live.filter((s) => s.action === "type");
      return t.length
        ? { verdict: "erfasst", detail: `typed_value=${JSON.stringify(t[0].typed_value)}` }
        : { verdict: "nicht" };
    },
  });

  await testCase({
    id: "10.1-dialog-modal",
    muster: "<dialog>-Element (modal) oeffnen und bestaetigen",
    supported: true,
    run: async () => {
      await clickAt("#dlgopen");
      await clickAt("#dlgok");
      await sleep(250);
    },
    verify: async (r) =>
      r.live.length === 2
        ? { verdict: "erfasst", detail: r.live.map((s) => s.label).join(" -> ") }
        : { verdict: r.live.length ? "teilweise" : "nicht", detail: `${r.live.length} Schritte` },
  });

  await testCase({
    id: "10.2-overlay-dialog",
    muster: "Overlay-Dialog (div, kein <dialog>)",
    supported: true,
    run: async () => {
      await clickAt("#ovopen");
      await clickAt("#ovok");
      await sleep(250);
    },
    verify: async (r) =>
      r.live.length === 2 ? { verdict: "erfasst", detail: r.live.map((s) => s.label).join(" -> ") } : { verdict: "teilweise", detail: `${r.live.length} Schritte` },
  });

  await testCase({
    id: "10.3-confirm",
    muster: "window.confirm() bestaetigen",
    supported: false,
    note: "Der Bestaetigungsdialog gehoert dem BROWSER - sein OK-Klick erzeugt kein DOM-Ereignis. Nur der ausloesende Klick wird erfasst.",
    run: async () => {
      dialogs.length = 0;
      await clickAt("#confirmbtn");
      await sleep(400);
    },
    verify: async (r) => {
      const saw = dialogs.includes("confirm");
      if (!saw) return { verdict: "nicht", detail: "Dialog kam nicht" };
      return r.live.length === 1
        ? { verdict: "teilweise", detail: "nur der ausloesende Klick; das Bestaetigen im Browser-Dialog fehlt" }
        : { verdict: "nicht", detail: `${r.live.length} Schritte` };
    },
  });

  await testCase({
    id: "10.4-alert-prompt",
    muster: "window.alert() / window.prompt()",
    supported: false,
    run: async () => {
      dialogs.length = 0;
      await clickAt("#alertbtn");
      await sleep(250);
      await clickAt("#promptbtn");
      await sleep(400);
    },
    verify: async (r) => ({
      verdict: "teilweise",
      detail: `Browser-Dialoge gesehen: ${dialogs.join(",") || "keine"}; erfasste Schritte: ${r.live.length} (nur die ausloesenden Klicks)`,
    }),
  });

  await testCase({
    id: "10.5-drucken",
    muster: "Drucken per Strg+P",
    supported: true,
    note: "Der Druck-Dialog selbst ist Browser-UI, aber das Tastenkuerzel wird als Schritt erfasst.",
    run: async () => {
      await page.focus("#printbtn");
      await page.keyboard.press("Control+p");
      await sleep(300);
    },
    verify: async (r) => {
      const keys = r.live.filter((s) => s.interaction && s.interaction.variant === "key");
      return keys.length
        ? { verdict: "erfasst", detail: `key=${keys[0].interaction.key}` }
        : { verdict: "nicht" };
    },
  });

  // page.mouse.click kennt KEINE modifiers-Option (die gibt es nur an locator.click) — die
  // Taste muss darum echt gedrueckt gehalten werden, sonst prueft der Test gar nichts.
  const clickWithKeys = async (sel, keys) => {
    for (const k of keys) await page.keyboard.down(k);
    try {
      await clickAt(sel);
    } finally {
      for (const k of keys.slice().reverse()) await page.keyboard.up(k);
    }
  };

  await testCase({
    id: "11.1-strg-klick",
    muster: "Mehrfachauswahl per Strg+Klick",
    supported: true,
    note: "Welle 55 (L3): ohne die Strg-Taste im Schritt verliert der Leser seine bisherige Auswahl, und der Automations-Lauf waehlt falsch.",
    run: async () => {
      await clickAt("#m1");
      reset();
      await clickWithKeys("#m3", ["Control"]);
      await sleep(250);
    },
    verify: async (r) =>
      one(r, async (s) => {
        const mods = (s.interaction && s.interaction.modifiers) || [];
        return {
          verdict: mods.length === 1 && mods[0] === "ctrl" ? "erfasst" : "teilweise",
          detail: `interaction=${JSON.stringify(s.interaction || null)}; Auswahl beim Screenshot=${s.__probe && s.__probe.sel}`,
        };
      }),
  });

  await testCase({
    id: "11.2-shift-klick",
    muster: "Bereichsauswahl per Shift+Klick",
    supported: true,
    run: async () => {
      await clickAt("#m1");
      reset();
      await clickWithKeys("#m4", ["Shift"]);
      await sleep(250);
    },
    verify: async (r) =>
      one(r, async (s) => {
        const mods = (s.interaction && s.interaction.modifiers) || [];
        return {
          verdict: mods.length === 1 && mods[0] === "shift" ? "erfasst" : "teilweise",
          detail: `interaction=${JSON.stringify(s.interaction || null)}`,
        };
      }),
  });

  await testCase({
    id: "11.3-strg-umschalt-klick",
    muster: "Strg+Umschalt+Klick (beide Zusatztasten)",
    supported: true,
    run: async () => {
      await clickAt("#m1");
      reset();
      await clickWithKeys("#m4", ["Control", "Shift"]);
      await sleep(250);
    },
    verify: async (r) =>
      one(r, async (s) => {
        const mods = (s.interaction && s.interaction.modifiers) || [];
        return {
          verdict: mods.join("+") === "ctrl+shift" ? "erfasst" : "teilweise",
          detail: `modifiers=${JSON.stringify(mods)} (feste Reihenfolge ctrl,meta,alt,shift)`,
        };
      }),
  });

  await testCase({
    id: "11.4-klick-ohne-zusatztaste",
    muster: "Gewoehnlicher Klick traegt KEINE Zusatztasten",
    supported: true,
    note: "Gegenprobe zu L3: sonst stuende in jeder Anleitung eine erfundene Taste.",
    run: async () => {
      reset();
      await clickAt("#m2");
      await sleep(250);
    },
    verify: async (r) =>
      one(r, async (s) => ({
        verdict: !(s.interaction && s.interaction.modifiers) ? "erfasst" : "teilweise",
        detail: `interaction=${JSON.stringify(s.interaction || null)}`,
      })),
  });

  await testCase({
    id: "12.1-langes-laden",
    muster: "Klick, Ergebnis erscheint erst nach 1,2 s",
    supported: true,
    note: "Gewollt: der Screenshot zeigt den Moment VOR dem Klick (mit dem Knopf). Das Ergebnis selbst erscheint in keinem Screenshot.",
    run: async () => {
      reset();
      await clickAt("#slow");
      await sleep(1600);
    },
    verify: async (r) =>
      one(r, async (s) => ({
        verdict: "erfasst",
        detail: `Ergebnis-Text beim Screenshot: ${JSON.stringify(s.__probe && s.__probe.slowout)} (das spaetere Ergebnis wird nie bebildert)`,
      })),
  });

  await testCase({
    id: "13.1-formular-knopf",
    muster: "Formular per Knopf absenden, Fehlermeldung erscheint",
    supported: true,
    run: async () => {
      await clickAt("#mail");
      await page.keyboard.type("keine-mail", { delay: 5 });
      reset();
      await clickAt("#submit");
      await sleep(300);
    },
    verify: async (r) => {
      const typed = r.live.filter((s) => s.action === "type");
      const click = r.live.filter((s) => s.action === "click");
      if (!typed.length || !click.length) return { verdict: "teilweise", detail: `${typed.length} Eingabe-, ${click.length} Klick-Schritte` };
      return {
        verdict: "erfasst",
        detail: `Eingabe + Klick erfasst; Fehlermeldung beim Screenshot sichtbar: ${click[0].__probe && click[0].__probe.err} (die Fehlermeldung selbst wird nie bebildert)`,
      };
    },
  });

  await testCase({
    id: "13.2-formular-enter",
    muster: "Formular per Enter absenden",
    supported: true,
    run: async () => {
      await page.fill("#mail", "");
      await clickAt("#mail");
      await page.keyboard.type("test@example.de", { delay: 5 });
      reset();
      await page.keyboard.press("Enter");
      await sleep(400);
    },
    verify: async (r) =>
      one(r, async (s) => ({
        verdict: s.interaction && s.interaction.enter === true ? "erfasst" : "teilweise",
        detail: `typed_value=${JSON.stringify(s.typed_value)} interaction=${JSON.stringify(s.interaction)}`,
      })),
  });

  // =========================================================================================
  console.log("\n\n===== ZUSAMMENFASSUNG =====");
  const counts = { erfasst: 0, teilweise: 0, nicht: 0 };
  for (const r of results) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
  for (const r of results) {
    console.log(`${(MARK[r.verdict] || r.verdict).padEnd(20)} ${r.id.padEnd(30)} ${r.muster}`);
  }
  console.log(
    `\nerfasst: ${counts.erfasst}  teilweise: ${counts.teilweise}  nicht erfasst: ${counts.nicht}  (gesamt ${results.length})`
  );
  if (STRICT) {
    console.log(strictFailed ? "\nSTRICT: FEHLGESCHLAGEN" : "\nSTRICT: alle unterstuetzten Muster in Ordnung");
    if (strictFailed) process.exitCode = 1;
  } else {
    console.log("\n(Bericht-Modus: Luecken sind kein Fehler. --strict prueft nur die unterstuetzten Muster.)");
  }
} catch (e) {
  console.error("\nAbbruch:", e && e.stack ? e.stack : e);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
