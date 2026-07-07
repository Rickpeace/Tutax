// Welle 47 — BEDINGTER SPRUNG / BLOCK-ÜBERSPRINGEN: ONESHOT-BEWEIS (Kern der Welle).
//
// Beweist im ECHTEN Browser (geladene Extension, panel.html als Tab) gegen EINE eigene
// node:http-Login-Testsite, dass ein Automations-Schritt mit `jump` einen ganzen (Login-)Block
// VORWÄRTS überspringt, wenn seine when-Bedingung greift — und zwar GANZ VOR der Navigation, sodass
// die Login-/Google-page_urls der übersprungenen Schritte NIE angefahren werden. Getrieben wird die
// AUSGELIEFERTE Ausführ-Maschine aus extension/panel.js (execExecuteCurrent / execTryJump /
// execJumpTo) + die pure extension/exec-plan.js (parseJump / jumpTargetIndex / shouldRunStep) + der
// content.js-Handler steply-eval-condition. Muster: scripts/test-conditional-e2e.mjs.
//
// SAME-URL-Login (KEIN Redirect, das ist der Unterschied zu Welle 40): Die Startseite „/" zeigt den
// „Anmelden"-Knopf NUR ausgeloggt (Cookie sess=1 steuert es). Der Sprung entscheidet am ELEMENT
// („Anmelden" da/weg), nicht an einer URL-Umleitung.
//
// Fixture-Automation (5 Schritte, page_urls absolut; Schritt 1 trägt den Sprung):
//   [1] „Anmelden öffnen" — Klick #anmelden (auf „/"); JUMP: when {element #anmelden, negate} →
//        to_position = letzter Schritt (5). „Anmelden NICHT da" (eingeloggt) → überspringe Login.
//   [2] „Benutzer" — fill #user (auf „/login").
//   [3] „Passwort" — fill #pass (auf „/login").
//   [4] „Absenden" — Klick #submit (auf „/login", POST → /app, setzt Session).
//   [5] „Zum Ziel" — Klick #fertig (auf „/app" → /done, „Ziel erreicht").
//
// BEWEISE:
//   (a) AUSGELOGGT („Anmelden" da): Sprung NICHT ausgelöst → Login-Schritte laufen (Server-Log
//       zeigt GET+POST /login), Ziel /done erreicht, KEINE Übersprungen-Notiz.
//   (b) EINGELOGGT („Anmelden" fehlt): Sprung ausgelöst → Login-Schritte (inkl. deren page_url-
//       Navigationen!) übersprungen, Server-Log zeigt KEINEN Aufruf von /login, Ziel direkt
//       erreicht, „↪ Login übersprungen"-Notiz sichtbar. (ECHTE Engine: Panel im Browser.)
//   (c) AUTONOMER Motor (extension/exec-run.js, dieselbe Sprung-Logik): mit Stub-deps — Sprung
//       fires/fires-nicht + Datei-Kohärenz (übersprungener Download, den ein späterer Upload
//       braucht, → ehrlicher Stopp). Zweite Engine ehrlich auf MOTOR-Ebene (nicht Browser-getrieben).
//
// Nutzung:  node scripts/test-jump-e2e.mjs
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
const SExecRun = require("../extension/exec-run.js");

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Login-Testsite (EIN Server, SAME-URL: „Anmelden" nur ausgeloggt via Cookie) ────────────────
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
    // KERN: „/" bleibt „/" (kein Redirect) — nur der Inhalt hängt am Login-Zustand.
    if (hasSession(req)) {
      html(res, "<h1>Konto</h1><p>Willkommen zurück.</p>"); // KEIN #anmelden
    } else {
      html(res, '<h1>Start</h1><a id="anmelden" href="/login">Anmelden</a>');
    }
    return;
  }
  if (u.pathname === "/login" && req.method === "GET") {
    if (hasSession(req)) { res.writeHead(302, { Location: "/app" }); res.end(); return; }
    html(res,
      "<h1>Anmeldung</h1>" +
      '<form id="loginForm" method="post" action="/login">' +
      '<input id="user" name="user" type="text" placeholder="Benutzer" />' +
      '<input id="pass" name="pass" type="password" placeholder="Passwort" />' +
      '<button id="submit" type="submit">Einloggen</button></form>');
    return;
  }
  if (u.pathname === "/login" && req.method === "POST") {
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(303, { "Set-Cookie": "sess=1; Path=/", Location: "/app" });
      res.end();
    });
    return;
  }
  if (u.pathname === "/app" && req.method === "GET") {
    if (!hasSession(req)) { res.writeHead(302, { Location: "/login" }); res.end(); return; }
    html(res, '<h1>App</h1><a id="fertig" href="/done">Fertig</a>');
    return;
  }
  if (u.pathname === "/done" && req.method === "GET") {
    html(res, "<h1>Ziel</h1><p>Fertig.</p>");
    return;
  }
  res.writeHead(404); res.end("nope");
});
function listen(s) {
  return new Promise((resolve) => s.listen(0, "127.0.0.1", () => resolve(s.address().port)));
}

// ── Fixture (Automation; Schritt 1 trägt den Block-Sprung über den Login) ──────────────────────
function jumpAuto(SITE) {
  const anmeldenSel = { css: "#anmelden", text: "Anmelden", role: "link" };
  return {
    automation: {
      id: "a-jump", title: "Login-Ablauf mit Sprung", site_domains: ["127.0.0.1"],
      params: [
        { key: "user", label: "Benutzer", type: "text", required: true },
        { key: "pass", label: "Passwort", type: "secret", required: true },
      ],
    },
    steps: [
      {
        id: "s1", position: 0, title: "Anmelden öffnen", action: "click",
        selector: anmeldenSel, page_url: SITE + "/",
        // BEDINGTER SPRUNG (Welle 47): „Anmelden" NICHT da (eingeloggt) → springe zum letzten
        // Schritt (position 4) und überspringe den ganzen Login-Block.
        jump: { when: { kind: "element", selector: anmeldenSel, negate: true }, to_position: 4 },
      },
      { id: "s2", position: 1, title: "Benutzer", action: "fill", selector: { css: "#user" }, page_url: SITE + "/login", param_key: "user" },
      { id: "s3", position: 2, title: "Passwort", action: "fill", selector: { css: "#pass" }, page_url: SITE + "/login", param_key: "pass" },
      { id: "s4", position: 3, title: "Absenden", action: "click", selector: { css: "#submit" }, page_url: SITE + "/login" },
      { id: "s5", position: 4, title: "Zum Ziel", action: "click", selector: { css: "#fertig" }, page_url: SITE + "/app" },
    ],
    values: { user: "richard", pass: "geheim" },
  };
}

// ── Panel-Treiber (repliziert die LOKALE Glue aus startAutoRun; Server umgangen) ──────────────
async function startRunInPanel(panelPage, fixture, mode, siteTabId) {
  await panelPage.evaluate(async (args) => {
    const { automation, steps, values, mode, siteTabId } = args;
    try { execLinkStop(); } catch (e) {}
    try { execRemoveDownloadWatch(); } catch (e) {}
    exec.running = false;
    exec.phase = "idle";
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
    exec.condSkip = null;
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
    total: exec.plan.length,
    missShown: els.autoMissBox ? !els.autoMissBox.hidden : false,
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
    await sleep(150);
  }
  return last;
}

let ext = null;
try {
  const PORT = await listen(server);
  const SITE = `http://127.0.0.1:${PORT}`;
  console.log(`  Login-Testsite :${PORT}`);

  const userDataDir = path.join(PW_DIR, "pw-jump-" + Date.now());
  mkdirSync(userDataDir, { recursive: true });
  ext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });

  let sw = ext.serviceWorkers()[0];
  if (!sw) sw = await ext.waitForEvent("serviceworker", { timeout: 10000 }).catch(() => null);
  const extId = sw ? new URL(sw.url()).host : null;
  ok(!!extId, "Extension geladen (Service-Worker aktiv)");
  if (!extId) throw new Error("Extension-ID nicht ermittelbar");

  const sitePage = ext.pages()[0] || (await ext.newPage());
  await sitePage.goto(SITE + "/", { waitUntil: "load" });
  const panelPage = await ext.newPage();
  await panelPage.goto(`chrome-extension://${extId}/panel.html`, { waitUntil: "load" });

  const sane = await panelPage.evaluate(() => ({
    exec: typeof exec !== "undefined",
    plan: typeof SteplyExecPlan !== "undefined" &&
      typeof SteplyExecPlan.jumpTargetIndex === "function" &&
      typeof SteplyExecPlan.parseJump === "function",
    run: typeof execExecuteCurrent === "function" && typeof execTryJump === "function",
    ens: typeof execEnsureStartTab === "function",
  }));
  ok(sane.exec && sane.plan && sane.run && sane.ens,
    "Panel: SHIPPED-Sprung-Maschine erreichbar (exec/SteplyExecPlan.jumpTargetIndex/execTryJump)");

  const siteTabId = await panelPage.evaluate(async (site) => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((x) => x.url && x.url.indexOf(site) === 0);
    return t ? t.id : null;
  }, SITE);
  ok(siteTabId != null, "Site-Tab an den Lauf gebunden (chrome.tabs)");

  // ════════ Beweis (a): AUSGELOGGT — „Anmelden" da → Sprung NICHT ausgelöst, Login läuft ════════
  await ext.clearCookies();
  await sitePage.goto(SITE + "/", { waitUntil: "load" });
  const logAFrom = reqLog.length;
  await startRunInPanel(panelPage, jumpAuto(SITE), "auto", siteTabId);
  const stA = await waitFor(panelPage, (s) => s.phase === "done" || s.phase === "miss" || s.phase === "aborted", 45000);
  const logA = reqLog.slice(logAFrom);
  const loginHitA = logA.some((r) => r.path === "/login");
  const postLoginA = logA.some((r) => r.method === "POST" && r.path === "/login");
  ok(stA && stA.phase === "done", `Beweis a: Lauf komplett durchgelaufen (phase=${stA && stA.phase})`);
  ok(loginHitA && postLoginA, "Beweis a: Login-Block LIEF — Server-Log zeigt GET+POST /login");
  ok(/\/done$/.test(sitePage.url()), `Beweis a: Ziel /done erreicht — war ${sitePage.url()}`);
  ok(stA && !stA.skipShown, "Beweis a: KEINE Übersprungen-Notiz (Sprung NICHT ausgelöst)");

  // ════════ Beweis (b): EINGELOGGT — „Anmelden" fehlt → Sprung überspringt den GANZEN Login ════════
  await ext.clearCookies();
  await ext.addCookies([{ name: "sess", value: "1", url: SITE }]);
  await sitePage.goto(SITE + "/", { waitUntil: "load" });
  const logBFrom = reqLog.length;
  await startRunInPanel(panelPage, jumpAuto(SITE), "auto", siteTabId);
  // „↪ Login übersprungen"-Notiz WÄHREND des Laufs einfangen (execRenderDone blendet sie am Ende aus).
  const stSkip = await waitFor(panelPage, (s) => s.skipShown || s.phase === "done" || s.phase === "miss", 45000);
  const stB = await waitFor(panelPage, (s) => s.phase === "done" || s.phase === "miss" || s.phase === "aborted", 45000);
  const logB = reqLog.slice(logBFrom);
  const loginHitB = logB.some((r) => r.path === "/login");
  ok(stB && stB.phase === "done", `Beweis b: Lauf trotz Sprung bis zum Ziel (phase=${stB && stB.phase})`);
  ok(!loginHitB, "Beweis b: Login-Block ÜBERSPRUNGEN — Server-Log zeigt KEINEN Aufruf von /login (auch keine Navigation dorthin)");
  ok(stSkip && stSkip.skipShown && /↪ Login übersprungen/.test(stSkip.skipText) && /Schritt 5/.test(stSkip.skipText),
    `Beweis b: „↪ Login übersprungen … Schritt 5" sichtbar — war „${stSkip && stSkip.skipText}"`);
  ok(/\/done$/.test(sitePage.url()), `Beweis b: Ziel /done direkt erreicht — war ${sitePage.url()}`);

  await panelPage.evaluate(() => { try { execAbort(); } catch (e) {} });
  await ext.close();
  ext = null;
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (ext) await ext.close().catch(() => {});
  server.close();
}

// ════════ Beweis (c): AUTONOMER Motor (exec-run.js) — dieselbe Sprung-Logik, Stub-deps ════════
// Ehrlich: der Panel-Motor ist oben ECHT im Browser bewiesen; der Runner-Motor wird hier auf
// MOTOR-Ebene bewiesen (createRunner mit injizierten deps — kein Browser). Beide teilen
// SteplyExecPlan.parseJump/jumpTargetIndex/shouldRunStep, sodass die Sprung-Entscheidung identisch ist.
{
  const anmeldenSel = { css: "#anmelden" };
  // Plan MIT expliziten Positionen (jumpTargetIndex sucht darüber). Schritt 0 trägt den Sprung.
  const mkPlan = () => [
    { index: 0, position: 0, total: 5, action: "click", selector: anmeldenSel, page_url: "http://s/",
      jump: { when: { kind: "element", selector: anmeldenSel, negate: true }, to_position: 4 } },
    { index: 1, position: 1, total: 5, action: "fill", selector: { css: "#u" }, page_url: "http://s/login" },
    { index: 2, position: 2, total: 5, action: "fill", selector: { css: "#p" }, page_url: "http://s/login" },
    { index: 3, position: 3, total: 5, action: "click", selector: { css: "#submit" }, page_url: "http://s/login" },
    { index: 4, position: 4, total: 5, action: "click", selector: { css: "#fertig" }, page_url: "http://s/app" },
  ];
  // Stub-deps: sendStep protokolliert die AUSGEFÜHRTEN Schritt-Indizes; evalCondition steuert, ob
  // „Anmelden" da ist (element-Bedingung des Sprungs).
  function makeDeps(anmeldenPresent, sent) {
    // curUrl simuliert die echte Navigation: navigateIfNeeded setzt sie auf die page_url des
    // Schritts (der Sprung wird DAVOR auf der jeweils AKTUELLEN Seite ausgewertet, wie im Panel).
    let curUrl = "http://s/";
    return {
      getTabUrl: async () => curUrl,
      navigateIfNeeded: async (t, s) => { if (s && s.page_url) curUrl = s.page_url; },
      sendStep: async (t, s) => { sent.push(s.index); return { ok: true }; },
      probePassword: async () => false,
      evalCondition: async (t, cond) => (cond && cond.kind === "element" ? anmeldenPresent : false),
      verifySubmit: async () => "ok",
      hide: () => {},
    };
  }

  // (c1) Ausgeloggt (Anmelden da) → Sprung NICHT ausgelöst → alle Schritte 0..4 ausgeführt.
  const sent1 = [];
  const run1 = SExecRun.createRunner({ automation: { id: "a", params: [] }, plan: mkPlan(), tabId: 1, execPlan: SExecPlan, gapMs: 0, deps: makeDeps(true, sent1) });
  const res1 = await run1.run();
  ok(res1.status === "success" && sent1.join(",") === "0,1,2,3,4",
    `Beweis c1 (autonom): Anmelden da → kein Sprung, Schritte 0..4 ausgeführt (war [${sent1.join(",")}], ${res1.status})`);

  // (c2) Eingeloggt (Anmelden weg) → Sprung ausgelöst → Login-Block (0..3) übersprungen, nur 4.
  const sent2 = [];
  const run2 = SExecRun.createRunner({ automation: { id: "a", params: [] }, plan: mkPlan(), tabId: 1, execPlan: SExecPlan, gapMs: 0, deps: makeDeps(false, sent2) });
  const res2 = await run2.run();
  ok(res2.status === "success" && sent2.join(",") === "4",
    `Beweis c2 (autonom): Anmelden weg → Sprung, Login-Block übersprungen, nur Schritt 4 (war [${sent2.join(",")}], ${res2.status})`);

  // (c3) Datei-Kohärenz: übersprungener DOWNLOAD (im Block), dessen Datei ein späterer, NICHT
  //      übersprungener Upload braucht → ehrlicher Stopp statt stummem Überspringen.
  const dlSel = { css: "#a" };
  const dlPlan = [
    { index: 0, position: 0, action: "click", selector: dlSel, page_url: "http://s/",
      jump: { when: { kind: "element", selector: dlSel, negate: true }, to_position: 1 },
      file_meta: { role: "download", key: "file1" } },
    { index: 1, position: 1, action: "upload", selector: { css: "#up" }, page_url: "http://s/app", file_meta: { role: "upload", source: "file1" } },
    { index: 2, position: 2, action: "click", selector: { css: "#buy" }, page_url: "http://s/app" },
  ];
  const sent3 = [];
  const run3 = SExecRun.createRunner({ automation: { id: "a", params: [] }, plan: dlPlan, tabId: 1, execPlan: SExecPlan, gapMs: 0, deps: makeDeps(false, sent3) });
  const res3 = await run3.run();
  ok(res3.status === "failed" && res3.detail === "sprung-datei",
    `Beweis c3 (autonom): übersprungener Download später gebraucht → ehrlicher Stopp (war ${res3.status}/${res3.detail})`);
  ok(sent3.length === 0, "Beweis c3: kein Schritt ausgeführt vor dem ehrlichen Stopp");
}

console.log(failed
  ? "\n✗ Bedingter-Sprung E2E FEHLGESCHLAGEN."
  : "\n✓ Bedingter-Sprung E2E grün: ausgeloggt → Login läuft (GET+POST /login), eingeloggt → Login-Block übersprungen (KEIN /login-Aufruf, Login-übersprungen-Notiz, Ziel direkt), autonomer Motor springt/springt-nicht + Datei-Kohärenz.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);
