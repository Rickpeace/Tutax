// Welle 44 — SELBSTHEILUNG STUFE A: BROWSER-BELEG (Kern der Welle).
//
// Beweist im ECHTEN Chromium gegen ein ECHTES DOM, dass der AUSGELIEFERTE, unveränderte
// extension/guide-resolve.js einen css-Treffer bei reiner Text-Drift (Versionsnummer, Datum,
// Zähler) selbstheilt (confidence 'healed'), aber KEINE unsicheren Fälle heilt. Der Resolver
// ist pur — deshalb wird die Datei VERBATIM als <script> in die Seite injiziert (UMD → setzt
// window.SteplyGuideResolve) und gegen document (echtes querySelector/querySelectorAll)
// ausgeführt. So zählt der Eindeutigkeits-Anker (querySelectorAll(css).length === 1) mit
// ECHTER CSS-Semantik, nicht mit einem Stub. Beweis-Ebene ehrlich: „shipped Resolver, echtes
// Browser-DOM" (die Extension als Ganzes braucht es für einen puren Resolver nicht).
//
// Motiv (Richards echter Test): Knopf „Extension herunterladen (v2.13.0)" heißt live „(v2.13.1)"
// → strikte Textprüfung meldete „text-mismatch", obwohl es derselbe Knopf ist.
//
// Nutzung:  node scripts/test-guide-heal-e2e.mjs
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESOLVER = path.resolve(HERE, "../extension/guide-resolve.js");

const PW_DIR = process.env.STEPLY_PW_DIR || "C:/Users/Richa/AppData/Local/Temp/steply-pw";
const pwEntry = `${PW_DIR}/node_modules/playwright/index.js`;
if (!existsSync(pwEntry)) {
  console.error("✗ Playwright nicht gefunden unter", pwEntry, "\n  (STEPLY_PW_DIR setzen oder Scratch-Ordner anlegen).");
  process.exit(2);
}
const { chromium } = require(pwEntry);

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };

// Echte Seite: ein eindeutiger, stabiler Download-Knopf mit Versionsnummer im Label + weitere
// Elemente für die Negativfälle (mehrdeutiger Klassen-css, Link statt Button, echter Textwechsel).
const PAGE = `<!doctype html><meta charset="utf-8"><title>heal</title>
  <button id="dl" type="button">Extension herunterladen (v2.13.1)</button>
  <a id="dl2" href="#">Herunterladen (v2.13.1)</a>
  <button id="act" type="button">Löschen</button>
  <button class="tab" type="button">Postausgang (5)</button>
  <button class="tab" type="button">Entwürfe (5)</button>
  <button id="cart" type="button">Warenkorb (5)</button>`;

// resolveSelector im Seitenkontext gegen das ECHTE document ausführen.
async function resolve(page, selector) {
  return page.evaluate((sel) => {
    const R = window.SteplyGuideResolve;
    const res = R.resolveSelector(document, sel);
    return {
      found: !!res.el,
      confidence: res.confidence,
      healed: res.healed === true,
      reason: res.reason,
      id: res.el ? res.el.id || null : null,
      text: res.el ? (res.el.textContent || "").trim() : null,
    };
  }, selector);
}

let browser = null;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(PAGE, { waitUntil: "load" });
  await page.addScriptTag({ path: RESOLVER });

  const ready = await page.evaluate(() =>
    !!(window.SteplyGuideResolve && typeof window.SteplyGuideResolve.resolveSelector === "function"));
  ok(ready, "Shipped guide-resolve.js im echten Browser geladen (window.SteplyGuideResolve aktiv)");

  // Sanity: echte querySelectorAll-Semantik — .tab trifft GENAU 2 (Eindeutigkeits-Anker echt).
  const tabCount = await page.evaluate(() => document.querySelectorAll(".tab").length);
  ok(tabCount === 2, `Echte CSS-Semantik: '.tab' trifft ${tabCount} Elemente (Eindeutigkeits-Anker greift echt)`);

  // ── KERNFALL: Versionsnummer v2.13.0 → v2.13.1, css #dl eindeutig+stabil, role=button ──
  const a = await resolve(page, { css: "#dl", text: "Extension herunterladen (v2.13.0)", role: "button" });
  ok(a.found && a.confidence === "healed" && a.healed && a.id === "dl",
    `KERN: Version v2.13.0→v2.13.1 am echten DOM selbstgeheilt -> healed (id=${a.id}, live="${a.text}")`);

  // ── Zähler (3) → (5) am echten DOM ──
  const c = await resolve(page, { css: "#cart", text: "Warenkorb (3)", role: "button" });
  ok(c.found && c.confidence === "healed" && c.id === "cart", "Zähler (3)→(5) am echten DOM -> healed");

  // ── NEGATIV: mehrdeutiger Klassen-css (2 echte Treffer) -> Bedingung 2 verhindert Heilung ──
  const d = await resolve(page, { css: ".tab", text: "Postausgang (3)", role: "button" });
  ok(!d.found && d.confidence !== "healed",
    `NEG mehrdeutig: '.tab' (2 echte Treffer) -> KEIN Heilen (found=${d.found}, reason=${d.reason})`);

  // ── NEGATIV: Rollenwechsel Button->Link (css #dl2 trifft ein <a>) -> Bedingung 3 ──
  const f = await resolve(page, { css: "#dl2", text: "Herunterladen (v2.13.0)", role: "button" });
  ok(!f.found && f.confidence !== "healed",
    `NEG Rollenwechsel: #dl2 ist <a>/link, gesucht role=button -> KEIN Heilen (found=${f.found})`);

  // ── NEGATIV: echter Textwechsel Speichern -> Löschen (nearText false) ──
  const g = await resolve(page, { css: "#act", text: "Speichern", role: "button" });
  ok(!g.found && g.confidence !== "healed",
    `NEG echter Textwechsel: 'Speichern' vs live 'Löschen' -> KEIN Heilen (found=${g.found})`);

  // ── Gegenprobe: exakter/enthaltener Text bleibt exact (Heilung ändert den Normalpfad nicht) ──
  const e = await resolve(page, { css: "#dl", text: "Extension herunterladen (v2.13.1)", role: "button" });
  ok(e.found && e.confidence === "exact", "Gegenprobe: unveränderter Text -> weiterhin exact (kein healed)");

  await browser.close();
  browser = null;
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
}

console.log(failed
  ? "\n✗ Selbstheilung-Browser-Beleg FEHLGESCHLAGEN."
  : "\n✓ Selbstheilung-Browser-Beleg grün: Version/Zähler-Drift am echten DOM geheilt; mehrdeutiger css, Rollenwechsel und echter Textwechsel werden NICHT geheilt.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 500);
