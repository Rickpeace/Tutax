// Welle 42 — BEDINGTE SCHRITTE: ONESHOT-BEWEIS (Kern der Welle).
//
// Beweist im ECHTEN Browser (geladene Extension, panel.html als Tab) gegen EINE eigene
// node:http-Zielsite, dass ein Automations-Schritt mit maschinenlesbarer Bedingung nur läuft,
// wenn die Bedingung erfüllt ist — sonst NAHTLOS übersprungen wird (keine Pause). Getrieben wird
// die AUSGELIEFERTE Ausführ-Maschine aus extension/panel.js (execExecuteCurrent / execApplyState /
// execStepConditionMet / execEvalElementCondition / execSkipConditional) + die reine
// extension/exec-plan.js (evalUrlCondition / shouldRunStep) + der content.js-Handler
// steply-eval-condition. Muster: scripts/test-state-intelligence-e2e.mjs.
//
// Zielsite (EIN Server, echtes Cookie-Banner-Verhalten):
//   • /shop-banner : Shop MIT Cookie-Banner (Knopf #accept „Alle akzeptieren", onclick-Beacon
//     GET /accept-click) + immer #enter (Landen) + #buy (→ /done, „Ziel erreicht").
//   • /shop-plain  : Shop OHNE Banner (#accept fehlt) + #enter + #buy.
//   • /done        : Ziel.
//
// Fixture-Automation (3 Schritte, page_urls absolut):
//   [1] „Landen" — Klick #enter (immer da; trägt die Navigation zur Shop-Seite).
//   [2] „Banner akzeptieren" — Klick #accept, condition {kind:element, selector:#accept}.
//   [3] „Kaufen" — Klick #buy (→ /done).
//
// BEWEISE (asserts auf Lauf-Zustand exec.* + Server-Log):
//   1) Banner DA (/shop-banner): Schritt 2 wird AUSGEFÜHRT (Server-Log GET /accept-click),
//      Ziel /done erreicht, phase=done, KEINE Übersprungen-Notiz.
//   2) Banner WEG (/shop-plain): Schritt 2 SAUBER übersprungen (KEIN /accept-click, KEIN Miss),
//      Übersprungen-Notiz „Schritt 2 übersprungen", Schritt 3 direkt, Ziel /done erreicht.
//   3) URL-Bedingung (pur, im Panel-Kontext): evalUrlCondition/shouldRunStep über die echte
//      shipped exec-plan.js (Host/Pfad + negate).
//   4) AUTONOMER Motor (extension/exec-run.js, dieselbe Bedingungslogik wie das Panel): mit
//      Stub-deps beweisen, dass er den bedingten Schritt bei elementFound=false ÜBERSPRINGT und
//      bei true AUSFÜHRT — inkl. Datei-Kohärenz (übersprungener Download, den ein Upload braucht,
//      → ehrlicher Stopp). Der Panel-Motor ist oben ECHT im Browser bewiesen; dieser Motor per
//      Motor-Level-Test (ehrlich benannt: zweite Engine über createRunner, nicht Browser-getrieben).
//
// Nutzung:  node scripts/test-conditional-e2e.mjs
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

// ── Zielsite (EIN Server, Cookie-Banner-Verhalten) ────────────────────────────────────────────
const reqLog = []; // { method, path } — Grundlage der Server-Log-Asserts
function html(res, body) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<!doctype html><meta charset=\"utf-8\">" + body);
}
// Shop-Seite: withBanner steuert, ob der Cookie-Banner-Knopf (#accept) im DOM ist.
function shopHtml(withBanner) {
  const banner = withBanner
    ? '<div id="cookie" style="border:1px solid #ccc;padding:8px">' +
      '<button id="accept" type="button" onclick="new Image().src=\'/accept-click\'">Alle akzeptieren</button>' +
      "</div>"
    : "";
  return (
    "<h1>Shop</h1>" +
    '<button id="enter" type="button">Eingang</button>' +
    banner +
    '<a id="buy" href="/done">Kaufen</a>'
  );
}
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  reqLog.push({ method: req.method, path: u.pathname });
  if (u.pathname === "/" && req.method === "GET") {
    html(res, '<h1>Start</h1><a id="go" href="/shop-banner">Zum Shop</a>');
    return;
  }
  if (u.pathname === "/shop-banner" && req.method === "GET") { html(res, shopHtml(true)); return; }
  if (u.pathname === "/shop-plain" && req.method === "GET") { html(res, shopHtml(false)); return; }
  if (u.pathname === "/accept-click" && req.method === "GET") {
    // Beacon vom Banner-Klick — 1×1 GIF, damit new Image() zufrieden ist.
    res.writeHead(200, { "Content-Type": "image/gif" });
    res.end(Buffer.from("GIF89a", "ascii"));
    return;
  }
  if (u.pathname === "/done" && req.method === "GET") {
    html(res, '<h1>Ziel</h1><button id="doneTarget" type="button">Fertig</button>');
    return;
  }
  res.writeHead(404); res.end("nope");
});
function listen(s) {
  return new Promise((resolve) => s.listen(0, "127.0.0.1", () => resolve(s.address().port)));
}

// ── Fixture (Automation; withBanner wählt die Shop-Seite) ─────────────────────────────────────
function bannerAuto(SITE, withBanner) {
  const shop = SITE + (withBanner ? "/shop-banner" : "/shop-plain");
  const acceptSel = { css: "#accept", text: "Alle akzeptieren", role: "button" };
  return {
    automation: { id: "a-cond", title: "Cookie-Banner-Ablauf", site_domains: ["127.0.0.1"], params: [] },
    steps: [
      { id: "c1", position: 0, title: "Landen", action: "click", selector: { css: "#enter" }, page_url: shop },
      {
        id: "c2", position: 1, title: "Banner akzeptieren", action: "click",
        selector: acceptSel, page_url: shop,
        // Bedingung: nur klicken, wenn der Banner-Knopf da ist (Welle 42).
        condition: { kind: "element", selector: acceptSel },
      },
      { id: "c3", position: 2, title: "Kaufen", action: "click", selector: { css: "#buy" }, page_url: shop },
    ],
    values: {},
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
    condSkipText: els.autoCondSkipNote ? els.autoCondSkipNote.textContent : "",
    condSkipShown: els.autoCondSkipNote ? !els.autoCondSkipNote.hidden : false,
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
  console.log(`  Zielsite :${PORT}`);

  const userDataDir = path.join(PW_DIR, "pw-cond-" + Date.now());
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
    plan: typeof SteplyExecPlan !== "undefined" && typeof SteplyExecPlan.shouldRunStep === "function",
    run: typeof execExecuteCurrent === "function" && typeof execStepConditionMet === "function",
    ens: typeof execEnsureStartTab === "function",
  }));
  ok(sane.exec && sane.plan && sane.run && sane.ens,
    "Panel: SHIPPED-Bedingungs-Maschine erreichbar (exec/SteplyExecPlan.shouldRunStep/execStepConditionMet)");

  const siteTabId = await panelPage.evaluate(async (site) => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((x) => x.url && x.url.indexOf(site) === 0);
    return t ? t.id : null;
  }, SITE);
  ok(siteTabId != null, "Site-Tab an den Lauf gebunden (chrome.tabs)");

  // ════════ Beweis 1: Banner DA — Schritt 2 wird ausgeführt (Server-Log), Ziel erreicht ════════
  await sitePage.goto(SITE + "/", { waitUntil: "load" });
  const log1From = reqLog.length;
  await startRunInPanel(panelPage, bannerAuto(SITE, true), "auto", siteTabId);
  const st1 = await waitFor(panelPage, (s) => s.phase === "done" || s.phase === "miss" || s.phase === "aborted", 45000);
  const log1 = reqLog.slice(log1From);
  const accepted1 = log1.some((r) => r.method === "GET" && r.path === "/accept-click");
  ok(st1 && st1.phase === "done", `Beweis 1: Lauf komplett durchgelaufen (phase=${st1 && st1.phase})`);
  ok(accepted1, "Beweis 1: Schritt 2 AUSGEFÜHRT — Server-Log zeigt Banner-Klick (GET /accept-click)");
  ok(/\/done$/.test(sitePage.url()), `Beweis 1: Ziel /done erreicht — war ${sitePage.url()}`);
  ok(st1 && !st1.condSkipShown, "Beweis 1: KEINE Übersprungen-Notiz (Bedingung war erfüllt)");
  ok(st1 && !st1.missShown, "Beweis 1: KEIN Miss (sauber durchgelaufen)");

  // ════════ Beweis 2: Banner WEG — Schritt 2 sauber übersprungen, kein Klick, Ziel erreicht ════
  await sitePage.goto(SITE + "/", { waitUntil: "load" });
  const log2From = reqLog.length;
  await startRunInPanel(panelPage, bannerAuto(SITE, false), "auto", siteTabId);
  // Übersprungen-Notiz WÄHREND des Laufs einfangen (execRenderDone blendet sie am Ende aus).
  const stSkip = await waitFor(panelPage, (s) => s.condSkipShown || s.phase === "done" || s.phase === "miss", 45000);
  const st2 = await waitFor(panelPage, (s) => s.phase === "done" || s.phase === "miss" || s.phase === "aborted", 45000);
  const log2 = reqLog.slice(log2From);
  const accepted2 = log2.some((r) => r.method === "GET" && r.path === "/accept-click");
  ok(st2 && st2.phase === "done", `Beweis 2: Lauf trotz Überspringen bis zum Ziel (phase=${st2 && st2.phase})`);
  ok(!accepted2, "Beweis 2: Schritt 2 NICHT ausgeführt — KEIN Banner-Klick im Server-Log (kein /accept-click)");
  ok(stSkip && stSkip.condSkipShown && /Schritt 2 übersprungen/.test(stSkip.condSkipText),
    `Beweis 2: Übersprungen-Notiz „Schritt 2 übersprungen" sichtbar — war „${stSkip && stSkip.condSkipText}"`);
  ok(st2 && !st2.missShown, "Beweis 2: KEIN Miss — sauberes Überspringen (keine Pause)");
  ok(/\/done$/.test(sitePage.url()), `Beweis 2: Ziel /done erreicht (Schritt 3 direkt) — war ${sitePage.url()}`);

  // ════════ Beweis 3: URL-Bedingung (pur, echte shipped exec-plan.js im Panel) ════════
  const urlProof = await panelPage.evaluate((site) => {
    const P = SteplyExecPlan;
    const cond = { kind: "url", pattern: "/shop-plain" };
    const negCond = { kind: "url", pattern: "/shop-plain", negate: true };
    return {
      matchRun: P.shouldRunStep(cond, { urlMatch: P.evalUrlCondition(site + "/shop-plain?x=1", cond) }),
      noMatchSkip: P.shouldRunStep(cond, { urlMatch: P.evalUrlCondition(site + "/shop-banner", cond) }),
      negMatchSkip: P.shouldRunStep(negCond, { urlMatch: P.evalUrlCondition(site + "/shop-plain", negCond) }),
      negNoMatchRun: P.shouldRunStep(negCond, { urlMatch: P.evalUrlCondition(site + "/other", negCond) }),
    };
  }, SITE);
  ok(urlProof.matchRun === true, "Beweis 3: URL passt → ausführen (evalUrlCondition+shouldRunStep, shipped)");
  ok(urlProof.noMatchSkip === false, "Beweis 3: URL passt nicht → überspringen");
  ok(urlProof.negMatchSkip === false, "Beweis 3: negate + URL passt → überspringen");
  ok(urlProof.negNoMatchRun === true, "Beweis 3: negate + URL passt nicht → ausführen");

  await panelPage.evaluate(() => { try { execAbort(); } catch (e) {} });
  await ext.close();
  ext = null;
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (ext) await ext.close().catch(() => {});
  server.close();
}

// ════════ Beweis 4: AUTONOMER Motor (exec-run.js) — dieselbe Bedingungslogik, Stub-deps ════════
// Ehrlich: der Panel-Motor ist oben ECHT im Browser bewiesen; der Runner-Motor wird hier auf
// MOTOR-Ebene bewiesen (createRunner mit injizierten deps — kein Browser). Beide teilen
// SteplyExecPlan.shouldRunStep/evalUrlCondition, sodass die Bedingungs-Entscheidung identisch ist.
{
  const acceptSel = { css: "#accept" };
  const mkPlan = () => [
    { index: 0, total: 3, action: "click", selector: { css: "#enter" }, page_url: "http://s/shop" },
    { index: 1, total: 3, action: "click", selector: acceptSel, page_url: "http://s/shop", condition: { kind: "element", selector: acceptSel } },
    { index: 2, total: 3, action: "click", selector: { css: "#buy" }, page_url: "http://s/shop" },
  ];
  // Stub-deps: sendStep protokolliert die AUSGEFÜHRTEN Schritt-Indizes; evalCondition steuerbar.
  function makeDeps(bannerPresent, sent) {
    return {
      getTabUrl: async () => "http://s/shop",
      navigateIfNeeded: async () => {},
      sendStep: async (t, s) => { sent.push(s.index); return { ok: true }; },
      probePassword: async () => false,
      evalCondition: async (t, cond) => cond && cond.kind === "element" ? bannerPresent : false,
      verifySubmit: async () => "ok",
      hide: () => {},
    };
  }

  // (a) Banner da → alle drei Schritte ausgeführt.
  const sentA = [];
  const runA = SExecRun.createRunner({ automation: { id: "a", params: [] }, plan: mkPlan(), tabId: 1, execPlan: SExecPlan, gapMs: 0, deps: makeDeps(true, sentA) });
  const resA = await runA.run();
  ok(resA.status === "success" && sentA.join(",") === "0,1,2",
    `Beweis 4a (autonom): Banner da → Schritte 0,1,2 ausgeführt (war [${sentA.join(",")}], ${resA.status})`);

  // (b) Banner weg → Schritt 1 übersprungen (nur 0,2 ausgeführt), Lauf erfolgreich.
  const sentB = [];
  const runB = SExecRun.createRunner({ automation: { id: "a", params: [] }, plan: mkPlan(), tabId: 1, execPlan: SExecPlan, gapMs: 0, deps: makeDeps(false, sentB) });
  const resB = await runB.run();
  ok(resB.status === "success" && sentB.join(",") === "0,2",
    `Beweis 4b (autonom): Banner weg → Schritt 1 übersprungen, nur 0,2 ausgeführt (war [${sentB.join(",")}], ${resB.status})`);

  // (c) Datei-Kohärenz: übersprungener bedingter DOWNLOAD, dessen Datei ein späterer Upload braucht
  //     → ehrlicher Stopp statt stummem Überspringen.
  const dlPlan = [
    { index: 0, total: 3, action: "click", selector: { css: "#dl" }, page_url: "http://s/shop", condition: { kind: "element", selector: { css: "#opt" } }, file_meta: { role: "download", key: "file1" } },
    { index: 1, total: 3, action: "upload", selector: { css: "#up" }, page_url: "http://s/shop", file_meta: { role: "upload", source: "file1" } },
    { index: 2, total: 3, action: "click", selector: { css: "#buy" }, page_url: "http://s/shop" },
  ];
  const sentC = [];
  const depsC = makeDeps(false, sentC); // Bedingung NICHT erfüllt → Download würde übersprungen
  const runC = SExecRun.createRunner({ automation: { id: "a", params: [] }, plan: dlPlan, tabId: 1, execPlan: SExecPlan, gapMs: 0, deps: depsC });
  const resC = await runC.run();
  ok(resC.status === "failed" && resC.detail === "bedingung-datei",
    `Beweis 4c (autonom): bedingter Download übersprungen, aber später gebraucht → ehrlicher Stopp (war ${resC.status}/${resC.detail})`);
  ok(sentC.length === 0, "Beweis 4c: kein Schritt ausgeführt vor dem ehrlichen Stopp");
}

console.log(failed
  ? "\n✗ Bedingte Schritte E2E FEHLGESCHLAGEN."
  : "\n✓ Bedingte Schritte E2E grün: Banner-da → Schritt ausgeführt (Server-Log), Banner-weg → sauber übersprungen (kein Klick, kein Miss), URL-Bedingung + negate, autonomer Motor skippt/führt-aus + Datei-Kohärenz.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);
