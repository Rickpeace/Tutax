// Seiten-Brücke der Erweiterung (v2.19.2, Sicherheits-Fix) — OHNE Browser, OHNE Netz.
//
// Lädt die ECHTE extension/background.js in einer Node-VM mit einem minimalen `chrome`-Stub und
// prüft die Herkunfts-Grenze der Nachrichten, die content.js von JEDER Website weiterreicht:
//   • steply-pair: nur von festen Steply-Adressen (localhost nur ohne Store-Installation) UND nur,
//     wenn der sendende Tab genau diese Herkunft hat. Fremde Seite → Ablehnung OHNE Netzaufruf,
//     nichts gespeichert. (Vorher: jede Website konnte die Erweiterung auf ihren Server umbiegen.)
//   • steply-open-panel / steply-record-into: nur von der GEKOPPELTEN App-Herkunft.
//   • Zeitplan-Sync: 401 (Verbindung getrennt) räumt die steply-run:*-Wecker ab.
//
// Nutzung:  node scripts/test-bridge-origin.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.join(__dirname, "..", "extension");

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const tick = () => new Promise((r) => setTimeout(r, 20));

function makeWorld({ store = false, local = {} } = {}) {
  const mkEvent = () => {
    const ls = [];
    return { addListener: (f) => ls.push(f), _ls: ls };
  };
  const W = {
    local: { ...local },
    fetches: [],
    fetchStatus: 200,
    panelOpens: [],
    alarms: new Map(),
    cleared: [],
  };
  const onChanged = mkEvent();
  const onMessage = mkEvent();
  const chrome = {
    runtime: {
      id: "ext-id",
      getManifest: () => (store ? { version: "9.9.9", update_url: "https://clients2.google.com/service/update2/crx" } : { version: "9.9.9" }),
      getURL: (p) => "chrome-extension://ext-id/" + p,
      onMessage,
      onInstalled: mkEvent(),
      onStartup: mkEvent(),
      onConnect: mkEvent(),
      sendMessage: () => Promise.resolve(),
    },
    storage: {
      local: {
        get: (keys) => {
          const out = {};
          for (const k of [].concat(keys || [])) if (k in W.local) out[k] = W.local[k];
          return Promise.resolve(out);
        },
        set: (items) => {
          const ch = {};
          for (const k of Object.keys(items)) {
            ch[k] = { oldValue: W.local[k], newValue: items[k] };
            W.local[k] = items[k];
          }
          onChanged._ls.forEach((f) => f(ch, "local"));
          return Promise.resolve();
        },
        remove: (keys) => {
          for (const k of [].concat(keys)) delete W.local[k];
          return Promise.resolve();
        },
      },
      onChanged,
    },
    sidePanel: {
      setPanelBehavior: () => Promise.resolve(),
      open: (o) => {
        W.panelOpens.push(o.tabId);
        return Promise.resolve();
      },
    },
    alarms: {
      create: (name, o) => W.alarms.set(name, o),
      getAll: () => Promise.resolve([...W.alarms.keys()].map((name) => ({ name }))),
      clear: (name) => {
        W.cleared.push(name);
        W.alarms.delete(name);
        return Promise.resolve(true);
      },
      onAlarm: mkEvent(),
    },
    tabs: {
      query: () => Promise.resolve([]),
      create: () => Promise.resolve({ id: 1 }),
      sendMessage: () => Promise.resolve(),
      captureVisibleTab: () => Promise.resolve(""),
      onActivated: mkEvent(),
      onUpdated: mkEvent(),
      onCreated: mkEvent(),
      onRemoved: mkEvent(),
    },
    action: { setBadgeText: () => Promise.resolve(), setBadgeBackgroundColor: () => Promise.resolve() },
    scripting: { executeScript: () => Promise.resolve([]) },
  };
  const fetch = (url) => {
    W.fetches.push(String(url));
    const status = W.fetchStatus;
    return Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(status === 200 ? { account: "Kanzlei Test", automations: [] } : {}),
    });
  };
  const self = {};
  const ctx = {
    chrome,
    fetch,
    console,
    setTimeout,
    clearTimeout,
    URL,
    AbortController,
    Date,
    Promise,
    self,
    importScripts: (name) => vm.runInContext(readFileSync(path.join(EXT, name), "utf8"), ctx),
  };
  ctx.self = ctx; // Service-Worker: self === globalThis
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path.join(EXT, "background.js"), "utf8"), ctx, { filename: "background.js" });
  W.ctx = ctx;
  // Eine Nachricht an ALLE onMessage-Listener schicken (wie Chrome) und die Antwort abwarten.
  W.send = (msg, sender) =>
    new Promise((resolve) => {
      let answered = false;
      let asyncPending = false;
      for (const f of onMessage._ls) {
        const r = f(msg, sender, (resp) => {
          answered = true;
          resolve(resp);
        });
        if (r === true) asyncPending = true;
      }
      if (!asyncPending && !answered) setTimeout(() => resolve(undefined), 30);
    });
  return W;
}

const tabSender = (origin, extra = {}) => ({
  id: "ext-id",
  origin,
  url: origin + "/app/settings/erweiterung",
  frameId: 0,
  tab: { id: 7, url: origin + "/app/settings/erweiterung" },
  ...extra,
});
const PROD = "https://tutax-ivory.vercel.app";
const EVIL = "https://evil.example";

// ---- steply-pair ----
{
  const W = makeWorld();
  await tick();
  const r = await W.send({ type: "steply-pair", token: "x", appUrl: EVIL }, tabSender(EVIL));
  ok(r && r.ok === false, "Pair: fremde Website → abgelehnt");
  ok(W.fetches.length === 0, "Pair: fremde Website → KEIN Netzaufruf an den fremden Server");
  ok(!("steplyAppUrl" in W.local) && !("steplyToken" in W.local), "Pair: fremde Website → nichts gespeichert");

  const r2 = await W.send({ type: "steply-pair", token: "x", appUrl: PROD }, tabSender(EVIL));
  ok(r2 && r2.ok === false && W.fetches.length === 0, "Pair: behauptete Steply-Adresse aus fremdem Tab → abgelehnt");

  const r3 = await W.send({ type: "steply-pair", token: "tok-1", appUrl: PROD }, tabSender(PROD, { frameId: 3 }));
  ok(r3 && r3.ok === false && W.fetches.length === 0, "Pair: aus einem iframe → abgelehnt");

  const r4 = await W.send({ type: "steply-pair", token: "tok-1", appUrl: PROD + "/evil" }, tabSender(PROD));
  ok(r4 && r4.ok === false && W.fetches.length === 0, "Pair: appUrl mit Pfad → abgelehnt");

  const r5 = await W.send({ type: "steply-pair", token: "tok-1", appUrl: PROD }, tabSender(PROD));
  ok(r5 && r5.ok === true && r5.account === "Kanzlei Test", "Pair: echte Steply-App → verbunden");
  ok(W.fetches[0] === PROD + "/api/recorder/me", "Pair: Token gegen die echte App geprüft");
  ok(W.local.steplyAppUrl === PROD && W.local.steplyToken === "tok-1", "Pair: Token + App-Adresse gespeichert");

  const r6 = await W.send({ type: "steply-pair", token: "tok-2", appUrl: "http://localhost:3000" }, tabSender("http://localhost:3000"));
  ok(r6 && r6.ok === true, "Pair: localhost erlaubt, solange nicht aus dem Web Store installiert");
}
{
  const W = makeWorld({ store: true });
  await tick();
  const r = await W.send({ type: "steply-pair", token: "tok", appUrl: "http://localhost:3000" }, tabSender("http://localhost:3000"));
  ok(r && r.ok === false && W.fetches.length === 0, "Pair: localhost bei Web-Store-Installation → abgelehnt");
  const r2 = await W.send({ type: "steply-pair", token: "tok", appUrl: PROD }, tabSender(PROD));
  ok(r2 && r2.ok === true, "Pair: Web-Store-Installation + echte App → verbunden");
}

// ---- steply-open-panel / steply-record-into ----
{
  const W = makeWorld({ local: { steplyToken: "tok", steplyAppUrl: PROD } });
  await tick();
  await W.send({ type: "steply-open-panel" }, tabSender(EVIL));
  ok(W.panelOpens.length === 0, "Seitenleiste öffnen: fremde Website → ignoriert");
  await W.send({ type: "steply-open-panel" }, tabSender(PROD));
  ok(W.panelOpens.length === 1, "Seitenleiste öffnen: gekoppelte App → geöffnet");
  await W.send({ type: "steply-open-panel" }, tabSender("http://localhost:3000"));
  ok(W.panelOpens.length === 1, "Seitenleiste öffnen: andere (nicht gekoppelte) App-Adresse → ignoriert");

  const target = { tutorialId: "t1", anchor: { afterStepId: "s1" } };
  await W.send({ type: "steply-record-into", target, label: "x" }, tabSender(EVIL));
  await tick();
  ok(!W.local.pendingTarget && W.panelOpens.length === 1, "Aufnahme-Anker: fremde Website → ignoriert");
  await W.send({ type: "steply-record-into", target, label: "nach Schritt 1" }, tabSender(PROD));
  await tick();
  ok(
    W.local.pendingTarget && W.local.pendingTarget.origin === PROD && W.local.pendingTarget.target.tutorialId === "t1",
    "Aufnahme-Anker: gekoppelte App → Ziel gemerkt"
  );
}
{
  // Ungekoppelt (frische Installation): die Standard-App darf die Seitenleiste öffnen.
  const W = makeWorld();
  await tick();
  await W.send({ type: "steply-open-panel" }, tabSender(PROD));
  ok(W.panelOpens.length === 1, "Seitenleiste öffnen: ungekoppelt → Standard-App erlaubt");
}

// ---- Zeitplan: 401 räumt Wecker ab ----
{
  const W = makeWorld({ local: { steplyToken: "tok", steplyAppUrl: PROD } });
  await tick();
  W.alarms.set("steply-run:a1", { when: 1 });
  W.alarms.set("steply-run:a2", { when: 2 });
  W.fetchStatus = 500;
  await W.ctx.__steplyScheduler.syncSchedules();
  ok(W.alarms.has("steply-run:a1") && W.alarms.has("steply-run:a2"), "Zeitplan: Serverfehler (500) → Wecker bleiben");
  W.fetchStatus = 401;
  await W.ctx.__steplyScheduler.syncSchedules();
  ok(!W.alarms.has("steply-run:a1") && !W.alarms.has("steply-run:a2"), "Zeitplan: 401 (getrennt) → alle steply-run-Wecker entfernt");
  ok(W.alarms.has("steply-sync"), "Zeitplan: Sync-Wecker bleibt (erkennt eine neue Verbindung)");
}

console.log(failed ? "\nFEHLGESCHLAGEN" : "\nAlle Prüfungen grün.");
process.exit(failed ? 1 : 0);
