// ECHTE E-Mails Ende-zu-Ende: auslösen wie ein Nutzer, über die Resend-API nachsehen, ob sie
// rausgingen, Inhalt prüfen und den Link AUS DER MAIL gegen die Live-App klicken.
// Empfänger sind Resend-Testadressen (delivered+…@resend.dev): kein echtes Postfach nötig.
//
// Datenschutz: Das Resend-Konto enthält auch Mails anderer Projekte — dieses Skript fragt nur
// Mails an die eigenen Testadressen ab und gibt nichts anderes aus.
//
// Nutzung:  TEST_BASE=https://tutax-ivory.vercel.app node --env-file=.env.local scripts/test-email-delivery.mjs
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

const BASE = (process.env.TEST_BASE || "https://tutax-ivory.vercel.app").replace(/\/$/, "");
const RESEND = process.env.RESEND_TEST_KEY || process.env.RESEND_API_KEY;
if (!RESEND) throw new Error("RESEND_API_KEY fehlt in .env.local");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
  if (!cond) failed++;
};
const stamp = Date.now().toString(36);
const PW = "Probe12345!";
const addr = (tag) => `delivered+steply-${tag}-${stamp}@resend.dev`;
const users = [];
const accounts = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resend(pathname) {
  const r = await fetch(`https://api.resend.com${pathname}`, { headers: { Authorization: `Bearer ${RESEND}` } });
  if (!r.ok) throw new Error(`Resend ${pathname}: HTTP ${r.status}`);
  return r.json();
}
/** Mail an genau diese Adresse finden (nur eigene Testadressen, nichts anderes wird ausgegeben). */
async function waitForMail(to, sinceMs, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const list = await resend("/emails?limit=100");
    const hit = (list.data ?? []).find(
      (m) => (Array.isArray(m.to) ? m.to : [m.to]).some((t) => String(t).toLowerCase() === to.toLowerCase()) &&
        new Date(m.created_at).getTime() >= sinceMs - 60_000,
    );
    if (hit) return resend(`/emails/${hit.id}`);
    await sleep(4000);
  }
  return null;
}
function linksIn(mail) {
  const html = String(mail?.html ?? "") + " " + String(mail?.text ?? "");
  return [...html.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0].replace(/&amp;/g, "&"));
}
async function track(uid) {
  users.push(uid);
  const { data } = await admin.from("account_members").select("account_id").eq("user_id", uid);
  for (const r of data ?? []) accounts.push(r.account_id);
}
async function mkUser(email, plan = "free") {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await track(data.user.id);
  await admin.from("accounts").update({ onboarded: true, plan }).in("id", accounts);
  return data.user.id;
}
const path_ = (page) => new URL(page.url()).pathname;
function describe(mail) {
  const target = linksIn(mail).find((l) => /auth\/v1\/verify|auth\/confirm|\/invite\//.test(l));
  let host = "—";
  try {
    host = target ? new URL(target).host : "—";
  } catch {}
  return { from: mail?.from ?? "?", subject: mail?.subject ?? "?", status: mail?.last_event ?? "?", target, host };
}

const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
const fresh = async () => (await browser.newContext()).newPage();
try {
  // ── 1. Passwort vergessen (Supabase → SMTP) ──
  console.log("1. Passwort vergessen");
  {
    const to = addr("reset");
    await mkUser(to);
    const t0 = Date.now();
    const { error } = await anon().auth.resetPasswordForEmail(to, { redirectTo: `${BASE}/auth/confirm?next=/reset` });
    ok(!error, `Versand ausgelöst${error ? ` — ${error.message}` : ""}`);
    const mail = await waitForMail(to, t0);
    ok(!!mail, "Mail ist bei Resend eingegangen");
    if (mail) {
      const d = describe(mail);
      console.log(`    Absender: ${d.from} · Betreff: „${d.subject}“ · Zustellung: ${d.status}`);
      ok(!!d.target, `Mail enthält einen Link (${d.host})`);
      if (d.target) {
        const page = await fresh();
        await page.goto(d.target, { waitUntil: "domcontentloaded" });
        await page.waitForURL((u) => u.pathname === "/reset", { timeout: 45_000 }).catch(() => {});
        let set = false;
        if (path_(page) === "/reset") {
          const newPw = `Mail${stamp}Neu!`;
          await page.locator('input[name="password"]').first().fill(newPw);
          await page.locator('button[type="submit"]').first().click();
          await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 45_000 }).catch(() => {});
          set = !(await anon().auth.signInWithPassword({ email: to, password: newPw })).error;
        }
        ok(set, `Link aus der Mail → neues Passwort gesetzt (→ ${path_(page)})`);
        await page.context().close();
      }
    }
  }

  // ── 2. Magic-Link (Supabase → SMTP) ──
  console.log("2. Magic-Link");
  {
    const to = addr("magic");
    await mkUser(to);
    const t0 = Date.now();
    const { error } = await anon().auth.signInWithOtp({ email: to, options: { emailRedirectTo: `${BASE}/auth/confirm`, shouldCreateUser: false } });
    ok(!error, `Versand ausgelöst${error ? ` — ${error.message}` : ""}`);
    const mail = await waitForMail(to, t0);
    ok(!!mail, "Mail ist bei Resend eingegangen");
    if (mail) {
      const d = describe(mail);
      console.log(`    Absender: ${d.from} · Betreff: „${d.subject}“ · Zustellung: ${d.status}`);
      if (d.target) {
        const page = await fresh();
        await page.goto(d.target, { waitUntil: "domcontentloaded" });
        await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 45_000 }).catch(() => {});
        ok(path_(page).startsWith("/app"), `Link aus der Mail → eingeloggt (→ ${path_(page)})`);
        await page.context().close();
      } else ok(false, "Mail enthält keinen Anmelde-Link");
    }
  }

  // ── 3. Registrierung: kommt eine Bestätigungs-Mail? ──
  console.log("3. Registrierung");
  {
    const to = addr("signup");
    const t0 = Date.now();
    const { data, error } = await anon().auth.signUp({ email: to, password: PW, options: { emailRedirectTo: `${BASE}/auth/confirm` } });
    if (data?.user) await track(data.user.id);
    ok(!error, `Registrierung ausgelöst${error ? ` — ${error.message}` : ""}`);
    if (data?.session) {
      console.log("    Hinweis: E-Mail-Bestätigung ist in Supabase AUS — Konten sind sofort aktiv, es geht keine Mail raus.");
    } else {
      const mail = await waitForMail(to, t0);
      ok(!!mail, "Bestätigungs-Mail ist bei Resend eingegangen");
      if (mail) {
        const d = describe(mail);
        console.log(`    Absender: ${d.from} · Betreff: „${d.subject}“ · Zustellung: ${d.status}`);
        if (d.target) {
          const page = await fresh();
          await page.goto(d.target, { waitUntil: "domcontentloaded" });
          await page.waitForURL((u) => /\/(app|onboarding)/.test(u.pathname), { timeout: 45_000 }).catch(() => {});
          ok(/\/(app|onboarding)/.test(path_(page)), `Link aus der Mail → bestätigt + eingeloggt (→ ${path_(page)})`);
          await page.context().close();
        }
      }
    }
  }

  // ── 4. Team-Einladung (App → Resend-API) ──
  console.log("4. Team-Einladung");
  {
    const ownerMail = addr("owner");
    await mkUser(ownerMail, "pro");
    const to = addr("gast");
    const op = await fresh();
    await op.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await op.locator('input[name="email"]').first().fill(ownerMail);
    await op.locator('input[name="password"]').first().fill(PW);
    await op.locator('button[type="submit"]').first().click();
    await op.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 45_000 });
    await op.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded" });
    const t0 = Date.now();
    await op.locator("#invite-email").fill(to);
    await op.getByRole("button", { name: /Einladen/ }).click();
    await op.locator('[role="status"]').first().waitFor({ timeout: 30_000 }).catch(() => {});
    const status = (await op.locator('[role="status"]').first().innerText().catch(() => "")).replace(/\s+/g, " ");
    ok(/gesendet/.test(status), `App meldet: „${status.slice(0, 80)}“`);
    await op.context().close();
    const mail = await waitForMail(to, t0);
    ok(!!mail, "Einladungs-Mail ist bei Resend eingegangen");
    if (mail) {
      const d = describe(mail);
      console.log(`    Absender: ${d.from} · Betreff: „${d.subject}“ · Zustellung: ${d.status}`);
      ok(d.host === new URL(BASE).host, `Link zeigt auf die Live-App (${d.host})`);
      if (d.target) {
        const gp = await fresh();
        await gp.goto(d.target, { waitUntil: "domcontentloaded" });
        const pwField = gp.locator('input[type="password"]').first();
        await pwField.waitFor({ timeout: 30_000 }).catch(() => {});
        await pwField.fill(PW).catch(() => {});
        await gp.getByRole("button", { name: /beitreten/i }).first().click().catch(() => {});
        await gp.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 60_000 }).catch(() => {});
        ok(path_(gp).startsWith("/app"), `Link aus der Mail → beigetreten (→ ${path_(gp)})`);
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const guest = list?.users?.find((u) => u.email === to);
        if (guest) await track(guest.id);
        await gp.context().close();
      }
    }
  }
} finally {
  await browser.close();
  for (const acc of [...new Set(accounts)]) await admin.from("accounts").delete().eq("id", acc);
  for (const uid of [...new Set(users)]) await admin.auth.admin.deleteUser(uid).catch(() => {});
}
console.log(failed ? `\n✗ ${failed} Prüfung(en) fehlgeschlagen` : "\n✓ Echte E-Mails kommen an und ihre Links funktionieren");
process.exit(failed ? 1 : 0);
