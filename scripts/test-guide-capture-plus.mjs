// Headless-Beweis Welle 48b: Erfassung der Sofort-Anleitung jenseits von „Klick"/„Eingabe".
// Laedt die ECHTE extension/content.js (+ guide-resolve.js) in echtes Chromium (Muster
// test-guide-enter.mjs) — auch in iframes (echte Cross-Origin-Frames ueber page.route) — und
// prueft ALLE gesendeten Nachrichten (steply-guide-step/-patch/-retract, steply-frame-geo):
//   1) iframes: gleiche Herkunft (Rand+Padding), cross-origin + VERSCHACHTELT, srcdoc ->
//      Schritt traegt interaction.frame + frameKey, die Geo kommt mit korrekt verschobenem rect
//      (Zahlen!), sensible Felder im iframe umgerechnet; Enter + Datei-Upload im iframe.
//   2) Shadow DOM (offen, verschachtelt, Slot-Text) -> Label + selector.shadow; guide-resolve.js
//      findet das Element darueber wieder; Text-Fallback in Shadow-Roots; change im Shadow-Root.
//   3) Hover-Menue (ARIA) -> hover gesetzt; per Klick geoeffnetes Menue -> KEIN hover.
//   4) contenteditable: Chat (leert sich) -> Schritt bleibt; Editor (Zeilenumbruch) -> retract.
//   5) Doppelklick -> 1 Schritt + patch double.   6) Rechtsklick mit/ohne eigenes Menue.
//   7) HTML5-DnD -> patch drag (+ retract ohne Drop); Zeiger-Ziehen; Datei-Drop -> Upload-Schritt.
//   8) Tastenkuerzel: Ctrl+S (mit/ohne Feld), Ctrl+C im Feld / Ctrl+Alt+Q (@) / Escape -> nichts.
//   9) DATENSCHUTZ: kein getippter Wert in irgendeiner Nachricht.
//  10) Panel-Merge-Logik (patch/retract/frame-geo, Queue/in-flight/Liste) + Listen-Labels —
//      die ECHTEN Funktionen aus extension/panel.js extrahiert und in Node ausgefuehrt.
//
// Nutzung:  node scripts/test-guide-capture-plus.mjs   (kein .env noetig; Playwright aus
//           dem npx-Cache oder STEPLY_PW_DIR)
import { createRequire } from "node:module";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolvePlaywright() {
  if (process.env.STEPLY_PW_DIR) {
    const p = path.join(process.env.STEPLY_PW_DIR, "node_modules", "playwright");
    if (existsSync(p)) return require(p);
  }
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

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const near = (a, b, eps = 0.0003) => typeof a === "number" && Math.abs(a - b) <= eps;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXT = path.join(__dirname, "..", "extension");
const CONTENT_JS = readFileSync(path.join(EXT, "content.js"), "utf8");
const RESOLVE_JS = readFileSync(path.join(EXT, "guide-resolve.js"), "utf8");
const PANEL_JS = readFileSync(path.join(EXT, "panel.js"), "utf8");

// Getippte Werte — duerfen in KEINER Nachricht auftauchen.
const SECRETS = ["FrameEingabe77", "Hallo Team geheim123", "Zeile eins privat", "Wert12345", "SchattenWert99"];

// chrome-Stub je Frame: sammelt ALLE runtime-Nachrichten.
const STUB = `<script>
  window.__msgs = [];
  window.chrome = {
    runtime: {
      lastError: undefined,
      getManifest: function () { return { version: "2.16.0" }; },
      sendMessage: function (m) { window.__msgs.push(JSON.parse(JSON.stringify(m))); return Promise.resolve(undefined); },
      onMessage: { addListener: function () {} },
    },
    storage: {
      local: { get: function (key, cb) { cb({ rec: { startedAt: Date.now(), mode: "guide", nonce: "testnonce123" } }); } },
      onChanged: { addListener: function () {} },
    },
    tabs: { sendMessage: function () {} },
  };
</script>`;

const FRAME_BTN = `<button id="fb" style="position:absolute;left:30px;top:40px;width:100px;height:20px;margin:0;padding:0;border:0">Frame-Knopf</button>`;

// ---------------------------------------------------------------- Seiten (page.route)
const PAGES = {
  "http://steply.test/frames.html": `<!DOCTYPE html><html><head><meta charset="utf-8">${STUB}</head>
<body style="margin:0;overflow:hidden">
  <iframe id="same" src="/same.html" style="position:absolute;left:50px;top:120px;width:400px;height:300px;border:5px solid #000;padding:10px"></iframe>
  <iframe id="cross" src="http://other.test/cross.html" style="position:absolute;left:500px;top:120px;width:400px;height:300px;border:0"></iframe>
  <iframe id="doc" style="position:absolute;left:50px;top:470px;width:400px;height:200px;border:0"
    srcdoc='${`<!DOCTYPE html><html><head><meta charset="utf-8">${STUB}</head><body style="margin:0">${FRAME_BTN}</body></html>`.replace(/'/g, "&#39;")}'></iframe>
</body></html>`,
  "http://steply.test/same.html": `<!DOCTYPE html><html><head><meta charset="utf-8">${STUB}</head><body style="margin:0">
  ${FRAME_BTN}
  <label for="pw" style="position:absolute;left:0;top:100px">Passwort</label>
  <input id="pw" type="password" style="position:absolute;left:30px;top:120px;width:200px;height:20px;margin:0;padding:0;border:0">
  <form id="f" onsubmit="event.preventDefault()">
    <label for="city" style="position:absolute;left:0;top:160px">Stadt</label>
    <input id="city" name="city" type="text" style="position:absolute;left:60px;top:160px;width:150px;height:20px">
  </form>
  <input id="up" type="file" style="position:absolute;left:30px;top:220px">
</body></html>`,
  "http://other.test/cross.html": `<!DOCTYPE html><html><head><meta charset="utf-8">${STUB}</head><body style="margin:0">
  ${FRAME_BTN}
  <iframe id="nested" src="http://other.test/nested.html" style="position:absolute;left:20px;top:100px;width:300px;height:150px;border:0"></iframe>
</body></html>`,
  "http://other.test/nested.html": `<!DOCTYPE html><html><head><meta charset="utf-8">${STUB}</head><body style="margin:0">${FRAME_BTN}</body></html>`,

  "http://steply.test/main.html": `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">${STUB}
<style>
  body { margin: 0; font: 14px sans-serif; }
  section { padding: 6px; }
  [hidden] { display: none !important; }
  .dz { display: inline-block; width: 160px; height: 40px; border: 1px dashed #999; }
</style></head><body>
  <section>
    <button id="other">Andere Aktion</button>
    <x-outer id="shadowcard"></x-outer>
    <x-form id="shadowform"></x-form>
  </section>
  <section>
    <div id="hovwrap" style="display:inline-block">
      <button id="hovtrig" aria-haspopup="true" aria-expanded="false" aria-controls="hovmenu">Datei</button>
      <ul id="hovmenu" role="menu" hidden style="margin:0">
        <li role="none"><a role="menuitem" href="#" id="exp" onclick="event.preventDefault()">Exportieren</a></li>
      </ul>
    </div>
    <div style="display:inline-block;margin-left:220px">
      <button id="clicktrig" aria-haspopup="menu" aria-expanded="false" aria-controls="clickmenu">Mehr</button>
      <ul id="clickmenu" role="menu" hidden style="margin:0">
        <li role="none"><button role="menuitem" id="del">Löschen</button></li>
      </ul>
    </div>
    <div style="display:inline-block;margin-left:120px">
      <button id="kbtrig" aria-haspopup="true" aria-expanded="false" aria-controls="kbmenu">Ansicht</button>
      <ul id="kbmenu" role="menu" hidden style="margin:0">
        <li role="none"><a role="menuitem" href="#" id="zoom" onclick="event.preventDefault()">Zoom</a></li>
      </ul>
    </div>
  </section>
  <section>
    <div id="chat" contenteditable="true" aria-label="Nachricht" style="width:300px;min-height:20px;border:1px solid #999"></div>
    <div id="editor" contenteditable="true" aria-label="Notiz" style="width:300px;min-height:20px;border:1px solid #999"></div>
  </section>
  <section>
    <button id="dbl">Öffnen</button>
    <div id="ctx" role="button" tabindex="0" style="display:inline-block">Beleg.pdf</div>
    <div id="ctxmenu" hidden>Eigenes Menü</div>
    <button id="noctx">Normal</button>
  </section>
  <section>
    <div id="card1" draggable="true" style="display:inline-block;width:120px">Karte A</div>
    <div id="card2" draggable="true" style="display:inline-block;width:120px">Karte B</div>
    <ul id="col2" aria-label="Erledigt" style="display:inline-block;width:160px;height:40px;border:1px solid #999;margin:0"><li>leer</li></ul>
    <div id="nodrop" style="display:inline-block;width:160px;height:40px;border:1px solid #ccc">kein Ziel</div>
  </section>
  <section style="height:60px;position:relative">
    <button id="sortA" style="position:absolute;left:10px;top:5px;cursor:grab">Zeile A</button>
    <button id="plainA" style="position:absolute;left:10px;top:35px">Nur Knopf</button>
    <button id="sortB" style="position:absolute;left:300px;top:5px">Zeile B</button>
    <button id="sortC" style="position:absolute;left:300px;top:35px">Zeile C</button>
  </section>
  <section>
    <div id="dropzone" class="dz" aria-label="Belege ablegen" tabindex="0">Hierher ziehen</div>
    <label for="fld">Betrag</label><input id="fld" type="text">
  </section>
<script>
  customElements.define("x-inner", class extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: "open" }).innerHTML =
      '<button id="ib" style="padding:4px 10px"><slot></slot></button>'; }
  });
  customElements.define("x-outer", class extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: "open" }).innerHTML =
      '<div><x-inner>Speichern im Schatten</x-inner></div><div><x-inner>Abbrechen</x-inner></div>'; }
  });
  customElements.define("x-form", class extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: "open" }).innerHTML =
      '<label for="sf">Kennzeichen</label><input id="sf" type="text">' +
      '<label for="ss">Land</label><select id="ss"><option>DE</option><option>AT</option></select>'; }
  });
  // Hover-Menue: oeffnet per mouseenter, schliesst per mouseleave.
  const hw = document.getElementById("hovwrap"), ht = document.getElementById("hovtrig"), hm = document.getElementById("hovmenu");
  hw.addEventListener("mouseenter", () => { hm.hidden = false; ht.setAttribute("aria-expanded", "true"); });
  hw.addEventListener("mouseleave", () => { hm.hidden = true; ht.setAttribute("aria-expanded", "false"); });
  // Klick-Menue
  const ct = document.getElementById("clicktrig"), cm = document.getElementById("clickmenu");
  ct.addEventListener("click", () => { const o = cm.hidden; cm.hidden = !o; ct.setAttribute("aria-expanded", o ? "true" : "false"); });
  // Chat: Enter schickt ab (Feld leert sich), Editor: Enter = Zeilenumbruch (Browser-Standard).
  document.getElementById("chat").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const c = e.currentTarget; setTimeout(() => { c.innerHTML = ""; }, 30); }
  });
  // Eigenes Kontextmenue
  document.getElementById("ctx").addEventListener("contextmenu", (e) => { e.preventDefault(); document.getElementById("ctxmenu").hidden = false; });
  // DnD-Ziel
  const col = document.getElementById("col2");
  col.addEventListener("dragover", (e) => e.preventDefault());
  col.addEventListener("drop", (e) => { e.preventDefault(); col.textContent = "abgelegt"; });
  const dz = document.getElementById("dropzone");
  dz.addEventListener("dragover", (e) => e.preventDefault());
  dz.addEventListener("drop", (e) => e.preventDefault());
</script>
</body></html>`,
};

let browser;
try {
  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await ctx.route(/^http:\/\/(steply|other)\.test\//, (route) => {
    const u = route.request().url().split(/[?#]/)[0];
    const body = PAGES[u];
    if (!body) return route.fulfill({ status: 404, body: "nope" });
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
  });
  const page = await ctx.newPage();

  // Content-Script in JEDEN Frame (wie all_frames + match_about_blank); guide-resolve zuerst.
  const inject = async () => {
    for (const fr of page.frames()) {
      await fr.addScriptTag({ content: RESOLVE_JS });
      await fr.addScriptTag({ content: CONTENT_JS });
    }
  };
  const frameBy = (pred) => page.frames().find(pred);
  const msgsOf = (fr) => fr.evaluate(() => window.__msgs.slice());
  const allMsgs = async () => {
    const out = [];
    for (const fr of page.frames()) out.push(...(await fr.evaluate(() => window.__msgs || [])));
    return out;
  };
  const resetAll = async () => {
    for (const fr of page.frames()) await fr.evaluate(() => { if (window.__msgs) window.__msgs.length = 0; });
  };
  const privacyCheck = async (label) => {
    const raw = JSON.stringify(await allMsgs());
    const leaked = SECRETS.filter((s) => raw.includes(s));
    ok(leaked.length === 0, `DATENSCHUTZ (${label}): kein getippter Wert in irgendeiner Nachricht${leaked.length ? " — GELEAKT: " + leaked.join(",") : ""}`);
  };

  // =====================================================================================
  // 1) iframes
  // =====================================================================================
  await page.goto("http://steply.test/frames.html", { waitUntil: "load" });
  await sleep(200);
  ok(page.frames().length === 5, `iframes: 5 Frames geladen (Haupt, same, cross, nested, srcdoc) (war ${page.frames().length})`);
  await inject();
  const top = page.mainFrame();
  const fSame = frameBy((f) => f.url() === "http://steply.test/same.html");
  const fCross = frameBy((f) => f.url() === "http://other.test/cross.html");
  const fNested = frameBy((f) => f.url() === "http://other.test/nested.html");
  const fDoc = frameBy((f) => f.url() === "about:srcdoc");

  async function frameCase(name, fr, expUrl, expX, expY) {
    await resetAll();
    await fr.click("#fb");
    await sleep(150);
    const own = await msgsOf(fr);
    const steps = own.filter((m) => m.type === "steply-guide-step");
    ok(steps.length === 1, `${name}: genau 1 Schritt im iframe (${steps.length})`);
    const s = steps[0] && steps[0].step;
    ok(s && s.label === "Frame-Knopf" && s.action === "click", `${name}: Label/Aktion (${s && s.label}/${s && s.action})`);
    ok(s && s.interaction && s.interaction.frame && s.interaction.frame.url === expUrl,
      `${name}: interaction.frame.url = ${expUrl} (war ${JSON.stringify(s && s.interaction)})`);
    ok(s && typeof s.frameKey === "string" && /^[a-z0-9]{8,40}$/.test(s.frameKey), `${name}: frameKey gesetzt`);
    ok(s && s.rect.x === 0 && s.rect.y === 0 && s.rect.w === 0 && s.rect.h === 0, `${name}: rect im Schritt vorerst leer (iframe-relativ waere falsch)`);
    const geos = (await msgsOf(top)).filter((m) => m.type === "steply-frame-geo");
    ok(geos.length === 1 && s && geos[0].key === s.frameKey, `${name}: Hauptfenster meldet steply-frame-geo mit passendem key (${geos.length})`);
    const g = geos[0] && geos[0].rect;
    ok(g && near(g.x, expX) && near(g.y, expY) && near(g.w, 0.1) && near(g.h, 0.025),
      `${name}: Geo-rect korrekt verschoben (erwartet x=${expX} y=${expY} w=0.1 h=0.025, war ${JSON.stringify(g)})`);
    return { step: s, geo: geos[0] };
  }

  // same: iframe (50,120) + Rand 5 + Padding 10 -> Inhalt ab (65,135); Knopf (30,40) -> (95,175)
  const rSame = await frameCase("iframe gleiche Herkunft", fSame, "http://steply.test/same.html", 0.095, 175 / 800);
  const sens = rSame.geo && rSame.geo.sensitive;
  // Passwortfeld im iframe (30,120) 200x20 -> (95,255)
  ok(Array.isArray(sens) && sens.some((r) => near(r.x, 0.095) && near(r.y, 255 / 800) && near(r.w, 0.2) && near(r.h, 0.025)),
    `iframe: sensibles Passwortfeld auf Hauptfenster umgerechnet (${JSON.stringify(sens)})`);
  ok(!("sensitive" in (rSame.step || {})), "iframe: Schritt selbst traegt KEINE (iframe-relativen) sensitive-Rechtecke");
  // cross-origin (500,120), Knopf (30,40) -> (530,160)
  await frameCase("iframe cross-origin", fCross, "http://other.test/cross.html", 0.53, 0.2);
  // verschachtelt: cross (500,120) + nested (20,100) + Knopf (30,40) -> (550,260)
  await frameCase("iframe verschachtelt (cross-origin in cross-origin)", fNested, "http://other.test/nested.html", 0.55, 260 / 800);
  // srcdoc (50,470) + Knopf (30,40) -> (80,510)
  await frameCase("iframe srcdoc", fDoc, "about:srcdoc", 0.08, 510 / 800);

  // Enter + Upload im iframe
  await resetAll();
  await fSame.click("#city");
  await fSame.type("#city", "FrameEingabe77");
  await fSame.press("#city", "Enter");
  await sleep(100);
  {
    const steps = (await msgsOf(fSame)).filter((m) => m.type === "steply-guide-step").map((m) => m.step);
    ok(steps.length === 1 && steps[0].action === "type" && steps[0].interaction && steps[0].interaction.enter === true &&
      steps[0].interaction.frame && steps[0].label === "Stadt",
      `iframe: Eingabe + Enter -> type-Schritt mit enter + frame (${JSON.stringify(steps.map((s) => [s.action, s.label, s.interaction]))})`);
    const geos = (await msgsOf(top)).filter((m) => m.type === "steply-frame-geo");
    ok(geos.length === 1 && steps[0] && geos[0].key === steps[0].frameKey, "iframe: Geo auch fuer den Eingabe-Schritt");
  }
  await resetAll();
  await fSame.setInputFiles("#up", { name: "rechnung.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
  await sleep(100);
  {
    const steps = (await msgsOf(fSame)).filter((m) => m.type === "steply-guide-step").map((m) => m.step);
    const up = steps.find((s) => s.fileMeta);
    ok(up && up.fileMeta.role === "upload" && up.fileMeta.filename === "rechnung.pdf" && up.interaction && up.interaction.frame && up.frameKey,
      `iframe: Datei-Upload -> Upload-Schritt mit frame (${JSON.stringify(up && { fm: up.fileMeta, i: up.interaction })})`);
  }
  // Geo-Faelschung: Nachricht vom Hauptfenster selbst / Muell-Zahlen -> verworfen
  await resetAll();
  await top.evaluate(() => {
    window.postMessage({ __steplyFrameGeo: 1, key: "abcdefgh12345678", rect: { left: 1, top: 1, width: 1, height: 1 }, sensitive: [] }, "*");
  });
  await fSame.evaluate(() => {
    window.parent.postMessage({ __steplyFrameGeo: 1, key: "abcdefgh12345678", rect: { left: "x", top: 1, width: 1, height: 1 } }, "*");
    window.parent.postMessage({ __steplyFrameGeo: 1, key: "<b>bad</b>", rect: { left: 1, top: 1, width: 1, height: 1 } }, "*");
  });
  await sleep(100);
  ok((await msgsOf(top)).filter((m) => m.type === "steply-frame-geo").length === 0,
    "iframe-Sicherheit: Geo von sich selbst / mit ungueltigen Zahlen / ungueltigem key -> verworfen");
  await privacyCheck("iframes");

  // =====================================================================================
  // 2)–8) Hauptseite
  // =====================================================================================
  await page.goto("http://steply.test/main.html", { waitUntil: "load" });
  await inject();
  const main = page.mainFrame();
  const steps = async () => (await msgsOf(main)).filter((m) => m.type === "steply-guide-step").map((m) => m.step);
  const ofType = async (t) => (await msgsOf(main)).filter((m) => m.type === t);
  const reset = () => resetAll();

  // ---------- 2) Shadow DOM ----------
  await reset();
  await page.getByRole("button", { name: "Speichern im Schatten" }).click();
  await sleep(50);
  {
    const s = (await steps())[0];
    ok(s && s.label === "Speichern im Schatten", `Shadow: Label aus Slot-Text (war „${s && s.label}")`);
    ok(s && s.selector && Array.isArray(s.selector.shadow) && s.selector.shadow.length === 2,
      `Shadow: selector.shadow = Host-Kette (2 Ebenen) (${JSON.stringify(s && s.selector)})`);
    ok(s && s.selector.shadow[0] === "#shadowcard" && s.selector.css === "#ib" && s.selector.role === "button",
      `Shadow: Host-Pfad aussen + css relativ zum innersten Root (${JSON.stringify(s && s.selector)})`);
    const found = await main.evaluate((sel) => {
      const r = globalThis.SteplyGuideResolve.resolveSelector(document, sel);
      const want = document.getElementById("shadowcard").shadowRoot.querySelector("x-inner").shadowRoot.getElementById("ib");
      return { same: r.el === want, conf: r.confidence };
    }, s && s.selector);
    ok(found.same && found.conf === "exact", `Shadow: guide-resolve findet den Button ueber selector.shadow wieder (${JSON.stringify(found)})`);
    const fb = await main.evaluate(() => {
      const r = globalThis.SteplyGuideResolve.resolveSelector(document, { text: "Abbrechen", role: "button" });
      const want = document.getElementById("shadowcard").shadowRoot.querySelectorAll("x-inner")[1].shadowRoot.getElementById("ib");
      const miss = globalThis.SteplyGuideResolve.resolveSelector(document, { css: "#ib", text: "Gibtsnicht", shadow: ["#nope"] });
      return { same: r.el === want, conf: r.confidence, miss: miss.el === null };
    });
    ok(fb.same && fb.conf === "text", `Shadow: Text-Fallback sucht in offenen Shadow-Roots (${JSON.stringify(fb)})`);
    ok(fb.miss, "Shadow: fehlender Host + unbekannter Text -> kein Treffer (kein Falsch-Positiv)");
  }
  // Eingabe + Auswahl im Shadow-Root (focusin/focusout ueber composedPath, change am Root)
  await reset();
  const sf = page.locator("x-form #sf");
  await sf.click();
  await sf.type("SchattenWert99");
  // Fokuswechsel INNERHALB desselben Shadow-Roots (erreicht document nie) -> Root-Listener.
  await page.locator("x-form #ss").focus();
  await page.locator("x-form #ss").selectOption("AT");
  await sleep(50);
  {
    const st = await steps();
    const typed = st.find((s) => s.action === "type" && s.label === "Kennzeichen");
    const sel = st.find((s) => s.action === "type" && s.label !== "Kennzeichen");
    ok(typed && typed.selector && typed.selector.shadow && typed.selector.shadow[0] === "#shadowform" && typed.selector.css === "#sf",
      `Shadow: Eingabe-Schritt mit Label „Kennzeichen" + shadow-Selektor (${JSON.stringify(st.map((s) => [s.action, s.label, s.selector]))})`);
    ok(!!sel, `Shadow: <select>-change im Shadow-Root erzeugt Schritt (${JSON.stringify(st.map((s) => s.label))})`);
  }
  await page.click("#other");

  // ---------- 3) Hover-Menue ----------
  await reset();
  await page.hover("#hovtrig");
  await sleep(80);
  await page.click("#exp");
  await sleep(50);
  {
    const s = (await steps()).find((x) => x.label === "Exportieren");
    ok(s && s.interaction && s.interaction.hover && s.interaction.hover.css === "#hovtrig" && s.interaction.hoverLabel === "Datei",
      `Hover-Menue: Schritt traegt hover=#hovtrig + hoverLabel „Datei" (${JSON.stringify(s && s.interaction)})`);
  }
  await page.mouse.move(900, 780);
  await sleep(50);
  await reset();
  await page.click("#clicktrig");
  await sleep(50);
  await page.click("#del");
  await sleep(50);
  {
    const st = await steps();
    const d = st.find((x) => x.label === "Löschen");
    ok(st.length === 2 && d && !(d.interaction && d.interaction.hover),
      `Klick-Menue: Eintrag OHNE hover (per Klick geoeffnet) (${JSON.stringify(st.map((s) => [s.label, s.interaction]))})`);
  }
  // Per Tastatur/Skript geoeffnetes ARIA-Menue: Maus war NIE ueber dem Ausloeser -> kein hover
  await main.evaluate(() => { document.getElementById("kbmenu").hidden = false; document.getElementById("kbtrig").setAttribute("aria-expanded", "true"); });
  await reset();
  await page.click("#zoom");
  await sleep(50);
  {
    const s = (await steps()).find((x) => x.label === "Zoom");
    ok(s && !(s.interaction && s.interaction.hover), `Tastatur-geoeffnetes Menue (Maus nie ueber Ausloeser) -> KEIN hover (${JSON.stringify(s && s.interaction)})`);
  }

  // ---------- 4) contenteditable: Chat vs. Editor ----------
  await reset();
  await page.click("#chat");
  await page.keyboard.type("Hallo Team geheim123");
  await page.keyboard.press("Enter");
  await sleep(600);
  {
    const st = await steps();
    const rt = await ofType("steply-guide-retract");
    ok(st.length === 1 && st[0].action === "type" && st[0].interaction && st[0].interaction.enter === true && st[0].label === "Nachricht",
      `Chat: Enter -> type-Schritt mit enter (${JSON.stringify(st.map((s) => [s.action, s.label, s.interaction]))})`);
    ok(rt.length === 0, `Chat: Feld leerte sich -> KEIN retract (${rt.length})`);
  }
  await reset();
  await page.click("#editor");
  await page.keyboard.type("Zeile eins privat");
  await page.keyboard.press("Enter");
  await sleep(600);
  {
    const st = await steps();
    const rt = await ofType("steply-guide-retract");
    ok(st.length === 1 && st[0].interaction && st[0].interaction.enter === true, "Editor: Enter -> Schritt sofort gesendet (Screenshot mit Text)");
    ok(rt.length === 1 && st[0] && rt[0].ts === st[0].ts, `Editor: Zeilenumbruch -> retract mit passendem ts (${JSON.stringify(rt)})`);
  }
  await page.keyboard.type("zwei");
  await page.click("#other");
  await sleep(50);
  {
    const st = await steps();
    const t2 = st.filter((s) => s.action === "type");
    ok(t2.length === 2 && !(t2[1].interaction && t2[1].interaction.enter) && t2[1].label === "Notiz",
      `Editor: spaeteres Verlassen -> normaler Eingabe-Schritt ohne enter (${JSON.stringify(st.map((s) => [s.action, s.label, s.interaction]))})`);
  }
  // Chat bleibt „scharf": zweite Nachricht wird wieder erfasst
  await reset();
  await page.click("#chat");
  await page.keyboard.type("noch was");
  await page.keyboard.press("Enter");
  await sleep(500);
  ok((await steps()).filter((s) => s.action === "type").length === 1, "Chat: zweite Nachricht wird ebenfalls erfasst");
  await page.click("#other");

  // ---------- 5) Doppelklick ----------
  await reset();
  await sleep(600);
  await page.dblclick("#dbl");
  await sleep(50);
  {
    const st = (await steps()).filter((s) => s.label === "Öffnen");
    const pa = await ofType("steply-guide-patch");
    ok(st.length === 1, `Doppelklick: genau 1 Schritt (${st.length})`);
    ok(pa.length === 1 && st[0] && pa[0].ts === st[0].ts && pa[0].interaction && pa[0].interaction.variant === "double",
      `Doppelklick: patch {variant:"double"} auf den ersten Schritt (${JSON.stringify(pa)})`);
  }
  // Zwei getrennte Klicks (>500 ms) bleiben zwei Schritte
  await reset();
  await page.click("#dbl");
  await sleep(650);
  await page.click("#dbl");
  await sleep(30);
  ok((await steps()).length === 2 && (await ofType("steply-guide-patch")).length === 0, "Zwei langsame Klicks -> 2 Schritte, kein patch");

  // ---------- 6) Rechtsklick ----------
  await reset();
  await page.click("#ctx", { button: "right" });
  await sleep(80);
  {
    const st = await steps();
    const rt = await ofType("steply-guide-retract");
    ok(st.length === 1 && st[0].interaction && st[0].interaction.variant === "right" && st[0].label === "Beleg.pdf",
      `Rechtsklick mit eigenem Menue -> Schritt variant right (${JSON.stringify(st.map((s) => [s.label, s.interaction]))})`);
    ok(rt.length === 0, "Rechtsklick mit eigenem Menue -> kein retract");
  }
  await reset();
  await page.click("#noctx", { button: "right" });
  await sleep(80);
  {
    const st = await steps();
    const rt = await ofType("steply-guide-retract");
    ok(st.length === 1 && rt.length === 1 && rt[0].ts === st[0].ts, `Rechtsklick ohne eigenes Menue -> Schritt + retract (${st.length}/${rt.length})`);
  }
  await page.keyboard.press("Escape");

  // ---------- 7) Ziehen & Ablegen ----------
  await reset();
  await page.dragAndDrop("#card1", "#col2");
  await sleep(80);
  {
    const st = await steps();
    const pa = await ofType("steply-guide-patch");
    const rt = await ofType("steply-guide-retract");
    const src = st.find((s) => s.label === "Karte A");
    ok(!!src, `HTML5-DnD: Schritt fuer die Quelle „Karte A" (${JSON.stringify(st.map((s) => s.label))})`);
    ok(pa.length === 1 && src && pa[0].ts === src.ts && pa[0].interaction.variant === "drag" &&
      pa[0].interaction.drop && pa[0].interaction.drop.css === "#col2" && pa[0].interaction.dropLabel === "Erledigt",
      `HTML5-DnD: patch drag mit drop=#col2 + dropLabel „Erledigt" (${JSON.stringify(pa)})`);
    ok(rt.length === 0, "HTML5-DnD: kein retract bei erfolgreichem Ablegen");
  }
  await reset();
  await page.dragAndDrop("#card2", "#nodrop");
  await sleep(80);
  {
    const st = await steps();
    const rt = await ofType("steply-guide-retract");
    const src = st.find((s) => s.label === "Karte B");
    ok(src && rt.length === 1 && rt[0].ts === src.ts && (await ofType("steply-guide-patch")).length === 0,
      `HTML5-DnD ohne Ablegen -> Quell-Schritt wird zurueckgenommen (${JSON.stringify({ st: st.map((s) => s.label), rt })})`);
  }
  // Zeiger-Ziehen (Sortier-Liste, cursor:grab)
  const center = async (sel) => {
    const b = await page.locator(sel).boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const pointerDrag = async (from, to) => {
    const a = await center(from);
    const b = await center(to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    await sleep(50);
  };
  await reset();
  await pointerDrag("#sortA", "#sortB");
  {
    const st = await steps();
    const pa = await ofType("steply-guide-patch");
    const src = st.find((s) => s.label === "Zeile A");
    ok(src && pa.length === 1 && pa[0].ts === src.ts && pa[0].interaction.variant === "drag" && pa[0].interaction.drop.css === "#sortB",
      `Zeiger-Ziehen (cursor:grab) -> patch drag drop=#sortB (${JSON.stringify(pa)})`);
  }
  await reset();
  await pointerDrag("#plainA", "#sortC");
  ok((await ofType("steply-guide-patch")).length === 0, "Zeiger-Bewegung von normalem Knopf (kein Zieh-Griff) -> KEIN drag-patch");
  // Datei aus dem Explorer auf eine Drop-Zone
  await reset();
  await main.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["inhalt"], "beleg.pdf", { type: "application/pdf" }));
    const dz = document.getElementById("dropzone");
    dz.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
  });
  await sleep(30);
  {
    const st = await steps();
    const up = st[0];
    ok(st.length === 1 && up.fileMeta && up.fileMeta.role === "upload" && up.fileMeta.filename === "beleg.pdf" &&
      up.fileMeta.mime === "application/pdf" && !up.foldPrevClick && up.selector && up.selector.css === "#dropzone",
      `Datei-Drop -> Upload-Schritt (Metadaten, ohne foldPrevClick) (${JSON.stringify(up)})`);
    ok(!JSON.stringify(st).includes("inhalt"), "Datei-Drop: KEINE Datei-Bytes im Payload");
  }

  // ---------- 8) Tastenkuerzel ----------
  await page.click("#other");
  await main.evaluate(() => document.activeElement && document.activeElement.blur());
  await reset();
  await page.keyboard.press("Control+s");
  await sleep(30);
  {
    const st = await steps();
    ok(st.length === 1 && st[0].interaction && st[0].interaction.variant === "key" && st[0].interaction.key === "Ctrl+S" &&
      st[0].action === "click" && st[0].label === "Ctrl+S" && st[0].rect.w === 0,
      `Ctrl+S ohne Fokus -> key-Schritt „Ctrl+S", rect leer (${JSON.stringify(st.map((s) => [s.label, s.interaction, s.rect]))})`);
  }
  await reset();
  await page.click("#fld");
  await page.keyboard.type("Wert12345");
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+Alt+q"); // AltGr+Q = @ (deutsche Tastatur)
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await sleep(30);
  {
    const st = await steps();
    // Tab verlaesst das Feld -> genau EIN normaler Eingabe-Schritt, aber KEIN Kuerzel-Schritt.
    ok(st.every((s) => !(s.interaction && s.interaction.variant === "key")),
      `Ctrl+C / Ctrl+A im Feld, Ctrl+Alt+Q (@), Escape, Tab -> KEIN Kuerzel-Schritt (${JSON.stringify(st.map((s) => [s.label, s.interaction]))})`);
  }
  await reset();
  await page.click("#fld");
  await page.keyboard.type("7");
  await page.keyboard.press("Control+Shift+p");
  await sleep(30);
  {
    const st = await steps();
    ok(st.length === 2 && st[0].action === "type" && st[1].interaction && st[1].interaction.key === "Ctrl+Shift+P" &&
      st[1].label === "Betrag" && st[1].rect.w > 0,
      `Kuerzel im Feld: erst Eingabe-Schritt, dann „Ctrl+Shift+P" mit Feld-Rechteck (${JSON.stringify(st.map((s) => [s.action, s.label, s.interaction]))})`);
  }
  await page.click("#other");
  await privacyCheck("Hauptseite");
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
}

// =====================================================================================
// 10) Panel-Merge-Logik (ECHTE Funktionen aus panel.js, in Node ausgefuehrt)
// =====================================================================================
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
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Funktion ${name} nicht gefunden`);
  return src.slice(start, braceSlice(src, src.indexOf(")", start)));
}
function extractConst(src, name) {
  const m = new RegExp(`const ${name} = [^;]+;`).exec(src);
  if (!m) throw new Error(`Konstante ${name} nicht gefunden`);
  return m[0];
}
try {
  const code = [
    extractConst(PANEL_JS, "GUIDE_AMEND_TTL"),
    extractConst(PANEL_JS, "GUIDE_PATCH_KEYS"),
    ...["guideAmendKey", "guideCleanRect", "guideCleanGeo", "guideMergeInteraction", "guideApplyGeo",
      "guideApplyAmend", "guideTakePending", "guideStepLabel"].map((n) => extractFn(PANEL_JS, n)),
    "return { guideApplyAmend, guideTakePending, guideStepLabel, guideCleanGeo };",
  ].join("\n");
  const P = new Function(code)();
  const newPending = () => ({ patch: new Map(), retract: new Map(), geo: new Map() });
  const now = 1_000_000;

  // Liste: patch merged, retract entfernt, geo setzt rect + sensitive
  {
    const steps = [
      { ts: 1, tabId: 7, label: "A", interaction: null, rect: { x: 0, y: 0, w: 0, h: 0 }, frameKey: "abcdefgh1234" },
      { ts: 2, tabId: 7, label: "B", interaction: { hover: { css: "#m" } } },
    ];
    const queue = [];
    const pend = newPending();
    let r = P.guideApplyAmend(steps, queue, pend, { type: "steply-guide-patch", ts: 2, interaction: { variant: "double", evil: 1, frame: { url: "http://x" } } }, 7, now);
    ok(r.changed && steps[1].interaction.variant === "double" && steps[1].interaction.hover.css === "#m" && !("evil" in steps[1].interaction) && !("frame" in steps[1].interaction),
      `Panel: patch merged in Listen-Schritt (nur bekannte Schluessel, frame nie) (${JSON.stringify(steps[1].interaction)})`);
    r = P.guideApplyAmend(steps, queue, pend, { type: "steply-guide-patch", ts: 2, interaction: { variant: "double" } }, 8, now);
    ok(!r.changed && pend.patch.size === 1, "Panel: patch aus ANDEREM Tab trifft den Schritt nicht (wartet nur)");
    r = P.guideApplyAmend(steps, queue, pend, { type: "steply-frame-geo", key: "abcdefgh1234", rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, sensitive: [{ x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, { x: "bad" }] }, 7, now);
    ok(r.changed && steps[0].rect.x === 0.1 && steps[0].rect.w === 0.3 && steps[0].sensitive.length === 1,
      `Panel: frame-geo setzt rect + gueltige sensitive im Listen-Schritt (${JSON.stringify(steps[0])})`);
    r = P.guideApplyAmend(steps, queue, pend, { type: "steply-frame-geo", key: "abcdefgh1234", rect: { x: NaN, y: 0, w: 1, h: 1 } }, 7, now);
    ok(!r.changed && steps[0].rect.x === 0.1, "Panel: frame-geo mit ungueltigen Zahlen verworfen");
    r = P.guideApplyAmend(steps, queue, pend, { type: "steply-frame-geo", key: "abcdefgh1234", rect: { x: 5, y: 0, w: 1, h: 1 } }, 7, now);
    ok(!r.changed && steps[0].rect.x === 0.1, "Panel: frame-geo ausserhalb 0..1 verworfen");
    r = P.guideApplyAmend(steps, queue, pend, { type: "steply-guide-retract", ts: 1 }, 7, now);
    ok(r.removed === steps[0], "Panel: retract liefert den Listen-Schritt zum Entfernen");
  }
  // Queue: patch/geo/retract wirken auf wartende Roh-Schritte
  {
    const queue = [
      { tabId: 3, step: { ts: 10, label: "Q1", frameKey: "zzzzzzzz9999", rect: { x: 0, y: 0, w: 0, h: 0 } } },
      { tabId: 3, step: { ts: 11, label: "Q2" } },
    ];
    const pend = newPending();
    P.guideApplyAmend([], queue, pend, { type: "steply-guide-patch", ts: 10, interaction: { variant: "drag", drop: { css: "#z" }, dropLabel: "Ziel" } }, 3, now);
    P.guideApplyAmend([], queue, pend, { type: "steply-frame-geo", key: "zzzzzzzz9999", rect: { x: 0.2, y: 0.2, w: 0.1, h: 0.1 } }, 3, now);
    ok(queue[0].step.interaction.variant === "drag" && queue[0].step.interaction.drop.css === "#z" && queue[0].step.rect.x === 0.2,
      "Panel: patch + geo auf Schritt in der Queue");
    P.guideApplyAmend([], queue, pend, { type: "steply-guide-retract", ts: 11 }, 3, now);
    ok(queue.length === 1 && queue[0].step.ts === 10, "Panel: retract entfernt Schritt aus der Queue");
  }
  // In-flight (gerade fotografiert): Nachtraege warten und werden beim Aufnehmen eingeloest
  {
    const pend = newPending();
    P.guideApplyAmend([], [], pend, { type: "steply-guide-patch", ts: 20, interaction: { variant: "double" } }, 5, now);
    P.guideApplyAmend([], [], pend, { type: "steply-frame-geo", key: "kkkkkkkk0000", rect: { x: 0.4, y: 0.4, w: 0.1, h: 0.1 } }, 5, now);
    const src = { ts: 20, frameKey: "kkkkkkkk0000", rect: { x: 0, y: 0, w: 0, h: 0 } };
    ok(P.guideTakePending(src, 5, pend, now + 100) === true && src.interaction.variant === "double" && src.rect.x === 0.4,
      "Panel: in-flight patch + geo werden beim Aufnehmen eingemischt (Geo VOR dem Screenshot eingetroffen)");
    ok(pend.patch.size === 0 && pend.geo.size === 0, "Panel: eingeloeste Nachtraege sind verbraucht");
    P.guideApplyAmend([], [], pend, { type: "steply-guide-retract", ts: 21 }, 5, now);
    ok(P.guideTakePending({ ts: 21 }, 5, pend, now + 100) === false, "Panel: in-flight retract -> Schritt wird NICHT aufgenommen");
    ok(P.guideTakePending({ ts: 22 }, 5, pend, now + 100) === true, "Panel: unbetroffener Schritt wird normal aufgenommen");
    P.guideApplyAmend([], [], pend, { type: "steply-guide-retract", ts: 23 }, 5, now);
    P.guideApplyAmend([], [], pend, { type: "steply-guide-patch", ts: 99, interaction: { variant: "right" } }, 5, now + 20000);
    ok(pend.retract.size === 0, "Panel: abgelaufene Nachtraege (TTL) werden aufgeraeumt");
  }
  // Listen-Labels
  {
    const L = P.guideStepLabel;
    ok(L({ label: "Beleg.pdf", interaction: { variant: "right" } }, 0) === "Rechtsklick: Beleg.pdf", "Label: Rechtsklick");
    ok(L({ label: "Öffnen", interaction: { variant: "double" } }, 0) === "Doppelklick: Öffnen", "Label: Doppelklick");
    ok(L({ label: "Karte A", interaction: { variant: "drag", dropLabel: "Erledigt" } }, 0) === "Ziehen: Karte A → Erledigt", "Label: Ziehen X → Y");
    ok(L({ label: "Ctrl+S", interaction: { variant: "key", key: "Ctrl+S" } }, 0) === "Taste: Ctrl+S", "Label: Taste");
    ok(L({ label: "Betrag", interaction: { variant: "key", key: "Ctrl+S" } }, 0) === "Taste: Ctrl+S · Betrag", "Label: Taste im Feld");
    ok(L({ label: "Suche", action: "type", interaction: { enter: true } }, 0) === "Suche ↵", "Label: Enter ↵");
    ok(L({ label: "Exportieren", interaction: { hover: { css: "#d" }, hoverLabel: "Datei" } }, 0) === "Datei › Exportieren", "Label: Hover-Menue");
    ok(L({ label: "Weiter" }, 0) === "Weiter" && L({ label: "", action: "type" }, 0) === "Eingabe", "Label: ohne interaction unveraendert");
  }
} catch (e) {
  ok(false, "Panel-Teil Fehler: " + (e && e.stack ? e.stack : e));
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Erfassung 48b (iframes, Shadow DOM, Hover, Chat-Enter, Doppel-/Rechtsklick, Ziehen, Kuerzel) verifiziert.");
process.exit(failed ? 1 : 0);
