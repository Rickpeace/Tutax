// Welle 48 — ERWEITERTE INTERAKTION + iframes: BROWSER-BEWEIS ohne Steply-Server/Datenbank.
//
// Laedt die AUSGELIEFERTE extension/guide-resolve.js + extension/content.js per addInitScript in
// JEDEN Frame (wie das Manifest mit all_frames/document_start) einer echten Chromium-Seite. Ein
// chrome-Stub sammelt je Frame die onMessage-Listener ein; der Test spielt chrome.tabs.sendMessage
// nach, indem er dieselbe Nachricht an ALLE Frames zustellt (genau das tut Chrome seit all_frames).
// Zwei node:http-Server = zwei Origins (Hauptseite + iframe).
//
// BEWEISE (Automationen, steply-exec-step):
//   1) fill + enter auf Google-artigem textarea: Seite schickt per keydown-Handler ab (requestSubmit),
//      Fokus liegt beim Abschicken im Feld, Wert steht drin, GENAU EINE Uebermittlung.
//   2) fill + enter auf normalem POST-Formular ohne eigenen Handler: implizite Uebermittlung via
//      requestSubmit, submitted=true (Panel prueft den Bounce), genau eine Uebermittlung.
//   3) Rechtsklick → contextmenu (button 2), KEIN normaler click.
//   4) Doppelklick → zwei clicks + dblclick.
//   5) Ziehen → HTML5-DnD: dragstart/drop mit DataTransfer-Daten + dragend, Zeiger-Sequenz.
//   6) Tastenkuerzel Ctrl+S → keydown mit ctrlKey am fokussierten Element.
//   7) Hover → JS-mouseenter oeffnet ein ARIA-Menue, dann Klick auf den Menuepunkt.
//   8) Hover ohne Wirkung → ehrlicher Miss (hover-menu-closed), NICHTS geklickt.
//   9) Frame-Filter: Schritt ohne frame → nur Hauptfenster; mit frame.url → nur der passende iframe;
//      unpassende frame.url → niemand. Je Schritt GENAU EIN steply-exec-result.
//  10) eval-condition / has-password: nur das Hauptfenster antwortet (iframe: kein sendResponse).
// BEWEISE (Live-Fuehrung, steply-guide-show):
//  11) Rechtsklick-Schritt: Badge „· Rechtsklick", Linksklick schaltet NICHT weiter, Rechtsklick schon.
//  12) Hover-Schritt: erst Ausloeser markiert („Mit der Maus über „Datei“ fahren"), nach echtem Hover
//      wechselt das Overlay aufs Ziel; Klick darauf schaltet weiter.
//  13) Kuerzel-Schritt: echtes Strg+S schaltet weiter. 14) frame-Schritt: Overlay NUR im iframe.
//
// Nutzung:  node scripts/test-exec-interaction-e2e.mjs   (STEPLY_PW_DIR = Ordner mit node_modules/playwright)
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESOLVER_JS = readFileSync(path.resolve(HERE, "../extension/guide-resolve.js"), "utf8");
const CONTENT_JS = readFileSync(path.resolve(HERE, "../extension/content.js"), "utf8");

const PW_DIR = process.env.STEPLY_PW_DIR || "C:/Users/Richa/AppData/Local/Temp/steply-pw";
const pwEntry = `${PW_DIR}/node_modules/playwright/index.js`;
if (!existsSync(pwEntry)) {
  console.error("✗ Playwright nicht gefunden unter", pwEntry, "\n  (STEPLY_PW_DIR setzen).");
  process.exit(2);
}
const { chromium } = require(pwEntry);

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// chrome-Stub je Frame: Listener einsammeln, gesendete Nachrichten protokollieren.
const STUB = `(() => {
  window.__listeners = [];
  window.__sent = [];
  window.__pageLog = [];
  window.chrome = {
    runtime: {
      lastError: undefined,
      getManifest: function () { return { version: "0.0.0-test" }; },
      sendMessage: function (m) {
        window.__sent.push(JSON.parse(JSON.stringify(m || {})));
        if (m && m.type === "steply-probe-hydration") return Promise.resolve({ ok: true, hydrated: false, isReact: false });
        return Promise.resolve(undefined);
      },
      onMessage: { addListener: function (fn) { window.__listeners.push(fn); } },
    },
    storage: {
      local: { get: function (key, cb) { cb({}); } },
      onChanged: { addListener: function () {} },
    },
  };
  // Test-Zustellung = chrome.tabs.sendMessage an DIESEN Frame: alle Listener aufrufen; wer
  // sendResponse ruft, wird protokolliert (Antwort ggf. asynchron).
  window.__deliver = function (msg) {
    const out = { responded: false, response: null, returnedTrue: false };
    for (const fn of window.__listeners) {
      let r;
      try {
        r = fn(msg, { id: "steply-test" }, function (resp) { out.responded = true; out.response = resp; });
      } catch (e) {
        out.error = String(e);
      }
      if (r === true) out.returnedTrue = true;
    }
    window.__lastDeliver = out;
    return true;
  };
})();`;

const PAGE_SCRIPT = `
  const L = (e) => window.__pageLog.push(e);
  document.addEventListener("submit", (e) => {
    e.preventDefault(); // echte Seite wuerde navigieren
    const q = document.getElementById("q");
    L({ ev: "submit", form: e.target.id, qFilled: !!(q && q.value === "steply"), focus: document.activeElement && document.activeElement.id });
  });
  // Google-Muster: textarea schickt per eigenem keydown-Handler ab.
  document.getElementById("q").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); this.form.requestSubmit(); }
  });
  const rc = document.getElementById("rc");
  rc.addEventListener("contextmenu", (e) => { e.preventDefault(); L({ ev: "contextmenu", button: e.button }); });
  rc.addEventListener("click", () => L({ ev: "rc-click" }));
  const dc = document.getElementById("dc");
  dc.addEventListener("click", () => L({ ev: "dc-click" }));
  dc.addEventListener("dblclick", () => L({ ev: "dblclick" }));
  const src = document.getElementById("src");
  const dst = document.getElementById("dst");
  src.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", "aufgabe-1"); L({ ev: "dragstart" }); });
  src.addEventListener("dragend", () => L({ ev: "dragend" }));
  src.addEventListener("pointerdown", () => L({ ev: "src-pointerdown" }));
  dst.addEventListener("dragover", (e) => e.preventDefault());
  dst.addEventListener("drop", (e) => { e.preventDefault(); L({ ev: "drop", data: e.dataTransfer.getData("text/plain") }); });
  dst.addEventListener("pointerup", () => L({ ev: "dst-pointerup" }));
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && (e.key === "s" || e.key === "S")) { e.preventDefault(); L({ ev: "save", focus: document.activeElement && document.activeElement.id }); }
  });
  const mtrig = document.getElementById("mtrig");
  const mlist = document.getElementById("mlist");
  mtrig.addEventListener("mouseenter", () => { mlist.hidden = false; mtrig.setAttribute("aria-expanded", "true"); });
  document.getElementById("mi").addEventListener("click", () => { L({ ev: "menuitem" }); });
  document.getElementById("deaditem").addEventListener("click", () => L({ ev: "deaditem" }));
  document.getElementById("pay").addEventListener("click", () => L({ ev: "pay", where: "top" }));
`;

function topHtml(framePort) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Hauptseite</title></head><body style="font:14px sans-serif">
  <form id="g" role="search" action="/search" method="get"><textarea id="q" name="q" role="combobox" aria-label="Suche" rows="1"></textarea></form>
  <form id="f" action="/save" method="post"><label for="city">Stadt</label><input id="city" name="city" type="text"></form>
  <div id="rc" style="padding:8px;border:1px solid #999;width:120px">Datei</div>
  <div id="dc" style="padding:8px;border:1px solid #999;width:120px">Bericht</div>
  <div style="display:flex;gap:40px">
    <div id="src" draggable="true" style="padding:8px;border:1px solid #999;width:100px">Aufgabe 1</div>
    <div id="dst" style="padding:24px;border:2px dashed #999;width:140px">Erledigt</div>
  </div>
  <div id="editor" tabindex="0" style="padding:8px;border:1px solid #999;width:200px">Editor</div>
  <div id="menu" role="menubar">
    <button id="mtrig" aria-haspopup="true" aria-expanded="false">Datei-Menü</button>
    <div id="mlist" role="menu" hidden><button id="mi" role="menuitem">Speichern unter</button></div>
  </div>
  <button id="deadtrig">Tot</button><button id="deaditem" style="display:none">Nie sichtbar</button>
  <button id="pay">Bezahlen</button>
  <iframe id="fr" src="http://127.0.0.1:${framePort}/inner" style="width:400px;height:120px"></iframe>
  <script>${PAGE_SCRIPT}</script>
</body></html>`;
}
const FRAME_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Rahmen</title></head><body>
  <button id="pay">Bezahlen</button>
  <script>document.getElementById("pay").addEventListener("click", () => window.__pageLog.push({ ev: "pay", where: "frame" }));</script>
</body></html>`;

function serve(handler) {
  return new Promise((resolve) => {
    const s = createServer(handler);
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
}

let browser = null;
let topSrv = null;
let frameSrv = null;
try {
  frameSrv = await serve((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(FRAME_HTML);
  });
  const framePort = frameSrv.address().port;
  topSrv = await serve((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(topHtml(framePort));
  });
  const topPort = topSrv.address().port;
  const TOP = `http://127.0.0.1:${topPort}/`;
  const FRAME_URL = `http://127.0.0.1:${framePort}/inner`;

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  // Reihenfolge wie im Manifest: Stub, dann guide-resolve.js, dann content.js — in JEDEM Frame.
  await context.addInitScript({ content: STUB });
  await context.addInitScript({ content: RESOLVER_JS });
  await context.addInitScript({ content: CONTENT_JS });
  const page = await context.newPage();
  await page.goto(TOP, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const f = document.getElementById("fr");
    return f && f.contentDocument === null; // cross-origin geladen
  });
  await sleep(300);

  const frames = () => page.frames();
  const topFrame = page.mainFrame();
  const childFrame = () => page.frames().find((f) => f !== topFrame);
  ok(frames().length === 2 && !!childFrame(), `Zwei Frames geladen (Hauptseite + iframe ${FRAME_URL})`);
  const listenersIn = async (f) => f.evaluate(() => window.__listeners.length);
  ok((await listenersIn(topFrame)) > 0 && (await listenersIn(childFrame())) > 0,
    "content.js laeuft in BEIDEN Frames (all_frames) und hat Listener registriert");
  ok((await topFrame.evaluate(() => document.documentElement.getAttribute("data-steply-recorder"))) === "0.0.0-test" &&
    (await childFrame().evaluate(() => document.documentElement.getAttribute("data-steply-recorder"))) === null,
    "Erkennungs-Marker nur im Hauptfenster (iframe bleibt unmarkiert)");

  // chrome.tabs.sendMessage nachspielen: an ALLE Frames zustellen.
  const broadcast = async (msg) => {
    for (const f of frames()) await f.evaluate((m) => window.__deliver(m), msg);
  };
  const resultsFor = async (token) => {
    const out = [];
    for (const f of frames()) {
      const list = await f.evaluate(
        (t) => window.__sent.filter((m) => m.type === "steply-exec-result" && m.token === t),
        token,
      );
      for (const r of list) out.push({ ...r, frame: f === topFrame ? "top" : "frame" });
    }
    return out;
  };
  const pageLog = async (f = topFrame) => f.evaluate(() => window.__pageLog.slice());
  const clearLogs = async () => {
    for (const f of frames()) await f.evaluate(() => { window.__pageLog.length = 0; window.__sent.length = 0; });
  };
  let tokenSeq = 100;
  // Einen Schritt ausfuehren lassen und auf GENAU EIN Ergebnis warten (+ Nachlauf gegen Doppel).
  async function execStep(step, { expectResult = true, maxMs = 9000 } = {}) {
    const token = ++tokenSeq;
    await broadcast({ type: "steply-exec-step", token, step: { index: 1, total: 1, ...step } });
    const t0 = Date.now();
    let res = [];
    while (Date.now() - t0 < maxMs) {
      res = await resultsFor(token);
      if (res.length) break;
      await sleep(100);
    }
    if (expectResult) await sleep(1200); // Nachlauf: kaeme ein zweites Ergebnis (anderer Frame)?
    res = await resultsFor(token);
    return res;
  }

  // ── 1) fill + enter: Google-artiges textarea ─────────────────────────────────────────────
  await clearLogs();
  {
    const r = await execStep({ selector: { css: "#q" }, action: "fill", value: "steply", interaction: { enter: true } });
    const log = await pageLog();
    const submits = log.filter((e) => e.ev === "submit");
    ok(r.length === 1 && r[0].ok === true && r[0].frame === "top", `Google-Enter: genau EIN Ergebnis ok aus dem Hauptfenster (${JSON.stringify(r)})`);
    ok(submits.length === 1 && submits[0].form === "g", `Google-Enter: GENAU EINE Uebermittlung des Such-Formulars (${JSON.stringify(submits)})`);
    ok(submits[0] && submits[0].qFilled === true && submits[0].focus === "q", "Google-Enter: beim Abschicken steht der Wert drin UND das Feld hat den Fokus");
    ok(r[0] && r[0].submitted === false, "Google-Enter: GET-Suche → submitted=false (kein falscher Bounce-Alarm)");
    const sentRaw = JSON.stringify(await topFrame.evaluate(() => window.__sent));
    ok(!sentRaw.includes('"steply"'), "DATENSCHUTZ: Feldwert nicht in gesendeten Nachrichten");
  }

  // ── 2) fill + enter: normales POST-Formular ohne eigenen Handler ─────────────────────────
  await clearLogs();
  {
    const r = await execStep({ selector: { css: "#city" }, action: "fill", value: "Berlin", interaction: { enter: true } });
    const submits = (await pageLog()).filter((e) => e.ev === "submit");
    ok(r.length === 1 && r[0].ok === true, "Formular-Enter: genau EIN Ergebnis ok");
    ok(submits.length === 1 && submits[0].form === "f", `Formular-Enter: implizite Uebermittlung per requestSubmit (${JSON.stringify(submits)})`);
    ok(r[0] && r[0].submitted === true, "Formular-Enter: POST → submitted=true (Panel prueft Bounce wie beim Klick)");
    ok((await topFrame.evaluate(() => document.getElementById("city").value)) === "Berlin", "Formular-Enter: Wert gesetzt");
  }

  // ── 3) Rechtsklick ──────────────────────────────────────────────────────────────────────
  await clearLogs();
  {
    const r = await execStep({ selector: { css: "#rc", text: "Datei" }, action: "click", interaction: { variant: "right" } });
    const log = await pageLog();
    ok(r.length === 1 && r[0].ok, "Rechtsklick: genau EIN Ergebnis ok");
    ok(log.some((e) => e.ev === "contextmenu" && e.button === 2), `Rechtsklick: contextmenu mit button 2 (${JSON.stringify(log)})`);
    ok(!log.some((e) => e.ev === "rc-click"), "Rechtsklick: KEIN normaler click ausgeloest");
  }

  // ── 4) Doppelklick ──────────────────────────────────────────────────────────────────────
  await clearLogs();
  {
    const r = await execStep({ selector: { css: "#dc", text: "Bericht" }, action: "click", interaction: { variant: "double" } });
    const log = await pageLog();
    ok(r.length === 1 && r[0].ok, "Doppelklick: genau EIN Ergebnis ok");
    ok(log.filter((e) => e.ev === "dc-click").length === 2 && log.some((e) => e.ev === "dblclick"),
      `Doppelklick: zwei clicks + dblclick (${JSON.stringify(log)})`);
  }

  // ── 5) Ziehen (HTML5-DnD) ───────────────────────────────────────────────────────────────
  await clearLogs();
  {
    const r = await execStep({
      selector: { css: "#src", text: "Aufgabe 1" },
      action: "click",
      interaction: { variant: "drag", drop: { css: "#dst", text: "Erledigt" }, dropLabel: "Erledigt" },
    });
    const log = await pageLog();
    ok(r.length === 1 && r[0].ok, `Ziehen: genau EIN Ergebnis ok (${JSON.stringify(r)})`);
    ok(log.some((e) => e.ev === "dragstart") && log.some((e) => e.ev === "drop" && e.data === "aufgabe-1") && log.some((e) => e.ev === "dragend"),
      `Ziehen: dragstart → drop (mit DataTransfer-Daten) → dragend (${JSON.stringify(log)})`);
    ok(log.some((e) => e.ev === "src-pointerdown") && log.some((e) => e.ev === "dst-pointerup"), "Ziehen: Zeiger-Sequenz pointerdown(Quelle) → pointerup(Ziel)");
    const miss = await execStep({ selector: { css: "#src" }, action: "click", interaction: { variant: "drag", drop: { css: "#gibtsnicht" } } });
    ok(miss.length === 1 && miss[0].ok === false && miss[0].reason === "drop-not-found", `Ziehen ohne Ablage-Ziel: ehrlicher Miss (${miss[0] && miss[0].reason})`);
  }

  // ── 6) Tastenkuerzel ────────────────────────────────────────────────────────────────────
  await clearLogs();
  {
    const r = await execStep({ selector: { css: "#editor" }, action: "click", interaction: { variant: "key", key: "Ctrl+S" } });
    const log = await pageLog();
    ok(r.length === 1 && r[0].ok, "Kuerzel: genau EIN Ergebnis ok");
    ok(log.some((e) => e.ev === "save" && e.focus === "editor"), `Kuerzel: Strg+S am fokussierten Element angekommen (${JSON.stringify(log)})`);
  }

  // ── 7) Hover-Menue ──────────────────────────────────────────────────────────────────────
  await clearLogs();
  {
    ok(await topFrame.evaluate(() => document.getElementById("mlist").hidden), "Hover: Menue ist vorher zu");
    const r = await execStep({
      selector: { text: "Speichern unter", role: "menuitem" },
      action: "click",
      interaction: { hover: { css: "#mtrig" }, hoverLabel: "Datei-Menü" },
    });
    const log = await pageLog();
    ok(r.length === 1 && r[0].ok, `Hover: genau EIN Ergebnis ok (${JSON.stringify(r)})`);
    ok(log.some((e) => e.ev === "menuitem"), "Hover: mouseenter oeffnete das Menue, der Menuepunkt wurde geklickt");
    await topFrame.evaluate(() => { document.getElementById("mlist").hidden = true; });
  }

  // ── 8) Hover ohne Wirkung → ehrlicher Miss ─────────────────────────────────────────────
  await clearLogs();
  {
    const r = await execStep({ selector: { css: "#deaditem" }, action: "click", interaction: { hover: { css: "#deadtrig" } } });
    const log = await pageLog();
    ok(r.length === 1 && r[0].ok === false && r[0].reason === "hover-menu-closed", `Hover ohne Wirkung: Miss hover-menu-closed (${JSON.stringify(r)})`);
    ok(!log.some((e) => e.ev === "deaditem"), "Hover ohne Wirkung: NICHTS geklickt (nie raten)");
  }

  // ── 9) Frame-Filter ─────────────────────────────────────────────────────────────────────
  await clearLogs();
  {
    const r = await execStep({ selector: { css: "#pay", text: "Bezahlen" }, action: "click" });
    const topLog = await pageLog(topFrame);
    const frLog = await pageLog(childFrame());
    ok(r.length === 1 && r[0].frame === "top" && r[0].ok, `Ohne frame: genau EIN Ergebnis, aus dem Hauptfenster (${JSON.stringify(r)})`);
    ok(topLog.some((e) => e.ev === "pay") && !frLog.some((e) => e.ev === "pay"), "Ohne frame: nur das Hauptfenster klickt");
  }
  await clearLogs();
  {
    const r = await execStep({ selector: { css: "#pay", text: "Bezahlen" }, action: "click", interaction: { frame: { url: FRAME_URL } } });
    const topLog = await pageLog(topFrame);
    const frLog = await pageLog(childFrame());
    ok(r.length === 1 && r[0].frame === "frame" && r[0].ok, `Mit frame.url: genau EIN Ergebnis, aus dem iframe (${JSON.stringify(r)})`);
    ok(frLog.some((e) => e.ev === "pay") && !topLog.some((e) => e.ev === "pay"), "Mit frame.url: nur der passende iframe klickt");
    const cursorTop = await topFrame.evaluate(() => !!document.getElementById("__steply-exec-cursor"));
    ok(!cursorTop, "Mit frame.url: Hauptfenster hat seine alte Maus abgeraeumt (keine zweite Buehne)");
  }
  await clearLogs();
  {
    const r = await execStep(
      { selector: { css: "#pay" }, action: "click", interaction: { frame: { url: `http://127.0.0.1:${framePort}/anders` } } },
      { expectResult: false, maxMs: 2500 },
    );
    const clicks = [...(await pageLog(topFrame)), ...(await pageLog(childFrame()))].filter((e) => e.ev === "pay");
    ok(r.length === 0 && clicks.length === 0, "Unpassende frame.url: kein Frame reagiert, nichts geklickt (Panel-Timeout = ehrlicher Miss)");
  }

  // ── 10) Antworten nur vom Hauptfenster ─────────────────────────────────────────────────
  {
    await broadcast({ type: "steply-eval-condition", cond: { kind: "element", selector: { css: "#pay", text: "Bezahlen" } } });
    await sleep(500);
    const topAns = await topFrame.evaluate(() => window.__lastDeliver);
    const frAns = await childFrame().evaluate(() => window.__lastDeliver);
    ok(topAns.responded && topAns.response && topAns.response.met === true, `eval-condition: Hauptfenster antwortet (met=${topAns.response && topAns.response.met})`);
    ok(!frAns.responded && !frAns.returnedTrue, "eval-condition: iframe antwortet NICHT und haelt den Kanal nicht offen");
    await broadcast({ type: "steply-exec-has-password" });
    const topPw = await topFrame.evaluate(() => window.__lastDeliver);
    const frPw = await childFrame().evaluate(() => window.__lastDeliver);
    ok(topPw.responded && !frPw.responded && !frPw.returnedTrue, "has-password: nur das Hauptfenster antwortet");
    await broadcast({ type: "steply-exec-file", fileId: "f1", name: "a.txt", mime: "text/plain", b64: "YQ==" });
    const frFile = await childFrame().evaluate(() => window.__lastDeliver);
    ok(!frFile.responded, "Datei-Bruecke: iframe nimmt keine Datei an (nur Hauptfenster)");
    await broadcast({ type: "steply-exec-hide" });
  }

  // ── 11..14) Live-Fuehrung ───────────────────────────────────────────────────────────────
  const advances = async (f = topFrame) => f.evaluate(() => window.__sent.filter((m) => m.type === "steply-guide-advance").length);
  const badge = async (f = topFrame) =>
    f.evaluate(() => {
      const o = document.getElementById("__steply-guide-overlay");
      return o ? o.lastElementChild.textContent : null;
    });
  const box = async (sel) => topFrame.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  const frameBox = async (f) => f.evaluate(() => {
    const r = document.getElementById("__steply-guide-overlay").firstElementChild.getBoundingClientRect();
    return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width) };
  });
  const waitFor = async (fn, ms = 4000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await fn()) return true;
      await sleep(100);
    }
    return false;
  };

  await clearLogs();
  {
    await broadcast({ type: "steply-guide-show", step: { selector: { css: "#rc", text: "Datei" }, title: "t", index: 2, total: 5, interaction: { variant: "right" } } });
    ok(await waitFor(async () => (await badge()) === "2/5 · Rechtsklick"), `Fuehrung Rechtsklick: Badge „2/5 · Rechtsklick" (${await badge()})`);
    const c = await box("#rc");
    await page.mouse.click(c.x, c.y); // normaler Linksklick
    await sleep(200);
    ok((await advances()) === 0, "Fuehrung Rechtsklick: Linksklick schaltet NICHT weiter");
    await page.mouse.click(c.x, c.y, { button: "right" });
    ok(await waitFor(async () => (await advances()) === 1), "Fuehrung Rechtsklick: echter Rechtsklick schaltet weiter");
  }

  await clearLogs();
  {
    await page.mouse.move(5, 5);
    await topFrame.evaluate(() => { document.getElementById("mlist").hidden = true; });
    await broadcast({
      type: "steply-guide-show",
      step: { selector: { text: "Speichern unter", role: "menuitem" }, title: "t", index: 3, total: 5, interaction: { hover: { css: "#mtrig" }, hoverLabel: "Datei" } },
    });
    ok(await waitFor(async () => (await badge()) === "3/5 · Mit der Maus über „Datei“ fahren"),
      `Fuehrung Hover: erst der Ausloeser markiert (${await badge()})`);
    const statusFound = await topFrame.evaluate(() => window.__sent.filter((m) => m.type === "steply-guide-status").map((m) => m.found));
    ok(statusFound.length > 0 && statusFound.every((f) => f === true), "Fuehrung Hover: Panel bekommt found:true (kein Screenshot-Fallback waehrend des Wartens)");
    await sleep(5600); // laenger als das normale 5-s-Suchlimit: KEIN Miss in der Hover-Phase
    const misses = await topFrame.evaluate(() => window.__sent.filter((m) => m.type === "steply-guide-status" && m.found === false).length);
    ok(misses === 0, "Fuehrung Hover: auch nach >5 s kein found:false (Mensch darf sich Zeit lassen)");
    const t = await box("#mtrig");
    await page.mouse.move(t.x, t.y); // echter Hover → mouseenter → Menue auf
    ok(await waitFor(async () => (await badge()) === "3/5"), `Fuehrung Hover: nach dem Hover wechselt das Overlay aufs Ziel (${await badge()})`);
    const mi = await box("#mi");
    const ov = await frameBox(topFrame);
    ok(Math.abs(ov.l + ov.w / 2 - mi.x) < 30, "Fuehrung Hover: Rahmen sitzt jetzt auf dem Menuepunkt");
    await page.mouse.move(mi.x, mi.y);
    await page.mouse.down();
    await page.mouse.up();
    ok(await waitFor(async () => (await advances()) === 1), "Fuehrung Hover: Klick auf den Menuepunkt schaltet weiter");
  }

  await clearLogs();
  {
    await broadcast({ type: "steply-guide-show", step: { selector: { css: "#editor" }, title: "t", index: 4, total: 5, interaction: { variant: "key", key: "Ctrl+S" } } });
    ok(await waitFor(async () => (await badge()) === "4/5 · Strg+S drücken"), `Fuehrung Kuerzel: Badge „Strg+S drücken" (${await badge()})`);
    await topFrame.focus("#editor");
    await page.keyboard.press("s");
    await sleep(150);
    ok((await advances()) === 0, "Fuehrung Kuerzel: Taste s allein schaltet NICHT weiter");
    await page.keyboard.press("Control+s");
    ok(await waitFor(async () => (await advances()) === 1), "Fuehrung Kuerzel: echtes Strg+S schaltet weiter");
  }

  await clearLogs();
  {
    await broadcast({ type: "steply-guide-show", step: { selector: { css: "#pay", text: "Bezahlen" }, title: "t", index: 5, total: 5, interaction: { frame: { url: FRAME_URL } } } });
    ok(await waitFor(async () => (await badge(childFrame())) === "5/5"), "Fuehrung frame: Overlay im iframe");
    ok((await badge(topFrame)) === null, "Fuehrung frame: Hauptfenster hat KEIN Overlay (altes abgeraeumt)");
    const topStatus = await topFrame.evaluate(() => window.__sent.filter((m) => m.type === "steply-guide-status").length);
    ok(topStatus === 0, "Fuehrung frame: Hauptfenster meldet keinen Status (kein falsches found:false)");
    await broadcast({ type: "steply-guide-hide" });
    ok((await badge(childFrame())) === null, "Fuehrung: guide-hide raeumt auch im iframe ab");
  }

  await context.close();
  await browser.close();
  browser = null;
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (topSrv) topSrv.close();
  if (frameSrv) frameSrv.close();
}

console.log(failed
  ? "\n✗ Erweiterte Interaktion / iframes: FEHLGESCHLAGEN."
  : "\n✓ Erweiterte Interaktion + iframes im echten Browser bewiesen (Enter, Rechts-/Doppelklick, Ziehen, Kuerzel, Hover, Frame-Filter, Antworten nur oben, Fuehrung).");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 300);
