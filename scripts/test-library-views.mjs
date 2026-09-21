// Welle 49 — Bibliothek: Karten (Titel im Kategorie-Farbfeld) + Liste (nach Kategorie gruppiert).
// Echter Login gegen die echte DB (Wegwerf-Konto, wird am Ende geloescht), Dev-Server lokal.
// Prueft: Karten zeigen Titel/Website/Kategorie, NUR „Intern" ist markiert (kein „Kunde"-Etikett),
// EIN Status-Schalter; Umschalten auf Liste gruppiert nach Kategorie + merkt sich die Wahl
// (Reload); Schalter veroeffentlicht wirklich (DB); mobil keine horizontale Scrollleiste.
// Screenshots → SHOT_DIR (Standard: scripts/.shots-library, gitignored ueber .shots*).
//
// Nutzung:  node --env-file=.env.local scripts/test-library-views.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, ".shots-library");
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

const PORT = 3024;
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const email = `tutax-lib-${stamp}@example.com`;

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

let server, browser, userId, accountId;
try {
  const created = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const { data: members } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = members[0].account_id;
  await admin.from("accounts").update({ name: "Bibliothek Test GmbH", onboarded: true }).eq("id", accountId);

  // Kategorien + Anleitungen (eine intern, eine ohne Kategorie, eine ohne Website).
  const { data: cats, error: catErr } = await admin
    .from("categories")
    .insert([
      { account_id: accountId, name: "Belege & Dokumente", position: 0 },
      { account_id: accountId, name: "Lohn & Gehalt", position: 1 },
    ])
    .select("id, name");
  if (catErr) throw catErr;
  const catId = (n) => cats.find((c) => c.name === n).id;
  const tuts = [
    { title: "Beleg in DATEV hochladen", category_id: catId("Belege & Dokumente"), site_domains: ["duo.datev.de"], description: "Rechnungen als PDF ablegen." },
    { title: "Lohnabrechnung abrufen", category_id: catId("Lohn & Gehalt"), site_domains: ["arbeitnehmer-online.de"] },
    { title: "Neue Mitarbeitende einarbeiten", category_id: catId("Lohn & Gehalt"), site_domains: [], visibility: "internal" },
    { title: "Passwort zurücksetzen", category_id: null, site_domains: ["login.example.com"] },
  ];
  const { data: tRows, error: tErr } = await admin
    .from("tutorials")
    .insert(tuts.map((t) => ({ account_id: accountId, status: "draft", visibility: "public", ...t })))
    .select("id, title");
  if (tErr) throw tErr;
  const stepRows = [];
  tRows.forEach((t, ti) => {
    for (let i = 0; i < ti + 2; i++) stepRows.push({ tutorial_id: t.id, position: i, title: `Schritt ${i + 1}` });
  });
  const { error: sErr } = await admin.from("steps").insert(stepRows);
  if (sErr) throw sErr;

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
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 60_000 });
  await page.getByText("Beleg in DATEV hochladen").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);

  // ---- Karten ----
  const main = page.locator("main").last();
  // Nur das Karten-Raster (ohne mobile Filter-Chips und Standard-Anleitungen darunter).
  const grid = main.locator("div.grid", { has: page.getByText("Beleg in DATEV hochladen") }).first();
  ok(await grid.getByText("duo.datev.de").isVisible(), "Karte zeigt die Website");
  ok((await grid.getByText("Kunde", { exact: true }).count()) === 0, "Kein „Kunde“-Etikett mehr");
  ok((await grid.getByText("Intern", { exact: true }).count()) === 1, "Genau EIN „Intern“-Etikett (nur die Ausnahme)");
  ok((await grid.getByText("Auf Hilfe-Seite").count()) === 0, "Kein doppelter Status (Etikett + Schalter) mehr");
  ok((await grid.getByRole("switch").count()) === 4, "Ein Status-Schalter je Anleitung");
  ok(await grid.getByText("Sonstiges").first().isVisible(), "Anleitung ohne Kategorie: „Sonstiges“");
  await page.screenshot({ path: path.join(SHOT_DIR, "1-karten.png"), fullPage: true });

  // Schalter → wirklich veroeffentlicht (DB).
  // Gleich hohe Farbfelder in einer Reihe (auch ohne Website).
  const heads = await grid.locator("div.border-b-2").evaluateAll((els) => els.slice(0, 3).map((e) => Math.round(e.getBoundingClientRect().height)));
  ok(heads.length === 3 && new Set(heads).size === 1, `Farbfelder einer Reihe gleich hoch (${heads.join("/")})`);
  const card = grid.locator("div.group", { hasText: "Beleg in DATEV hochladen" }).first();
  await card.getByRole("switch").click();
  await card.getByText("Veröffentlicht").waitFor({ timeout: 20_000 });
  let pub = null;
  for (let i = 0; i < 20 && pub !== "published"; i++) {
    await page.waitForTimeout(700);
    const { data } = await admin.from("tutorials").select("status").eq("id", tRows[0].id).single();
    pub = data.status;
  }
  ok(pub === "published", `Schalter veröffentlicht wirklich (DB status=${pub})`);

  // ---- Liste ----
  await page.getByRole("button", { name: "Liste" }).click();
  await page.waitForTimeout(400);
  ok(await main.getByText("Website", { exact: true }).isVisible(), "Liste: Spaltenkopf „Website“");
  const groupOrder = await main.locator("div.bg-line-2").allInnerTexts();
  ok(
    groupOrder.length === 3 && /BELEGE/i.test(groupOrder[0]) && /LOHN/i.test(groupOrder[1]) && /SONSTIGES/i.test(groupOrder[2]),
    `Liste: nach Kategorie gruppiert, „Sonstiges“ zuletzt (${JSON.stringify(groupOrder)})`,
  );
  await page.screenshot({ path: path.join(SHOT_DIR, "2-liste.png"), fullPage: true });

  await page.reload();
  await page.getByText("Beleg in DATEV hochladen").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(600);
  ok(await main.getByText("Website", { exact: true }).isVisible(), "Liste bleibt nach Neuladen gewählt");

  // ---- Mobil ----
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mob.newPage();
  await mp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await mp.fill("#email", email);
  await mp.fill("#password", PW);
  await mp.click('button[type="submit"]');
  await mp.waitForURL(/\/app/, { timeout: 60_000 });
  await mp.getByText("Beleg in DATEV hochladen").first().waitFor({ timeout: 60_000 });
  await mp.waitForTimeout(600);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow <= 1, `Mobil Karten: keine horizontale Scrollleiste (${overflow}px)`);
  await mp.screenshot({ path: path.join(SHOT_DIR, "3-mobil-karten.png"), fullPage: true });
  await mp.locator("main").last().getByRole("button", { name: /Liste/ }).click().catch(async () => {
    await mp.locator('[aria-label="Ansicht"] button').nth(1).click();
  });
  await mp.waitForTimeout(400);
  const overflow2 = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow2 <= 1, `Mobil Liste: keine horizontale Scrollleiste (${overflow2}px)`);
  await mp.screenshot({ path: path.join(SHOT_DIR, "4-mobil-liste.png"), fullPage: true });
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

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Bibliothek: Karten + Liste verifiziert.");
process.exit(failed ? 1 : 0);
