// Erzeugt ALLE Steply-Markenicons aus einer Quelle: Korallen-Kreis (#ef6a4e) mit weißem „S“
// in Nunito 900 — dasselbe Zeichen wie das Logo oben links in App und Seitenleiste.
//
//   -> src/app/favicon.ico            (16/32/48, PNG-in-ICO)
//   -> src/app/icon.png               (512, transparent — Next.js <link rel="icon">)
//   -> src/app/apple-icon.png         (180, vollflächig koralle — iOS rundet selbst ab)
//   -> extension/icons/icon{16,48,128}.png
//
// Das „S“ wird mit der echten Nunito-Schrift gerendert (headless Chromium lädt sie von
// Google Fonts), dann mit sharp heruntergerechnet. Kein sichtbares Fenster.
//
// Nutzung:  node scripts/make-brand-icons.mjs
//   (Playwright: wie die E2E-Tests über STEPLY_PW_DIR oder den npx-Cache)
import { createRequire } from "node:module";
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORAL = "#ef6a4e";
const MASTER = 1024;

function resolvePlaywright() {
  if (process.env.STEPLY_PW_DIR) {
    const p = path.join(process.env.STEPLY_PW_DIR, "node_modules", "playwright");
    if (existsSync(p)) return require(p);
  }
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
  throw new Error("Playwright nicht gefunden (STEPLY_PW_DIR setzen).");
}

/** Master-PNG rendern: Kreis (round) oder vollflächiges Quadrat (full). */
async function renderMaster(browser, shape) {
  const page = await browser.newPage({ viewport: { width: MASTER, height: MASTER } });
  const radius = shape === "round" ? "50%" : "0";
  await page.setContent(`<!doctype html><html><head>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@900&display=block">
    <style>
      html,body{margin:0;background:transparent}
      .m{width:${MASTER}px;height:${MASTER}px;border-radius:${radius};background:${CORAL};
         display:flex;align-items:center;justify-content:center;
         font:900 ${Math.round(MASTER * 0.66)}px/1 Nunito,sans-serif;color:#fff}
      /* optische Mitte: Versal-S sitzt in Nunito leicht tief */
      .m span{transform:translateY(-3%)}
    </style></head><body><div class="m"><span>S</span></div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const ok = await page.evaluate(() => document.fonts.check('900 100px "Nunito"'));
  if (!ok) throw new Error("Nunito wurde nicht geladen — kein Netz?");
  const png = await page.locator(".m").screenshot({ omitBackground: true });
  await page.close();
  return png;
}

const resize = (buf, size) =>
  sharp(buf).resize(size, size, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toBuffer();

/** ICO mit eingebetteten PNGs (von allen aktuellen Browsern/Windows unterstützt). */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4); // Farbebenen
    e.writeUInt16LE(32, 6); // Bit pro Pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
try {
  const round = await renderMaster(browser, "round");
  const full = await renderMaster(browser, "full");

  const ico = [];
  for (const size of [16, 32, 48]) ico.push({ size, data: await resize(round, size) });
  writeFileSync(path.join(root, "src/app/favicon.ico"), buildIco(ico));
  writeFileSync(path.join(root, "src/app/icon.png"), await resize(round, 512));
  writeFileSync(path.join(root, "src/app/apple-icon.png"), await resize(full, 180));

  const extDir = path.join(root, "extension/icons");
  mkdirSync(extDir, { recursive: true });
  for (const size of [16, 48, 128]) {
    writeFileSync(path.join(extDir, `icon${size}.png`), await resize(round, size));
  }
  console.log("✓ Favicon, App-Icons und Extension-Icons erzeugt.");
} finally {
  await browser.close();
}
