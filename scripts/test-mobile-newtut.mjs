// Beweis: Der mobile »Aufnehmen«-Tab öffnet den »Neue Anleitung«-Dialog.
// Richards Bug: mobil passierte beim Tippen NICHTS, weil CreateTabTrigger die
// Base-UI-render-Props (onClick/ref) nicht durchreichte. Hier: echter Login,
// Mobil-Viewport (iPhone-Breite), Tab tippen, Dialog muss erscheinen.
//
// Nutzung:  node --env-file=.env.local scripts/test-mobile-newtut.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

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
  if (existsSync(npxDir)) {
    for (const d of readdirSync(npxDir)) {
      const p = path.join(npxDir, d, "node_modules", "playwright");
      if (existsSync(p)) return require(p);
    }
  }
  throw new Error("playwright nicht gefunden.");
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
);

const PORT = 3023;
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = process.env.TEST_STAMP || String(process.hrtime.bigint()).slice(-8);
const email = `tutax-mob-${stamp}@example.com`;

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

function waitForServer(timeoutMs = 150_000) {
  const start = Date.now();
  return (async () => {
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
  })();
}

let server, browser, userId;
try {
  const created = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const { data: members } = await admin
    .from("account_members").select("account_id").eq("user_id", userId);
  const accountId = members[0].account_id;
  await admin.from("accounts").update({ name: "Mobil Test GmbH", onboarded: true }).eq("id", accountId);

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], { cwd: path.join(__dirname, ".."), shell: true, stdio: "ignore" });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  // iPhone-12-Breite, Touch aktiv.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 30_000 });
  ok(true, "Eingeloggt, /app erreicht (mobil)");

  // Die Desktop-Sidebar/Header-Aktion ist mobil ausgeblendet (lg:hidden-Logik).
  const tab = page.getByRole("button", { name: "Aufnehmen" });
  await tab.waitFor({ state: "visible", timeout: 15_000 });
  ok(true, "Mobiler »Aufnehmen«-Tab ist sichtbar");

  // Dialog darf VOR dem Tap nicht SICHTBAR sein (Base UI haelt den Titel im DOM,
  // daher auf Sichtbarkeit pruefen, nicht auf DOM-Praesenz).
  const dialogVisibleBefore = await page.getByRole("dialog").isVisible().catch(() => false);
  ok(!dialogVisibleBefore, `Dialog vor dem Tippen unsichtbar (war ${dialogVisibleBefore ? "offen" : "zu"})`);

  await tab.tap();
  const opened = await page
    .getByRole("dialog")
    .getByText("Neue Anleitung", { exact: true })
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  ok(opened, "Nach dem Tippen öffnet sich der »Neue Anleitung«-Dialog");

  // Und die drei Karten sind da (Selbst bauen / Aus Video / Sofort-Anleitung).
  const cards = await page.getByText(/Selbst bauen|Aus Video|Sofort-Anleitung/).count();
  ok(cards >= 2, `Dialog zeigt die Auswahl-Karten (${cards})`);
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) {
    try {
      spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore", shell: true });
    } catch {
      /* egal */
    }
  }
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Mobiler »Neue Anleitung«-Tab öffnet den Dialog.");
process.exit(failed ? 1 : 0);
