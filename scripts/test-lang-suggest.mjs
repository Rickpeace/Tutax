// Welle 30 — Beweis: (1) Browser-Sprach-Vorschlag auf der Hilfe-Seite und
// (2) die Sprach-Sektion im Onboarding.
//
// Ablauf: legt per Service-Client (admin) drei Testkonten an
//   • Konto EN  (languages=['en'])  — für die Vorschlagsleiste,
//   • Konto PL  (languages=['pl'])  — Gegenprobe „ohne EN",
//   • Konto OB  (free, onboarded=false) — für die Onboarding-Sektion,
// startet einen lokalen `next dev` im Worktree und prüft mit echtem Chromium
// (Playwright), jeweils über die Browser-Sprache des Kontexts (context.locale):
//
//   (a) en-US + EN aktiviert  -> dezente Vorschlagsleiste sichtbar, Link trägt ?lang=en;
//       Klick öffnet den EN-Hub (englische UI).
//   (b) de-DE                 -> KEINE Leiste (Deutsch bevorzugt).
//   (c) Leiste schließen      -> sofort weg UND nach Reload weiterhin weg (localStorage).
//   (d) Konto OHNE EN + en-US -> KEINE Leiste (nur aktivierte Sprachen zählen).
//   (e) Onboarding            -> Sprach-Sektion mit fixem Deutsch; Free = Teaser
//       (Business-Badge + Satz + Abo-Link, EN deaktiviert), Business = EN anhakbar.
//
// Seeds über Service-Client, Aufräumen im finally (auch im Fehlerfall).
// Nutzung:  node --env-file=.env.local scripts/test-lang-suggest.mjs
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, "..", ".tmp", "w30");

// Playwright lokal ODER aus dem npx-Cache auflösen (wie test-wizard-hostile.mjs).
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

const PORT = 3022;
const BASE = `http://localhost:${PORT}`;
const stamp = Date.now();
const SLUG_EN = `w30en-${stamp}`;
const SLUG_PL = `w30pl-${stamp}`;
const PW = "Test12345!";

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

async function mkUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error) throw error;
  const { data: members } = await admin
    .from("account_members")
    .select("account_id")
    .eq("user_id", data.user.id);
  return { userId: data.user.id, accountId: members[0].account_id };
}

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

async function shot(page, name) {
  try {
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
  } catch (e) {
    console.warn("  (Screenshot-Warnung", name, ":", e.message, ")");
  }
}

// Zustand einer Sprach-Checkbox im Onboarding (per Label-Text) auslesen.
async function checkboxState(page, labelText) {
  return page.evaluate((txt) => {
    const labels = [...document.querySelectorAll("label")];
    const label = labels.find((l) => l.textContent && l.textContent.includes(txt));
    const cb = label ? label.querySelector('input[type="checkbox"]') : null;
    return cb ? { checked: cb.checked, disabled: cb.disabled } : null;
  }, labelText);
}

let server, browser;
const users = [];
let obEmail, obAccountId;

try {
  mkdirSync(SHOT_DIR, { recursive: true });

  // --- Konten anlegen ---
  const aEn = await mkUser(`tutax-w30-en-${stamp}@example.com`);
  await admin
    .from("accounts")
    .update({ slug: SLUG_EN, name: "W30 EN GmbH", plan: "business", languages: ["en"], onboarded: true })
    .eq("id", aEn.accountId);

  const aPl = await mkUser(`tutax-w30-pl-${stamp}@example.com`);
  await admin
    .from("accounts")
    .update({ slug: SLUG_PL, name: "W30 PL GmbH", plan: "business", languages: ["pl"], onboarded: true })
    .eq("id", aPl.accountId);

  obEmail = `tutax-w30-ob-${stamp}@example.com`;
  const aOb = await mkUser(obEmail);
  obAccountId = aOb.accountId;
  await admin
    .from("accounts")
    .update({ name: "W30 Onboarding GmbH", plan: "free", onboarded: false })
    .eq("id", aOb.accountId);

  users.push(aEn, aPl, aOb);
  ok(true, `Setup: 3 Konten (EN=/h/${SLUG_EN}, PL=/h/${SLUG_PL}, Onboarding)`);

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

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch();

  // ===== (a) en-US + EN aktiviert -> Leiste sichtbar, Link ?lang=en, Klick -> EN-Hub =====
  {
    const ctx = await browser.newContext({ locale: "en-US" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/h/${SLUG_EN}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector('[data-tx="header"]', { timeout: 90_000 });
    let barVisible = false;
    try {
      await page.waitForSelector('[data-tx="lang-suggest"]', { timeout: 25_000 });
      barVisible = true;
    } catch {
      /* bleibt false */
    }
    ok(barVisible, "(a) en-US + EN aktiv: Vorschlagsleiste erscheint");
    const href = await page.getAttribute('[data-tx="lang-suggest-link"]', "href");
    ok(!!href && /[?&]lang=en(\b|$)/.test(href), `(a) Link trägt ?lang=en (href="${href}")`);
    await shot(page, "a-hub-de-with-suggest");
    await page.click('[data-tx="lang-suggest-link"]');
    await page.waitForURL(/lang=en/, { timeout: 20_000 }).catch(() => {});
    ok(/lang=en/.test(page.url()), `(a) Klick öffnet EN-Hub (url="${page.url()}")`);
    await page.waitForTimeout(600);
    const html = await page.content();
    ok(html.includes("How can we help?"), "(a) EN-Hub zeigt englische UI (heroTitle)");
    await shot(page, "a-hub-en");
    await ctx.close();
  }

  // ===== (b) de-DE -> keine Leiste =====
  {
    const ctx = await browser.newContext({ locale: "de-DE" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/h/${SLUG_EN}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector('[data-tx="header"]', { timeout: 90_000 });
    await page.waitForTimeout(1800);
    const count = await page.locator('[data-tx="lang-suggest"]').count();
    ok(count === 0, `(b) de-DE: keine Vorschlagsleiste (count ${count})`);
    await ctx.close();
  }

  // ===== (c) schließen -> sofort weg UND nach Reload weiterhin weg (localStorage) =====
  {
    const ctx = await browser.newContext({ locale: "en-US" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/h/${SLUG_EN}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector('[data-tx="lang-suggest"]', { timeout: 25_000 });
    await page.click('[data-tx="lang-suggest-close"]');
    await page.waitForTimeout(300);
    const afterClose = await page.locator('[data-tx="lang-suggest"]').count();
    ok(afterClose === 0, `(c) nach Schließen sofort weg (count ${afterClose})`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-tx="header"]', { timeout: 90_000 });
    await page.waitForTimeout(1800);
    const afterReload = await page.locator('[data-tx="lang-suggest"]').count();
    ok(afterReload === 0, `(c) nach Reload weiterhin weg — localStorage greift (count ${afterReload})`);
    await ctx.close();
  }

  // ===== (d) Konto OHNE EN + en-US -> keine Leiste =====
  {
    const ctx = await browser.newContext({ locale: "en-US" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/h/${SLUG_PL}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector('[data-tx="header"]', { timeout: 90_000 });
    await page.waitForTimeout(1800);
    const count = await page.locator('[data-tx="lang-suggest"]').count();
    ok(count === 0, `(d) Konto ohne EN + en-US: keine Leiste (count ${count})`);
    await ctx.close();
  }

  // ===== (e) Onboarding-Sprach-Sektion (Free-Teaser + Business-aktiv) =====
  {
    const ctx = await browser.newContext({ locale: "de-DE" });
    const page = await ctx.newPage();
    // Login per Passwort-Formular.
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.fill("#email", obEmail);
    await page.fill("#password", PW);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(app|onboarding)/, { timeout: 25_000 }).catch(() => {});

    // Free-Variante
    await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("button", { name: /Los geht/ }).click();
    await page.waitForSelector("text=Sprachen Ihrer Hilfe-Seite", { timeout: 25_000 });
    ok(true, "(e) Onboarding zeigt die Sprach-Sektion");

    const deFree = await checkboxState(page, "Deutsch");
    ok(
      deFree && deFree.checked === true && deFree.disabled === true,
      `(e) Deutsch fix (checked+disabled): ${JSON.stringify(deFree)}`,
    );
    ok(
      (await page.locator("text=Business").count()) > 0,
      "(e) Free: Business-Badge sichtbar",
    );
    ok(
      (await page.locator("text=Mehrsprachige Hilfe-Seite gibt es im Business-Tarif").count()) > 0,
      "(e) Free: Teaser-Satz sichtbar",
    );
    ok(
      (await page.locator('a[href="/app/settings/abo"]').count()) > 0,
      "(e) Free: Link zur Abo-Seite vorhanden",
    );
    const enFree = await checkboxState(page, "Englisch");
    ok(enFree && enFree.disabled === true, `(e) Free: EN-Checkbox deaktiviert (${JSON.stringify(enFree)})`);
    await shot(page, "e-onboarding-free");

    // Business-Variante: Konto hochstufen und neu laden.
    await admin.from("accounts").update({ plan: "business" }).eq("id", obAccountId);
    await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("button", { name: /Los geht/ }).click();
    await page.waitForSelector("text=Sprachen Ihrer Hilfe-Seite", { timeout: 25_000 });
    const enBiz = await checkboxState(page, "Englisch");
    ok(enBiz && enBiz.disabled === false, `(e) Business: EN-Checkbox anhakbar (${JSON.stringify(enBiz)})`);
    ok(
      (await page.locator("text=Mehrsprachige Hilfe-Seite gibt es im Business-Tarif").count()) === 0,
      "(e) Business: kein Teaser-Satz mehr",
    );
    await shot(page, "e-onboarding-business");
    await ctx.close();
  }
} catch (e) {
  ok(false, "Fehler: " + (e?.stack ?? e?.message ?? e));
  console.error(e);
} finally {
  for (const u of users) {
    try {
      await admin.from("accounts").delete().eq("id", u.accountId);
    } catch {}
    try {
      await admin.auth.admin.deleteUser(u.userId);
    } catch {}
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
      try {
        server.kill("SIGKILL");
      } catch {}
    }
  }
}

console.log(`\nScreenshots: ${SHOT_DIR}`);
console.log(failed ? "\n✗ Einige Welle-30-Checks sind fehlgeschlagen." : "\n✓ Alle Welle-30-Checks bestanden.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);
