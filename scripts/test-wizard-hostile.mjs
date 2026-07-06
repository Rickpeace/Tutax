// Welle 26 — Beweis: Der Endkunden-Wizard (und Hub + Druckansicht) hält FEINDLICHEN,
// aus echter Aufnahme stammenden Inhalt aus, ohne horizontal aus dem Layout zu laufen.
//
// Feindlicher Inhalt (aus freier Wildbahn nachgestellt):
//   • Schritt-Titel ~60 Zeichen inkl. Zitat + „…" (zitat-sichere Server-Titel).
//   • Fließtext 300+ Zeichen mit Emoji 😂, englischen Wörtern UND einer 120-Zeichen-URL
//     OHNE Leerzeichen (der harte Fall: eine ungebrochene Kette).
//   • Verzweigungsfrage mit zwei langen Antworten (eine mit ungebrochener Kette).
//
// Ablauf: legt per Service-Client (admin) ein Pro-Testkonto + zwei veröffentlichte
// Tutorials an (linear = Fortschritt/Sidebar; Verzweigung = Antwort-Buttons), startet
// einen lokalen `next dev` im Worktree und prüft mit echtem Chromium (Playwright):
//   (a) document.documentElement.scrollWidth <= innerWidth  (KEIN H-Overflow)
//       auf Hub + jedem Wizard-Schritt + Fertig-Screen + Druckansicht,
//       jeweils in 1440×900 UND 390×844.
//   (b) legt Vollseiten-Screenshots unter .tmp/w26/ ab (gitignored, NICHT committen).
//   (c) räumt Tutorials/Konto/User am Ende wieder weg (auch im Fehlerfall, try/finally).
//
// Nutzung:  node --env-file=.env.local scripts/test-wizard-hostile.mjs
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, "..", ".tmp", "w26");

// Playwright lokal ODER aus dem npx-Cache auflösen (wie test-guide-capture.mjs).
function resolvePlaywright() {
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

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
);

const PORT = 3017;
const BASE = `http://localhost:${PORT}`;
const stamp = Date.now();
const SLUG = `w26host-${stamp}`;
const uuid = () => crypto.randomUUID();

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

// ---- feindlicher Inhalt --------------------------------------------------
// 120-Zeichen-URL OHNE Leerzeichen (der harte Umbruch-Fall).
const HOSTILE_URL = "https://example.com/" + "x".repeat(100); // = 120 Zeichen
// Fließtext 300+ Zeichen mit Emoji + Englisch + der 120-Zeichen-URL am Stück.
const HOSTILE_BODY_TEXT =
  "Das hier ist ein absichtlich sehr langer Fließtext aus einer echten Aufnahme 😂 " +
  'mit englischen Wörtern like "seriously the best workflow I have ever tested" und einer ' +
  "endlosen, nicht umbrechbaren Adresse " +
  HOSTILE_URL +
  " — danach folgt noch mehr Text, damit wir sicher deutlich über dreihundert Zeichen " +
  "kommen und der Zeilenumbruch im Wizard wirklich auf die Probe gestellt wird. 🚀";
// Titel ~60 Zeichen mit Zitat + „…" (wie die Server-seitig zitat-sicheren Titel).
const HOSTILE_TITLE = "Klicken Sie auf „I Tested the Cheapest Path to 96GB of RAM…";
// Zwei lange Antworten; die zweite enthält eine ungebrochene Kette.
const LONG_ANSWER_A =
  "Ja, ich habe die Anwendung bereits vollständig installiert und erfolgreich mit meinen Zugangsdaten eingerichtet";
const LONG_ANSWER_B = "Nein-" + "a".repeat(90) + " (noch nicht eingerichtet)";

const mkBody = (text) => ({
  type: "doc",
  content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
});

let userId, accId, server, browser;
const tutorialIds = [];

async function mkUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "Test12345!",
    email_confirm: true,
  });
  if (error) throw error;
  const { data: members } = await admin
    .from("account_members")
    .select("account_id")
    .eq("user_id", data.user.id);
  return { userId: data.user.id, accountId: members[0].account_id };
}

/** Legt ein veröffentlichtes, öffentliches Tutorial an; gibt die tutorialId zurück. */
async function seedTutorial({ title, slug, steps }) {
  const tutId = uuid();
  await admin.from("tutorials").insert({
    id: tutId,
    account_id: accId,
    title,
    slug,
    status: "published",
    visibility: "public",
    is_template: false,
  });
  const ids = steps.map(() => uuid());
  await admin.from("steps").insert(
    steps.map((s, i) => ({
      id: ids[i],
      tutorial_id: tutId,
      title: s.title,
      body: mkBody(s.body),
      position: i + 1,
      is_decision: !!s.branches,
    })),
  );
  await admin.from("tutorials").update({ root_step_id: ids[0] }).eq("id", tutId);

  const branchRows = [];
  steps.forEach((s, i) => {
    if (s.branches) {
      // Verzweigung: jede Antwort zeigt auf einen späteren Schritt (per Index).
      s.branches.forEach((b, j) =>
        branchRows.push({
          id: uuid(),
          step_id: ids[i],
          label: b.label,
          target_step_id: ids[b.to],
          position: j,
          color: b.color ?? null,
        }),
      );
    } else if (i < steps.length - 1) {
      // Linear: nächster Schritt (nur wenn nicht schon per Verzweigung verdrahtet).
      branchRows.push({
        id: uuid(),
        step_id: ids[i],
        label: null,
        target_step_id: ids[i + 1],
        position: 0,
        color: null,
      });
    }
  });
  if (branchRows.length) await admin.from("step_branches").insert(branchRows);
  tutorialIds.push(tutId);
  return tutId;
}

function waitForServer(timeoutMs = 150_000) {
  const start = Date.now();
  return (async () => {
    while (Date.now() - start < timeoutMs) {
      try {
        const r = await fetch(`${BASE}/api/recorder/guide-handshake`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (r.status === 401 || r.status === 400) return true;
      } catch {
        /* noch nicht bereit */
      }
      await new Promise((res) => setTimeout(res, 1000));
    }
    return false;
  })();
}

async function checkOverflow(page, label) {
  const r = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    bsw: document.body.scrollWidth,
    iw: window.innerWidth,
  }));
  // +1px Toleranz gegen sub-pixel-Rundung.
  const good = r.sw <= r.iw + 1 && r.bsw <= r.iw + 1;
  ok(good, `${label}: kein H-Overflow (html ${r.sw} / body ${r.bsw} ≤ vw ${r.iw})`);
}

async function shot(page, name) {
  try {
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
  } catch (e) {
    console.warn("  (Screenshot-Warnung", name, ":", e.message, ")");
  }
}

/** Öffnet einen Wizard und klickt sich Schritt für Schritt bis zum Fertig-Screen. */
async function walkWizard(page, slug, tag, vpName) {
  await page.goto(`${BASE}/h/${SLUG}/${slug}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector('[data-tx="step"]', { timeout: 90_000 });
  for (let i = 0; i < 15; i++) {
    // kurze Ruhe, damit Bild/Layout steht.
    await page.waitForTimeout(300);
    await checkOverflow(page, `${tag} ${vpName} · Schritt ${i}`);
    await shot(page, `${tag}-${vpName}-step${i}`);
    const btns = page.locator('[data-tx="btn"]');
    const n = await btns.count();
    if (n === 0) break; // Fertig-Screen erreicht
    await btns.first().click();
  }
}

try {
  mkdirSync(SHOT_DIR, { recursive: true });

  // --- Konto anlegen + auf einen bekannten Slug setzen ---
  const A = await mkUser(`tutax-w26-${stamp}@example.com`);
  accId = A.accountId;
  userId = A.userId;
  await admin
    .from("accounts")
    .update({ slug: SLUG, name: "W26 Härtetest GmbH", plan: "pro" })
    .eq("id", accId);
  ok(true, `Setup: Pro-Konto /h/${SLUG}`);

  // --- Tutorial 1: LINEAR (Fortschrittsbalken + Desktop-Sidebar) ---
  await seedTutorial({
    title: HOSTILE_TITLE,
    slug: "linear",
    steps: [
      { title: HOSTILE_TITLE, body: HOSTILE_BODY_TEXT },
      { title: "Schritt mit ungebrochener Kette " + HOSTILE_URL, body: "Kurzer Text. " + HOSTILE_URL },
      { title: "Letzter Schritt 😂 mit englischem Wort SUPERCALIFRAGILISTIC", body: HOSTILE_BODY_TEXT },
    ],
  });

  // --- Tutorial 2: VERZWEIGUNG (Antwort-Buttons mit langen Labels) ---
  await seedTutorial({
    title: "Verzweigung mit langen Antworten",
    slug: "verzweigung",
    steps: [
      {
        title: "Haben Sie die App schon eingerichtet? " + HOSTILE_URL,
        body: HOSTILE_BODY_TEXT,
        branches: [
          { label: LONG_ANSWER_A, to: 1, color: "#18a999" },
          { label: LONG_ANSWER_B, to: 2, color: "#d3543a" },
        ],
      },
      { title: "Danke — weiter geht es", body: "Alles gut. " + HOSTILE_URL },
      { title: "Kein Problem, hier die Einrichtung", body: HOSTILE_BODY_TEXT },
    ],
  });
  ok(true, "Setup: 2 feindliche Tutorials veröffentlicht");

  // --- Server starten ---
  console.log("… Next-Server auf Port", PORT, "wird gestartet (kann dauern) …");
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
    shell: true,
  });
  const up = await waitForServer();
  ok(up, "Server erreichbar");
  if (!up) throw new Error("Server nicht erreichbar");

  // --- Chromium ---
  const { chromium } = resolvePlaywright();
  browser = await chromium.launch();

  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    // Frischer Context je Viewport -> saubere sessionStorage (Wizard merkt sich Position).
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();

    // Hub
    await page.goto(`${BASE}/h/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector('[data-tx="browser"]', { timeout: 90_000 });
    await page.waitForTimeout(300);
    await checkOverflow(page, `Hub ${vp.name}`);
    await shot(page, `hub-${vp.name}`);

    // Wizard linear (Fortschritt + Sidebar) + Wizard Verzweigung (Antwort-Buttons)
    await walkWizard(page, "linear", "linear", vp.name);
    await walkWizard(page, "verzweigung", "verzweigung", vp.name);

    // Druckansicht
    await page.goto(`${BASE}/h/${SLUG}/linear/drucken`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForTimeout(500);
    await checkOverflow(page, `Druckansicht ${vp.name}`);
    await shot(page, `drucken-${vp.name}`);

    await ctx.close();
  }
} catch (e) {
  ok(false, "Fehler: " + e.message);
  console.error(e);
} finally {
  try {
    for (const id of tutorialIds) await admin.from("tutorials").delete().eq("id", id);
    if (accId) await admin.from("accounts").delete().eq("id", accId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  } catch (e) {
    console.warn("Cleanup-Warnung:", e.message);
  }
  try {
    if (browser) await browser.close();
  } catch {}
  if (server && server.pid) {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore", shell: true });
      } else {
        process.kill(-server.pid, "SIGKILL");
      }
    } catch {
      server.kill("SIGKILL");
    }
  }
}

console.log(`\nScreenshots: ${SHOT_DIR}`);
console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Wizard-Härtetest bestanden.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);
