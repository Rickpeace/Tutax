// Welle 40 — ZUSTANDS-INTELLIGENZ: ONESHOT-BEWEIS (Kern der Welle).
//
// Beweist im ECHTEN Browser (geladene Extension, panel.html als Tab) gegen EINE eigene
// node:http-Login-Testsite mit echtem Session-Verhalten, dass Läufe mit dem Anmelde-Zustand
// klarkommen. Getrieben wird die AUSGELIEFERTE Ausführ-Maschine aus extension/panel.js
// (execEnsureStartTab / execExecuteCurrent / execNavigateIfNeeded / execApplyState /
// execEvaluateState / execHandleUnexpectedNav) + die pure extension/exec-plan.js (resyncTarget /
// looksLikeLoginUrl / skipCrossesNeededDownload). Muster: scripts/test-file-bridge-e2e.mjs.
//
// Der Test replicated NUR die lokale Setup-Glue aus startAutoRun (der Server-Fetch wird
// umgangen — es gibt keinen Steply-Server); alles Zustandsrelevante ist SHIPPED-Code im Panel.
//
// BEWEISE (asserts auf Lauf-Zustand exec.* + Site-Server-Log):
//   1) Ausgeloggt, regulär : Lauf führt Schritte 1–6 aus, Session entsteht via Submit (Schritt 4)
//      → Ziel /app/done erreicht (Regression: nichts kaputt; Server-Log zeigt POST /login).
//   2) Schon eingeloggt    : page_url von Schritt 2 (/login) leitet zu /app um → VORSPULEN auf
//      Schritt 5 mit „Angemeldet? → Ja"-Meldung; Schritte 2–4 NIE ausgeführt (kein POST /login).
//   3) Anmelde-Wache       : Ablauf OHNE Login-Schritte, ausgeloggt → landet auf /login → Phase
//      waiting-login mit Meldung; Test loggt sich MANUELL ein → Lauf setzt automatisch fort → Ziel.
//   4) Unerwartete Seite   : Navigation auf eine Seite (kein Schritt, kein Login) → Pause
//      „unexpected-page".
//   5) Datei-Kohärenz (pur): resync würde einen gebrauchten Download überspringen → Pause-Logik.
//
// Nutzung:  node scripts/test-state-intelligence-e2e.mjs
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
const SExecPlan = require("../extension/exec-plan.js");

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Login-Testsite (EIN Server, echtes Session-Verhalten) ────────────────────────────────────
// Cookie „sess=1" = angemeldet. /login (POST) setzt ihn (303 → /app). /app ohne Cookie → 302
// /login, mit Cookie → Dashboard. /gone → 302 /elsewhere (für den „unexpected-page"-Beweis).
const reqLog = []; // { method, path } — Grundlage der Server-Log-Asserts
function hasSession(req) {
  return String(req.headers.cookie || "").includes("sess=1");
}
function html(res, body, extraHeaders) {
  res.writeHead(200, Object.assign({ "Content-Type": "text/html; charset=utf-8" }, extraHeaders || {}));
  res.end("<!doctype html><meta charset=\"utf-8\">" + body);
}
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  reqLog.push({ method: req.method, path: u.pathname });
  if (u.pathname === "/" && req.method === "GET") {
    html(res, '<h1>Basis</h1><a id="loginLink" href="/login">Anmelden</a>');
    return;
  }
  if (u.pathname === "/login" && req.method === "GET") {
    if (hasSession(req)) { res.writeHead(302, { Location: "/app" }); res.end(); return; }
    html(res,
      '<h1>Anmeldung</h1>' +
      '<form id="loginForm" method="post" action="/login">' +
      '<input id="user" name="user" type="text" placeholder="Benutzer" />' +
      '<input id="pass" name="pass" type="password" placeholder="Passwort" />' +
      '<button id="submit" type="submit">Anmelden</button></form>');
    return;
  }
  if (u.pathname === "/login" && req.method === "POST") {
    // Body verwerfen (Inhalt egal — jede „Anmeldung" gilt), Session setzen, 303 → /app.
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(303, { "Set-Cookie": "sess=1; Path=/", Location: "/app" });
      res.end();
    });
    return;
  }
  if (u.pathname === "/app" && req.method === "GET") {
    if (!hasSession(req)) { res.writeHead(302, { Location: "/login" }); res.end(); return; }
    html(res, '<h1>Dashboard</h1><a id="appBtn" href="/app/done">Weiter zum Ziel</a>');
    return;
  }
  if (u.pathname === "/app/done" && req.method === "GET") {
    html(res, '<h1>Ziel</h1><button id="doneTarget" type="button">Fertig</button>');
    return;
  }
  if (u.pathname === "/gone" && req.method === "GET") {
    res.writeHead(302, { Location: "/elsewhere" }); res.end(); return;
  }
  if (u.pathname === "/elsewhere" && req.method === "GET") {
    html(res, '<h1>Ganz woanders</h1><button id="x" type="button">Nichts</button>');
    return;
  }
  res.writeHead(404); res.end("nope");
});
function listen(s) {
  return new Promise((resolve) => s.listen(0, "127.0.0.1", () => resolve(s.address().port)));
}

// ── Fixtures (Automationen; page_urls absolut auf SITE) ──────────────────────────────────────
function fullAuto(SITE) {
  return {
    automation: {
      id: "a-full", title: "Login-Ablauf", site_domains: ["127.0.0.1"],
      params: [
        { key: "user", label: "Benutzer", type: "text", required: true },
        { key: "pass", label: "Passwort", type: "secret", required: true },
      ],
    },
    steps: [
      { id: "s1", position: 0, title: "Anmelden öffnen", action: "click", selector: { css: "#loginLink" }, page_url: SITE + "/" },
      { id: "s2", position: 1, title: "Benutzer", action: "fill", selector: { css: "#user" }, page_url: SITE + "/login", param_key: "user" },
      { id: "s3", position: 2, title: "Passwort", action: "fill", selector: { css: "#pass" }, page_url: SITE + "/login", param_key: "pass" },
      { id: "s4", position: 3, title: "Absenden", action: "click", selector: { css: "#submit" }, page_url: SITE + "/login" },
      { id: "s5", position: 4, title: "Zum Ziel", action: "click", selector: { css: "#appBtn" }, page_url: SITE + "/app" },
      { id: "s6", position: 5, title: "Fertig klicken", action: "click", selector: { css: "#doneTarget" }, page_url: SITE + "/app/done" },
    ],
    values: { user: "richard", pass: "geheim" },
  };
}
function noLoginAuto(SITE) {
  return {
    automation: { id: "a-nologin", title: "Direkt ins Ziel", site_domains: ["127.0.0.1"], params: [] },
    steps: [
      { id: "n1", position: 0, title: "Zum Ziel", action: "click", selector: { css: "#appBtn" }, page_url: SITE + "/app" },
      { id: "n2", position: 1, title: "Fertig klicken", action: "click", selector: { css: "#doneTarget" }, page_url: SITE + "/app/done" },
    ],
    values: {},
  };
}
function goneAuto(SITE) {
  return {
    automation: { id: "a-gone", title: "Weg", site_domains: ["127.0.0.1"], params: [] },
    steps: [
      { id: "g1", position: 0, title: "Irgendwas", action: "click", selector: { css: "#x" }, page_url: SITE + "/gone" },
    ],
    values: {},
  };
}

// ── Panel-Treiber: Lauf starten (repliziert die LOKALE Glue aus startAutoRun; Server umgangen) ─
async function startRunInPanel(panelPage, fixture, mode, siteTabId) {
  await panelPage.evaluate(async (args) => {
    const { automation, steps, values, mode, siteTabId } = args;
    // sauberer Reset eines evtl. vorherigen Laufs
    try { execLinkStop(); } catch (e) {}
    try { execRemoveDownloadWatch(); } catch (e) {}
    exec.running = false;
    exec.phase = "idle";
    // Setup (wie startAutoRun, ohne Server-Fetch)
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
    exec.finished = false;
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
    // running erst NACH execEnsureStartTab true setzen (wie startAutoRun) — so kapert der
    // unerwartete-Navigation-Wächter die Start-Navigation nicht.
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

// Aktuellen Lauf-Zustand aus dem Panel lesen (für die Asserts).
function readState(panelPage) {
  return panelPage.evaluate(() => ({
    phase: exec.phase,
    index: exec.index,
    running: exec.running,
    reason: exec.lastMissReason,
    total: exec.plan.length,
    missText: els.autoMissText ? els.autoMissText.textContent : "",
    missShown: els.autoMissBox ? !els.autoMissBox.hidden : false,
    waitText: els.autoWaitLogin ? els.autoWaitLogin.textContent : "",
    waitShown: els.autoWaitLogin ? !els.autoWaitLogin.hidden : false,
    skipText: els.autoSkipNote ? els.autoSkipNote.textContent : "",
    skipShown: els.autoSkipNote ? !els.autoSkipNote.hidden : false,
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
  return last; // letzter bekannter Zustand (Assert schlägt dann fehl)
}

let ext = null;
try {
  const PORT = await listen(server);
  const SITE = `http://127.0.0.1:${PORT}`;
  console.log(`  Login-Testsite :${PORT}`);

  const userDataDir = path.join(PW_DIR, "pw-state-" + Date.now());
  mkdirSync(userDataDir, { recursive: true });
  ext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });

  // Extension-ID über den Service-Worker.
  let sw = ext.serviceWorkers()[0];
  if (!sw) sw = await ext.waitForEvent("serviceworker", { timeout: 10000 }).catch(() => null);
  const extId = sw ? new URL(sw.url()).host : null;
  ok(!!extId, "Extension geladen (Service-Worker aktiv)");
  if (!extId) throw new Error("Extension-ID nicht ermittelbar");

  // Gebundener „Site-Tab" (Seite 0 der persistenten Session) + Panel-Tab.
  const sitePage = ext.pages()[0] || (await ext.newPage());
  await sitePage.goto(SITE + "/", { waitUntil: "load" });
  const panelPage = await ext.newPage();
  await panelPage.goto(`chrome-extension://${extId}/panel.html`, { waitUntil: "load" });

  // Sanity: die SHIPPED-Ausführ-Maschine ist im Panel erreichbar (globaler Namensraum).
  const sane = await panelPage.evaluate(() => ({
    exec: typeof exec !== "undefined",
    plan: typeof SteplyExecPlan !== "undefined" && typeof SteplyExecPlan.resyncTarget === "function",
    run: typeof execExecuteCurrent === "function" && typeof execApplyState === "function",
    ens: typeof execEnsureStartTab === "function",
  }));
  ok(sane.exec && sane.plan && sane.run && sane.ens,
    "Panel: SHIPPED-Zustands-Maschine erreichbar (exec/SteplyExecPlan/execExecuteCurrent/execApplyState)");

  // Site-Tab-ID aus dem Panel-Kontext (chrome.tabs) ermitteln.
  const siteTabId = await panelPage.evaluate(async (site) => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((x) => x.url && x.url.indexOf(site) === 0);
    return t ? t.id : null;
  }, SITE);
  ok(siteTabId != null, "Site-Tab an den Lauf gebunden (chrome.tabs)");

  // ════════ Beweis 1: Ausgeloggt, regulär — Lauf 1–6, Session via Submit, Ziel erreicht ════════
  await ext.clearCookies();
  await sitePage.goto(SITE + "/", { waitUntil: "load" });
  const log1From = reqLog.length;
  await startRunInPanel(panelPage, fullAuto(SITE), "auto", siteTabId);
  const st1 = await waitFor(panelPage, (s) => s.phase === "done" || s.phase === "miss" || s.phase === "aborted", 45000);
  const log1 = reqLog.slice(log1From);
  const postLogin1 = log1.some((r) => r.method === "POST" && r.path === "/login");
  const siteUrl1 = sitePage.url();
  ok(st1 && st1.phase === "done", `Beweis 1: Lauf komplett durchgelaufen (phase=${st1 && st1.phase})`);
  ok(postLogin1, "Beweis 1: Session entstand via Submit — Server-Log zeigt POST /login");
  ok(/\/app\/done$/.test(siteUrl1), `Beweis 1: Ziel /app/done erreicht — war ${siteUrl1}`);
  ok(st1 && !st1.skipShown, "Beweis 1: KEIN Vorspulen (nichts übersprungen) — Regression sauber");

  // ════════ Beweis 2: Schon eingeloggt — /login → /app, Vorspulen auf Schritt 5, kein POST ════════
  await ext.clearCookies();
  await ext.addCookies([{ name: "sess", value: "1", url: SITE }]);
  await sitePage.goto(SITE + "/", { waitUntil: "load" });
  const log2From = reqLog.length;
  await startRunInPanel(panelPage, fullAuto(SITE), "auto", siteTabId);
  // Vorspul-Notiz WÄHREND des Laufs einfangen (execRenderDone blendet sie am Ende wieder aus).
  const stSkip = await waitFor(panelPage, (s) => s.skipShown || s.phase === "done" || s.phase === "miss", 45000);
  const st2 = await waitFor(panelPage, (s) => s.phase === "done" || s.phase === "miss" || s.phase === "aborted", 45000);
  const log2 = reqLog.slice(log2From);
  const postLogin2 = log2.some((r) => r.method === "POST" && r.path === "/login");
  ok(st2 && st2.phase === "done", `Beweis 2: Lauf trotz Vorspulen bis zum Ziel (phase=${st2 && st2.phase})`);
  ok(stSkip && stSkip.skipShown && /Angemeldet\? → Ja/.test(stSkip.skipText) && /2.?4/.test(stSkip.skipText),
    `Beweis 2: Vorspul-Meldung „Angemeldet? → Ja" (Schritte 2–4) sichtbar — war „${stSkip && stSkip.skipText}"`);
  ok(!postLogin2, "Beweis 2: Schritte 2–4 NIE ausgeführt — Server-Log zeigt KEIN POST /login");
  ok(/\/app\/done$/.test(sitePage.url()), `Beweis 2: Ziel /app/done erreicht — war ${sitePage.url()}`);

  // ════════ Beweis 3: Anmelde-Wache — ausgeloggt, Ablauf ohne Login-Schritte → warten → Ziel ════════
  await ext.clearCookies();
  await sitePage.goto(SITE + "/", { waitUntil: "load" });
  const log3From = reqLog.length;
  await startRunInPanel(panelPage, noLoginAuto(SITE), "auto", siteTabId);
  const stWait = await waitFor(panelPage, (s) => s.phase === "waiting-login" || s.phase === "miss" || s.phase === "done", 30000);
  ok(stWait && stWait.phase === "waiting-login", `Beweis 3: Phase waiting-login erreicht (war ${stWait && stWait.phase})`);
  ok(stWait && stWait.waitShown && /Bitte kurz anmelden/.test(stWait.waitText),
    `Beweis 3: Anmelde-Wache-Meldung sichtbar — war „${stWait && stWait.waitText}"`);
  // Menschliche Anmeldung simulieren: das Formular im Site-Tab von Hand ausfüllen + absenden.
  await sitePage.waitForSelector("#pass", { timeout: 8000 });
  await sitePage.fill("#user", "mensch");
  await sitePage.fill("#pass", "handtippt");
  await sitePage.click("#submit");
  const st3 = await waitFor(panelPage, (s) => s.phase === "done" || s.phase === "miss" || s.phase === "aborted", 30000);
  const log3 = reqLog.slice(log3From);
  ok(st3 && st3.phase === "done", `Beweis 3: nach manueller Anmeldung automatisch fortgesetzt → Ziel (phase=${st3 && st3.phase})`);
  ok(log3.some((r) => r.method === "POST" && r.path === "/login"), "Beweis 3: manuelle Anmeldung im Server-Log (POST /login)");
  ok(/\/app\/done$/.test(sitePage.url()), `Beweis 3: Ziel /app/done erreicht — war ${sitePage.url()}`);

  // ════════ Beweis 4: Unerwartete Seite — Navigation passt zu nichts, kein Login → Pause ════════
  await ext.clearCookies();
  await sitePage.goto(SITE + "/", { waitUntil: "load" });
  await startRunInPanel(panelPage, goneAuto(SITE), "auto", siteTabId);
  const st4 = await waitFor(panelPage, (s) => s.phase === "miss" || s.phase === "done" || s.phase === "aborted", 30000);
  ok(st4 && st4.phase === "miss" && st4.reason === "unexpected-page",
    `Beweis 4: Pause mit Grund „unexpected-page" (phase=${st4 && st4.phase}, reason=${st4 && st4.reason})`);
  ok(st4 && st4.missShown && /Unerwartete Seite/.test(st4.missText),
    `Beweis 4: ehrliche Miss-Meldung — war „${st4 && st4.missText}"`);
  // Lauf sauber beenden.
  await panelPage.evaluate(() => { try { execAbort(); } catch (e) {} });

  // ════════ Beweis 5: Datei-Kohärenz (pur) — Vorspulen überspränge einen gebrauchten Download ════════
  const dl = (key) => ({ file_meta: { role: "download", key } });
  const up = (source) => ({ file_meta: { role: "upload", source } });
  const filePlan = [{}, dl("file1"), {}, up("file1"), {}];
  ok(SExecPlan.skipCrossesNeededDownload(filePlan, 1, 3) === true,
    "Beweis 5: resync über einen gebrauchten Download → Pause-Entscheidung (skipCrossesNeededDownload)");
  ok(SExecPlan.skipCrossesNeededDownload(filePlan, 1, 4) === false,
    "Beweis 5: Download UND Upload übersprungen → kein Konflikt");

  await ext.close();
  ext = null;
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (ext) await ext.close().catch(() => {});
  server.close();
}

console.log(failed
  ? "\n✗ Zustands-Intelligenz E2E FEHLGESCHLAGEN."
  : "\n✓ Zustands-Intelligenz E2E grün: reguläre Anmeldung (POST /login), Vorspulen bei bereits-angemeldet (kein POST), Anmelde-Wache mit Auto-Fortsetzen, unexpected-page-Pause + Datei-Kohärenz.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);
