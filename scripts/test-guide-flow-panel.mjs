// Headless-Beweis des Sofort-Aufnahme-Ablaufs im Panel (Welle 48a, Welle 50a), OHNE Netz/Server.
// Laedt die ECHTE extension/panel.html + panel.js in echtem Chromium mit einem minimalen
// `chrome`-Stub (runtime/storage/tabs/windows/downloads) und prueft den Zustandsautomaten:
//   1) Versoehnung: klemmendes rec beim Oeffnen wird verworfen (Hinweis sichtbar).
//   2) Start-Screen (seit Welle 50a der fruehere „Bereit"-Zustand): KEIN rec im Storage,
//      Schritt-Nachrichten werden ignoriert — nichts nimmt vor dem Klick auf „Aufnahme starten" auf.
//   3) Start -> rec gesetzt, Schritt wird angenommen; Pause -> rec weg, Schritt ignoriert,
//      Timer steht; Fortsetzen -> Timer zaehlt ohne Sprung weiter.
//   4) Stopp mit einem Schritt „unterwegs" -> der Schritt geht NICHT verloren.
//   5) Gestoppt: Liste sichtbar, „Anleitung erstellen" aktiv; „Weiter aufnehmen"; „Verwerfen"
//      (mit Bestaetigung) -> Start-Screen; 0 Schritte -> „Anleitung erstellen" deaktiviert.
//   6) Popups: Schritt aus fremdem Fenster verworfen; aus per onCreated (openerTabId-Kette)
//      registriertem Popup angenommen, Screenshot aus DESSEN Fenster; nach onRemoved verworfen.
//   7) Hinweis „kann nicht aufnehmen": chrome://-Tab / Tab ohne Content-Script -> Hinweis;
//      Nachimpfen + Retry erfolgreich -> kein Hinweis; aufnehmbarer Tab -> Hinweis weg.
//
// Nutzung:  node scripts/test-guide-flow-panel.mjs [--shots <verzeichnis>]
// Playwright wird lokal ODER aus dem npx-Cache aufgeloest (wie test-guide-capture.mjs).
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
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

const shotsIdx = process.argv.indexOf("--shots");
const SHOTS = shotsIdx > 0 ? process.argv[shotsIdx + 1] : "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

const PANEL_URL = pathToFileURL(path.join(__dirname, "..", "extension", "panel.html")).href;

// chrome-Stub: laeuft VOR panel.js (addInitScript). Welt: Panel-Fenster 10 mit Tab 1
// (https, Content-Script antwortet) + fremdes Fenster 20 mit Tab 99 (z. B. private E-Mail).
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
  const T = (window.__T = {
    local: { steplyToken: "tok-test", steplyAppUrl: "https://app.example.test", rec: { startedAt: 1, mode: "guide" } },
    session: {},
    tabs: [
      { id: 1, windowId: 10, url: "https://example.com/start", active: true, status: "complete" },
      { id: 99, windowId: 20, url: "https://mail.example.org/", active: true, status: "complete" },
    ],
    pingOk: { 1: true, 99: true },
    injectOnEnsure: {}, // tabId -> true: „steply-ensure-content" macht den Tab aufnehmbar
    runtimeSent: [],
    captureWindows: [],
    events: {},
  });
  const tabsEv = {
    onCreated: mkEvent(),
    onRemoved: mkEvent(),
    onActivated: mkEvent(),
    onUpdated: mkEvent(),
  };
  T.events = { ...tabsEv, onMessage: mkEvent(), downloadsCreated: mkEvent() };
  const fakePng = () => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 200;
    const x = c.getContext("2d");
    x.fillStyle = "#f7f1e6";
    x.fillRect(0, 0, 320, 200);
    x.fillStyle = "#ef6a4e";
    x.fillRect(40, 60, 120, 40);
    return c.toDataURL("image/png");
  };
  const chromeStub = {
    runtime: {
      id: "stub",
      lastError: undefined,
      getManifest: () => ({ version: "2.16.0" }),
      onMessage: T.events.onMessage,
      connect: () => ({ onDisconnect: mkEvent(), onMessage: mkEvent(), postMessage() {}, disconnect() {} }),
      sendMessage: (msg) => {
        T.runtimeSent.push(msg && msg.type);
        if (msg && msg.type === "steply-capture") {
          T.captureWindows.push(msg.windowId);
          return Promise.resolve({ ok: true, dataUrl: fakePng() });
        }
        if (msg && msg.type === "steply-ensure-content") {
          for (const id of Object.keys(T.injectOnEnsure)) T.pingOk[id] = true;
        }
        return Promise.resolve(undefined);
      },
    },
    storage: {
      local: mkArea(T.local, "local"),
      session: mkArea(T.session, "session"),
      onChanged,
    },
    windows: {
      getCurrent: () => Promise.resolve({ id: 10 }),
      update: () => Promise.resolve({}),
    },
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
      sendMessage: (tabId, msg) => {
        if (msg && msg.type === "steply-rec-ping") {
          const t = T.tabs.find((x) => x.id === tabId);
          if (t && /^https?:/.test(t.url) && T.pingOk[tabId]) return Promise.resolve({ ok: true });
          return Promise.reject(new Error("Could not establish connection. Receiving end does not exist."));
        }
        return Promise.resolve(undefined);
      },
      create: () => Promise.resolve({ id: 500 }),
      update: () => Promise.resolve({}),
      captureVisibleTab: () => Promise.reject(new Error("stub")),
    },
    downloads: {
      onCreated: T.events.downloadsCreated,
      onChanged: mkEvent(),
      search: () => Promise.resolve([]),
    },
    extension: { isAllowedFileSchemeAccess: () => Promise.resolve(false) },
    sidePanel: { open: () => Promise.resolve() },
  };
  Object.defineProperty(window, "chrome", { value: chromeStub, configurable: true, writable: true });
};

const chromium = resolvePlaywright().chromium;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 860 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e && e.message)));
  // Bestaetigungen („Verwerfen?") annehmen und mitzaehlen.
  let dialogs = 0;
  page.on("dialog", (d) => {
    dialogs++;
    d.accept();
  });
  // Kein echtes Netz: alle http(s)-Requests (Konto, Update, Kategorien …) -> 404.
  await page.route(/^https?:/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.addInitScript(STUB);
  await page.goto(PANEL_URL, { waitUntil: "load" });

  const vis = (id) => page.evaluate((i) => {
    const el = document.getElementById(i);
    return !!el && !el.hidden && !(el.closest("section") && el.closest("section").hidden) &&
      el.offsetParent !== null;
  }, id);
  const st = () =>
    page.evaluate(() => ({
      phase: guidePhase,
      active: guideActive,
      steps: guideSteps.length,
      rec: window.__T.local.rec,
      extra: Array.from(guideExtraTabs),
    }));
  const click = (id) => page.click("#" + id);
  const sleep = (ms) => page.waitForTimeout(ms);
  let tsBase = Date.now();
  const sendStep = (tab, label) =>
    page.evaluate(
      ({ tab, label, ts }) => {
        window.__T.events.onMessage._fire(
          {
            type: "steply-guide-step",
            step: {
              rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 },
              label,
              action: "click",
              url: "https://example.com/start",
              ts,
            },
          },
          { tab: { id: tab.id, windowId: tab.windowId } },
          () => {}
        );
      },
      { tab, label, ts: (tsBase += 2000) }
    );
  const waitSteps = async (n, ms = 4000) => {
    try {
      await page.waitForFunction((k) => guideSteps.length === k, n, { timeout: ms });
      return true;
    } catch {
      return false;
    }
  };
  const TAB1 = { id: 1, windowId: 10 };
  const TAB_FOREIGN = { id: 99, windowId: 20 };

  // ---- 1) Versoehnung ----
  await page.waitForFunction(() => !document.getElementById("start").hidden, null, { timeout: 5000 });
  let s = await st();
  ok(s.rec === undefined, "Versöhnung: klemmendes rec beim Öffnen verworfen");
  ok(await vis("interruptedHint"), "Versöhnung: Hinweis „unterbrochene Aufnahme“ sichtbar");

  // ---- 2) Start-Screen = „Bereit": vor dem Klick nimmt NICHTS auf ----
  s = await st();
  ok(s.phase === "idle", "Start-Screen: Phase „idle“ (keine Aufnahme)");
  ok(s.rec === undefined, "Start-Screen: KEIN rec im Storage");
  ok(await vis("recStart"), "Start-Screen: „Aufnahme starten“ sichtbar");
  ok(!(await vis("guideStop")) && !(await vis("guidePause")), "Start-Screen: kein Pause/Fertig");
  ok(!(await vis("guideTimer")), "Start-Screen: kein Timer");
  await sendStep(TAB1, "Ignoriert (Start-Screen)");
  await sleep(800);
  ok((await st()).steps === 0 && (await st()).rec === undefined, "Start-Screen: Schritt-Nachricht wird ignoriert");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "1-start.png"), fullPage: true });

  // ---- 3) Start / Schritt / Pause / Fortsetzen ----
  await click("recStart");
  await page.waitForFunction(() => !!window.__T.local.rec, null, { timeout: 2000 });
  s = await st();
  ok(s.phase === "recording" && s.active, "Aufnahme starten → Phase „recording“, guideActive");
  ok(s.rec && s.rec.mode === "guide", "Start: rec {mode:'guide'} gesetzt");
  ok(await vis("guidePause") && (await vis("guideStop")), "Nimmt auf: Pause + Fertig sichtbar");
  ok(!(await vis("recStart")) && !(await vis("guideCreate")), "Nimmt auf: kein Start/Erstellen");
  ok(!(await vis("tabs")), "Nimmt auf: keine Reiter");
  ok(!(await vis("guideTitle")), "Nimmt auf: Titel/Kategorie erst beim Prüfen");
  ok(
    (await page.textContent("#guideBadgeText")).trim() === "Aufnahme läuft",
    "Nimmt auf: Steuerleiste „Aufnahme läuft“"
  );
  await sendStep(TAB1, "Klicken Sie auf „Anmelden“");
  ok(await waitSteps(1), "Nimmt auf: Schritt wird angenommen (1)");
  await sendStep(TAB1, "Klicken Sie auf „Belege“");
  ok(await waitSteps(2), "Nimmt auf: zweiter Schritt (2)");
  await sleep(1100);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "2-nimmt-auf.png"), fullPage: true });

  await click("guidePause");
  await page.waitForFunction(() => !guideActive, null, { timeout: 4000 });
  s = await st();
  ok(s.phase === "paused" && s.rec === undefined, "Pause: Phase „paused“, rec entfernt");
  ok(
    (await page.textContent("#guideBadgeText")).trim() === "Pausiert" && !(await vis("guidePulse")),
    "Pause: Badge „Pausiert“ ohne Puls"
  );
  ok(await vis("guideResume") && (await vis("guideStop")), "Pause: Fortsetzen + Stopp sichtbar");
  const tPaused = await page.textContent("#guideTimer");
  await sendStep(TAB1, "Ignoriert (Pause)");
  // Bewusst >3 s pausieren: zaehlte die Pause mit, sprange der Timer beim Fortsetzen um >=3 s.
  await sleep(3200);
  ok((await st()).steps === 2, "Pause: Schritt-Nachricht wird ignoriert");
  ok((await page.textContent("#guideTimer")) === tPaused, "Pause: Timer steht (" + tPaused + ")");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "3-pausiert.png"), fullPage: true });

  await click("guideResume");
  s = await st();
  ok(s.phase === "recording" && s.active && s.rec, "Fortsetzen → recording, rec wieder gesetzt");
  const toSec = (t) => {
    const [m, x] = t.split(":").map(Number);
    return m * 60 + x;
  };
  const tResumed = await page.textContent("#guideTimer");
  ok(
    toSec(tResumed) - toSec(tPaused) <= 1,
    "Fortsetzen: Timer ohne Sprung (" + tPaused + " → " + tResumed + ")"
  );
  // iframe-Schritt: content.js kennt nur die iframe-Adresse -> Panel setzt Seite/Titel des TABS.
  await page.evaluate(
    ({ ts }) => {
      window.__T.events.onMessage._fire(
        {
          type: "steply-guide-step",
          step: {
            rect: { x: 0, y: 0, w: 0, h: 0 },
            label: "Klicken Sie auf „Hochladen“",
            action: "click",
            url: "https://frame.example.net/upload?token=geheim",
            title: "iframe",
            interaction: { frame: { url: "https://frame.example.net/upload" } },
            ts,
          },
        },
        { tab: { id: 1, windowId: 10, url: "https://portal.example.com/belege", title: "Belege – Portal" } },
        () => {}
      );
    },
    { ts: (tsBase += 2000) }
  );
  ok(await waitSteps(3), "Nach Fortsetzen: Schritt angenommen (3)");
  {
    const fs = await page.evaluate(() => {
      const s = guideSteps[2];
      return { url: s.url, title: s.title, frame: s.interaction && s.interaction.frame && s.interaction.frame.url };
    });
    ok(
      fs.url === "https://portal.example.com/belege" && fs.title === "Belege – Portal" &&
        fs.frame === "https://frame.example.net/upload",
      "iframe-Schritt: Seite/Titel = Tab, iframe-Adresse bleibt in interaction.frame (" + JSON.stringify(fs) + ")"
    );
  }

  // ---- 4) Stopp mit Schritt „unterwegs" ----
  await sendStep(TAB1, "Klicken Sie auf „Speichern“");
  await click("guideStop");
  ok(await waitSteps(4), "Stopp: unterwegs befindlicher Schritt geht NICHT verloren (4)");
  await page.waitForFunction(() => !guideActive, null, { timeout: 4000 });
  s = await st();
  ok(s.phase === "stopped" && s.rec === undefined, "Stopp: Phase „stopped“, rec entfernt");
  // ---- 4b) Abschluss-Bild (Welle 55, Lücke L2 „Variante A") ----
  // Nach „Fertig" fotografiert das Panel EINMAL den Endzustand des aufgenommenen Tabs und
  // hängt ihn als letzten Schritt an — sonst ist das Ergebnis des letzten Klicks in keiner
  // Anleitung zu sehen.
  ok(await waitSteps(5, 8000), "Fertig: Abschluss-Bild wird als letzter Schritt angehängt (5)");
  {
    const r = await page.evaluate(() => {
      const last = guideSteps[guideSteps.length - 1];
      return {
        variant: last.interaction && last.interaction.variant,
        selector: last.selector,
        rect: last.rect,
        hasImage: !!last.blob && last.width > 0 && last.height > 0,
        results: guideSteps.filter((x) => x.interaction && x.interaction.variant === "result").length,
        label: (document.querySelector("#guideList .guide-item:last-child .lbl") || {}).textContent || "",
      };
    });
    ok(r.variant === "result", "Abschluss-Bild: interaction.variant = „result“");
    ok(r.selector === null, "Abschluss-Bild: OHNE Selektor → nicht automatisierbar, keine Live-Markierung");
    ok(r.rect && r.rect.w === 0 && r.rect.h === 0, "Abschluss-Bild: keine Markierung im Bild");
    ok(r.hasImage, "Abschluss-Bild: trägt einen echten Screenshot");
    ok(r.results === 1, "Abschluss-Bild: genau EINES");
    ok(/Ergebnis/.test(r.label), "Abschluss-Bild: in der Prüfen-Liste als „Ergebnis“ (" + r.label.slice(0, 40) + ")");
  }
  await sendStep(TAB1, "Ignoriert (Gestoppt)");
  await sleep(900);
  ok((await st()).steps === 5, "Gestoppt: Schritt-Nachricht wird ignoriert");

  // ---- 5) Gestoppt: Pruefen ----
  ok(await vis("guideCreate"), "Gestoppt: „Anleitung erstellen“ sichtbar");
  ok(!(await page.isDisabled("#guideCreate")), "Gestoppt: „Anleitung erstellen“ aktiv");
  ok(await vis("guideContinue") && (await vis("guideDiscard")), "Gestoppt: Weiter aufnehmen + Verwerfen");
  ok((await page.$$("#guideList .guide-item")).length === 5, "Gestoppt: Liste mit 5 Schritten sichtbar");
  ok(
    /5\s*Schritte aufgenommen/.test(await page.textContent("#guideCountLine")) && (await vis("guideCountLine")),
    "Gestoppt: Prüfen-Kopf „5 Schritte aufgenommen“"
  );
  ok(await vis("guideTitle"), "Gestoppt: Titel-Feld sichtbar (Prüfen)");
  ok(!(await vis("guidePause")) && !(await vis("guideStop")), "Gestoppt: keine Aufnahme-Steuerleiste");
  await page.click("#guideList .guide-item:last-child .rm");
  ok((await st()).steps === 4, "Gestoppt: Abschluss-Bild per ✕ entfernbar (4)");
  await page.click("#guideList .guide-item:last-child .rm");
  ok((await st()).steps === 3, "Gestoppt: Schritt per ✕ entfernbar (3)");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "4-gestoppt.png"), fullPage: true });

  await click("guideContinue");
  s = await st();
  ok(s.phase === "recording" && s.rec && s.steps === 3, "Weiter aufnehmen → recording, Liste bleibt (3)");
  await click("guideStop");
  await page.waitForFunction(() => !guideActive, null, { timeout: 4000 });
  // Keine Dopplung: „Weiter aufnehmen" wirft ein altes Abschluss-Bild weg, am Ende gibt es
  // wieder genau EINES.
  ok(await waitSteps(4, 8000), "Weiter aufnehmen → Fertig: wieder genau ein Abschluss-Bild (4)");
  ok(
    (await page.evaluate(() =>
      guideSteps.filter((x) => x.interaction && x.interaction.variant === "result").length,
    )) === 1,
    "Abschluss-Bild: nach Stopp → Weiter → Stopp immer noch genau EINES"
  );
  const dBefore2 = dialogs;
  await click("guideDiscard");
  await page.waitForFunction(() => !document.getElementById("start").hidden, null, { timeout: 3000 });
  s = await st();
  ok(dialogs === dBefore2 + 1, "Verwerfen mit Schritten: Bestätigung abgefragt");
  ok(s.phase === "idle" && s.steps === 0 && s.rec === undefined, "Verwerfen → Start-Screen, alles leer");

  // 0 Schritte -> „Anleitung erstellen" deaktiviert.
  await click("recStart");
  await click("guideStop");
  await page.waitForFunction(() => !guideActive, null, { timeout: 4000 });
  // Abschluss-Bild (Welle 55): bei 0 Schritten entsteht KEINES.
  await sleep(1600);
  ok((await st()).steps === 0, "0 Schritte: kein Abschluss-Bild");
  ok(await page.isDisabled("#guideCreate"), "0 Schritte: „Anleitung erstellen“ deaktiviert");
  ok(/Noch keine Schritte/.test(await page.textContent("#guideNote")), "0 Schritte: Hinweis sichtbar");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "5-gestoppt-leer.png"), fullPage: true });
  const dBefore3 = dialogs;
  await click("guideDiscard");
  ok(dialogs === dBefore3 && (await st()).phase === "idle", "Verwerfen ohne Schritte: ohne Rückfrage");

  // ---- 6) Popups ----
  await click("recStart");
  await sendStep(TAB_FOREIGN, "Private Mail (fremdes Fenster)");
  await sleep(1300);
  ok((await st()).steps === 0, "Popup: Schritt aus fremdem Fenster wird verworfen");
  // Popup aus Tab 1 (Panel-Fenster) in NEUEM Fenster 30; dann Kette (Popup aus Popup) in 31;
  // dazu ein Fenster, das aus dem fremden Tab 99 heraus geoeffnet wurde (muss draussen bleiben).
  await page.evaluate(() => {
    const T = window.__T;
    const add = (t) => {
      T.tabs.push(t);
      T.events.onCreated._fire({ ...t });
    };
    add({ id: 50, windowId: 30, openerTabId: 1, url: "https://accounts.google.com/", active: true });
  });
  await sleep(100);
  await page.evaluate(() => {
    const T = window.__T;
    const add = (t) => {
      T.tabs.push(t);
      T.events.onCreated._fire({ ...t });
    };
    add({ id: 51, windowId: 31, openerTabId: 50, url: "https://accounts.google.com/x", active: true });
    add({ id: 60, windowId: 32, openerTabId: 99, url: "https://mail.example.org/p", active: true });
  });
  await sleep(100);
  s = await st();
  ok(s.extra.includes(50) && s.extra.includes(51), "Popup: Tabs 50 (Opener Panel-Tab) + 51 (Kette) registriert");
  ok(!s.extra.includes(60), "Popup: Fenster aus fremdem Tab bleibt ausgeschlossen");
  await page.evaluate(() => (window.__T.captureWindows = []));
  await sendStep({ id: 50, windowId: 30 }, "Klicken Sie auf „Mit Google anmelden“");
  ok(await waitSteps(1), "Popup: Schritt aus registriertem Popup angenommen");
  const capWins = await page.evaluate(() => window.__T.captureWindows.slice());
  ok(capWins.includes(30), "Popup: Screenshot aus dem Popup-Fenster (windowId 30)");
  await sendStep({ id: 51, windowId: 31 }, "Klicken Sie auf „Weiter“");
  ok(await waitSteps(2), "Popup: Schritt aus Ketten-Popup angenommen");
  await sendStep({ id: 60, windowId: 32 }, "Fremd");
  await sleep(1300);
  ok((await st()).steps === 2, "Popup: Schritt aus nicht zugehörigem Fenster verworfen");
  await page.evaluate(() => window.__T.events.onRemoved._fire(50, { windowId: 30 }));
  await sendStep({ id: 50, windowId: 30 }, "Nach Schließen");
  await sleep(1300);
  ok((await st()).steps === 2, "Popup: nach onRemoved wird der Tab nicht mehr angenommen");
  // Waehrend Pause geoeffnete Popups werden NICHT registriert.
  await click("guidePause");
  await page.waitForFunction(() => !guideActive, null, { timeout: 4000 });
  await page.evaluate(() => {
    const t = { id: 70, windowId: 33, openerTabId: 1, url: "https://x.example/", active: true };
    window.__T.tabs.push(t);
    window.__T.events.onCreated._fire({ ...t });
  });
  await sleep(100);
  ok(!(await st()).extra.includes(70), "Popup: in der Pause geöffnetes Fenster wird nicht registriert");
  await click("guideStop");
  await page.waitForFunction(() => !guideActive, null, { timeout: 4000 });
  await click("guideDiscard");
  ok((await st()).extra.length === 0, "Popup: Menge nach Verwerfen leer");

  // ---- 7) Hinweis „kann nicht aufnehmen" ----
  await click("recStart");
  await sleep(300);
  ok(!(await vis("guideCaptureHint")), "Hinweis: aufnehmbarer Tab → kein Hinweis");
  const activate = (id, url) =>
    page.evaluate(
      ({ id, url }) => {
        const T = window.__T;
        let t = T.tabs.find((x) => x.id === id);
        if (!t) {
          t = { id, windowId: 10, url, active: false, status: "complete" };
          T.tabs.push(t);
        }
        if (url) t.url = url;
        for (const x of T.tabs) if (x.windowId === 10) x.active = x.id === id;
        T.events.onActivated._fire({ tabId: id, windowId: 10 });
      },
      { id, url }
    );
  await activate(2, "chrome://extensions/");
  await page.waitForFunction(() => !document.getElementById("guideCaptureHint").hidden, null, { timeout: 3000 }).catch(() => {});
  ok(await vis("guideCaptureHint"), "Hinweis: chrome://-Tab → Hinweis sichtbar");
  ok(
    /Auf dieser Seite kann Steply nicht aufnehmen/.test(await page.textContent("#guideCaptureHint")),
    "Hinweis: Text korrekt"
  );
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "6-hinweis.png"), fullPage: true });
  await activate(1);
  await page.waitForFunction(() => document.getElementById("guideCaptureHint").hidden, null, { timeout: 3000 }).catch(() => {});
  ok(!(await vis("guideCaptureHint")), "Hinweis: zurück auf aufnehmbaren Tab → Hinweis weg");
  // https-Tab OHNE Content-Script (z. B. Web Store) → Hinweis nach Retry.
  await activate(3, "https://chromewebstore.google.com/detail/x");
  await page.waitForFunction(() => !document.getElementById("guideCaptureHint").hidden, null, { timeout: 5000 }).catch(() => {});
  ok(await vis("guideCaptureHint"), "Hinweis: https-Tab ohne Antwort → Hinweis (nach Retry)");
  // Altoffener Tab: antwortet erst nach dem Nachimpfen → KEIN Hinweis.
  await page.evaluate(() => {
    window.__T.injectOnEnsure[4] = true;
    window.__T.runtimeSent = [];
  });
  await activate(4, "https://old-tab.example/");
  await sleep(2500);
  ok(!(await vis("guideCaptureHint")), "Hinweis: altoffener Tab wird nachgeimpft → kein Hinweis");
  ok(
    (await page.evaluate(() => window.__T.runtimeSent.includes("steply-ensure-content"))),
    "Hinweis: steply-ensure-content vor dem Retry gesendet"
  );
  // onUpdated complete des aktiven Tabs → neue Pruefung (Tab navigiert auf chrome://).
  await page.evaluate(() => {
    const T = window.__T;
    const t = T.tabs.find((x) => x.id === 4);
    t.url = "chrome://settings/";
    T.events.onUpdated._fire(4, { status: "complete" }, { ...t });
  });
  await page.waitForFunction(() => !document.getElementById("guideCaptureHint").hidden, null, { timeout: 3000 }).catch(() => {});
  ok(await vis("guideCaptureHint"), "Hinweis: Laden auf Browser-Seite (onUpdated) → Hinweis");
  await click("guidePause");
  ok(!(await vis("guideCaptureHint")), "Hinweis: in der Pause ausgeblendet");

  // ---- 8) Schnelle Klicks (Welle 51): kein stiller Schritt-Verlust ----
  // Stub bildet Chromiums captureVisibleTab-Kontingent nach (2 Aufrufe je 1-s-Fenster, das
  // mit dem ersten Aufruf nach Ablauf beginnt; darüber: Quota-Fehler wie im echten Browser)
  // und protokolliert jeden Aufruf mit Zeitstempel.
  await click("guideStop");
  await page.waitForFunction(() => !guideActive, null, { timeout: 4000 });
  await click("guideDiscard");
  await activate(1);
  await page.evaluate(() => {
    const T = window.__T;
    T.capLog = [];
    T.quotaRejects = 0;
    let winStart = -1e9;
    let tokens = 0;
    const orig = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = (msg) => {
      if (msg && msg.type === "steply-capture") {
        const now = performance.now();
        if (now > winStart + 1000) {
          winStart = now;
          tokens = 2;
        }
        if (tokens <= 0) {
          T.quotaRejects++;
          return Promise.resolve({
            ok: false,
            error: "This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.",
          });
        }
        tokens--;
        T.capLog.push(Date.now());
      }
      return orig(msg);
    };
  });
  await sleep(1300); // evtl. altes Kontingent-Fenster ablaufen lassen
  await click("recStart");
  await page.waitForFunction(() => guideActive, null, { timeout: 3000 });
  const fire = (label, action, ts) =>
    page.evaluate(
      ({ label, action, ts }) => {
        window.__T.events.onMessage._fire(
          {
            type: "steply-guide-step",
            step: { rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 }, label, action, url: "https://example.com/start", ts },
          },
          { tab: { id: 1, windowId: 10 } },
          () => {}
        );
        return Date.now();
      },
      { label, action, ts }
    );

  // 8a) Zwei echte Klicks im 200-ms-Abstand (z. B. „Filter öffnen“ → „Option wählen“):
  //     zwei EIGENE Screenshot-Aufrufe, beide sofort (das Menü ist beim 2. Klick noch offen).
  const t0 = Date.now();
  const sentA = await fire("Klicken Sie auf „Filter“", "click", t0);
  await sleep(200);
  const sentB = await fire("Klicken Sie auf „Offen“", "click", t0 + 200);
  ok(await waitSteps(2, 3000), "Zwei Klicks (200 ms): beide Schritte in der Liste");
  {
    const r = await page.evaluate(() => ({
      log: window.__T.capLog.slice(),
      imp: guideSteps.map((s) => s.imprecise),
      distinctBlobs: guideSteps[0].blob !== guideSteps[1].blob,
    }));
    ok(r.log.length === 2, `Zwei Klicks: zwei getrennte Screenshot-Aufrufe (${r.log.length})`);
    ok(r.distinctBlobs, "Zwei Klicks: jeder Schritt hat ein eigenes Bild");
    ok(r.log[1] - sentB < 250, `Zwei Klicks: 2. Screenshot sofort (${r.log[1] - sentB} ms nach dem Klick, nicht erst nach 550 ms)`);
    ok(r.log[0] - sentA < 250, "Zwei Klicks: 1. Screenshot sofort");
    ok(!r.imp[0] && !r.imp[1], "Zwei Klicks: kein „Bild ggf. ungenau“");
  }

  // 8b) Acht Schritte in < 1 s: alle acht landen (in Reihenfolge) in der Liste, jeder mit Bild.
  await sleep(1300);
  await page.evaluate(() => (window.__T.capLog = []));
  const labels8 = Array.from({ length: 8 }, (_, i) => `Schnell ${i + 1}`);
  const tStart8 = Date.now();
  for (let i = 0; i < 8; i++) {
    await fire(labels8[i], "click", tStart8 + i * 110);
    await sleep(110);
  }
  const burstMs = Date.now() - tStart8;
  ok(await waitSteps(10, 8000), `Acht schnelle Schritte (${burstMs} ms): alle in der Liste (10 gesamt)`);
  {
    const r = await page.evaluate(() => ({
      labels: guideSteps.slice(2).map((s) => s.label),
      allImg: guideSteps.every((s) => s.blob && s.blob.size > 0 && s.thumbUrl),
      imp: guideSteps.slice(2).map((s) => !!s.imprecise),
      caps: window.__T.capLog.length,
      status: document.getElementById("status").textContent,
      rendered: document.querySelectorAll("#guideList .guide-item").length,
      warns: document.querySelectorAll("#guideList .img-warn").length,
    }));
    ok(JSON.stringify(r.labels) === JSON.stringify(labels8), "Acht Schritte: Reihenfolge erhalten");
    ok(r.allImg, "Acht Schritte: jeder Schritt hat ein Bild");
    ok(r.rendered === 10, `Acht Schritte: Liste zeigt 10 Einträge (${r.rendered})`);
    ok(!/übersprungen/.test(r.status), "Acht Schritte: kein „Schritt übersprungen“");
    ok(r.caps >= 2 && r.caps < 8, `Acht Schritte: Rückstau teilt Screenshots (${r.caps} Aufrufe für 8 Schritte)`);
    ok(r.imp.some(Boolean), `Acht Schritte: verspätete Bilder markiert (${r.imp.map((x) => (x ? "!" : "·")).join("")})`);
    ok(!r.imp[0] && !r.imp[1], "Acht Schritte: die ersten beiden (sofort fotografiert) sind nicht markiert");
    ok(r.warns === r.imp.filter(Boolean).length, `Acht Schritte: „Bild ggf. ungenau“ sichtbar (${r.warns}×)`);
  }
  ok((await page.evaluate(() => window.__T.quotaRejects)) === 0, "Kontingent: kein einziger Quota-Fehler (Limiter trifft Chromiums Fenster)");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "8-schnelle-klicks.png"), fullPage: true });

  // 8c) Eingabe-Flush + Klick (Welle 24) teilen sich weiterhin EINEN Screenshot.
  await sleep(1300);
  await page.evaluate(() => (window.__T.capLog = []));
  // Wie content.js (flushUnlessInside + emitClick im selben pointerdown): zwei Nachrichten direkt
  // hintereinander (eigene Tasks, wie runtime-Nachrichten).
  await page.evaluate(() => {
    const T = window.__T;
    const ts = Date.now();
    const send = (label, action, t) =>
      T.events.onMessage._fire(
        {
          type: "steply-guide-step",
          step: { rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 }, label, action, url: "https://example.com/start", ts: t },
        },
        { tab: { id: 1, windowId: 10 } },
        () => {}
      );
    setTimeout(() => send("Geben Sie „Müller“ ein", "type", ts), 0);
    setTimeout(() => send("Klicken Sie auf „Suchen“", "click", ts + 2), 0);
  });
  ok(await waitSteps(12, 3000), "Eingabe + Klick: beide Schritte in der Liste");
  {
    const r = await page.evaluate(() => ({
      caps: window.__T.capLog.length,
      same: guideSteps[10].blob === guideSteps[11].blob,
      imp: guideSteps[10].imprecise || guideSteps[11].imprecise,
    }));
    ok(r.caps === 1 && r.same, `Eingabe + Klick: EIN geteilter Screenshot (${r.caps})`);
    ok(!r.imp, "Eingabe + Klick: nicht als ungenau markiert");
  }

  // 8d) Quota-Fehler trotz Limiter (fremder Aufrufer verbraucht das Kontingent): Schritt bleibt.
  await sleep(1300);
  await page.evaluate(() => {
    // Kontingent „von außen“ leeren: zwei Aufrufe am Panel vorbei.
    chrome.runtime.sendMessage({ type: "steply-capture", windowId: 10 });
    chrome.runtime.sendMessage({ type: "steply-capture", windowId: 10 });
  });
  await fire("Klicken Sie auf „Nach Quota“", "click", Date.now());
  ok(await waitSteps(13, 5000), "Quota-Fehler: Schritt wird nach Ablauf des Fensters doch fotografiert");
  ok(
    (await page.evaluate(() => window.__T.quotaRejects)) >= 1 &&
      (await page.evaluate(() => guideSteps[12].label === "Klicken Sie auf „Nach Quota“")),
    "Quota-Fehler: erkannt und abgewartet statt verworfen"
  );

  // ---- 9) Video: Auftrags-Status nach dem Upload (Welle 51) ----
  // Vorher endete „wird erstellt“ still. Jetzt fragt das Panel /api/recorder/video-status ab:
  // gescheitert -> Grund in Klartext + „Erneut aufnehmen“; fertig -> „In Steply öffnen“ direkt
  // in die Anleitung.
  await click("guideStop").catch(() => {});
  await page.waitForFunction(() => !guideActive, null, { timeout: 4000 }).catch(() => {});
  if (!(await page.evaluate(() => document.getElementById("guideDiscard").hidden))) await click("guideDiscard");
  const statusSeq = { "job-fail": ["queued", "processing", "failed"], "job-done": ["processing", "done"] };
  const statusHits = { "job-fail": 0, "job-done": 0 };
  let authSeen = "";
  await page.route(/\/api\/recorder\/video-status/, (r) => {
    const u = new URL(r.request().url());
    const id = u.searchParams.get("id");
    authSeen = r.request().headers()["authorization"] || "";
    const seq = statusSeq[id] || ["queued"];
    const n = statusHits[id] || 0;
    statusHits[id] = n + 1;
    const st = seq[Math.min(n, seq.length - 1)];
    const body = {
      status: st,
      progress: st === "processing" ? "Schritt 1/3" : null,
      tutorialId: st === "done" ? "tut-42" : null,
      reason: st === "failed" ? "die Aufnahme ließ sich nicht lesen (möglicherweise unvollständig oder zu kurz)" : null,
    };
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.evaluate(() => {
    window.__T.created = [];
    chrome.tabs.create = (o) => {
      window.__T.created.push(o && o.url);
      return Promise.resolve({ id: 777 });
    };
    show("videoDone");
    setVideoDoneState("recorded");
    els.uploadBox.hidden = false;
    els.uploadDone.hidden = false;
    watchVideoJob("job-fail", appBase());
  });
  ok(/Warteschlange/.test(await page.textContent("#uploadDoneText")), "Video-Status: zuerst „In der Warteschlange“");
  await page.waitForFunction(() => /KI verarbeitet/.test(document.getElementById("uploadDoneText").textContent), null, { timeout: 9000 }).catch(() => {});
  ok(/KI verarbeitet das Video – Schritt 1\/3/.test(await page.textContent("#uploadDoneText")), "Video-Status: Fortschritt wird angezeigt");
  await page.waitForFunction(() => !document.getElementById("videoRetry").hidden, null, { timeout: 12000 }).catch(() => {});
  ok(await vis("videoRetry"), "Video-Status: gescheitert → „Erneut aufnehmen“ sichtbar");
  ok(!(await vis("openApp")), "Video-Status: gescheitert → kein „In Steply öffnen“");
  ok(
    (await page.textContent("#uploadDoneText")).includes(
      "Das Video konnte nicht verarbeitet werden – die Aufnahme ließ sich nicht lesen (möglicherweise unvollständig oder zu kurz). Bitte erneut aufnehmen."
    ),
    "Video-Status: Grund in Klartext"
  );
  ok((await page.textContent("#videoDoneTitle")).trim() === "Verarbeitung fehlgeschlagen", "Video-Status: Überschrift „Verarbeitung fehlgeschlagen“");
  ok(authSeen === "Bearer tok-test", "Video-Status: Abfrage mit Verbindungs-Token (Bearer)");
  const hitsAfterFail = statusHits["job-fail"];
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "9-video-fehlgeschlagen.png"), fullPage: true });
  await sleep(4500);
  ok(statusHits["job-fail"] === hitsAfterFail, "Video-Status: nach dem Endzustand keine weiteren Abfragen");
  await click("videoRetry");
  await page.waitForFunction(() => !document.getElementById("videoSetup").hidden, null, { timeout: 3000 }).catch(() => {});
  ok(await vis("videoSetup"), "Video-Status: „Erneut aufnehmen“ → Video-Aufnahme vorbereiten");
  ok((await page.textContent("#videoDoneTitle")).trim() === "Aufnahme fertig", "Video-Status: Fertig-Bildschirm zurückgesetzt");

  await page.evaluate(() => {
    show("videoDone");
    els.uploadBox.hidden = false;
    els.uploadDone.hidden = false;
    watchVideoJob("job-done", appBase());
  });
  await page.waitForFunction(() => /Fertig/.test(document.getElementById("uploadDoneText").textContent), null, { timeout: 12000 }).catch(() => {});
  ok(/Fertig – die Anleitung liegt als Entwurf in Steply/.test(await page.textContent("#uploadDoneText")), "Video-Status: fertig → „Fertig – …“");
  ok((await page.textContent("#videoDoneTitle")).trim() === "Anleitung erstellt" && (await vis("openApp")) && !(await vis("videoRetry")), "Video-Status: fertig → „In Steply öffnen“");
  await click("openApp");
  ok(
    (await page.evaluate(() => window.__T.created.slice())).includes("https://app.example.test/app/tutorials/tut-42"),
    "Video-Status: „In Steply öffnen“ öffnet direkt die neue Anleitung"
  );
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "10-video-fertig.png"), fullPage: true });
  // „Neue Aufnahme“ beendet eine laufende Abfrage.
  await page.evaluate(() => watchVideoJob("job-x", appBase()));
  await click("again");
  await sleep(4500);
  ok(!(statusHits["job-x"] > 0),"Video-Status: „Neue Aufnahme“ beendet die Abfrage");

  ok(pageErrors.length === 0, "keine Seitenfehler" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  if (browser) await browser.close();
}

console.log(failed ? "\nFEHLGESCHLAGEN" : "\nAlle Prüfungen grün.");
process.exit(failed ? 1 : 0);
