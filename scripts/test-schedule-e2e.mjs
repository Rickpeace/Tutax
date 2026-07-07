// Welle 41 — ZEITPLAN für Automationen: ONESHOT-BEWEIS (Kern der Welle).
//
// Beweist im ECHTEN Browser (geladene Extension) den AUTONOMEN geplanten Lauf END-TO-END:
//   Wecker-Handler (background.js) → Runner-Tab (runner.html/runner.js) → SteplyExecRun-Motor
//   (extension/exec-run.js) → content.js im ECHTEN Ziel-Tab → Server-Meldung (trigger:scheduled).
//
// Zwei echte node:http-Server:
//   • ZIEL-Site  : Login-Flow (wie test-state-intelligence-e2e) — beweist die AUSGEFÜHRTEN
//                  Aktionen über sein Request-Log (u. a. POST /login = autonome Anmeldung).
//   • FAKE-Steply: /api/recorder/automations(+/[id]) (Detail mit schedule) + automation-runs
//                  (start/finish) — beweist die Server-Meldung inkl. trigger:'scheduled'.
//     steplyToken/steplyAppUrl zeigen auf FAKE-Steply → der Runner nimmt den ECHTEN Fetch-Pfad.
//
// BEWEISE:
//   A) syncSchedules() legt pro AKTIVEM Zeitplan einen chrome.alarms-Wecker an (nextFireTime).
//   1) Fälliger geplanter Lauf (Werte gemerkt) → Runner führt den Login-Ablauf aus →
//      Ziel-Log zeigt POST /login → automation_runs finish status:'success' trigger:'scheduled'.
//   2) Pflicht-Wert fehlt → KEIN Ziel-Tab; failed-Lauf trigger:'scheduled' detail:'werte-fehlen'
//      + Benachrichtigung „werte-fehlen".
//   3) Recompute nach Lauf: nächster Wecker steht wieder + Doppel-Fire-Schutz (lastDue) →
//      zweiter identischer Handler-Aufruf startet KEINEN zweiten Lauf.
//   4) Belegt (frische Sperre) → geplanter Lauf verschiebt sich (kein zweiter Lauf gleichzeitig).
//   5) (best effort) REALE onAlarm-Zustellung: kurzer when-Alarm feuert den Handler.
//
// Der onAlarm-Listener ist eine Ein-Zeilen-Weiche auf handleScheduledRun — die Behavior-Beweise
// rufen genau DIESE Funktion über den Test-Hook self.__steplyScheduler auf (deterministisch),
// die Alarm-ZUSTELLUNG wird zusätzlich best-effort real geprüft.
//
// Nutzung:  node scripts/test-schedule-e2e.mjs
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
const note = (c, m) => { console.log(`${c ? "✓" : "⚠"} ${m}`); }; // best-effort, nie fatal
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── ZIEL-Site (Login-Flow, echtes Session-Verhalten) ─────────────────────────────────────────
const siteLog = [];
const hasSession = (req) => String(req.headers.cookie || "").includes("sess=1");
function siteHtml(res, body) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end('<!doctype html><meta charset="utf-8">' + body);
}
const siteServer = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  siteLog.push({ method: req.method, path: u.pathname });
  if (u.pathname === "/" && req.method === "GET") {
    siteHtml(res, '<h1>Basis</h1><a id="loginLink" href="/login">Anmelden</a>');
    return;
  }
  if (u.pathname === "/login" && req.method === "GET") {
    if (hasSession(req)) { res.writeHead(302, { Location: "/app" }); res.end(); return; }
    siteHtml(res,
      '<h1>Anmeldung</h1><form id="loginForm" method="post" action="/login">' +
      '<input id="user" name="user" type="text" />' +
      '<input id="pass" name="pass" type="password" />' +
      '<button id="submit" type="submit">Anmelden</button></form>');
    return;
  }
  if (u.pathname === "/login" && req.method === "POST") {
    req.on("data", () => {});
    req.on("end", () => { res.writeHead(303, { "Set-Cookie": "sess=1; Path=/", Location: "/app" }); res.end(); });
    return;
  }
  if (u.pathname === "/app" && req.method === "GET") {
    if (!hasSession(req)) { res.writeHead(302, { Location: "/login" }); res.end(); return; }
    siteHtml(res, '<h1>Dashboard</h1><a id="appBtn" href="/app/done">Weiter</a>');
    return;
  }
  if (u.pathname === "/app/done" && req.method === "GET") {
    siteHtml(res, '<h1>Ziel</h1><button id="doneTarget" type="button">Fertig</button>');
    return;
  }
  res.writeHead(404); res.end("nope");
});

// ── FAKE-Steply-Server (Detail + Läufe) ──────────────────────────────────────────────────────
const TOKEN = "test-token-" + Date.now();
const runsLog = []; // { event, automationId?, runId?, status?, detail?, trigger?, mode? }
let runSeq = 0;
const AUTOS = {}; // id → { automation:{...,schedule}, steps:[...] }

function jsonRes(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}
const steplyServer = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { jsonRes(res, 204, {}); return; }
  const auth = String(req.headers.authorization || "");
  const tokenOk = auth === "Bearer " + TOKEN;

  if (u.pathname === "/api/recorder/me") { return jsonRes(res, tokenOk ? 200 : 401, tokenOk ? { account: "Test-Kanzlei" } : { error: "no" }); }

  if (u.pathname === "/api/recorder/automations" && req.method === "GET") {
    if (!tokenOk) return jsonRes(res, 401, { error: "no" });
    const list = Object.values(AUTOS).map((a) => ({
      id: a.automation.id, title: a.automation.title, site_domains: [], stepCount: a.steps.length,
      paramCount: a.automation.params.length, schedule: a.automation.schedule, updated_at: new Date().toISOString(),
    }));
    return jsonRes(res, 200, { automations: list });
  }
  const mDet = u.pathname.match(/^\/api\/recorder\/automations\/([^/]+)$/);
  if (mDet && req.method === "GET") {
    if (!tokenOk) return jsonRes(res, 401, { error: "no" });
    const a = AUTOS[decodeURIComponent(mDet[1])];
    if (!a) return jsonRes(res, 404, { error: "nf" });
    return jsonRes(res, 200, { automation: a.automation, steps: a.steps });
  }
  if (u.pathname === "/api/recorder/automation-runs" && req.method === "POST") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let b = {};
      try { b = JSON.parse(raw || "{}"); } catch { b = {}; }
      if (b.token !== TOKEN) return jsonRes(res, 401, { error: "no" });
      if (b.event === "start") {
        const runId = "run-" + ++runSeq;
        runsLog.push({ event: "start", automationId: b.automationId, mode: b.mode, trigger: b.trigger, runId });
        return jsonRes(res, 200, { runId });
      }
      if (b.event === "finish") {
        runsLog.push({ event: "finish", runId: b.runId, status: b.status, detail: b.detail, currentStep: b.currentStep });
        return jsonRes(res, 200, { ok: true, status: b.status });
      }
      return jsonRes(res, 400, { error: "?" });
    });
    return;
  }
  jsonRes(res, 404, { error: "nf" });
});

const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(s.address().port)));

// Fixture-Bauer: Automation + schedule + Login-Ablauf-Schritte gegen SITE.
function loginAutomation(id, SITE, schedule) {
  return {
    automation: {
      id, title: "Portal-Login geplant",
      params: [
        { key: "user", label: "Benutzer", type: "text", required: true },
        { key: "pass", label: "Passwort", type: "secret", required: true },
      ],
      schedule,
    },
    steps: [
      { id: "s1", position: 1, title: "Anmelden öffnen", action: "click", selector: { css: "#loginLink" }, page_url: SITE + "/", param_key: null, imageUrl: null, highlights: [], file_meta: null },
      { id: "s2", position: 2, title: "Benutzer", action: "fill", selector: { css: "#user" }, page_url: SITE + "/login", param_key: "user", imageUrl: null, highlights: [], file_meta: null },
      { id: "s3", position: 3, title: "Passwort", action: "fill", selector: { css: "#pass" }, page_url: SITE + "/login", param_key: "pass", imageUrl: null, highlights: [], file_meta: null },
      { id: "s4", position: 4, title: "Absenden", action: "click", selector: { css: "#submit" }, page_url: SITE + "/login", param_key: null, imageUrl: null, highlights: [], file_meta: null },
      { id: "s5", position: 5, title: "Zum Ziel", action: "click", selector: { css: "#appBtn" }, page_url: SITE + "/app", param_key: null, imageUrl: null, highlights: [], file_meta: null },
      { id: "s6", position: 6, title: "Fertig", action: "click", selector: { css: "#doneTarget" }, page_url: SITE + "/app/done", param_key: null, imageUrl: null, highlights: [], file_meta: null },
    ],
  };
}

async function waitFor(pred, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { if (await pred()) return true; await sleep(200); }
  return false;
}

let ext = null;
try {
  const SITE_PORT = await listen(siteServer);
  const STEPLY_PORT = await listen(steplyServer);
  const SITE = `http://127.0.0.1:${SITE_PORT}`;
  const STEPLY = `http://127.0.0.1:${STEPLY_PORT}`;
  console.log(`  Ziel-Site :${SITE_PORT}   Fake-Steply :${STEPLY_PORT}`);

  const ID_OK = "auto-ok";
  const ID_NOVAL = "auto-noval";
  const weekly = { enabled: true, freq: "weekly", weekday: 1, hour: 8, minute: 0 };
  AUTOS[ID_OK] = loginAutomation(ID_OK, SITE, weekly);
  AUTOS[ID_NOVAL] = loginAutomation(ID_NOVAL, SITE, { enabled: true, freq: "monthly", day: 3, hour: 9, minute: 0 });

  const userDataDir = path.join(PW_DIR, "pw-sched-" + Date.now());
  mkdirSync(userDataDir, { recursive: true });
  ext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });

  let sw = ext.serviceWorkers()[0];
  if (!sw) sw = await ext.waitForEvent("serviceworker", { timeout: 10000 }).catch(() => null);
  ok(!!sw, "Extension geladen (Service-Worker aktiv)");
  if (!sw) throw new Error("kein Service-Worker");

  // Konfig in chrome.storage.local: Token + Fake-Steply-URL + gemerkte Werte für ID_OK.
  await sw.evaluate(async (args) => {
    await chrome.storage.local.set({
      steplyToken: args.token,
      steplyAppUrl: args.steply,
      autoValues: { [args.idOk]: { user: "richard", pass: "geheim" } }, // ID_NOVAL: KEINE Werte
      steplyRunState: { lastDue: {}, lock: null },
    });
  }, { token: TOKEN, steply: STEPLY, idOk: ID_OK });

  // Sanity: Scheduler-Hook + nextFireTime im Worker erreichbar.
  const sane = await sw.evaluate(() => ({
    hook: typeof self.__steplyScheduler === "object" && typeof self.__steplyScheduler.handleScheduledRun === "function",
    nft: !!(self.SteplyExecPlan && typeof self.SteplyExecPlan.nextFireTime === "function"),
  }));
  ok(sane.hook && sane.nft, "Worker: Scheduler-Hook + SteplyExecPlan.nextFireTime erreichbar");

  // ════════ Beweis A: syncSchedules legt Wecker an (nextFireTime → chrome.alarms) ════════
  await sw.evaluate(() => self.__steplyScheduler.syncSchedules());
  await sleep(1200); // syncSchedules ist async (Fetch der Liste) — kurz warten
  const alarms1 = await sw.evaluate(async () => (await chrome.alarms.getAll()).map((a) => ({ name: a.name, when: a.scheduledTime })));
  const hasOk = alarms1.some((a) => a.name === "steply-run:" + ID_OK);
  const hasNoval = alarms1.some((a) => a.name === "steply-run:" + ID_NOVAL);
  const hasSync = alarms1.some((a) => a.name === "steply-sync");
  ok(hasOk && hasNoval, `Beweis A: pro aktivem Zeitplan ein Wecker (steply-run:*) — ${alarms1.map((a) => a.name).join(", ")}`);
  ok(hasSync, "Beweis A: periodischer Sync-Wecker (steply-sync) vorhanden");

  // ════════ Beweis 1: fälliger Lauf (Werte gemerkt) → Login ausgeführt → success/scheduled ════════
  await ext.clearCookies();
  const siteFrom1 = siteLog.length;
  const dueA = Date.now();
  await sw.evaluate(async (args) => { await self.__steplyScheduler.handleScheduledRun(args.id, args.due); }, { id: ID_OK, due: dueA });

  const done1 = await waitFor(() => runsLog.some((r) => r.event === "finish"), 60000);
  const fin1 = runsLog.find((r) => r.event === "finish");
  console.log("   [diag] finish#1:", JSON.stringify(fin1), " site:", JSON.stringify(siteLog.slice(siteFrom1)));
  ok(fin1 && fin1.status === "success", `Beweis 1: geplanter Lauf meldete finish status:'success' (war ${fin1 && fin1.status}/${fin1 && fin1.detail})`);
  const start1 = runsLog.find((r) => r.event === "start" && r.automationId === ID_OK);
  ok(start1 && start1.trigger === "scheduled" && start1.mode === "auto", `Beweis 1: start mit trigger:'scheduled' + mode:'auto' (war ${JSON.stringify(start1)})`);
  const site1 = siteLog.slice(siteFrom1);
  ok(site1.some((r) => r.method === "POST" && r.path === "/login"), "Beweis 1: autonome Anmeldung ausgeführt — Ziel-Log zeigt POST /login");
  ok(site1.some((r) => r.method === "GET" && r.path === "/app/done"), "Beweis 1: Ablauf bis zum Ziel gelaufen — Ziel-Log zeigt GET /app/done");
  const notify1 = await sw.evaluate(async () => (await chrome.storage.local.get("steplyLastNotify")).steplyLastNotify || null);
  ok(notify1 && notify1.kind === "success", `Beweis 1: Erfolgs-Benachrichtigung ausgelöst (war ${notify1 && notify1.kind})`);

  // ════════ Beweis 3: Recompute + Doppel-Fire-Schutz ════════
  const state1 = await sw.evaluate(async () => (await chrome.storage.local.get("steplyRunState")).steplyRunState);
  ok(state1 && state1.lastDue && state1.lastDue[ID_OK] === dueA, `Beweis 3: lastDue gesetzt (Doppel-Fire-Schutz) — ${state1 && JSON.stringify(state1.lastDue)}`);
  // Der Runner gibt die Sperre kurz NACH dem finish-POST frei (finish → Benachrichtigung →
  // Ziel-Tab schließen → releaseRunLock) — darauf warten statt gleich zu lesen.
  const lockReleased = await waitFor(async () => {
    const s = await sw.evaluate(async () => (await chrome.storage.local.get("steplyRunState")).steplyRunState);
    return !!(s && (!s.lock || s.lock.id !== ID_OK));
  }, 10000);
  ok(lockReleased, "Beweis 3: Sperre nach Lauf wieder freigegeben (Runner)");
  const alarms2 = await sw.evaluate(async () => (await chrome.alarms.getAll()).map((a) => ({ name: a.name, when: a.scheduledTime })));
  const nextOk = alarms2.find((a) => a.name === "steply-run:" + ID_OK);
  ok(nextOk && nextOk.when > Date.now(), `Beweis 3: nächster Wecker für ID_OK neu gesetzt (${nextOk && new Date(nextOk.when).toISOString()})`);
  // Zweiter IDENTISCHER Aufruf (gleiche Fälligkeit) → KEIN zweiter Lauf.
  const startsBefore = runsLog.filter((r) => r.event === "start" && r.automationId === ID_OK).length;
  await sw.evaluate(async (args) => { await self.__steplyScheduler.handleScheduledRun(args.id, args.due); }, { id: ID_OK, due: dueA });
  await sleep(1500);
  const startsAfter = runsLog.filter((r) => r.event === "start" && r.automationId === ID_OK).length;
  ok(startsAfter === startsBefore, `Beweis 3: identische Fälligkeit startet KEINEN zweiten Lauf (${startsBefore}→${startsAfter})`);

  // ════════ Beweis 2: Pflicht-Wert fehlt → kein Ziel-Tab, failed/werte-fehlen ════════
  const siteFrom2 = siteLog.length;
  const runsFrom2 = runsLog.length;
  const dueB = Date.now();
  await sw.evaluate(async (args) => { await self.__steplyScheduler.handleScheduledRun(args.id, args.due); }, { id: ID_NOVAL, due: dueB });
  const failed2 = await waitFor(() => runsLog.slice(runsFrom2).some((r) => r.event === "finish" && r.status === "failed" && r.detail === "werte-fehlen"), 30000);
  ok(failed2, "Beweis 2: fehlender Pflicht-Wert → finish status:'failed' detail:'werte-fehlen'");
  const start2 = runsLog.slice(runsFrom2).find((r) => r.event === "start" && r.automationId === ID_NOVAL);
  ok(start2 && start2.trigger === "scheduled", "Beweis 2: der übersprungene Lauf ist als trigger:'scheduled' vermerkt");
  const notify2 = await sw.evaluate(async () => (await chrome.storage.local.get("steplyLastNotify")).steplyLastNotify || null);
  ok(notify2 && notify2.kind === "werte-fehlen", `Beweis 2: „werte-fehlen"-Benachrichtigung (war ${notify2 && notify2.kind})`);
  await sleep(1200);
  const site2 = siteLog.slice(siteFrom2);
  ok(site2.length === 0, `Beweis 2: KEIN Ziel-Tab geöffnet (keine Ziel-Requests) — waren ${site2.length}`);

  // ════════ Beweis 4: Belegt (frische Sperre) → geplanter Lauf verschiebt sich ════════
  await sw.evaluate(async () => {
    const s = (await chrome.storage.local.get("steplyRunState")).steplyRunState || { lastDue: {} };
    s.lock = { id: "anderer-lauf", at: Date.now() }; // frische Fremd-Sperre
    await chrome.storage.local.set({ steplyRunState: s });
  });
  const startsB4 = runsLog.filter((r) => r.event === "start" && r.automationId === ID_OK).length;
  const dueBusy = Date.now() + 12345; // andere Fälligkeit → nicht durch lastDue blockiert
  await sw.evaluate(async (args) => { await self.__steplyScheduler.handleScheduledRun(args.id, args.due); }, { id: ID_OK, due: dueBusy });
  await sleep(1500);
  const startsAfterBusy = runsLog.filter((r) => r.event === "start" && r.automationId === ID_OK).length;
  ok(startsAfterBusy === startsB4, `Beweis 4: bei belegter Sperre KEIN zweiter Lauf (${startsB4}→${startsAfterBusy})`);
  const alarmsBusy = await sw.evaluate(async () => (await chrome.alarms.getAll()).map((a) => ({ name: a.name, when: a.scheduledTime })));
  const postponed = alarmsBusy.find((a) => a.name === "steply-run:" + ID_OK);
  ok(postponed && postponed.when > Date.now() && postponed.when < Date.now() + 6 * 60 * 1000, `Beweis 4: Wecker um ~5 min verschoben (${postponed && new Date(postponed.when).toISOString()})`);
  // Fremd-Sperre wieder freigeben.
  await sw.evaluate(async () => { const s = (await chrome.storage.local.get("steplyRunState")).steplyRunState || {}; s.lock = null; await chrome.storage.local.set({ steplyRunState: s }); });

  // ════════ Beweis 5 (best effort): REALE onAlarm-Zustellung ════════
  // Kurzer when-Alarm auf eine bogus-id: feuert der Listener, ruft er handleScheduledRun('probe',…),
  // was lastDue['probe'] setzt (Automation existiert nicht → Runner meldet nur load-failed).
  await sw.evaluate(async () => { const s = (await chrome.storage.local.get("steplyRunState")).steplyRunState || { lastDue: {} }; delete s.lastDue["probe-alarm"]; s.lock = null; await chrome.storage.local.set({ steplyRunState: s }); });
  const probeDue = Date.now() + 1500;
  await sw.evaluate((when) => chrome.alarms.create("steply-run:probe-alarm", { when }), probeDue);
  const fired = await waitFor(async () => {
    const s = await sw.evaluate(async () => (await chrome.storage.local.get("steplyRunState")).steplyRunState || {});
    return !!(s.lastDue && "probe-alarm" in s.lastDue);
  }, 20000);
  note(fired, fired
    ? "Beweis 5: reale onAlarm-Zustellung feuerte den Handler (kurzer when-Alarm)"
    : "Beweis 5: reale kurze onAlarm-Zustellung nicht in 20s (Chrome-Clamping) — Handler ist über den Hook bereits bewiesen");

  await ext.close();
  ext = null;
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (ext) await ext.close().catch(() => {});
  siteServer.close();
  steplyServer.close();
}

console.log(failed
  ? "\n✗ Zeitplan E2E FEHLGESCHLAGEN."
  : "\n✓ Zeitplan E2E grün: Wecker-Anlage (nextFireTime→alarms), autonomer geplanter Lauf (Login ausgeführt, success/scheduled), Werte-fehlen-Skip, Recompute + Doppel-Fire-Schutz, Belegt-Verschiebung.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);
