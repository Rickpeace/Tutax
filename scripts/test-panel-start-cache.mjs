// Welle 50a: Beweis des „5-Sekunden-Fix" im ECHTEN extension/panel.html + panel.js (Chromium,
// chrome-Stub, gemockte API — kein echtes Netz).
//
//   A) Mit gemerkter Liste (chrome.storage.local.badgeCache/steplyDocCache) zeigt der Start-Screen
//      „Für diese Seite" SOFORT (< 300 ms nach Navigationsbeginn) mit der Zahl aus dem Speicher.
//      Gemessen am DOM-Zustand (performance.now() beim ersten erfüllten 10-ms-Poll). Paint-
//      Zeitstempel sind in Headless-Chromium nicht verlässlich (schwanken ohne Bezug zur Seite).
//   B) Trifft die (absichtlich langsame) Netzantwort ein, wird die Zahl an Ort und Stelle ersetzt —
//      und der Knopf „Aufnahme starten" sowie die Zeile bewegen sich um KEINEN Pixel.
//   C) Beide Listen werden PARALLEL geholt (Konto + Steply lernen); /api/recorder/me genau EINMAL.
//   D) Ohne gemerkte Liste: Platzhalter „…", Knopf-Lage bleibt beim Eintreffen der Antwort gleich.
//   E) Gemerkte Liste eines ANDEREN Tokens (fp passt nicht) wird NICHT angezeigt.
//   F) Sequenz-Schutz: Tab-Wechsel während des Abrufs → die Anzeige gehört zur NEUEN Seite.
//
// Nutzung:  node scripts/test-panel-start-cache.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
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

const PANEL_URL = pathToFileURL(path.join(__dirname, "..", "extension", "panel.html")).href;

// Gleicher FNV-1a-Fingerabdruck wie panel.js (tokenFp).
function tokenFp(token) {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

const tut = (id, domains, status) => ({
  id,
  title: "Anleitung " + id,
  slug: id,
  status: status || "published",
  site_domains: domains,
  stepCount: 3,
  selectorCount: 3,
  category: null,
});
const CACHED = [tut("c1", ["datev.de"]), tut("c2", ["datev.de"], "draft"), tut("c3", ["elster.de"])];
const FRESH = [tut("c1", ["datev.de"]), tut("c2", ["datev.de"], "draft"), tut("c4", ["datev.de"]), tut("c5", ["datev.de"])];

const STUB = (o) => {
  const mkEvent = () => {
    const ls = [];
    return {
      addListener: (f) => ls.push(f),
      removeListener: (f) => {
        const i = ls.indexOf(f);
        if (i >= 0) ls.splice(i, 1);
      },
      hasListener: (f) => ls.includes(f),
      _fire: (...a) => ls.map((f) => f(...a)),
    };
  };
  const onChanged = mkEvent();
  const mkArea = (obj, name) => ({
    get: (keys) => {
      let out = {};
      if (keys == null) out = { ...obj };
      else if (typeof keys === "string") {
        if (keys in obj) out[keys] = obj[keys];
      } else if (Array.isArray(keys)) {
        for (const k of keys) if (k in obj) out[k] = obj[k];
      }
      return Promise.resolve(out);
    },
    set: (items) => {
      const ch = {};
      for (const k of Object.keys(items)) {
        ch[k] = { oldValue: obj[k], newValue: items[k] };
        obj[k] = items[k];
      }
      onChanged._fire(ch, name);
      return Promise.resolve();
    },
    remove: (keys) => {
      for (const k of [].concat(keys)) delete obj[k];
      return Promise.resolve();
    },
  });
  const T = (window.__T = {
    local: o.local,
    session: {},
    tabs: [{ id: 1, windowId: 10, url: o.url, active: true, status: "complete" }],
  });
  const ev = { onCreated: mkEvent(), onRemoved: mkEvent(), onActivated: mkEvent(), onUpdated: mkEvent() };
  T.events = ev;
  Object.defineProperty(window, "chrome", {
    configurable: true,
    writable: true,
    value: {
      runtime: {
        id: "stub",
        getManifest: () => ({ version: "2.17.1" }),
        onMessage: mkEvent(),
        connect: () => ({ onDisconnect: mkEvent(), onMessage: mkEvent(), postMessage() {}, disconnect() {} }),
        sendMessage: () => Promise.resolve(undefined),
      },
      storage: { local: mkArea(T.local, "local"), session: mkArea(T.session, "session"), onChanged },
      windows: { getCurrent: () => Promise.resolve({ id: 10 }), update: () => Promise.resolve({}) },
      tabs: {
        ...ev,
        query: () => Promise.resolve(T.tabs.filter((t) => t.active)),
        get: (id) => Promise.resolve({ ...T.tabs.find((t) => t.id === id) }),
        sendMessage: () => Promise.resolve(undefined),
        create: () => Promise.resolve({ id: 500 }),
        update: () => Promise.resolve({}),
      },
      downloads: { onCreated: mkEvent(), onChanged: mkEvent(), search: () => Promise.resolve([]) },
    },
  });
};

async function openPanel(browser, o) {
  const page = await browser.newPage({ viewport: { width: 380, height: 700 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e && e.message)));
  const reqs = []; // { path, at, doneAt }
  const t0 = Date.now();
  await page.route(/^https?:/, async (r) => {
    const p = new URL(r.request().url()).pathname;
    const entry = { path: p, at: Date.now() - t0, doneAt: null };
    reqs.push(entry);
    const reply = async (ms, body) => {
      await new Promise((res) => setTimeout(res, ms));
      entry.doneAt = Date.now() - t0;
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    };
    if (p === "/api/recorder/tutorials") return reply(o.tutLatency ?? 2500, { tutorials: FRESH });
    if (p === "/api/guide/steply") return reply(1500, { tutorials: [] });
    if (p === "/api/recorder/me") return reply(600, { account: "Kanzlei Test" });
    if (p === "/api/recorder/categories") return reply(300, { categories: [] });
    return reply(50, {});
  });
  await page.addInitScript(STUB, { local: o.local, url: o.url || "https://duo.datev.de/belege" });
  await page.goto(PANEL_URL, { waitUntil: "commit" });
  page.__reqs = reqs;
  page.__errors = errors;
  return page;
}

const geom = (page) =>
  page.evaluate(() => {
    const b = document.getElementById("recStart").getBoundingClientRect();
    const r = document.getElementById("siteRow").getBoundingClientRect();
    return {
      btnTop: b.top,
      btnLeft: b.left,
      btnH: b.height,
      rowTop: r.top,
      rowH: r.height,
      count: document.getElementById("siteRowCount").textContent,
    };
  });

const chromium = resolvePlaywright().chromium;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const TOKEN = "tok-cache-test";

  // ---- A + B + C: mit gemerkter Liste ----
  {
    const page = await openPanel(browser, {
      local: {
        steplyToken: TOKEN,
        steplyAppUrl: "https://app.example.test",
        badgeCache: { tutorials: CACHED, at: Date.now() - 60000, fp: tokenFp(TOKEN) },
        steplyDocCache: { tutorials: [], at: Date.now() - 60000 },
      },
    });
    const shownAt = await (
      await page.waitForFunction(
        () => {
          const s = document.getElementById("start");
          const c = document.getElementById("siteRowCount");
          return s && !s.hidden && c && c.textContent === "2" ? performance.now() : false;
        },
        null,
        { polling: 10, timeout: 5000 }
      )
    ).jsonValue();
    ok(shownAt < 300, `A: „Für diese Seite (2)“ aus dem Speicher nach ${Math.round(shownAt)} ms (< 300 ms)`);
    const before = await geom(page);
    const tabCount = await page.textContent("#tabGuidesCount");
    ok(tabCount === "2", `A: Reiter „Anleitungen“ zeigt sofort den Zähler (${tabCount})`);

    // Netzantwort (2,5 s) bringt 4 Treffer → Zahl wird ersetzt, NICHTS bewegt sich.
    await page.waitForFunction(() => document.getElementById("siteRowCount").textContent === "4", null, {
      timeout: 8000,
    });
    const after = await geom(page);
    ok(after.count === "4", "B: Netzantwort ersetzt die Zahl an Ort und Stelle (2 → 4)");
    ok(
      after.btnTop === before.btnTop && after.btnLeft === before.btnLeft && after.btnH === before.btnH,
      `B: „Aufnahme starten“ bleibt pixelgenau liegen (top ${before.btnTop} → ${after.btnTop})`
    );
    ok(
      after.rowTop === before.rowTop && after.rowH === before.rowH,
      `B: Zeile „Für diese Seite“ bleibt pixelgenau liegen (top ${before.rowTop} → ${after.rowTop}, h ${before.rowH} → ${after.rowH})`
    );
    const saved = await page.evaluate(() => window.__T.local.badgeCache);
    ok(
      saved && saved.tutorials.length === 4 && saved.fp,
      "B: frische Liste wird (mit Token-Fingerabdruck) für das nächste Öffnen gemerkt"
    );

    await page.waitForTimeout(800);
    const reqs = page.__reqs;
    const tutReq = reqs.find((r) => r.path === "/api/recorder/tutorials");
    const docReq = reqs.find((r) => r.path === "/api/guide/steply");
    ok(
      tutReq && docReq && docReq.at < tutReq.doneAt && tutReq.at < docReq.doneAt,
      `C: Konto- und Steply-Liste parallel angefragt (tutorials @${tutReq && tutReq.at} ms, steply @${docReq && docReq.at} ms)`
    );
    const meCount = reqs.filter((r) => r.path === "/api/recorder/me").length;
    ok(meCount === 1, `C: /api/recorder/me genau einmal angefragt (${meCount}×)`);
    ok(page.__errors.length === 0, "A–C: keine Seitenfehler" + (page.__errors.length ? ": " + page.__errors.join(" | ") : ""));
    await page.close();
  }

  // ---- D: ohne gemerkte Liste ----
  {
    const page = await openPanel(browser, {
      local: { steplyToken: TOKEN, steplyAppUrl: "https://app.example.test" },
    });
    await page.waitForFunction(() => !document.getElementById("start").hidden, null, { timeout: 5000 });
    const before = await geom(page);
    ok(before.count === "…", `D: ohne Speicher Platzhalter „…“ (war „${before.count}“)`);
    await page.waitForFunction(() => document.getElementById("siteRowCount").textContent === "4", null, {
      timeout: 8000,
    });
    const after = await geom(page);
    ok(
      after.btnTop === before.btnTop && after.rowTop === before.rowTop && after.rowH === before.rowH,
      `D: Knopf + Zeile bleiben liegen, als die Antwort kommt (Knopf ${before.btnTop} → ${after.btnTop})`
    );
    await page.close();
  }

  // ---- E: gemerkte Liste eines anderen Tokens ----
  {
    const page = await openPanel(browser, {
      local: {
        steplyToken: TOKEN,
        steplyAppUrl: "https://app.example.test",
        badgeCache: { tutorials: CACHED, at: Date.now(), fp: tokenFp("anderer-token") },
      },
    });
    await page.waitForFunction(() => !document.getElementById("start").hidden, null, { timeout: 5000 });
    const g = await geom(page);
    ok(g.count === "…", `E: Liste eines anderen Kontos wird NICHT gezeigt (Anzeige „${g.count}“)`);
    await page.close();
  }

  // ---- E2: gemerkte Liste OHNE Konto-Stempel (ältere Version / unbekannte Herkunft) ----
  // QA Welle 50: Der Service-Worker schrieb früher ohne fp — nach einem Kontowechsel bei
  // geschlossenem Panel erschien so die Liste des ALTEN Kontos. Ohne fp: nie anzeigen.
  {
    const page = await openPanel(browser, {
      local: {
        steplyToken: TOKEN,
        steplyAppUrl: "https://app.example.test",
        badgeCache: { tutorials: CACHED, at: Date.now() },
      },
    });
    await page.waitForFunction(() => !document.getElementById("start").hidden, null, { timeout: 5000 });
    const g = await geom(page);
    ok(g.count === "…", `E2: Liste ohne Konto-Stempel wird NICHT gezeigt (Anzeige „${g.count}“)`);
    await page.close();
  }

  // ---- F: Tab-Wechsel während des Abrufs ----
  {
    const page = await openPanel(browser, {
      url: "https://www.example.org/",
      tutLatency: 1200,
      local: { steplyToken: TOKEN, steplyAppUrl: "https://app.example.test" },
    });
    await page.waitForFunction(() => !document.getElementById("start").hidden, null, { timeout: 5000 });
    await page.evaluate(() => {
      const T = window.__T;
      T.tabs[0].active = false;
      T.tabs.push({ id: 2, windowId: 10, url: "https://duo.datev.de/x", active: true, status: "complete" });
      T.events.onActivated._fire({ tabId: 2, windowId: 10 });
    });
    await page.waitForFunction(() => document.getElementById("siteRowCount").textContent === "4", null, {
      timeout: 8000,
    }).catch(() => {});
    const g = await geom(page);
    ok(g.count === "4", `F: nach Tab-Wechsel gehört die Anzeige zur neuen Seite (${g.count})`);
    await page.close();
  }
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  if (browser) await browser.close();
}

console.log(failed ? "\nFEHLGESCHLAGEN" : "\nAlle Prüfungen grün.");
process.exit(failed ? 1 : 0);
