// Audit 24.09.2026 — Headless-Beweis der Seitenleisten-Korrekturen (v2.19.4), OHNE Netz/Server.
// Lädt die ECHTE extension/panel.html + panel.js in Chromium (headless) mit einem `chrome`-Stub
// (Muster test-guide-flow-panel.mjs) und prüft:
//   A) Seitenleiste mitten in der Aufnahme zu → Merker guideLive; beim Öffnen Hinweis mit Zahl.
//   B) Download während des Screenshots seines Klicks → dem RICHTIGEN (späteren) Klick zugeordnet.
//   C) Klick öffnet neuen Tab (der beim Screenshot vorn ist) → Bild des Klick-Tabs, „ggf. ungenau“.
//   D) /me: tutorialsLeft 0 → Hinweis „kostenlose Tarif ist voll“; videoAllowed false → Start-
//      Knopf/Mikrofon-Zeile weg, auch mit „Ohne Ton“.
//   E) Trennen → POST /api/recorder/disconnect mit Token, autoValues + steply-run:*-Wecker weg.
//   F) App-Adresse ohne https:// wird ergänzt; 404 unter der Adresse → klare Ablehnung.
//   G) Einfügen in veröffentlichte Anleitung: Banner nennt Titel + „sofort sichtbar“; Abschluss
//      ohne verschachtelte Anführungszeichen; Liste wird nach dem Hochladen sofort neu geholt.
// Reine Logik (Node): guidePickDownloadStep, guideImageForStep.
//
// Nutzung:  node scripts/test-guide-audit-panel.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolvePlaywright() {
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
  throw new Error("playwright nicht gefunden (weder lokal noch im npx-Cache).");
}

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

// ── Reine Logik (Node) ────────────────────────────────────────────────────────────────────────
const PANEL_JS = readFileSync(path.join(__dirname, "..", "extension", "panel.js"), "utf8");
function braceSlice(src, fromIdx) {
  let i = src.indexOf("{", fromIdx);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error("Klammern nicht balanciert");
}
const extractFn = (name) => {
  const start = PANEL_JS.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Funktion ${name} nicht gefunden`);
  return PANEL_JS.slice(start, braceSlice(PANEL_JS, PANEL_JS.indexOf(")", start)));
};
const extractConst = (name) => {
  const m = new RegExp(`const ${name} = [^;]+;`).exec(PANEL_JS);
  if (!m) throw new Error(`Konstante ${name} nicht gefunden`);
  return m[0];
};
{
  const L = new Function(
    [
      extractConst("GUIDE_DL_MATCH_MS"),
      extractConst("GUIDE_DL_TOLERANCE"),
      extractFn("guidePickDownloadStep"),
      extractFn("guideImageForStep"),
      "return { guidePickDownloadStep, guideImageForStep };",
    ].join("\n"),
  )();
  const at = 100000;
  const a = { action: "click", ts: at - 1500 };
  const b = { action: "click", ts: at - 20 };
  const late = { action: "click", ts: at + 300 };
  ok(L.guidePickDownloadStep([a, b], at) === b, "Download: der Klick mit dem kleinsten Abstand VOR dem Download");
  ok(L.guidePickDownloadStep([a, late], at) === a, "Download: ein Klick davor schlägt einen Klick danach");
  ok(L.guidePickDownloadStep([late], at) === late, "Download: nur ein Klick knapp danach → Uhr-Toleranz");
  ok(L.guidePickDownloadStep([{ action: "click", ts: at - 5000 }], at) === null, "Download: älter als 3 s → keiner");
  ok(L.guidePickDownloadStep([{ action: "type", ts: at - 10 }], at) === null, "Download: Eingabe-Schritte zählen nicht");
  ok(L.guidePickDownloadStep([{ ...b, fileMeta: {} }, a], at) === a, "Download: Schritt mit file_meta wird übersprungen");

  const img = { blob: "neu", shotTabId: 2, shotUnsure: false };
  const own = { blob: "alt" };
  const map = new Map([[1, own]]);
  let r = L.guideImageForStep(img, 1, map);
  ok(r.img === own && r.imprecise, "Neuer Tab vorn: Bild des Klick-Tabs, „ggf. ungenau“");
  r = L.guideImageForStep(img, 1, new Map());
  ok(r.img === img && r.imprecise, "Neuer Tab vorn, kein altes Bild: aktuelles Bild, „ggf. ungenau“");
  r = L.guideImageForStep({ ...img, shotTabId: 1 }, 1, map);
  ok(r.img.blob === "neu" && !r.imprecise, "Klick-Tab vorn: eigenes Bild, genau");
  r = L.guideImageForStep({ ...img, shotTabId: 1, shotUnsure: true }, 1, map);
  ok(r.imprecise, "Tab wechselte während des Screenshots: „ggf. ungenau“");
}

// ── Headless-Panel ────────────────────────────────────────────────────────────────────────────
const PANEL_URL = pathToFileURL(path.join(__dirname, "..", "extension", "panel.html")).href;

const STUB = () => {
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
    get: (keys, cb) => {
      let out = {};
      if (keys == null) out = { ...obj };
      else if (typeof keys === "string") {
        if (keys in obj) out[keys] = obj[keys];
      } else if (Array.isArray(keys)) {
        for (const k of keys) if (k in obj) out[k] = obj[k];
      } else {
        for (const k of Object.keys(keys)) out[k] = k in obj ? obj[k] : keys[k];
      }
      if (cb) cb(out);
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
      const ch = {};
      for (const k of [].concat(keys)) {
        if (k in obj) {
          ch[k] = { oldValue: obj[k], newValue: undefined };
          delete obj[k];
        }
      }
      if (Object.keys(ch).length) onChanged._fire(ch, name);
      return Promise.resolve();
    },
  });
  const params = new URLSearchParams(location.search);
  const T = (window.__T = {
    local: {
      steplyToken: "11111111-2222-3333-4444-555555555555",
      steplyAppUrl: "https://app.example.test",
      autoValues: { a1: { kunde: "Müller" } },
    },
    session: {},
    tabs: [{ id: 1, windowId: 10, url: "https://example.com/start", active: true, status: "complete" }],
    alarms: [{ name: "steply-run:a1" }, { name: "steply-run:b2" }, { name: "steply-sync" }],
    captureDelay: 0,
    events: {},
  });
  if (params.get("live")) T.local.guideLive = { steps: 3, at: Date.now(), windowId: 10 };
  if (params.get("target")) {
    T.local.pendingTarget = {
      target: { tutorialId: "tut-1", anchor: { afterStepId: "s-3" } },
      label: "nach Schritt 3 („Klicken Sie auf „Speichern““)",
      origin: "https://app.example.test",
      ts: Date.now(),
    };
  }
  const tabsEv = { onCreated: mkEvent(), onRemoved: mkEvent(), onActivated: mkEvent(), onUpdated: mkEvent() };
  T.events = { ...tabsEv, onMessage: mkEvent(), downloadsCreated: mkEvent() };
  let shot = 0;
  const fakePng = () => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 200;
    const x = c.getContext("2d");
    x.fillStyle = "#f7f1e6";
    x.fillRect(0, 0, 320, 200);
    x.fillStyle = "#ef6a4e";
    x.fillRect(10 + (shot++ % 20) * 10, 60, 40, 40);
    return c.toDataURL("image/png");
  };
  const chromeStub = {
    runtime: {
      id: "stub",
      lastError: undefined,
      getManifest: () => ({ version: "2.19.4" }),
      onMessage: T.events.onMessage,
      connect: () => ({ onDisconnect: mkEvent(), onMessage: mkEvent(), postMessage() {}, disconnect() {} }),
      sendMessage: (msg) => {
        if (msg && msg.type === "steply-capture") {
          const d = T.captureDelay;
          const res = { ok: true, dataUrl: fakePng() };
          return d ? new Promise((r) => setTimeout(() => r(res), d)) : Promise.resolve(res);
        }
        return Promise.resolve(undefined);
      },
    },
    storage: { local: mkArea(T.local, "local"), session: mkArea(T.session, "session"), onChanged },
    windows: { getCurrent: () => Promise.resolve({ id: 10 }), update: () => Promise.resolve({}) },
    tabs: {
      ...tabsEv,
      query: (q) => {
        let r = T.tabs.slice();
        if (q && q.active) r = r.filter((t) => t.active);
        if (q && q.windowId != null) r = r.filter((t) => t.windowId === q.windowId);
        if (q && q.currentWindow) r = r.filter((t) => t.windowId === 10);
        return Promise.resolve(r);
      },
      get: (id) => {
        const t = T.tabs.find((x) => x.id === id);
        return t ? Promise.resolve({ ...t }) : Promise.reject(new Error("No tab with id " + id));
      },
      sendMessage: (tabId, msg) =>
        msg && msg.type === "steply-rec-ping" ? Promise.resolve({ ok: true }) : Promise.resolve(undefined),
      create: () => Promise.resolve({ id: 500 }),
      update: () => Promise.resolve({}),
      captureVisibleTab: () => Promise.reject(new Error("stub")),
    },
    alarms: {
      getAll: () => Promise.resolve(T.alarms.slice()),
      clear: (name) => {
        T.alarms = T.alarms.filter((a) => a.name !== name);
        return Promise.resolve(true);
      },
      create: () => {},
    },
    downloads: { onCreated: T.events.downloadsCreated, onChanged: mkEvent(), search: () => Promise.resolve([]) },
    extension: { isAllowedFileSchemeAccess: () => Promise.resolve(false) },
    sidePanel: { open: () => Promise.resolve() },
  };
  Object.defineProperty(window, "chrome", { value: chromeStub, configurable: true, writable: true });
};

const chromium = resolvePlaywright().chromium;
let browser;
try {
  browser = await chromium.launch({ headless: true });

  // Neue Seite mit eigener Netz-Welt. me = Antwort von /api/recorder/me.
  async function openPanel(query, me, extra) {
    const page = await browser.newPage({ viewport: { width: 380, height: 860 } });
    const net = { disconnect: [], tutorialsGets: 0, me: 0 };
    page.__errors = [];
    page.on("pageerror", (e) => page.__errors.push(String(e && e.message)));
    page.on("dialog", (d) => d.accept());
    await page.route(/^https?:/, (r) => r.fulfill({ status: 404, body: "" }));
    await page.route(/^https:\/\/app\.example\.test\/api\/recorder\/me$/, (r) => {
      net.me++;
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(me || { account: "Kanzlei" }) });
    });
    await page.route(/\/api\/recorder\/tutorials$/, (r) => {
      net.tutorialsGets++;
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tutorials: [{ id: "tut-1", title: "Rechnung schreiben", status: "published", visibility: "public", site_domains: [] }],
        }),
      });
    });
    await page.route(/\/api\/recorder\/disconnect$/, (r) => {
      net.disconnect.push(r.request().postDataJSON());
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, removed: true }) });
    });
    if (extra) await extra(page, net);
    await page.addInitScript(STUB);
    await page.goto(PANEL_URL + (query ? "?" + query : ""), { waitUntil: "load" });
    await page.waitForFunction(() => !document.getElementById("start").hidden, null, { timeout: 5000 });
    return { page, net };
  }
  const vis = (page, id) =>
    page.evaluate((i) => {
      const el = document.getElementById(i);
      return !!el && !el.hidden && el.offsetParent !== null;
    }, id);
  const fire = (page, tab, label, ts) =>
    page.evaluate(
      ({ tab, label, ts }) => {
        window.__T.events.onMessage._fire(
          {
            type: "steply-guide-step",
            step: { rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 }, label, action: "click", url: "https://example.com/start", ts },
          },
          { tab: { id: tab, windowId: 10 } },
          () => {},
        );
      },
      { tab, label, ts },
    );
  const waitSteps = (page, n) =>
    page.waitForFunction((k) => guideSteps.length === k, n, { timeout: 5000 }).then(
      () => true,
      () => false,
    );

  // ---- A) Unterbrochene Aufnahme ----
  {
    const { page } = await openPanel("live=1");
    ok(await vis(page, "interruptedHint"), "Unterbrochen: Hinweis sichtbar");
    ok(/3 Schritte/.test(await page.textContent("#interruptedText")), "Unterbrochen: Zahl der verlorenen Schritte genannt");
    ok(!(await page.evaluate(() => "guideLive" in window.__T.local)), "Unterbrochen: Merker nach dem Anzeigen entfernt");
    await page.click("#recStart");
    await page.waitForFunction(() => guideActive, null, { timeout: 3000 });
    ok(!(await page.evaluate(() => "guideLive" in window.__T.local)), "Aufnahme ohne Schritt: kein Merker");
    await fire(page, 1, "Schritt A", Date.now());
    await waitSteps(page, 1);
    await page.waitForTimeout(100);
    ok((await page.evaluate(() => window.__T.local.guideLive && window.__T.local.guideLive.steps)) === 1, "Aufnahme mit 1 Schritt: Merker guideLive {steps:1}");
    await page.click("#guideStop");
    await page.waitForFunction(() => !guideActive, null, { timeout: 4000 });
    await page.waitForTimeout(1500);
    ok(await page.evaluate(() => !!window.__T.local.guideLive), "Prüfen: Merker bleibt (Schritte noch nicht gespeichert)");
    await page.click("#guideDiscard");
    await page.waitForTimeout(100);
    ok(!(await page.evaluate(() => "guideLive" in window.__T.local)), "Verwerfen: Merker entfernt");
    ok(page.__errors.length === 0, "A: keine Seitenfehler " + page.__errors.join(" | "));
    await page.close();
  }

  // ---- B) Download während des Screenshots seines Klicks ----
  {
    const { page } = await openPanel("");
    await page.click("#recStart");
    await page.waitForFunction(() => guideActive, null, { timeout: 3000 });
    const t0 = Date.now();
    await fire(page, 1, "Übersicht", t0);
    await waitSteps(page, 1);
    await page.waitForTimeout(1300); // Kontingent-Fenster ablaufen lassen
    await page.evaluate(() => (window.__T.captureDelay = 700));
    await fire(page, 1, "PDF herunterladen", Date.now());
    await page.waitForTimeout(80);
    await page.evaluate(() =>
      window.__T.events.downloadsCreated._fire({ filename: "C:\\Downloads\\rechnung.pdf", mime: "application/pdf", fileSize: 1234 }),
    );
    await waitSteps(page, 2);
    await page.waitForTimeout(100);
    const fm = await page.evaluate(() => guideSteps.map((s) => (s.fileMeta ? s.fileMeta.filename : null)));
    ok(fm[0] === null && fm[1] === "rechnung.pdf", `Download dem Download-Klick zugeordnet, nicht dem vorigen (${JSON.stringify(fm)})`);
    await page.evaluate(() => (window.__T.captureDelay = 0));

    // ---- C) Neuer Tab ist beim Screenshot schon vorn ----
    await page.waitForTimeout(1300);
    await page.evaluate(() => {
      const T = window.__T;
      T.tabs[0].active = false;
      T.tabs.push({ id: 2, windowId: 10, url: "https://example.com/neu", active: true, status: "complete" });
    });
    await fire(page, 1, "Link in neuem Tab", Date.now());
    await waitSteps(page, 3);
    const r = await page.evaluate(() => ({
      sameAsTab1: guideSteps[2].blob === guideSteps[1].blob,
      imprecise: guideSteps[2].imprecise,
    }));
    ok(r.sameAsTab1, "Neuer Tab: Schritt bekommt das letzte Bild SEINES Tabs (nicht den neuen Tab)");
    ok(r.imprecise, "Neuer Tab: als „Bild ggf. ungenau“ markiert");
    ok(page.__errors.length === 0, "B/C: keine Seitenfehler " + page.__errors.join(" | "));
    await page.close();
  }

  // ---- D) Gratis: Limit + Video ----
  {
    const { page } = await openPanel("", { account: "Kanzlei", videoAllowed: false, tutorialsLeft: 0 });
    await page.waitForFunction(() => accountTutorialsLeft === 0, null, { timeout: 3000 });
    ok(await vis(page, "quotaHint"), "Gratis voll: Hinweis auf dem Start-Bildschirm");
    ok(/kostenlose Tarif ist voll/.test(await page.textContent("#quotaHint")), "Gratis voll: Text „Der kostenlose Tarif ist voll …“");
    await page.evaluate(() => goVideoSetup());
    ok(!(await vis(page, "begin")), "Video gratis: Start-Knopf ausgeblendet");
    ok(!(await vis(page, "micStatus")), "Video gratis: „Mikrofon wird geprüft …“ ausgeblendet");
    ok(!(await vis(page, "noAudio")), "Video gratis: „Ohne Ton“ ausgeblendet");
    await page.evaluate(() => {
      els.noAudio.checked = true;
      updateBeginEnabled();
    });
    ok(await page.evaluate(() => els.begin.disabled), "Video gratis: auch mit „Ohne Ton“ bleibt der Start deaktiviert");
    await page.close();
  }
  {
    const { page } = await openPanel("", { account: "Kanzlei", videoAllowed: true, tutorialsLeft: null });
    await page.waitForTimeout(300);
    ok(!(await vis(page, "quotaHint")), "Pro (unbegrenzt): kein Tarif-Hinweis");
    await page.evaluate(() => goVideoSetup());
    ok(await vis(page, "begin"), "Video Pro: Start-Knopf sichtbar");
    await page.close();
  }

  // ---- E) Trennen ----
  {
    const { page, net } = await openPanel("");
    await page.evaluate(() => disconnect());
    await page.waitForTimeout(200);
    const T = await page.evaluate(() => window.__T);
    ok(net.disconnect.length === 1 && net.disconnect[0].token === "11111111-2222-3333-4444-555555555555", "Trennen: Server-Route mit genau diesem Token aufgerufen");
    ok(T.local.steplyToken === "", "Trennen: Token lokal entfernt");
    ok(!("autoValues" in T.local), "Trennen: gemerkte Automations-Werte gelöscht");
    ok(T.alarms.map((a) => a.name).join(",") === "steply-sync", `Trennen: alle steply-run:*-Wecker entfernt (${T.alarms.map((a) => a.name)})`);
    await page.close();
  }

  // ---- F) App-Adresse ----
  {
    const { page } = await openPanel("");
    const n = await page.evaluate(() =>
      ["app.steply.de", "localhost:3013", "https://x.example.de/", "  https://x.example.de//  ", "steply", "ftp://x.de", ""].map((v) =>
        normalizeAppUrl(v),
      ),
    );
    ok(n[0].url === "https://app.steply.de", `Adresse ohne Schema → https:// (${n[0].url})`);
    ok(n[1].url === "http://localhost:3013", `localhost → http:// (${n[1].url})`);
    ok(n[2].url === "https://x.example.de" && n[3].url === "https://x.example.de", "Schrägstriche am Ende entfernt");
    ok(!!n[4].error && !!n[5].error, "Ungültige Adressen abgelehnt (kein Host / kein http(s))");
    ok(n[6].url === "", "Leeres Feld = Standard-Adresse");
    // 404 unter der Adresse (keine Steply-App) → Ablehnung statt „nicht prüfbar“ gespeichert.
    await page.evaluate(() => {
      showConnect("change");
      els.token.value = "11111111-2222-3333-4444-555555555555";
      els.appUrl.value = "falsch.example.test";
    });
    await page.evaluate(() => saveCfg());
    const st = await page.evaluate(() => ({ text: els.cfgStatus.textContent, url: window.__T.local.steplyAppUrl }));
    ok(/keine Steply-App/.test(st.text), `404 unter der Adresse: klare Ablehnung („${st.text}“)`);
    ok(st.url === "https://app.example.test", "404 unter der Adresse: nichts gespeichert");
    await page.close();
  }

  // ---- G) Einfügen in veröffentlichte Anleitung ----
  {
    const { page, net } = await openPanel("target=1", null, async (p, net2) => {
      await p.route(/\/api\/recorder\/guide-handshake/, (r) => {
        const n = r.request().postDataJSON().count;
        const uploads = Array.from({ length: n }, (_, i) => ({
          path: `acc/guide-00000000-0000-0000-0000-000000000001/${i}.webp`,
          uploadUrl: `https://storage.example.test/up/${i}`,
          token: "t",
        }));
        return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uploads }) });
      });
      await p.route(/storage\.example\.test\/up\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
      await p.route(/\/api\/recorder\/guide-complete/, (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ tutorialId: "tut-1", inserted: true, title: "Rechnung schreiben", live: true, publicLive: true }),
        }),
      );
      net2.ready = true;
    });
    await page.waitForFunction(() => !document.getElementById("targetLive").hidden, null, { timeout: 4000 }).catch(() => {});
    ok(await vis(page, "targetLive"), "Ziel veröffentlicht: Hinweis im Banner sichtbar");
    ok(/sofort auf Ihrer Hilfe-Seite sichtbar/.test(await page.textContent("#targetLive")), "Ziel veröffentlicht: „… sofort auf Ihrer Hilfe-Seite sichtbar.“");
    ok(/„Rechnung schreiben“/.test(await page.textContent("#targetPrefix")), "Banner nennt die Ziel-Anleitung beim Namen");
    await page.click("#recStart");
    await page.waitForFunction(() => guideActive, null, { timeout: 3000 });
    await fire(page, 1, "Speichern", Date.now());
    await waitSteps(page, 1);
    await page.click("#guideStop");
    await page.waitForFunction(() => guidePhase === "stopped" && !guideActive, null, { timeout: 4000 });
    await page.waitForTimeout(300);
    const before = net.tutorialsGets;
    await page.click("#guideCreate");
    await page.waitForFunction(() => !document.getElementById("guideUploadDone").hidden, null, { timeout: 6000 }).catch(() => {});
    const text = await page.textContent("#guideDoneText");
    ok(/„Rechnung schreiben“/.test(text) && !/„[^“]*„/.test(text), `Abschluss: Titel der Anleitung, keine verschachtelten Anführungszeichen („${text}“)`);
    ok(/sofort auf Ihrer Hilfe-Seite sichtbar/.test(text), "Abschluss: sagt, dass die Schritte live sind");
    await page.waitForTimeout(300);
    ok(net.tutorialsGets > before, `Nach dem Hochladen: Anleitungen-Liste sofort neu geholt (${net.tutorialsGets - before}×)`);
    ok(!(await page.evaluate(() => "guideLive" in window.__T.local)), "Nach dem Hochladen: kein „unterbrochen“-Merker");
    ok(page.__errors.length === 0, "G: keine Seitenfehler " + page.__errors.join(" | "));
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
