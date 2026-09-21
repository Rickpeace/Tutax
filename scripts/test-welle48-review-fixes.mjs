// Welle 48 — Korrekturen aus der unabhaengigen Pruefung: BROWSER-BEWEIS ohne Server/Datenbank.
//
// Laedt die ausgelieferte extension/guide-resolve.js + extension/content.js per addInitScript in
// JEDEN Frame (wie all_frames/document_start) einer echten Chromium-Seite; Seiten + iframes kommen
// per page.route (eine Herkunft, damit gleichartige Geschwister-Frames wie Kartenfelder entstehen).
//
// BEWEISE (Abspielen, steply-exec-step / steply-eval-condition):
//   B2  Zwei gleichartige iframes (gleicher Pfad, andere Query): Schritt mit frame.nth=1 klickt NUR
//       im zweiten; genau EIN Ergebnis.
//   S2  fill+Enter schickt nur ab, wo ein echtes Enter es taete: Formular mit 2 Feldern + nur
//       type=button → KEIN Absenden; ein Feld ohne Knopf → Absenden; Submit-Knopf → Absenden.
//   S5  Tastenkuerzel ohne Ziel-Element (kein Selektor) wird ausgefuehrt.
//   S4  Bedingung eines iframe-Schritts beantwortet NUR der passende Frame (nicht das Hauptfenster).
// BEWEISE (Aufnahme):
//   S1  Strg+Z auf deutscher Tastatur (key „z", code „KeyY") wird als „Ctrl+Z" erfasst.
//   K1  Zwei Suchen hintereinander im selben Feld (Enter, weitertippen, Enter) → ZWEI Schritte.
//   K3  Per Klick geoeffnetes Mehrfach-Dropdown: Auswahl-Klicks bekommen KEIN hover.
//   S3  iframe-Klick: Die einbettende Seite sieht per window-message KEINE Geometrie; ein von der
//       Seite untergeschobener Port (falsches Geheimnis) bekommt nichts; das Panel bekommt die Geo.
//
// Nutzung:  node scripts/test-welle48-review-fixes.mjs   (STEPLY_PW_DIR = Ordner mit node_modules/playwright)
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
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
const ORIGIN = "https://shop.test";

// chrome-Stub je Frame. REC=true → Aufnahme laeuft (mit Geheimnis), sonst passiv (Abspielen).
const stub = (rec) => `(() => {
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
      local: { get: function (key, cb) { cb(${rec ? '{ rec: { startedAt: Date.now(), mode: "guide", nonce: "echtesgeheimnis42" } }' : "{}"}); } },
      onChanged: { addListener: function () {} },
    },
  };
  window.__deliver = function (msg) {
    const out = { responded: false, response: null };
    for (const fn of window.__listeners) {
      try {
        fn(msg, { id: "steply-test" }, function (resp) { out.responded = true; out.response = resp; });
      } catch (e) { out.error = String(e); }
    }
    window.__lastDeliver = out;
    return true;
  };
})();`;

const FRAME_HTML = `<!doctype html><html><body>
  <button id="b" onclick="window.__pageLog.push({ev:'click', q: location.search})">Feld</button>
  <div id="cookie">Cookie-Hinweis</div>
</body></html>`;

const EXEC_TOP = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Shop</title></head><body>
  <iframe id="fa" src="/w.html?f=a" style="width:200px;height:60px"></iframe>
  <iframe id="fb" src="/w.html?f=b" style="width:200px;height:60px"></iframe>
  <form id="two"><label for="t1">Vorname</label><input id="t1" type="text"><label for="t2">Name</label><input id="t2" type="text"><button type="button">Speichern</button></form>
  <form id="one"><label for="o1">Suche</label><input id="o1" type="text"></form>
  <form id="btn"><label for="s1">Ort</label><input id="s1" type="text"><input id="s2" type="text"><button id="go">Los</button></form>
  <script>
    document.addEventListener("submit", (e) => { e.preventDefault(); window.__pageLog.push({ ev: "submit", form: e.target.id }); });
    document.addEventListener("keydown", (e) => { if (e.ctrlKey && (e.key === "s" || e.key === "S")) window.__pageLog.push({ ev: "save" }); });
  </script>
</body></html>`;

const REC_TOP = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Portal</title></head><body style="font:14px sans-serif">
  <form id="sf" role="search"><label for="sq">Filter</label><input id="sq" type="text"></form>
  <button id="ms" aria-haspopup="listbox" aria-expanded="false">Filter wählen</button>
  <ul id="opts" role="listbox" hidden>
    <li><button id="alpha" role="option">Alpha</button></li>
    <li><button id="beta" role="option">Beta</button></li>
  </ul>
  <p>Text</p>
  <iframe id="fr" src="/w.html?f=r" style="margin-left:50px;width:220px;height:80px;border:5px solid #999"></iframe>
  <script>
    document.addEventListener("submit", (e) => e.preventDefault());
    const ms = document.getElementById("ms");
    ms.addEventListener("click", () => { const o = document.getElementById("opts"); o.hidden = !o.hidden; ms.setAttribute("aria-expanded", String(!o.hidden)); });
    // Neugierige einbettende Seite: protokolliert ALLE window-Nachrichten.
    window.__seen = [];
    window.addEventListener("message", (e) => { try { window.__seen.push(JSON.stringify(e.data)); } catch (x) { window.__seen.push("?"); } });
  </script>
</body></html>`;

async function newPage(browser, rec, topHtml) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await page.addInitScript(stub(rec));
  await page.addInitScript(RESOLVER_JS);
  await page.addInitScript(CONTENT_JS);
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    const body = u.pathname === "/w.html" ? FRAME_HTML : topHtml;
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
  });
  await page.goto(ORIGIN + "/start");
  await page.waitForLoadState("load");
  await sleep(200);
  return page;
}
const frameByQ = (page, q) => page.frames().find((f) => f.url().endsWith("/w.html?f=" + q));
const deliverAll = (page, msg) =>
  Promise.all(page.frames().map((f) => f.evaluate((m) => window.__deliver(m), msg).catch(() => false)));
const results = (page, token) =>
  Promise.all(
    page.frames().map((f) =>
      f.evaluate((t) => window.__sent.filter((m) => m.type === "steply-exec-result" && m.token === t), token).catch(() => [])
    )
  ).then((a) => a.flat());

let browser;
try {
  browser = await chromium.launch({ headless: true });

  // ===================== ABSPIELEN =====================
  {
    const page = await newPage(browser, false, EXEC_TOP);
    const fa = frameByQ(page, "a");
    const fb = frameByQ(page, "b");
    ok(!!fa && !!fb, "Vorbedingung: zwei gleichartige iframes geladen");

    // B2: nth=1 → nur der zweite iframe klickt.
    await deliverAll(page, {
      type: "steply-exec-step",
      token: "t-b2",
      step: { selector: { css: "#b" }, action: "click", index: 0, total: 1, interaction: { frame: { url: ORIGIN + "/w.html", nth: 1 } } },
    });
    await sleep(2500);
    const ca = await fa.evaluate(() => window.__pageLog.filter((e) => e.ev === "click").length);
    const cb = await fb.evaluate(() => window.__pageLog.filter((e) => e.ev === "click").length);
    const rb2 = await results(page, "t-b2");
    ok(ca === 0 && cb === 1, `B2: nur der iframe mit nth=1 klickt (a=${ca}, b=${cb})`);
    ok(rb2.length === 1 && rb2[0].ok, `B2: genau EIN Ergebnis, ok (${JSON.stringify(rb2)})`);

    // S2: Enter nur dort abschicken, wo ein echtes Enter es taete.
    const fillEnter = async (token, css) => {
      await deliverAll(page, {
        type: "steply-exec-step",
        token,
        step: { selector: { css }, action: "fill", value: "x", index: 0, total: 1, interaction: { enter: true } },
      });
      await sleep(2800);
    };
    const submits = () => page.evaluate(() => window.__pageLog.filter((e) => e.ev === "submit").map((e) => e.form));
    await fillEnter("t-two", "#t1");
    ok(!(await submits()).includes("two"), `S2: 2 Felder + nur type=button → KEIN Absenden (${JSON.stringify(await submits())})`);
    await fillEnter("t-one", "#o1");
    ok((await submits()).includes("one"), `S2: ein Feld ohne Knopf → Absenden (${JSON.stringify(await submits())})`);
    await fillEnter("t-btn", "#s1");
    ok((await submits()).includes("btn"), `S2: Submit-Knopf vorhanden → Absenden (${JSON.stringify(await submits())})`);
    const rTwo = await results(page, "t-two");
    ok(rTwo.length === 1 && rTwo[0].ok, "S2: Schritt selbst gilt trotzdem als ausgefuehrt");

    // S5: Kuerzel ohne Selektor.
    await deliverAll(page, {
      type: "steply-exec-step",
      token: "t-key",
      step: { selector: null, action: "click", index: 0, total: 1, interaction: { variant: "key", key: "Ctrl+S" } },
    });
    await sleep(300);
    const saves = await page.evaluate(() => window.__pageLog.filter((e) => e.ev === "save").length);
    const rKey = await results(page, "t-key");
    ok(saves === 1 && rKey.length === 1 && rKey[0].ok, `S5: Strg+S ohne Ziel ausgefuehrt (saves=${saves}, ${JSON.stringify(rKey)})`);

    // S4: Bedingung eines iframe-Schritts → nur der passende Frame antwortet.
    const cond = { kind: "element", selector: { css: "#cookie" } };
    const answers = [];
    for (const f of page.frames()) {
      await f.evaluate((m) => window.__deliver(m), { type: "steply-eval-condition", cond, frame: { url: ORIGIN + "/w.html", nth: 0 } });
      await sleep(600);
      const d = await f.evaluate(() => window.__lastDeliver);
      answers.push({ url: f.url(), responded: d.responded, met: d.response && d.response.met });
    }
    const who = answers.filter((a) => a.responded);
    ok(who.length === 1 && who[0].url.endsWith("f=a") && who[0].met === true,
      `S4: nur der passende iframe beantwortet die Bedingung (${JSON.stringify(answers)})`);
    await page.close();
  }

  // ===================== AUFNAHME =====================
  {
    const page = await newPage(browser, true, REC_TOP);
    const steps = () => page.evaluate(() => window.__sent.filter((m) => m.type === "steply-guide-step").map((m) => m.step));
    const clear = () => page.evaluate(() => { window.__sent.length = 0; });

    // S1: deutsche Tastatur — Taste „Z" hat code KeyY.
    await page.evaluate(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "z", code: "KeyY", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await sleep(100);
    {
      const s = (await steps()).filter((x) => x.interaction && x.interaction.variant === "key");
      ok(s.length === 1 && s[0].interaction.key === "Ctrl+Z", `S1: Strg+Z auf QWERTZ → „Ctrl+Z" (${JSON.stringify(s.map((x) => x.interaction))})`);
    }

    // K1: zwei Suchen hintereinander im selben Feld.
    await clear();
    await page.click("#sq");
    await page.keyboard.type("abc");
    await page.keyboard.press("Enter");
    await page.keyboard.type("def");
    await page.keyboard.press("Enter");
    await sleep(100);
    {
      const s = (await steps()).filter((x) => x.action === "type");
      ok(s.length === 2 && s.every((x) => x.interaction && x.interaction.enter), `K1: zwei Enter → zwei Eingabe-Schritte (${s.length})`);
    }

    // K3: per Klick geoeffnetes Mehrfach-Dropdown → kein hover an den Auswahl-Klicks.
    await clear();
    await page.click("#ms");
    await page.hover("#ms");
    await page.click("#alpha");
    await page.hover("#ms");
    await page.click("#beta");
    await sleep(700);
    {
      const s = (await steps()).filter((x) => x.action === "click");
      const withHover = s.filter((x) => x.interaction && x.interaction.hover);
      ok(s.length >= 3 && withHover.length === 0, `K3: kein hover im per Klick geoeffneten Dropdown (${JSON.stringify(s.map((x) => [x.label, x.interaction]))})`);
    }

    // S3: Geo-Kanal privat + untergeschobener Port bekommt nichts.
    await clear();
    const fr = frameByQ(page, "r");
    ok(!!fr, "Vorbedingung: Aufnahme-iframe geladen");
    await page.evaluate(() => {
      window.__stolen = [];
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => window.__stolen.push(e.data);
      document.getElementById("fr").contentWindow.postMessage({ __steplyGeoPort: 1, nonce: "geraten" }, "*", [ch.port2]);
      window.__seen.length = 0;
    });
    await sleep(100);
    await fr.locator("#b").click();
    await sleep(800);
    {
      const frameSteps = await fr.evaluate(() => window.__sent.filter((m) => m.type === "steply-guide-step").map((m) => m.step));
      const geo = await page.evaluate(() => window.__sent.filter((m) => m.type === "steply-frame-geo"));
      const seen = await page.evaluate(() => window.__seen);
      const stolen = await page.evaluate(() => window.__stolen);
      ok(frameSteps.length === 1 && frameSteps[0].interaction && frameSteps[0].interaction.frame.nth === 0,
        `S3: iframe-Schritt erfasst, mit frame.nth (${JSON.stringify(frameSteps.map((s) => s.interaction))})`);
      ok(geo.length === 1 && geo[0].key === frameSteps[0].frameKey && geo[0].rect.w > 0,
        `S3: Panel bekommt die Geometrie über den privaten Kanal (${JSON.stringify(geo)})`);
      ok(!seen.some((s) => /rect|frameKey|"key"|sensitive/.test(s)),
        `S3: einbettende Seite sieht KEINE Geometrie per window-message (${JSON.stringify(seen)})`);
      ok(stolen.length === 0, `S3: untergeschobener Port (falsches Geheimnis) bekommt nichts (${JSON.stringify(stolen)})`);
    }
    await page.close();
  }
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Welle-48-Korrekturen (Pruefbericht) verifiziert.");
process.exit(failed ? 1 : 0);
