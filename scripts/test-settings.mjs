// Welle 50c — Einstellungen mit Seitenleiste (Entwurf „App-Makeover" §2/§3).
// Echter Login gegen die echte DB (Wegwerf-Konto, wird am Ende gelöscht), Dev-Server lokal.
// Prüft: jede neue Seite lädt (H1), Seitenleiste zeigt alle Gruppen, alte Routen leiten
// weiter (inkl. Query), „Aussehen" zeigt die warmen Standard-Farben (kein altes Indigo),
// Speichern-Balken erscheint erst nach einer Änderung, „Verwerfen" setzt zurück,
// „Speichern" schreibt NUR die geänderte Farbe (DB) und die Hilfe-Seite nutzt sie,
// Name der Organisation speichert (DB), Tarif-Etiketten stimmen, Erweiterungs-Status
// ohne Erweiterung, mobil (390px) keine horizontale Scrollleiste.
// Screenshots → SHOT_DIR (Standard: scripts/.shots-settings, gitignored über .shots*).
//
// Nutzung:  node --env-file=.env.local scripts/test-settings.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, ".shots-settings");
mkdirSync(SHOT_DIR, { recursive: true });

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

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const PORT = Number(process.env.PORT_SETTINGS || 3026);
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const email = `tutax-settings-${stamp}@example.com`;

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

async function waitForServer(timeoutMs = 180_000) {
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

const PAGES = [
  ["allgemein", "Allgemein"],
  ["team", "Team"],
  ["aussehen", "Aussehen"],
  ["teilen", "Adresse & Teilen"],
  ["sprachen", "Sprachen & Vorlesen"],
  ["chat", "Chat auf Ihrer Website"],
  ["erweiterung", "Steply-Erweiterung"],
  ["tarif", "Tarif"],
  ["profil", "Mein Profil"],
];
const GROUPS = ["Arbeitsbereich", "Hilfe-Seite", "KI-Assistent", "Integrationen", "Abrechnung", "Persönlich"];
const REDIRECTS = [
  ["/app/settings", "/app/settings/allgemein"],
  ["/app/settings/branding", "/app/settings/aussehen"],
  ["/app/settings/einbetten", "/app/settings/teilen"],
  ["/app/settings/konto", "/app/settings/profil"],
  ["/app/settings/abo?limit=tutorials", "/app/settings/tarif?limit=tutorials"],
  ["/app/settings/eskalation", "/app/assistent/eskalation"],
];

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 90_000 });
}

async function h1(page) {
  const el = page.locator("main h1").first();
  await el.waitFor({ timeout: 90_000 });
  return (await el.innerText()).trim();
}

async function pollDb(fn, want, tries = 25) {
  let v;
  for (let i = 0; i < tries; i++) {
    v = await fn();
    if (want(v)) return v;
    await new Promise((r) => setTimeout(r, 600));
  }
  return v;
}

let server, browser, userId, accountId, slug;
try {
  const created = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const { data: members } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = members[0].account_id;
  await admin.from("accounts").update({ name: "Einstellungen Test GmbH", onboarded: true }).eq("id", accountId);
  slug = (await admin.from("accounts").select("slug").eq("id", accountId).single()).data.slug;

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: path.join(__dirname, ".."),
    shell: true,
    stdio: "ignore",
  });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  await login(page);

  // ---- Jede neue Seite lädt + Seitenleiste ----
  for (const [route, title] of PAGES) {
    const res = await page.goto(`${BASE}/app/settings/${route}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    const t = await h1(page);
    ok(res && res.status() < 400 && t === title, `/${route} lädt (H1 „${t}“)`);
    await page.waitForTimeout(400);
    if (route === "teilen") {
      const qr = page.locator('img[alt="QR-Code zur Hilfe-Seite"]');
      await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, await qr.elementHandle(), { timeout: 60_000 }).catch(() => {});
      ok(await qr.evaluate((el) => el.naturalWidth > 0), "Teilen: QR-Code wird geladen");
    }
    await page.screenshot({ path: path.join(SHOT_DIR, `d-${route}.png`), fullPage: true });
  }
  const aside = page.locator("aside nav[aria-label='Einstellungen']");
  const asideText = await aside.innerText();
  ok(GROUPS.every((g) => asideText.toUpperCase().includes(g.toUpperCase())), "Seitenleiste zeigt alle 6 Gruppen");
  ok((await aside.locator("a").count()) === 9, "Seitenleiste: 9 Einträge");
  ok(
    (await aside.locator('a[aria-current="page"]').innerText()).includes("Mein Profil"),
    "Seitenleiste markiert die aktive Seite",
  );
  ok((await page.getByText("Dashboard", { exact: true }).count()) === 0, "Kein „Dashboard“-Zurück-Link mehr");

  // ---- Alte Routen leiten weiter ----
  for (const [from, to] of REDIRECTS) {
    await page.goto(`${BASE}${from}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForURL((u) => u.pathname + u.search === to, { timeout: 60_000 }).catch(() => {});
    const u = new URL(page.url());
    ok(u.pathname + u.search === to, `${from} → ${u.pathname + u.search}`);
  }

  // ---- Tarif (kostenlos) ----
  await page.goto(`${BASE}/app/settings/tarif`, { waitUntil: "domcontentloaded" });
  await h1(page);
  const freeCard = page.locator('[data-plan="free"]');
  ok((await freeCard.getAttribute("data-current")) === "true", "Tarif: „Kostenlos“ ist als aktiv markiert");
  ok((await freeCard.getByText("Ihr Tarif").count()) === 1, "Tarif: Etikett „Ihr Tarif“ am aktiven");
  ok((await freeCard.getByText("Bald buchbar").count()) === 0, "Tarif: kein „Bald buchbar“ am aktiven Tarif");
  ok((await page.locator('[data-plan="pro"]').getByText("Beliebt").count()) === 1, "Tarif: „Beliebt“ am buchbaren Pro");

  // ---- Erweiterung (ohne installierte Erweiterung) ----
  await page.goto(`${BASE}/app/settings/erweiterung`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.getByText("Noch nicht installiert").waitFor({ timeout: 15_000 });
  const status = page.getByTestId("extension-status");
  // Base-UI-Button mit render={<Link/>} ist ein <a role="button">.
  const steps = status.locator("a, button");
  ok(
    (await steps.count()) === 1 && (await steps.first().getAttribute("href")) === "/extension",
    "Erweiterung: genau ein nächster Schritt (installieren → /extension)",
  );
  await page.getByText("Code manuell eingeben").click();
  ok(await page.getByRole("button", { name: "Code erzeugen" }).isVisible(), "Erweiterung: „Code manuell eingeben“ klappt auf");
  await page.screenshot({ path: path.join(SHOT_DIR, "d-erweiterung-offen.png"), fullPage: true });

  // ---- Aussehen: warme Standard-Farben + Speichern-Balken ----
  await page.goto(`${BASE}/app/settings/aussehen`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(500);
  const html = (await page.content()).toLowerCase();
  ok(!html.includes("#3d4ee6") && !html.includes("#f6f7fe") && !html.includes("#eef0fe"), "Aussehen: kein altes Indigo im Seitenquelltext");
  const primary = await page.inputValue('input[name="color-primary"]');
  const bgVal = await page.inputValue('input[name="color-background"]');
  ok(primary === "#ef6a4e" && bgVal === "#fdf3ec", `Aussehen: warme Standard-Farben (${primary}, ${bgVal})`);
  const previewBg = await page.getByTestId("brand-live-preview").evaluate((e) => getComputedStyle(e).backgroundColor);
  ok(previewBg === "rgb(253, 243, 236)", `Vorschau-Hintergrund = echte Hilfe-Seite (${previewBg})`);
  const saveBar = page.getByRole("region", { name: "Ungespeicherte Änderungen" });
  ok((await saveBar.count()) === 0, "Speichern-Balken ist ohne Änderung unsichtbar");

  // Verwerfen
  await page.fill('input[name="color-primary"]', "#123456");
  await saveBar.waitFor({ timeout: 5_000 });
  ok(await saveBar.isVisible(), "Speichern-Balken erscheint nach Änderung");
  await page.screenshot({ path: path.join(SHOT_DIR, "d-aussehen-savebar.png"), fullPage: false });
  await saveBar.getByRole("button", { name: "Verwerfen" }).click();
  await page.waitForTimeout(300);
  ok((await saveBar.count()) === 0 && (await page.inputValue('input[name="color-primary"]')) === "#ef6a4e", "„Verwerfen“ setzt zurück und blendet den Balken aus");

  // Speichern
  await page.fill('input[name="color-primary"]', "#1a7f5a");
  await saveBar.waitFor({ timeout: 5_000 });
  await saveBar.getByRole("button", { name: "Speichern" }).click();
  const tok = await pollDb(
    async () => (await admin.from("themes").select("tokens").eq("account_id", accountId).single()).data?.tokens,
    (t) => t?.colors?.primary === "#1a7f5a",
  );
  ok(tok?.colors?.primary === "#1a7f5a", "Speichern schreibt die Akzentfarbe in die DB");
  ok(
    tok?.colors && !("background" in tok.colors) && !("surface" in tok.colors) && !("text" in tok.colors),
    `Nur die geänderte Farbe gespeichert (keine Standard-Werte festgeschrieben): ${JSON.stringify(tok?.colors)}`,
  );
  await page.waitForTimeout(800);
  ok((await saveBar.count()) === 0, "Balken verschwindet nach dem Speichern");
  const hub = await (await fetch(`${BASE}/h/${slug}`)).text();
  ok(hub.toLowerCase().includes("#1a7f5a"), "Hilfe-Seite nutzt die gespeicherte Akzentfarbe");

  // ---- Allgemein: Name speichern ----
  await page.goto(`${BASE}/app/settings/allgemein`, { waitUntil: "domcontentloaded" });
  await h1(page);
  ok((await saveBar.count()) === 0, "Allgemein: kein Balken ohne Änderung");
  await page.fill("#org-name", "Umbenannt Test GmbH");
  await saveBar.waitFor({ timeout: 5_000 });
  await saveBar.getByRole("button", { name: "Speichern" }).click();
  const acc = await pollDb(
    async () => (await admin.from("accounts").select("name, slug").eq("id", accountId).single()).data,
    (a) => a?.name === "Umbenannt Test GmbH",
  );
  ok(acc?.name === "Umbenannt Test GmbH", "Name der Organisation gespeichert (DB)");
  ok(acc?.slug === slug, "Adresse bleibt beim Umbenennen unverändert");
  const tok2 = (await admin.from("themes").select("tokens").eq("account_id", accountId).single()).data?.tokens;
  ok(JSON.stringify(tok2?.colors) === JSON.stringify(tok?.colors), "Umbenennen fasst die Farben nicht an");

  // ---- Mobil (390px) ----
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mob.newPage();
  await login(mp);
  for (const [route] of PAGES) {
    await mp.goto(`${BASE}/app/settings/${route}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await h1(mp);
    await mp.waitForTimeout(500);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 1, `Mobil /${route}: keine horizontale Scrollleiste (${overflow}px)`);
    await mp.screenshot({ path: path.join(SHOT_DIR, `m-${route}.png`), fullPage: true });
  }
  ok(await mp.locator('select[aria-label="Bereich der Einstellungen"]').isVisible(), "Mobil: Bereichs-Auswahl oben sichtbar");
  ok(!(await mp.locator("aside nav[aria-label='Einstellungen']").isVisible()), "Mobil: Seitenleiste ausgeblendet");
  await mp.selectOption('select[aria-label="Bereich der Einstellungen"]', "/app/settings/tarif");
  await mp.waitForURL(/\/app\/settings\/tarif/, { timeout: 60_000 });
  ok((await h1(mp)) === "Tarif", "Mobil: Auswahl wechselt die Seite");
  await mp.goto(`${BASE}/app/settings/aussehen`, { waitUntil: "domcontentloaded" });
  await h1(mp);
  await mp.waitForTimeout(800); // Hydration abwarten (wie im Desktop-Schritt), sonst geht die Eingabe ins Leere
  await mp.fill('input[name="color-text"]', "#222222");
  await mp.getByRole("region", { name: "Ungespeicherte Änderungen" }).waitFor({ timeout: 5_000 });
  const ov2 = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(ov2 <= 1, `Mobil: Speichern-Balken ohne horizontale Scrollleiste (${ov2}px)`);
  await mp.screenshot({ path: path.join(SHOT_DIR, "m-aussehen-savebar.png"), fullPage: false });
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
  if (accountId) await admin.from("accounts").delete().eq("id", accountId).then(() => {}, () => {});
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Einstellungen: Struktur, Weiterleitungen, Farben, Speichern-Balken verifiziert.");
process.exit(failed ? 1 : 0);
