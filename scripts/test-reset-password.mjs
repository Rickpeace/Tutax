// Passwort-Sicherheit (M7, 23.09.2026) — headless gegen einen laufenden Server.
//
//  (a) Zurücksetzen-Link aus der E-Mail -> /reset -> neues Passwort klappt.
//  (b) Normale Passwort-Sitzung -> /reset -> wird abgelehnt (kein Nachweis per E-Mail).
//  (c) Profil -> „Passwort ändern“ mit FALSCHEM aktuellen Passwort -> abgelehnt,
//      mit richtigem -> klappt, und das neue Passwort funktioniert beim Anmelden.
//
// Legt ein Wegwerf-Konto an und löscht es am Ende wieder.
// Nutzung:  TEST_BASE=http://localhost:3097 node --env-file=.env.local scripts/test-reset-password.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
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

const BASE = process.env.TEST_BASE || "http://localhost:3097";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = () =>
  createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
  if (!cond) failed++;
};
const canLogin = async (email, password) => !(await anon().auth.signInWithPassword({ email, password })).error;

const email = `reset-probe-${Date.now()}@example.com`;
const PW1 = "Start12345!";
const PW2 = "PerLink12345!";
const PW3 = "PerProfil12345!";
const { data: created, error: ce } = await admin.auth.admin.createUser({ email, password: PW1, email_confirm: true });
if (ce) throw ce;
const uid = created.user.id;

const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
try {
  // Onboarding überspringen, damit /app nicht umleitet.
  const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", uid);
  for (const m of mem ?? []) await admin.from("accounts").update({ onboarded: true }).eq("id", m.account_id);

  // (a) über den Link aus der E-Mail
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (error) throw error;
    await page.goto(
      `${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=recovery&next=/reset`,
      { waitUntil: "domcontentloaded" },
    );
    // Zwischenseite gegen Link-Scanner (Runde 4): Knopf drücken.
    await page.locator('form[action="/auth/confirm"] button[type="submit"]').click();
    await page.waitForURL(/\/reset/, { timeout: 30_000 });
    await page.locator('input[name="password"]').first().fill(PW2);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/app|\/onboarding/, { timeout: 30_000 }).catch(() => {});
    ok(/\/app|\/onboarding/.test(page.url()), `(a) Link aus der E-Mail -> neues Passwort gesetzt (landet auf ${new URL(page.url()).pathname})`);
    ok(await canLogin(email, PW2), "(a) Anmelden mit dem neuen Passwort klappt");
    await ctx.close();
  }

  // (b) normale Passwort-Sitzung darf /reset NICHT nutzen
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="email"]').first().fill(email);
    await page.locator('input[name="password"]').first().fill(PW2);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/app/, { timeout: 30_000 });
    await page.goto(`${BASE}/reset`, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="password"]').first().fill("Uebernahme12345!");
    await page.locator('button[type="submit"]').first().click();
    const msg = page.getByText(/nur direkt über den Link aus der E-Mail/);
    await msg.waitFor({ timeout: 20_000 }).catch(() => {});
    ok(await msg.isVisible().catch(() => false), "(b) Passwort-Sitzung: /reset lehnt ab und erklärt warum");
    ok(!(await canLogin(email, "Uebernahme12345!")), "(b) Passwort wurde NICHT geändert");

    // (c) Profil: aktuelles Passwort nötig
    await page.goto(`${BASE}/app/settings/profil`, { waitUntil: "domcontentloaded" });
    await page.locator("#pw-current").waitFor({ timeout: 30_000 });
    await page.locator("#pw-current").fill("Falsch12345!");
    await page.locator("#pw").fill(PW3);
    await page.locator("#pw2").fill(PW3);
    await page.getByRole("button", { name: "Passwort ändern" }).click();
    const wrong = page.getByText("Das aktuelle Passwort stimmt nicht.");
    await wrong.waitFor({ timeout: 20_000 }).catch(() => {});
    ok(await wrong.isVisible().catch(() => false), "(c) falsches aktuelles Passwort -> abgelehnt mit Erklärung");
    ok(!(await canLogin(email, PW3)), "(c) Passwort blieb unverändert");

    await page.locator("#pw-current").fill(PW2);
    await page.getByRole("button", { name: "Passwort ändern" }).click();
    await page.getByText("Passwort geändert").waitFor({ timeout: 20_000 }).catch(() => {});
    ok(await canLogin(email, PW3), "(c) richtiges aktuelles Passwort -> neues Passwort gilt");
    ok(page.url().includes("/app/settings/profil"), "(c) laufende Sitzung bleibt bestehen");
    await ctx.close();
  }
} finally {
  await browser.close();
  const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", uid);
  for (const m of mem ?? []) await admin.from("accounts").delete().eq("id", m.account_id);
  await admin.auth.admin.deleteUser(uid);
}
console.log(failed ? `\n✗ ${failed} Prüfung(en) fehlgeschlagen` : "\n✓ Passwort-Sicherheit verifiziert");
process.exit(failed ? 1 : 0);
