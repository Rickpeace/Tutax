// Kern-Durchlauf — Bugsuche „wie ein echter Nutzer“ (headless, deutsche Oberflaeche).
//
// Geht die Kernwege durch: Registrierung -> Onboarding -> erste Anleitung -> Veroeffentlichen
// -> Hilfe-Seite; Bibliothek (Suche/Filter/Ansichten/Kategorien/Karten-Menue); Editor
// (Schritte, Bild, Verpixeln, Frage, Vorschau, KI-Texte, Status); Schulungen (zweites Konto);
// KI-Assistent + Wissensdatenbank; Glocke; Strg+K; Konto-Wechsel; 390 px mobil.
//
// Protokolliert dabei JS-Fehler, 4xx/5xx-Antworten, haengende Ladezustaende und
// Auffaelligkeiten. Legt NICHTS live an: Wegwerf-Konten werden am Ende geloescht.
//
// Nutzung:  node --env-file=.env.local scripts/test-kern-durchlauf.mjs
//           TEST_BASE=http://localhost:3097 node --env-file=.env.local scripts/test-kern-durchlauf.mjs
//           PHASES=1,2 ... (nur bestimmte Abschnitte)
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, ".shots-kern");
mkdirSync(SHOT_DIR, { recursive: true });

function resolvePlaywright() {
  try {
    return require("playwright");
  } catch {
    /* npx-Cache */
  }
  const dirs = [];
  if (process.env.STEPLY_PW_DIR) dirs.push(path.join(process.env.STEPLY_PW_DIR, "node_modules", "playwright"));
  const base = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
  const npxDir = path.join(base, "npm-cache", "_npx");
  if (existsSync(npxDir)) {
    for (const d of readdirSync(npxDir)) dirs.push(path.join(npxDir, d, "node_modules", "playwright"));
  }
  for (const p of dirs) if (existsSync(p)) return require(p);
  throw new Error("playwright nicht gefunden.");
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const PORT = Number(process.env.TEST_PORT) || 3097;
const BASE = process.env.TEST_BASE || `http://localhost:${PORT}`;
const OWN_SERVER = !process.env.TEST_BASE;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const PHASES = (process.env.PHASES || "1,2,3,4,5,6,7,8,9").split(",").map((s) => s.trim());
const on = (p) => PHASES.includes(String(p));

const findings = [];
const notes = [];
function bug(sev, title, detail) {
  findings.push({ sev, title, detail });
  console.log(`\n!! [${sev}] ${title}\n   ${detail}`);
}
function ok(msg) {
  notes.push(msg);
  console.log(`   ok: ${msg}`);
}
function info(msg) {
  console.log(`   .. ${msg}`);
}

// ── Konsolen-/Netzwerk-Beobachter ──────────────────────────────────────────────
const consoleErrors = [];
const httpErrors = [];
let phaseLabel = "start";
function watch(page) {
  page.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const t = m.text();
    if (/Download the React DevTools|Fast Refresh|\[Fast Refresh\]/i.test(t)) return;
    (m.type() === "error" ? consoleErrors : []).push?.({ phase: phaseLabel, url: page.url(), text: t });
    if (m.type() === "error") console.log(`   [console] ${t.slice(0, 300)}`);
  });
  page.on("pageerror", (e) => {
    consoleErrors.push({ phase: phaseLabel, url: page.url(), text: "pageerror: " + e.message });
    console.log(`   [pageerror] ${e.message.slice(0, 300)}`);
  });
  page.on("response", (r) => {
    const s = r.status();
    if (s < 400) return;
    const u = r.url();
    if (u.includes("/_next/") && s === 404) return;
    httpErrors.push({ phase: phaseLabel, status: s, url: u, method: r.request().method() });
    console.log(`   [http ${s}] ${r.request().method()} ${u.slice(0, 200)}`);
  });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true }).catch(() => {});
}

async function waitForServer(timeoutMs = 240_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/robots.txt`);
      if (r.status === 200) return true;
    } catch {
      /* noch nicht bereit */
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  return false;
}

// Hilfsfunktion: misst, wie lange ein Locator bis zur Sichtbarkeit braucht.
async function timed(fn) {
  const t = Date.now();
  try {
    await fn();
    return Date.now() - t;
  } catch {
    return -1;
  }
}

let server, browser;
const cleanup = { users: [], accounts: [] };

try {
  if (OWN_SERVER) {
    server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
      cwd: path.join(__dirname, ".."),
      shell: true,
      stdio: "ignore",
    });
    console.log("… Server startet auf", PORT, "…");
  }
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar: " + BASE);

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    locale: "de-DE",
  });
  const page = await ctx.newPage();
  watch(page);

  const email = `steply-kern-${stamp}@example.com`;
  const mod = await import(pathToFileURL(path.join(__dirname, "kern-phases.mjs")).href);
  await mod.run({
    page,
    ctx,
    browser,
    BASE,
    PW,
    email,
    stamp,
    admin,
    bug,
    ok,
    info,
    shot,
    timed,
    on,
    cleanup,
    watch,
    setPhase: (p) => {
      phaseLabel = p;
      console.log(`\n=== Phase ${p} ===`);
    },
  });
} catch (e) {
  bug("blockierend", "Skript-Abbruch", String(e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const a of cleanup.accounts) await admin.from("accounts").delete().eq("id", a).then(() => {}, () => {});
  for (const u of cleanup.users) await admin.auth.admin.deleteUser(u).catch(() => {});
  if (server) {
    try {
      spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore", shell: true });
    } catch {
      /* egal */
    }
  }
}

const report = { findings, notes, consoleErrors, httpErrors };
writeFileSync(path.join(SHOT_DIR, "bericht.json"), JSON.stringify(report, null, 2), "utf8");
console.log("\n──────── Zusammenfassung ────────");
console.log(`Befunde: ${findings.length}`);
for (const f of findings) console.log(`  [${f.sev}] ${f.title}`);
console.log(`JS-Fehler: ${consoleErrors.length}, HTTP 4xx/5xx: ${httpErrors.length}`);
console.log("Bericht:", path.join(SHOT_DIR, "bericht.json"));
process.exit(0);
