// Einrichtung der Steply-Erweiterung IN der App (statt öffentlicher Marketing-Seite).
// Echter Login gegen die echte DB (Wegwerf-Konten, werden am Ende gelöscht), eigener Dev-Server,
// Browser headless, alles nacheinander (nie parallel).
//
// Prüft:
//   * ausgeloggt: /extension bleibt öffentlich, 3 Schritte, KEIN Edge-Kasten, „Anmelden und
//     verbinden“ → Login mit next → landet auf Einstellungen → Steply-Erweiterung
//   * eingeloggt (Inhaber): /extension → Redirect auf /app/settings/erweiterung (App-Kopf)
//   * Mitarbeiter: /extension bleibt die öffentliche Seite
//   * „Neue Anleitung“ → Sofort-Anleitung ohne Erweiterung → gleiche Seite, SELBER Tab, Dialog zu
//   * leere Anleitung → „Mit der Steply-Erweiterung aufnehmen“ → Hinweis-Link → gleiche Seite
//   * Chrome-UA zeigt nur chrome://, Edge-UA nur edge://; „Anderer Browser?“ klappt die andere auf
//   * simulierte Erkennung der Erweiterung springt ohne Neuladen zu Schritt 3 „Jetzt verbinden“,
//     Verbinden klappt, danach Status + „Ihre verbundenen Browser“
// Screenshots → scripts/.shots-extension-setup/ (gitignored über .shots*).
//
// Nutzung:  node --env-file=.env.local scripts/test-extension-setup.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, ".shots-extension-setup");
mkdirSync(SHOT_DIR, { recursive: true });

function resolvePlaywright() {
  try {
    return require("playwright");
  } catch {
    /* npx-Cache */
  }
  if (process.env.STEPLY_PW_DIR) {
    const p = path.join(process.env.STEPLY_PW_DIR, "node_modules", "playwright");
    if (existsSync(p)) return require(p);
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

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const PORT = Number(process.env.PORT_EXT_SETUP || 3047);
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const E = { owner: `tutax-extsetup-owner-${stamp}@example.com`, member: `tutax-extsetup-mit-${stamp}@example.com` };
const UA = {
  chrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
};
const SETTINGS = "/app/settings/erweiterung";

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, name) => page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true });

async function waitForServer(timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/robots.txt`);
      if (r.status === 200) return true;
    } catch {
      /* noch nicht bereit */
    }
    await sleep(1000);
  }
  return false;
}

// Nur den eigenen Dev-Server (auf PORT) beenden — nie fremde Prozesse.
function killPort(port) {
  const out = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" }).stdout || "";
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols[1]?.endsWith(`:${port}`) && /:0$/.test(cols[2] ?? "") && Number(cols[4]) > 0) pids.add(cols[4]);
  }
  for (const pid of pids) {
    if (Number(pid) === process.pid) continue;
    spawnSync("taskkill", ["/pid", pid, "/f", "/t"], { stdio: "ignore" });
  }
}

// Nachgestellte Erweiterung (Vertrag wie extension/content.js + background.js): DOM-Marker +
// Antwort auf „steply-pair“. Wird per evaluate in eine BEREITS offene Seite gesetzt — so wie
// background.js content.js nach dem Laden in offene Tabs nachimpft.
function fakeExtension() {
  document.documentElement.setAttribute("data-steply-recorder", "9.9.9");
  window.addEventListener("message", async (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.__steply !== true || d.type !== "steply-pair") return;
    let okPair = false;
    let account;
    try {
      const r = await fetch(d.appUrl + "/api/recorder/me", { headers: { Authorization: "Bearer " + d.token } });
      const body = await r.json().catch(() => ({}));
      okPair = r.status === 200 && !!body.account;
      account = body.account;
    } catch {
      /* nicht verbunden */
    }
    window.postMessage(
      { __steply: true, type: "steply-pair-result", ok: okPair, account, error: okPair ? undefined : "abgelehnt" },
      location.origin,
    );
  });
}

async function login(page, email, next) {
  await page.goto(`${BASE}/login${next ? "?next=" + encodeURIComponent(next) : ""}`, {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 90_000 });
}

async function visibleAddresses(page) {
  return page.locator('[data-testid="browser-address"]:visible').allInnerTexts();
}

async function setupReady(page) {
  await page.getByTestId("extension-setup").waitFor({ timeout: 60_000 });
}

const users = new Set();
const accounts = new Set();
let server, browser;
try {
  // ---------- Wegwerf-Konten: Inhaber + Mitarbeiter im Konto des Inhabers ----------
  const mk = async (email) => {
    const cu = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    if (cu.error) throw cu.error;
    const uid = cu.data.user.id;
    users.add(uid);
    const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", uid);
    for (const r of m ?? []) accounts.add(r.account_id);
    return { uid, ownAccount: m?.[0]?.account_id };
  };
  const owner = await mk(E.owner);
  const accId = owner.ownAccount;
  await admin.from("accounts").update({ name: `Einrichtung Test ${stamp}`, onboarded: true }).eq("id", accId);
  const mit = await mk(E.member);
  if (mit.ownAccount) await admin.from("accounts").update({ onboarded: true }).eq("id", mit.ownAccount);
  const ins = await admin.from("account_members").insert({ account_id: accId, user_id: mit.uid, role: "member" });
  if (ins.error) throw ins.error;
  await admin.auth.admin.updateUserById(mit.uid, { user_metadata: { active_account_id: accId } });

  // Leere Anleitung (für den Editor-Leerzustand).
  const tutId = randomUUID();
  const tIns = await admin
    .from("tutorials")
    .insert({ id: tutId, account_id: accId, title: `Leer ${stamp}`, status: "draft", visibility: "internal" });
  if (tIns.error) throw tIns.error;

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], { cwd: path.join(__dirname, ".."), shell: true, stdio: "ignore" });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const newCtx = (ua, width = 1300) =>
    browser.newContext({ viewport: { width, height: 950 }, userAgent: ua, acceptDownloads: true });

  // ================= 1) Ausgeloggt: öffentliche Seite =================
  {
    const ctx = await newCtx(UA.chrome);
    const page = await ctx.newPage();
    const res = await page.goto(`${BASE}/extension`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await setupReady(page);
    ok(res.status() === 200 && new URL(page.url()).pathname === "/extension", "Ausgeloggt: /extension bleibt öffentlich");
    ok((await page.getByTestId("edge-hint").count()) === 0, "Öffentlich: kein Edge-Kasten mehr");
    ok((await page.getByText("Auch in Microsoft Edge").count()) === 0, "Öffentlich: kein „Auch in Microsoft Edge“");
    ok((await page.getByText("Video mit Ton", { exact: true }).count()) === 0, "Öffentlich: keine Feature-Kacheln");
    ok((await page.locator('[data-testid^="setup-step-"]').count()) === 3, "Öffentlich: genau 3 Schritte");
    const addr = await visibleAddresses(page);
    ok(addr.length === 1 && addr[0] === "chrome://extensions", `Öffentlich (Chrome): nur chrome:// (${addr.join(", ")})`);
    const cta = page.getByRole("button", { name: "Anmelden und verbinden" });
    const href = await cta.getAttribute("href");
    ok(href === "/login?next=%2Fapp%2Fsettings%2Ferweiterung", `„Anmelden und verbinden“ → Login mit next (${href})`);
    ok((await page.getByTestId("webstore-hint").count()) === 1, "Web-Store-Hinweis als eine Zeile");
    await shot(page, "public-desktop.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!overflow, "Öffentlich 390px: keine horizontale Scrollleiste");
    await shot(page, "public-390.png");
    await page.setViewportSize({ width: 1300, height: 950 });

    // Anmelden und verbinden → Login → Einstellungen → Steply-Erweiterung
    await cta.click();
    await page.waitForURL(/\/login/, { timeout: 60_000 });
    await page.fill("#email", E.owner);
    await page.fill("#password", PW);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => u.pathname === SETTINGS, { timeout: 90_000 }).catch(() => {});
    ok(new URL(page.url()).pathname === SETTINGS, `Nach Anmelden landet man bei der Einrichtung (${new URL(page.url()).pathname})`);
    await ctx.close();
  }

  // ================= 2) Inhaber, Chrome =================
  {
    const ctx = await newCtx(UA.chrome);
    const page = await ctx.newPage();
    await login(page, E.owner);

    // /extension → Redirect in die App
    await page.goto(`${BASE}/extension`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    ok(new URL(page.url()).pathname === SETTINGS, `Eingeloggt: /extension → ${new URL(page.url()).pathname}`);
    await setupReady(page);
    ok((await page.getByLabel("Zu den Anleitungen").count()) >= 1, "Einrichtung mit App-Kopf");
    ok((await page.getByText("Kostenlos starten").count()) === 0, "Kein Marketing-Kopf („Kostenlos starten“)");

    // „Neue Anleitung“ → Sofort-Anleitung (ohne Erweiterung) → gleiche Seite, selber Tab
    await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("button", { name: /Neue Anleitung/ }).first().click();
    const sofort = page.getByRole("link", { name: /Sofort-Anleitung/ });
    await sofort.waitFor({ timeout: 20_000 });
    ok((await sofort.getAttribute("target")) === null, "Sofort-Anleitung-Link öffnet keinen neuen Tab");
    await sofort.click();
    await page.waitForURL((u) => u.pathname === SETTINGS, { timeout: 60_000 }).catch(() => {});
    ok(new URL(page.url()).pathname === SETTINGS, "Neue Anleitung → Sofort-Anleitung → Einrichtung in der App");
    ok(ctx.pages().length === 1, "Kein zusätzlicher Tab");
    await setupReady(page);
    await sleep(500);
    ok((await page.getByRole("dialog").count()) === 0, "„Neue Anleitung“-Dialog ist geschlossen");

    // Schrittfolge (Chrome)
    ok((await page.getByTestId("extension-setup").getAttribute("data-browser")) === "chrome", "Browser erkannt: Chrome");
    let addr = await visibleAddresses(page);
    ok(addr.length === 1 && addr[0] === "chrome://extensions", `Chrome: nur chrome:// (${addr.join(", ")})`);
    ok((await page.getByText("Entpackt laden", { exact: false }).count()) >= 1, "Chrome: „Entpackt laden“");
    const dl = page.getByRole("button", { name: /Steply-Erweiterung herunterladen/ });
    ok((await dl.getAttribute("href")) === "/downloads/steply-recorder.zip", "Download-Knopf zeigt auf die ZIP");
    ok((await page.getByText(/Version \d+\.\d+\.\d+/).count()) >= 1, "Version wird angezeigt");
    ok((await page.getByTestId("setup-step-1").getAttribute("data-state")) === "current", "Schritt 1 ist dran");
    await shot(page, "app-nicht-installiert-chrome.png");
    // Download-Klick → Schritt 2 (Download nicht wirklich speichern)
    const dlPromise = page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
    await dl.click();
    const d = await dlPromise;
    if (d) await d.cancel().catch(() => {});
    ok((await page.getByTestId("extension-setup").getAttribute("data-step")) === "2", "Nach dem Herunterladen: Schritt 2");
    await page.getByRole("button", { name: "Anderer Browser?" }).click();
    addr = await visibleAddresses(page);
    ok(addr.includes("edge://extensions") && addr.includes("chrome://extensions"), "„Anderer Browser?“ zeigt auch edge://");

    // Simulierte Erkennung: Erweiterung „wird geladen“ → ohne Neuladen Schritt 3
    ok((await page.getByTestId("extension-waiting").count()) === 1, "Schritt 3 wartet auf die Erweiterung");
    await page.evaluate(fakeExtension);
    const jumped = await page
      .waitForFunction(() => document.querySelector('[data-testid="extension-setup"]')?.getAttribute("data-step") === "3", null, {
        timeout: 8_000,
      })
      .then(() => true, () => false);
    ok(jumped, "Erweiterung erkannt → springt ohne Neuladen zu Schritt 3");
    const connectBtn = page.getByRole("button", { name: "Jetzt verbinden" });
    ok(await connectBtn.isVisible().catch(() => false), "„Jetzt verbinden“ sichtbar");
    ok((await page.getByTestId("setup-step-1").getAttribute("data-state")) === "done", "Schritt 1–2 abgehakt");
    await shot(page, "app-installiert-nicht-verbunden.png");

    // Verbinden (bestehender Pairing-Flow)
    await connectBtn.click();
    await page.getByText(/Steply-Erweiterung verbunden/).first().waitFor({ timeout: 60_000 });
    await page
      .getByTestId("extension-status")
      .locator("b", { hasText: /^Installiert und verbunden$/ })
      .waitFor({ timeout: 15_000 })
      .then(() => ok(true, "Nach dem Verbinden: „Installiert und verbunden“"), () => ok(false, "Nach dem Verbinden: „Installiert und verbunden“"));
    await page.getByTestId("recorder-connections").waitFor({ timeout: 15_000 }).catch(() => {});
    ok((await page.getByTestId("recorder-connection").count()) === 1, "Liste „Ihre verbundenen Browser“ zeigt die Verbindung");
    ok((await page.getByTestId("extension-setup").count()) === 0, "Schrittfolge verschwindet nach dem Verbinden");
    await sleep(1500); // Toast ausblenden lassen
    await shot(page, "app-verbunden.png");

    // Editor-Leerzustand → „Mit der Steply-Erweiterung aufnehmen“ (ohne Erweiterung: neue Seite
    // ohne Marker) → Hinweis-Link → Einrichtung im selben Tab
    await page.goto(`${BASE}/app/tutorials/${tutId}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("button", { name: /Mit der Steply-Erweiterung aufnehmen/ }).click();
    const need = page.getByRole("link", { name: /Steply-Erweiterung nötig/ });
    await need.waitFor({ timeout: 20_000 });
    ok((await need.getAttribute("target")) === null, "Editor: Hinweis-Link ohne neuen Tab");
    await need.click();
    await page.waitForURL((u) => u.pathname === SETTINGS, { timeout: 60_000 }).catch(() => {});
    ok(new URL(page.url()).pathname === SETTINGS && ctx.pages().length === 1, "Editor → Einrichtung in der App, selber Tab");
    await ctx.close();
  }

  // ================= 3) Inhaber, Edge =================
  {
    const ctx = await newCtx(UA.edge);
    const page = await ctx.newPage();
    await login(page, E.owner);
    await page.goto(`${BASE}${SETTINGS}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await setupReady(page);
    await sleep(300);
    ok((await page.getByTestId("extension-setup").getAttribute("data-browser")) === "edge", "Browser erkannt: Edge");
    const addr = await visibleAddresses(page);
    ok(addr.length === 1 && addr[0] === "edge://extensions", `Edge: nur edge:// (${addr.join(", ")})`);
    ok((await page.getByText("Entpackte Erweiterung laden").count()) >= 1, "Edge: „Entpackte Erweiterung laden“");
    ok((await page.getByTestId("recorder-connections").count()) === 1, "Edge: Chrome-Verbindung weiter in der Liste");
    await shot(page, "app-nicht-installiert-edge.png");
    await ctx.close();
  }

  // ================= 4) Inhaber, 390px =================
  {
    const ctx = await newCtx(UA.chrome, 390);
    const page = await ctx.newPage();
    await login(page, E.owner);
    await page.goto(`${BASE}${SETTINGS}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await setupReady(page);
    await sleep(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!overflow, "App 390px: keine horizontale Scrollleiste");
    await shot(page, "app-nicht-installiert-390.png");
    await ctx.close();
  }

  // ================= 5) Mitarbeiter: öffentliche Seite =================
  {
    const ctx = await newCtx(UA.chrome);
    const page = await ctx.newPage();
    await login(page, E.member);
    await page.goto(`${BASE}/extension`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await setupReady(page);
    ok(new URL(page.url()).pathname === "/extension", `Mitarbeiter: /extension bleibt öffentlich (${new URL(page.url()).pathname})`);
    await ctx.close();
  }
} catch (err) {
  console.error("✗ Abbruch:", err);
  failed = true;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) killPort(PORT);
  for (const a of accounts) await admin.from("accounts").delete().eq("id", a).then(() => {}, () => {});
  for (const u of users) await admin.auth.admin.deleteUser(u).catch(() => {});
  // Nachkontrolle: Wegwerf-Konten wirklich weg?
  const left = [];
  for (const u of users) {
    const r = await admin.auth.admin.getUserById(u);
    if (r.data?.user) left.push(u);
  }
  if (left.length) console.error("✗ Nicht gelöschte Wegwerf-Nutzer:", left.join(", "));
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Einrichtung der Steply-Erweiterung verifiziert.");
process.exit(failed ? 1 : 0);
