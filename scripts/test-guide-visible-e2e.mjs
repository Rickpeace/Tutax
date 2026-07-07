// Welle 45 — SICHTBARE ELEMENTE BEVORZUGEN: BROWSER-BELEG (Kern der Welle).
//
// Beweist im ECHTEN Chromium gegen ein ECHTES DOM, dass der AUSGELIEFERTE, unveränderte
// extension/guide-resolve.js mit injiziertem isVisible-Prädikat den SICHTBAREN Kandidaten wählt,
// statt an einem unsichtbaren 0×0-Duplikat (z. B. eingeklapptes Mobil-Menü) hängen zu bleiben.
// Der Resolver ist pur — deshalb wird die Datei VERBATIM als <script> in die Seite injiziert
// (UMD → setzt window.SteplyGuideResolve) und gegen document ausgeführt. Die Sichtbarkeit liefert
// hier ein ECHTES getBoundingClientRect>0 (kein Stub) — display:none-Elemente sind real 0×0.
// Beweis-Ebene ehrlich: „shipped Resolver, echtes Browser-DOM, echte Rects".
//
// Motiv (Richards echter Test): Schritt „Anmelden auswählen" auf der Steply-„Konto erstellen"-
// Seite → Grund „target-hidden": der aufgenommene css zeigte auf ein VERSTECKTES „Anmelden"-
// Duplikat (0×0), nicht auf den sichtbaren Link → der Lauf pausierte unnötig.
//
// Nutzung:  node scripts/test-guide-visible-e2e.mjs
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

// Echte Seite (Richards Fall nachgebaut): ein VERSTECKTES „Anmelden" im eingeklappten Mobil-Menü
// (display:none → real 0×0) und ein SICHTBARES „Anmelden" in der Desktop-Kopfzeile — beides Links.
// Zusätzlich ein rein verstecktes Element mit eindeutigem Text für den „nur unsichtbar"-Fall.
const PAGE = `<!doctype html><meta charset="utf-8"><title>visible</title>
  <nav id="mobile-menu" style="display:none">
    <a id="anm-mobile" href="/login">Anmelden</a>
  </nav>
  <header>
    <a id="anm-desktop" href="/login">Anmelden</a>
  </header>
  <a id="only-hidden" href="/x" style="display:none">Nur Versteckt Hier</a>`;

// resolveSelector im Seitenkontext gegen das ECHTE document ausführen — wahlweise MIT injiziertem
// isVisible (echtes getBoundingClientRect>0) oder OHNE (Alt-Verhalten).
async function resolve(page, selector, useVis) {
  return page.evaluate(({ sel, useVis }) => {
    const R = window.SteplyGuideResolve;
    const opts = useVis
      ? {
          isVisible: (el) => {
            const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
            return !!(r && r.width > 0 && r.height > 0);
          },
        }
      : undefined;
    const res = R.resolveSelector(document, sel, opts);
    return {
      found: !!res.el,
      confidence: res.confidence,
      reason: res.reason,
      id: res.el ? res.el.id || null : null,
      rectW: res.el && res.el.getBoundingClientRect ? Math.round(res.el.getBoundingClientRect().width) : null,
    };
  }, { sel: selector, useVis });
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

  // Sanity: echte Geometrie — das Mobil-„Anmelden" ist 0×0 (versteckt), das Desktop-„Anmelden" > 0.
  const rects = await page.evaluate(() => {
    const w = (id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    };
    return { mobile: w("anm-mobile"), desktop: w("anm-desktop"), only: w("only-hidden") };
  });
  ok(rects.mobile.w === 0 && rects.mobile.h === 0,
    `Echte Rects: verstecktes Mobil-„Anmelden" ist 0×0 (${rects.mobile.w}×${rects.mobile.h})`);
  ok(rects.desktop.w > 0 && rects.desktop.h > 0,
    `Echte Rects: sichtbares Desktop-„Anmelden" hat Fläche (${rects.desktop.w}×${rects.desktop.h})`);

  const anmSel = { css: "#anm-mobile", text: "Anmelden", role: "link" };

  // ── KERNFALL (Richard): css zeigt auf das VERSTECKTE Duplikat ──────────────────────────────
  // OHNE isVisible: der Resolver verankert exakt am unsichtbaren #anm-mobile → der Aufrufer
  // meldete „target-hidden" (der Bug). MIT isVisible: Stufe 1 wird übersprungen, der sichtbare
  // Desktop-Link gewinnt.
  const bugBefore = await resolve(page, anmSel, false);
  ok(bugBefore.found && bugBefore.id === "anm-mobile" && bugBefore.rectW === 0,
    `VORHER (ohne isVisible): css haftet am unsichtbaren Duplikat #${bugBefore.id} (0×0) → Aufrufer meldet target-hidden`);

  const fixAfter = await resolve(page, anmSel, true);
  ok(fixAfter.found && fixAfter.id === "anm-desktop" && fixAfter.rectW > 0,
    `NACHHER (mit isVisible): SICHTBARER Desktop-Link #${fixAfter.id} aufgelöst (conf=${fixAfter.confidence}, ${fixAfter.rectW}px breit)`);

  // ── Ohne css (nur Text+Rolle): zwei exakte „Anmelden" ──────────────────────────────────────
  // OHNE isVisible: zwei exakte Treffer → mehrdeutig → null. MIT isVisible: der sichtbare gewinnt.
  const twinSel = { text: "Anmelden", role: "link" };
  const twinBefore = await resolve(page, twinSel, false);
  ok(!twinBefore.found && twinBefore.reason === "ambiguous",
    `Ohne css, ohne isVisible: zwei exakte „Anmelden" → mehrdeutig (reason=${twinBefore.reason})`);
  const twinAfter = await resolve(page, twinSel, true);
  ok(twinAfter.found && twinAfter.id === "anm-desktop",
    `Ohne css, mit isVisible: sichtbarer „Anmelden" gewählt (#${twinAfter.id})`);

  // ── Nur-unsichtbar-Fall: kein sichtbarer Kandidat → Element WIE BISHER zurückgegeben ─────────
  // (nicht schlechter als heute; die 0×0-Nachprüfung im Aufrufer meldet dann target-hidden).
  const onlySel = { css: "#only-hidden", text: "Nur Versteckt Hier", role: "link" };
  const onlyRes = await resolve(page, onlySel, true);
  ok(onlyRes.found && onlyRes.id === "only-hidden" && onlyRes.rectW === 0,
    `Nur unsichtbar (mit isVisible): das eine Element wird zurückgegeben (#${onlyRes.id}, 0×0) → Aufrufer meldet target-hidden`);

  await browser.close();
  browser = null;
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
}

console.log(failed
  ? "\n✗ Sichtbarkeits-Browser-Beleg FEHLGESCHLAGEN."
  : "\n✓ Sichtbarkeits-Browser-Beleg grün: css am 0×0-Duplikat -> mit isVisible wird der SICHTBARE Anmelden-Link gewählt; ohne isVisible bleibt das Alt-Verhalten (Bug/ambiguous); nur-unsichtbar wird wie bisher zurückgegeben.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 500);
