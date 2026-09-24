// Runde 4 (Richards Wahl 24.09.): Klicks in Cookie-/Einwilligungs-Bannern werden bei der Aufnahme
// automatisch „nur wenn vorhanden“ (condition) — normale Knöpfe nicht. Außerdem: Kontrollkästchen
// melden ihren Zustand nach dem Klick (interaction.checked). Echte extension/content.js, headless.
// Nutzung:  node scripts/test-consent-capture.mjs   (kein .env nötig)
import { createRequire } from "node:module";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function resolvePlaywright() {
  try {
    return require("playwright");
  } catch {
    /* npx-Cache */
  }
  const base = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
  const npxDir = path.join(base, "npm-cache", "_npx");
  for (const d of existsSync(npxDir) ? readdirSync(npxDir) : []) {
    const p = path.join(npxDir, d, "node_modules", "playwright");
    if (existsSync(p)) return require(p);
  }
  throw new Error("playwright nicht gefunden.");
}
let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const CONTENT_JS = readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
const HTML = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><script>
  window.__sent = []; window.__patches = [];
  window.chrome = {
    runtime: {
      lastError: undefined,
      getManifest: function () { return { version: "2.19.8" }; },
      sendMessage: function (m) {
        if (m && m.type === "steply-guide-step") { window.__sent.push(m.step); return; }
        if (m && m.type === "steply-guide-patch") { window.__patches.push(m); return; }
        return Promise.resolve(undefined);
      },
      onMessage: { addListener: function () {} },
    },
    storage: {
      local: { get: function (key, cb) { cb({ rec: { startedAt: Date.now(), mode: "guide" } }); } },
      onChanged: { addListener: function () {} },
    },
    tabs: { sendMessage: function () {} },
  };
</script></head><body style="font-family:sans-serif;padding:20px">
  <div id="usercentrics-root" class="uc-banner"><p>Wir nutzen Cookies.</p>
    <button id="acc">Alle akzeptieren</button></div>
  <div class="cmp-container"><button id="rej">Nur notwendige</button></div>
  <button id="cookieBtn">Cookie-Einstellungen</button>
  <button id="save">Speichern</button>
  <button id="accept2">Akzeptieren</button>
  <label><input id="cb" type="checkbox" checked> Newsletter</label>
</body></html>`;

let browser;
try {
  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.setContent(HTML, { waitUntil: "load" });
  await page.addScriptTag({ content: CONTENT_JS });
  const last = () => page.evaluate(() => window.__sent[window.__sent.length - 1]);
  const click = async (sel) => {
    await page.click(sel);
    await page.waitForTimeout(350);
    return last();
  };
  let s = await click("#acc");
  ok(!!s?.condition && s.condition.kind === "element", "Banner „Alle akzeptieren“ → nur wenn vorhanden");
  s = await click("#rej");
  ok(!!s?.condition, "CMP „Nur notwendige“ → nur wenn vorhanden");
  s = await click("#cookieBtn");
  ok(!!s?.condition, "Beschriftung mit „Cookie“ → nur wenn vorhanden");
  s = await click("#save");
  ok(!s?.condition, "Normaler „Speichern“-Knopf → immer");
  s = await click("#accept2");
  ok(!s?.condition, "„Akzeptieren“ außerhalb eines Banners → immer");
  await page.click("#cb");
  await page.waitForTimeout(400);
  const patches = await page.evaluate(() => window.__patches);
  ok(patches.some((p) => p.interaction && p.interaction.checked === false), "Kontrollkästchen abgewählt → checked:false nachgereicht");
} catch (e) {
  ok(false, "Fehler: " + (e?.message || e));
} finally {
  await browser?.close();
}
console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Cookie-Banner + Kontrollkästchen-Zustand korrekt erfasst.");
process.exit(failed ? 1 : 0);
