// Welle 46 — BUGFIX: Automations-Lauf hängt nach einem erfolgreichen IN-PAGE-KLICK.
//
// Richards echter Test: Schritt „Konto-Menü öffnen" (Klick auf Avatar → Dropdown öffnet sich
// IN der Seite, KEINE Navigation, KEIN neuer Tab). Der Klick FUNKTIONIERT (Menü sichtbar offen),
// aber der Lauf bleibt auf „Schritt wird ausgeführt …" hängen und schaltet NICHT weiter — er
// „merkt nicht, dass er es ausgeführt hat". Seit den Wellen 43 (Tab-Folgen) / 44 / 45.
//
// URSACHE (im Browser reproduziert, siehe Szenario B): execSelectTabForStep (Welle 43) läuft VOR
// jedem Schritt und bindet den Lauf an den Tab um, dessen URL zum Schritt passt. Enthält die lauf-
// zugehörige Menge einen ZWEITEN Tab mit DERSELBEN page_url (z. B. während des Laufs geöffnete
// Kopie/Login-Echo), wählte pickTabForStep den (zuletzt fokussierten) FALSCHEN Tab statt des
// gebundenen — der reine In-Page-Klick landete im falschen Tab. Konnte dieser den Klick nicht
// abschließen, lief der Schritt in den Timeout → der Lauf schaltete nicht weiter.
//
// FIX (Welle 46): pickTabForStep bekommt den gebundenen Tab als preferTabId; passt der gebundene
// Tab selbst zum Schritt, bleibt er gebunden (kein Wechsel bei reinem In-Page-Klick). Zusätzlich
// stützt sich der Ergebnis-Handler jetzt AUTORITATIV auf den (pro Schritt eindeutigen) Token statt
// auf den fragilen Tab-ID-Vergleich. Beides gespiegelt im autonomen Runner (exec-run.js/runner.js).
//
// Getrieben wird die AUSGELIEFERTE Ausführ-Maschine aus extension/panel.js im ECHTEN Browser
// (geladene Extension, panel.html als Tab) gegen eine eigene node:http-Testsite. Muster:
// scripts/test-tab-follow-e2e.mjs.
//
// BEWEISE:
//   A) EINFACH (ein Tab): In-Page-Klick öffnet Dropdown → Folge-Schritt im Dropdown → Lauf durch.
//   B) REGRESSION (der Kern): Ein Vorschritt öffnet eine ZWEITE Kopie derselben Seite (gleicher
//      page_url-Pfad), die den Ziel-Knopf NICHT trägt. VORHER band der Lauf dorthin um → der
//      In-Page-Klick lief ins Leere → Miss/Hänger. NACHHER bleibt der Lauf am gebundenen (sicht-
//      baren) Tab, klickt DORT (Server-Log tag=A), öffnet das Menü und läuft durch.
//   C) TAB-FOLGE INTAKT (Welle 43): Ein Klick öffnet ein OAuth-Popup, das nach der Kontowahl einen
//      NEUEN Tab auf einem ANDEREN Pfad (/app2) öffnet; der Lauf FOLGT korrekt dorthin (preferTabId
//      blockiert echte Folgen NICHT, weil der gebundene Tab dort nicht mehr passt).
//
// Nutzung:  node scripts/test-inpage-advance-e2e.mjs
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
// /app       : Avatar-Knopf (type=button) → toggelt IN-PAGE ein Dropdown (KEINE Navigation); im
//              Menü ein „Abmelden"-Knopf. ?tag=X kennzeichnet, WELCHER Tab geklickt hat (Beleg).
//              ?bare=1 liefert dieselbe Seite (gleicher Pfad!) OHNE den Avatar (die „falsche"
//              zweite Kopie). Zusätzlich Knöpfe „2. Tab" (Szenario B) und „Login" (Szenario C).
// /oauth     : Google-artige Konto-Zeile; Klick → Opener öffnet /app2 in NEUEM Tab, Popup schließt.
// /app2      : zweiter App-Tab (anderer Pfad) mit eigenem In-Page-Dropdown.
const reqLog = []; // { method, path, search }
function html(res, body) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end('<!doctype html><meta charset="utf-8"><style>#menu[hidden],#menu2[hidden]{display:none}</style>' + body);
}
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  reqLog.push({ method: req.method, path: u.pathname, search: u.search });
  if (u.pathname === "/app" && req.method === "GET") {
    const tag = u.searchParams.get("tag") || "A";
    const bare = u.searchParams.get("bare") === "1";
    const avatar = bare
      ? "" // die „falsche" zweite Kopie trägt den Avatar NICHT → sie kann den Klick nicht abschließen
      : '<button id="avatar" type="button" aria-haspopup="menu" ' +
        "onclick=\"fetch('/avatar-click?tag=" + tag + "'); var m=document.getElementById('menu'); m.hidden=!m.hidden;\">☰ Konto</button>" +
        '<div id="menu" role="menu" hidden>' +
        '  <button id="logout" type="button" onclick="fetch(\'/logout-click?tag=' + tag + "')\">Abmelden</button></div>";
    html(res,
      '<h1>App ' + tag + (bare ? " (bare)" : "") + '</h1>' +
      // Öffnet eine ZWEITE Kopie DERSELBEN Seite (gleicher Pfad /app), aber OHNE Avatar.
      '<button id="opendup" type="button" onclick="window.open(\'/app?tag=B&bare=1\',\'_blank\')">2. Tab</button>' +
      avatar +
      '<button id="glogin" type="button" ' +
      "onclick=\"window.open('/oauth','oauthwin','width=480,height=620,left=160,top=140')\">Login mit Google</button>");
    return;
  }
  if (u.pathname === "/oauth" && req.method === "GET") {
    html(res,
      '<h1>Konto auswählen</h1>' +
      '<button id="chooseAccount" type="button" ' +
      "onclick=\"navigator.sendBeacon('/oauth-click'); try{ if(window.opener) window.opener.open('/app2','_blank'); }catch(e){} window.close();\">" +
      '<div>Richard Petrasch</div><div>richard.petrasch@googlemail.com</div></button>');
    return;
  }
  if (u.pathname === "/app2" && req.method === "GET") {
    html(res,
      '<h1>App (zweiter Tab)</h1>' +
      '<button id="avatar2" type="button" aria-haspopup="menu" ' +
      "onclick=\"fetch('/avatar2-click'); var m=document.getElementById('menu2'); m.hidden=!m.hidden;\">☰ Konto</button>" +
      '<div id="menu2" role="menu" hidden>' +
      '  <button id="logout2" type="button" onclick="fetch(\'/logout2-click\')">Abmelden</button></div>');
    return;
  }
  if (/-click$/.test(u.pathname)) {
    req.on("data", () => {});
    req.on("end", () => { res.writeHead(204); res.end(); });
    return;
  }
  res.writeHead(404); res.end("nope");
});
function listen(s) {
  return new Promise((resolve) => s.listen(0, "127.0.0.1", () => resolve(s.address().port)));
}

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────
function inpageAuto(SITE) {
  return {
    automation: { id: "a-inpage", title: "Konto-Menü", site_domains: ["127.0.0.1"], params: [] },
    steps: [
      { id: "s1", position: 0, title: "Konto-Menü öffnen", action: "click", selector: { css: "#avatar", text: "☰ Konto" }, page_url: SITE + "/app" },
      { id: "s2", position: 1, title: "Abmelden", action: "click", selector: { css: "#logout", text: "Abmelden" }, page_url: SITE + "/app" },
    ],
    values: {},
  };
}
function dupTabThenInpageAuto(SITE) {
  return {
    automation: { id: "a-dup-inpage", title: "Zweite Kopie dann Konto-Menü", site_domains: ["127.0.0.1"], params: [] },
    steps: [
      { id: "d1", position: 0, title: "Zweite Kopie öffnen", action: "click", selector: { css: "#opendup", text: "2. Tab" }, page_url: SITE + "/app" },
      // Reiner In-Page-Klick — page_url ist DERSELBE Pfad /app wie die (avatar-lose) zweite Kopie.
      { id: "d2", position: 1, title: "Konto-Menü öffnen", action: "click", selector: { css: "#avatar", text: "☰ Konto" }, page_url: SITE + "/app" },
      { id: "d3", position: 2, title: "Abmelden", action: "click", selector: { css: "#logout", text: "Abmelden" }, page_url: SITE + "/app" },
    ],
    values: {},
  };
}
function popupThenInpageAuto(SITE) {
  return {
    automation: { id: "a-popup-inpage", title: "Login dann Konto-Menü", site_domains: ["127.0.0.1"], params: [] },
    steps: [
      { id: "b1", position: 0, title: "Login mit Google", action: "click", selector: { css: "#glogin", text: "Login mit Google" }, page_url: SITE + "/app" },
      { id: "b2", position: 1, title: "Konto wählen", action: "click", selector: { css: "#chooseAccount", text: "Richard Petrasch richard.petrasch@googlemail.com" }, page_url: SITE + "/oauth" },
      { id: "b3", position: 2, title: "Konto-Menü öffnen", action: "click", selector: { css: "#avatar2", text: "☰ Konto" }, page_url: SITE + "/app2" },
      { id: "b4", position: 3, title: "Abmelden", action: "click", selector: { css: "#logout2", text: "Abmelden" }, page_url: SITE + "/app2" },
    ],
    values: {},
  };
}

// ── Panel-Treiber (repliziert die lokale Glue aus startAutoRun; Server umgangen) ─────────────
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
const clicks = (from) => reqLog.slice(from).filter((r) => /-click$/.test(r.path)).map((r) => r.path + r.search);

let ext = null;
try {
  const PORT = await listen(server);
  const SITE = `http://127.0.0.1:${PORT}`;
  console.log(`  Testsite :${PORT}`);

  const userDataDir = path.join(PW_DIR, "pw-inpage-" + Date.now());
  mkdirSync(userDataDir, { recursive: true });
  ext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`, "--disable-popup-blocking"],
  });

  let sw = ext.serviceWorkers()[0];
  if (!sw) sw = await ext.waitForEvent("serviceworker", { timeout: 10000 }).catch(() => null);
  const extId = sw ? new URL(sw.url()).host : null;
  ok(!!extId, "Extension geladen (Service-Worker aktiv)");
  if (!extId) throw new Error("Extension-ID nicht ermittelbar");

  const sitePage = ext.pages()[0] || (await ext.newPage());
  await sitePage.goto(SITE + "/app?tag=A", { waitUntil: "load" });
  const panelPage = await ext.newPage();
  await panelPage.goto(`chrome-extension://${extId}/panel.html`, { waitUntil: "load" });

  const sane = await panelPage.evaluate(() => ({
    exec: typeof exec !== "undefined",
    run: typeof execExecuteCurrent === "function",
    sel: typeof execSelectTabForStep === "function",
    pick: typeof SteplyExecPlan !== "undefined" && typeof SteplyExecPlan.pickTabForStep === "function",
  }));
  ok(sane.exec && sane.run && sane.sel && sane.pick, "Panel: SHIPPED-Ausführ-Maschine erreichbar");

  const siteTabId = await panelPage.evaluate(async (site) => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((x) => x.url && x.url.indexOf(site + "/app") === 0);
    return t ? t.id : null;
  }, SITE);
  ok(siteTabId != null, "Site-Tab an den Lauf gebunden");

  // ════════ BEWEIS A: EINFACHER In-Page-Klick (ein Tab) ════════
  await sitePage.goto(SITE + "/app?tag=A", { waitUntil: "load" });
  const aFrom = reqLog.length;
  await startRunInPanel(panelPage, inpageAuto(SITE), "auto", siteTabId);
  const stA = await waitFor(panelPage, (s) => s.phase === "done" || s.phase === "miss" || s.phase === "aborted", 40000);
  const aClicks = clicks(aFrom);
  ok(aClicks.some((c) => c.indexOf("/avatar-click") === 0), "A: Avatar-Klick ausgeführt (Dropdown geöffnet)");
  ok(stA && stA.phase === "done",
    `A: Lauf schaltet nach dem In-Page-Klick weiter und läuft durch (phase=${stA && stA.phase}, index=${stA && stA.index}, reason=${stA && stA.reason})`);
  ok(aClicks.some((c) => c.indexOf("/logout-click") === 0), "A: Folge-Schritt im Dropdown ausgeführt");

  // ════════ BEWEIS B (REGRESSION): zweite gleich-URL-Kopie darf die Bindung NICHT stehlen ════════
  await sitePage.goto(SITE + "/app?tag=A", { waitUntil: "load" });
  const bFrom = reqLog.length;
  await startRunInPanel(panelPage, dupTabThenInpageAuto(SITE), "auto", siteTabId);
  const stB = await waitFor(panelPage, (s) => s.phase === "done" || s.phase === "miss" || s.phase === "aborted", 45000);
  const bClicks = clicks(bFrom);
  // Der In-Page-Klick MUSS auf dem gebundenen (sichtbaren) Tab A laufen — nicht auf der zweiten Kopie.
  ok(bClicks.some((c) => c === "/avatar-click?tag=A"),
    `B: In-Page-Klick lief auf dem GEBUNDENEN Tab (tag=A) — nicht auf der zweiten Kopie (clicks=${JSON.stringify(bClicks)})`);
  ok(stB && stB.phase === "done",
    `B: Lauf schaltet nach dem In-Page-Klick weiter statt zu hängen (phase=${stB && stB.phase}, index=${stB && stB.index}, reason=${stB && stB.reason})`);
  ok(bClicks.some((c) => c === "/logout-click?tag=A"), "B: Folge-Schritt im Dropdown des gebundenen Tabs ausgeführt");

  // ════════ BEWEIS C: echte Tab-Folge (Welle 43) bleibt intakt ════════
  await sitePage.goto(SITE + "/app?tag=A", { waitUntil: "load" });
  const cFrom = reqLog.length;
  await startRunInPanel(panelPage, popupThenInpageAuto(SITE), "auto", siteTabId);
  const stC = await waitFor(panelPage, (s) => s.phase === "done" || s.phase === "miss" || s.phase === "aborted", 70000);
  const cClicks = clicks(cFrom);
  ok(cClicks.some((c) => c === "/oauth-click"), "C: Popup-Konto gewählt");
  ok(cClicks.some((c) => c === "/avatar2-click"),
    "C: Lauf ist der echten Tab-Folge auf /app2 gefolgt und hat DORT den In-Page-Klick ausgeführt");
  ok(stC && stC.phase === "done",
    `C: echte Tab-Folge läuft durch (phase=${stC && stC.phase}, index=${stC && stC.index}, reason=${stC && stC.reason})`);
  ok(cClicks.some((c) => c === "/logout2-click"), "C: Folge-Schritt im Dropdown des gefolgten Tabs ausgeführt");

  await ext.close();
  ext = null;
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (ext) await ext.close().catch(() => {});
  server.close();
}

console.log(failed
  ? "\n✗ In-Page-Advance E2E FEHLGESCHLAGEN."
  : "\n✓ In-Page-Advance E2E grün: Lauf schaltet nach einem erfolgreichen In-Page-Klick sauber weiter — bleibt am gebundenen Tab (keine Umbindung an eine zweite gleich-URL-Kopie), echte Tab-Folgen (Welle 43) intakt.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);
