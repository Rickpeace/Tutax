// Welle 43 — TAB-/FENSTER-FOLGEN: ONESHOT-BEWEIS (Kern der Welle).
//
// Beweist im ECHTEN Browser (geladene Extension, panel.html als Tab) gegen EINE eigene
// node:http-Testsite, dass ein Lauf automatisch in während des Laufs geöffnete Tabs, Fenster
// und OAuth-Popups FOLGT — statt starr am Ursprungs-Tab (Richards WeTransfer-Fall) hängenzu-
// bleiben. Getrieben wird die AUSGELIEFERTE Ausführ-Maschine aus extension/panel.js
// (execExecuteCurrent / execSelectTabForStep / execRunTabs / execActivateTab) + die pure
// extension/exec-plan.js (pickTabForStep) + die Worker-Tab-Verfolgung in extension/background.js
// (steply-exec-Port-Session, onCreated-openerTabId-Kette, onRemoved). Muster:
// scripts/test-state-intelligence-e2e.mjs.
//
// Die zwei realen Bugs aus Richards ERSTEM echten Test:
//   Bug 1: Ein Klick öffnet einen neuen Tab/ein Popup — es öffnet, wird aber NICHT aktiviert;
//          der Lauf hängt, bis man von Hand den Tab wechselt.
//   Bug 2: Der Google-„Konto auswählen"-Popup (separates Fenster) wird nicht durchsucht — die
//          Engine sucht weiter im ALTEN Tab → „text-mismatch", obwohl das Element sichtbar ist.
//
// BEWEISE (asserts auf Lauf-Zustand exec.* + welcher Tab aktiv war + Server-Log):
//   A) NEUER TAB: Klick öffnet target=_blank → /second in NEUEM Tab; der Lauf bindet dorthin um,
//      AKTIVIERT ihn und führt den Schritt DORT aus (Server-Log /second-click; Tab aktiv).
//   B) POPUP (separates Fenster): Klick öffnet window.open → /oauth in NEUEM Fenster mit dem
//      Google-artigen mehrzeiligen „Richard Petrasch \n richard.petrasch@googlemail.com"-Element;
//      der Lauf FINDET+FOKUSSIERT das Popup-Fenster und klickt „Konto wählen" (Server-Log
//      /oauth-click); danach schließt sich das Popup und schickt den Opener auf /done → der Lauf
//      KEHRT ZUM OPENER ZURÜCK und schließt ab (Server-Log /done-click).
//
// Engine-Ebene: PANEL (Vollautomatik) ECHT im Browser. Der RUNNER (geplanter Lauf) teilt exakt
// dieselbe pure Logik (pickTabForStep) + dieselbe Worker-Tab-Verfolgung und ist über die
// gemeinsamen Bausteine (exec-run.js selectTabForStep + runner.js getRunTabs/rebind/activateTab)
// per Code-Review abgedeckt — hier ehrlich benannt (nicht separat im Browser gefahren).
//
// Nutzung:  node scripts/test-tab-follow-e2e.mjs
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(HERE, "../extension");

const PW_DIR = process.env.STEPLY_PW_DIR || "C:/Users/Richa/AppData/Local/Temp/steply-pw";
const pwEntry = `${PW_DIR}/node_modules/playwright/index.js`;
if (!existsSync(pwEntry)) {
  console.error("✗ Playwright nicht gefunden unter", pwEntry, "\n  (STEPLY_PW_DIR setzen oder Scratch anlegen).");
  process.exit(2);
}
const { chromium } = require(pwEntry);

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Testsite (EIN Server) ─────────────────────────────────────────────────────────────────
// /start          : Button „Neuer Tab" (a target=_blank → /second) + „Popup öffnen" (window.open → /oauth)
// /second         : Element, dessen Klick /second-click protokolliert
// /oauth          : Google-artige Konto-Zeile (mehrzeilig Name+E-Mail); Klick protokolliert
//                   /oauth-click, schickt den Opener auf /done und SCHLIESST das Popup
// /done           : Abschluss-Element, dessen Klick /done-click protokolliert
const reqLog = []; // { method, path }
function html(res, body) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end('<!doctype html><meta charset="utf-8"><style>body{font:16px system-ui;padding:40px}button,a{display:inline-block;font-size:18px;padding:12px 18px;margin:8px}</style>' + body);
}
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  reqLog.push({ method: req.method, path: u.pathname });
  if (u.pathname === "/start" && req.method === "GET") {
    html(res,
      '<h1>Start</h1>' +
      '<a id="newtab" href="/second" target="_blank">Neuer Tab</a>' +
      '<button id="openpopup" type="button" ' +
      "onclick=\"window.open('/oauth','oauthwin','width=480,height=620,left=160,top=140')\">Popup öffnen</button>");
    return;
  }
  if (u.pathname === "/second" && req.method === "GET") {
    html(res,
      '<h1 id="secondHead">Zweiter Tab</h1>' +
      '<button id="secondBtn" type="button" onclick="fetch(\'/second-click\')">Auf zweitem Tab</button>');
    return;
  }
  if (u.pathname === "/oauth" && req.method === "GET") {
    // Konto-Zeile: verschachtelt (Name-<div> + E-Mail-<div>). innerText fügt an den Block-Grenzen
    // einen Umbruch ein → „Richard Petrasch\nrichard.petrasch@googlemail.com" (wie die Aufnahme);
    // textContent klebte es OHNE Trenner zusammen (der Resolver-Härtungs-Fall der Welle 43).
    // Klick: sendBeacon /oauth-click (überlebt das Schließen), Opener → /done, Popup schließen.
    html(res,
      '<h1>Konto auswählen</h1>' +
      '<button id="chooseAccount" type="button" ' +
      "onclick=\"navigator.sendBeacon('/oauth-click'); try{ if(window.opener) window.opener.location='/done'; }catch(e){} window.close();\">" +
      '<div>Richard Petrasch</div><div>richard.petrasch@googlemail.com</div></button>');
    return;
  }
  if (u.pathname === "/done" && req.method === "GET") {
    html(res,
      '<h1 id="doneHead">Fertig</h1>' +
      '<button id="doneBtn" type="button" onclick="fetch(\'/done-click\')">Abschließen</button>');
    return;
  }
  // Protokoll-Endpunkte (Klick-Belege). 204, Body egal.
  if (u.pathname === "/second-click" || u.pathname === "/oauth-click" || u.pathname === "/done-click") {
    req.on("data", () => {});
    req.on("end", () => { res.writeHead(204); res.end(); });
    return;
  }
  res.writeHead(404); res.end("nope");
});
function listen(s) {
  return new Promise((resolve) => s.listen(0, "127.0.0.1", () => resolve(s.address().port)));
}

// ── Fixtures (Automationen; page_urls absolut) ─────────────────────────────────────────────
function newTabAuto(SITE) {
  return {
    automation: { id: "a-newtab", title: "Neuer Tab folgen", site_domains: ["127.0.0.1"], params: [] },
    steps: [
      { id: "t1", position: 0, title: "Neuer Tab öffnen", action: "click", selector: { css: "#newtab", text: "Neuer Tab" }, page_url: SITE + "/start" },
      { id: "t2", position: 1, title: "Im zweiten Tab klicken", action: "click", selector: { css: "#secondBtn", text: "Auf zweitem Tab" }, page_url: SITE + "/second" },
    ],
    values: {},
  };
}
function popupAuto(SITE) {
  return {
    automation: { id: "a-popup", title: "Popup folgen", site_domains: ["127.0.0.1"], params: [] },
    steps: [
      { id: "p1", position: 0, title: "Popup öffnen", action: "click", selector: { css: "#openpopup", text: "Popup öffnen" }, page_url: SITE + "/start" },
      { id: "p2", position: 1, title: "Konto wählen", action: "click", selector: { css: "#chooseAccount", text: "Richard Petrasch richard.petrasch@googlemail.com" }, page_url: SITE + "/oauth" },
      { id: "p3", position: 2, title: "Abschließen", action: "click", selector: { css: "#doneBtn", text: "Abschließen" }, page_url: SITE + "/done" },
    ],
    values: {},
  };
}

// ── Panel-Treiber: Lauf starten (repliziert die LOKALE Glue aus startAutoRun; Server umgangen) ─
async function startRunInPanel(panelPage, fixture, mode, siteTabId) {
  await panelPage.evaluate(async (args) => {
    const { automation, steps, values, mode, siteTabId } = args;
    try { execLinkStop(); } catch (e) {}
    try { execRemoveDownloadWatch(); } catch (e) {}
    exec.running = false;
    exec.phase = "idle";
    exec.finished = false;
    exec.automation = automation;
    exec.steps = steps;
    exec.values = values;
    exec.mode = mode;
    exec.autoMode = mode === "auto";
    exec.plan = SteplyExecPlan.buildRunPlan(automation, steps, values);
    exec.tabId = siteTabId;
    exec.runId = null;
    exec.index = 0;
    exec.paused = false;
    exec.lastMissReason = "";
    exec.lastMissDetail = "";
    exec.skipNote = null;
    exec.skipFileTarget = null;
    exec.verifying = false;
    exec.stateBusy = false;
    exec.files = {};
    execLinkStart(exec.tabId);
    show("autoRun");
    execRenderFileChip();
    await execEnsureStartTab(exec.plan[0]);
    exec.running = true;
    if (exec.autoMode) {
      exec.phase = "running";
      execRenderRun();
      setTimeout(() => { if (exec.running && exec.autoMode && !exec.paused) execExecuteCurrent(); }, 100);
    } else {
      const decided = await execApplyState();
      if (exec.running && decided === "proceed") { exec.phase = "ready"; execRenderRun(); }
    }
  }, Object.assign({ mode, siteTabId }, fixture));
}

function readState(panelPage) {
  return panelPage.evaluate(() => ({
    phase: exec.phase,
    index: exec.index,
    running: exec.running,
    reason: exec.lastMissReason,
    tabId: exec.tabId,
    total: exec.plan.length,
  }));
}
async function waitFor(panelPage, pred, timeoutMs) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await readState(panelPage);
    if (pred(last)) return last;
    await sleep(200);
  }
  return last;
}

let ext = null;
try {
  const PORT = await listen(server);
  const SITE = `http://127.0.0.1:${PORT}`;
  console.log(`  Testsite :${PORT}`);

  const userDataDir = path.join(PW_DIR, "pw-tabfollow-" + Date.now());
  mkdirSync(userDataDir, { recursive: true });
  ext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    // --disable-popup-blocking: window.open aus einem SKRIPTIERTEN Klick (content.js el.click())
    // hat keine „transient user activation" → würde sonst geblockt. Der neue Tab (target=_blank)
    // funktioniert ohnehin; das Flag stellt nur den echten Popup-Fenster-Fall her.
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`, "--disable-popup-blocking"],
  });

  let sw = ext.serviceWorkers()[0];
  if (!sw) sw = await ext.waitForEvent("serviceworker", { timeout: 10000 }).catch(() => null);
  const extId = sw ? new URL(sw.url()).host : null;
  ok(!!extId, "Extension geladen (Service-Worker aktiv)");
  if (!extId) throw new Error("Extension-ID nicht ermittelbar");

  const sitePage = ext.pages()[0] || (await ext.newPage());
  await sitePage.goto(SITE + "/start", { waitUntil: "load" });
  const panelPage = await ext.newPage();
  await panelPage.goto(`chrome-extension://${extId}/panel.html`, { waitUntil: "load" });

  // Sanity: die SHIPPED-Tab-Folge-Maschine ist im Panel + die pure pickTabForStep erreichbar.
  const sane = await panelPage.evaluate(() => ({
    exec: typeof exec !== "undefined",
    pick: typeof SteplyExecPlan !== "undefined" && typeof SteplyExecPlan.pickTabForStep === "function",
    sel: typeof execSelectTabForStep === "function" && typeof execRunTabs === "function" && typeof execActivateTab === "function",
    run: typeof execExecuteCurrent === "function",
  }));
  ok(sane.exec && sane.pick && sane.sel && sane.run,
    "Panel: SHIPPED-Tab-Folge-Maschine erreichbar (execSelectTabForStep/execRunTabs/execActivateTab + pickTabForStep)");

  // Site-Tab-ID + Fenster-ID aus dem Panel-Kontext.
  const siteInfo = await panelPage.evaluate(async (site) => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((x) => x.url && x.url.indexOf(site + "/start") === 0);
    return t ? { tabId: t.id, windowId: t.windowId } : null;
  }, SITE);
  ok(siteInfo && siteInfo.tabId != null, "Site-Tab an den Lauf gebunden (chrome.tabs)");
  const siteTabId = siteInfo.tabId;
  const startWindowId = siteInfo.windowId;

  // ════════ BEWEIS A: NEUER TAB — Klick öffnet target=_blank → Lauf folgt + aktiviert + führt DORT aus ════════
  await sitePage.goto(SITE + "/start", { waitUntil: "load" });
  const aFrom = reqLog.length;
  await startRunInPanel(panelPage, newTabAuto(SITE), "auto", siteTabId);
  const stA = await waitFor(panelPage, (s) => s.phase === "done" || s.phase === "miss" || s.phase === "aborted", 45000);
  const aLog = reqLog.slice(aFrom);
  const aState = await panelPage.evaluate(async (site) => {
    const tabs = await chrome.tabs.query({});
    const second = tabs.find((t) => t.url && t.url.indexOf(site + "/second") === 0);
    return { execTabId: exec.tabId, secondTabId: second ? second.id : null, secondActive: second ? second.active : null };
  }, SITE);
  ok(stA && stA.phase === "done", `Beweis A: Lauf komplett durchgelaufen (phase=${stA && stA.phase})`);
  ok(aLog.some((r) => r.path === "/second-click"),
    "Beweis A: Schritt 2 wurde im NEUEN Tab ausgeführt — Server-Log zeigt /second-click");
  ok(aState.secondTabId != null && aState.execTabId === aState.secondTabId,
    `Beweis A: Lauf an den neuen Tab umgebunden (exec.tabId=${aState.execTabId}, neuer Tab=${aState.secondTabId})`);
  ok(aState.secondActive === true, "Beweis A: der neue Tab wurde AKTIVIERT (Bug 1 behoben — kein Hängen mehr)");

  // ════════ BEWEIS B: POPUP (separates Fenster) — folgen + fokussieren + Konto wählen + zurück zum Opener ════════
  await sitePage.goto(SITE + "/start", { waitUntil: "load" });
  const bFrom = reqLog.length;

  // Popup-Fenster-Beobachter: während des Laufs die Fenster abtasten und festhalten, ob je ein
  // POPUP-Fenster mit /oauth existierte (separates Fenster ≠ Start-Fenster) und FOKUSSIERT war.
  const popupObs = { seen: false, focused: false, urlOk: false, separateWindow: false };
  const poller = setInterval(async () => {
    try {
      const wins = await panelPage.evaluate(async () =>
        (await chrome.windows.getAll({ populate: true })).map((w) => ({
          id: w.id, type: w.type, focused: w.focused, urls: (w.tabs || []).map((t) => t.url || ""),
        })),
      );
      for (const w of wins) {
        const hasOauth = w.urls.some((x) => x.indexOf("/oauth") >= 0);
        if (w.type === "popup" || hasOauth) {
          popupObs.seen = true;
          if (hasOauth) popupObs.urlOk = true;
          if (w.id !== startWindowId) popupObs.separateWindow = true;
          if (w.focused && (hasOauth || w.type === "popup")) popupObs.focused = true;
        }
      }
    } catch (e) { /* Panel evtl. kurz beschäftigt */ }
  }, 70);

  await startRunInPanel(panelPage, popupAuto(SITE), "auto", siteTabId);
  const stB = await waitFor(panelPage, (s) => s.phase === "done" || s.phase === "miss" || s.phase === "aborted", 60000);
  clearInterval(poller);
  await sleep(300);
  const bLog = reqLog.slice(bFrom);
  const bState = await panelPage.evaluate(async (site) => {
    const tabs = await chrome.tabs.query({});
    const done = tabs.find((t) => t.url && t.url.indexOf(site + "/done") === 0);
    return { execTabId: exec.tabId, doneTabId: done ? done.id : null };
  }, SITE);

  ok(stB && stB.phase === "done", `Beweis B: Lauf komplett durchgelaufen (phase=${stB && stB.phase}, reason=${stB && stB.reason})`);
  ok(popupObs.separateWindow && popupObs.urlOk,
    `Beweis B: OAuth-Popup als SEPARATES Fenster erkannt (separateWindow=${popupObs.separateWindow}, /oauth=${popupObs.urlOk})`);
  ok(popupObs.focused, "Beweis B: das Popup-Fenster wurde FOKUSSIERT (chrome.windows.update focused) — Bug 1 im Fenster behoben");
  ok(bLog.some((r) => r.path === "/oauth-click"),
    "Beweis B: Konto-Zeile im POPUP-Fenster gefunden+geklickt — Server-Log /oauth-click (Bug 2 behoben)");
  ok(bLog.some((r) => r.path === "/done-click"),
    "Beweis B: nach Popup-Schluss zum Opener zurückgekehrt + /done erreicht — Server-Log /done-click");
  ok(bState.doneTabId != null && bState.execTabId === bState.doneTabId && bState.doneTabId === siteTabId,
    `Beweis B: Rückbindung an den Opener-Tab (exec.tabId=${bState.execTabId}, Opener=${siteTabId})`);

  await ext.close();
  ext = null;
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (ext) await ext.close().catch(() => {});
  server.close();
}

console.log(failed
  ? "\n✗ Tab-/Fenster-Folgen E2E FEHLGESCHLAGEN."
  : "\n✓ Tab-/Fenster-Folgen E2E grün: neuer Tab wird aktiviert + Schritt dort ausgeführt; OAuth-Popup (separates Fenster) gefunden+fokussiert + Konto-Zeile geklickt; nach Popup-Schluss Rückkehr zum Opener bis /done.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);
