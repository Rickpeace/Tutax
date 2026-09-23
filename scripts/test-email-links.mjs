// E-Mail-Links Ende-zu-Ende — ohne echte Mails: Supabase erzeugt jeden Link genau so, wie er in
// der Mail stünde (admin.generateLink), und wir klicken ihn im Browser gegen die Ziel-Seite.
//
//  0. Adressen: Supabase-„Site URL“ (Ersatz, wenn ein Rücksprung nicht erlaubt ist) und unsere
//     Rücksprung-Adressen sind erlaubt (kein localhost in Kunden-Mails).
//  1. Registrierung bestätigen   2. Magic-Link   3. Passwort zurücksetzen (+ neues Passwort gilt)
//  4. E-Mail-Adresse ändern (Bestätigung an alte + neue Adresse)   5. Team-Einladung (neue Person)
//  Jeweils beide Link-Formen: Supabase-Standardlink (…/auth/v1/verify) UND token_hash-Direktlink
//  (/auth/confirm?token_hash=…), wie ihn eigene Mail-Vorlagen nutzen.
//
// Nutzung:  TEST_BASE=https://tutax-ivory.vercel.app node --env-file=.env.local scripts/test-email-links.mjs
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
const users = [];
const accounts = [];

async function track(uid) {
  users.push(uid);
  const { data } = await admin.from("account_members").select("account_id").eq("user_id", uid);
  for (const r of data ?? []) accounts.push(r.account_id);
}
async function mkUser(tag, extra = {}) {
  const email = `mail-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, ...extra });
  if (error) throw error;
  await track(data.user.id);
  return { email, uid: data.user.id };
}
const path_ = (page) => new URL(page.url()).pathname;
const confirmLink = (hash, type, next) =>
  `${BASE}/auth/confirm?token_hash=${hash}&type=${type}${next ? `&next=${encodeURIComponent(next)}` : ""}`;

const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
const fresh = async () => (await browser.newContext()).newPage();
try {
  // ── 0. Adressen ──
  console.log("0. Adressen in den Mails");
  const probe = await mkUser("probe");
  const notAllowed = await admin.auth.admin.generateLink({ type: "recovery", email: probe.email, options: { redirectTo: "https://nicht-erlaubt.example.org/x" } });
  const siteUrl = notAllowed.data?.properties?.redirect_to ?? "";
  ok(siteUrl.startsWith(BASE) || siteUrl.startsWith("https://tutax-ivory.vercel.app"), `Supabase-Site-URL zeigt auf die Live-App (${siteUrl || "?"})`);
  ok(!/localhost|127\.0\.0\.1/.test(siteUrl), "Keine localhost-Adresse als Ersatz-Ziel");
  for (const want of [`${BASE}/auth/confirm`, `${BASE}/auth/confirm?next=/reset`]) {
    const r = await admin.auth.admin.generateLink({ type: "magiclink", email: probe.email, options: { redirectTo: want } });
    ok(r.data?.properties?.redirect_to === want, `Rücksprung erlaubt: ${want.replace(BASE, "")} (bekam ${r.data?.properties?.redirect_to?.replace(BASE, "") ?? "?"})`);
  }

  // ── 1. Registrierung bestätigen ──
  console.log("1. Registrierung bestätigen");
  for (const form of ["verify", "token_hash"]) {
    const email = `mail-signup-${form}-${stamp}@example.com`;
    const { data, error } = await admin.auth.admin.generateLink({ type: "signup", email, password: PW, options: { redirectTo: `${BASE}/auth/confirm` } });
    if (error) {
      ok(false, `Registrierung (${form}): Link erzeugen — ${error.message}`);
      continue;
    }
    await track(data.user.id);
    const page = await fresh();
    await page.goto(form === "verify" ? data.properties.action_link : confirmLink(data.properties.hashed_token, "signup"), { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => /\/(app|onboarding)/.test(u.pathname), { timeout: 45_000 }).catch(() => {});
    const { data: u } = await admin.auth.admin.getUserById(data.user.id);
    ok(!!u?.user?.email_confirmed_at && /\/(app|onboarding)/.test(path_(page)), `Registrierung (${form}-Link): bestätigt + eingeloggt → ${path_(page)}`);
    await page.context().close();
  }

  // ── 2. Magic-Link ──
  console.log("2. Magic-Link");
  const ml = await mkUser("magic");
  await admin.from("accounts").update({ onboarded: true }).in("id", accounts);
  for (const form of ["verify", "token_hash"]) {
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: ml.email, options: { redirectTo: `${BASE}/auth/confirm` } });
    const page = await fresh();
    await page.goto(form === "verify" ? data.properties.action_link : confirmLink(data.properties.hashed_token, "magiclink"), { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 45_000 }).catch(() => {});
    ok(path_(page).startsWith("/app"), `Magic-Link (${form}): eingeloggt in der App → ${path_(page)}`);
    await page.context().close();
  }
  {
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: ml.email, options: { redirectTo: `${BASE}/auth/confirm` } });
    const link = confirmLink(data.properties.hashed_token, "magiclink");
    const p1 = await fresh();
    await p1.goto(link, { waitUntil: "domcontentloaded" });
    await p1.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 45_000 }).catch(() => {});
    const p2 = await fresh();
    await p2.goto(link, { waitUntil: "domcontentloaded" });
    await p2.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 45_000 }).catch(() => {});
    await p2.getByText(/nur einmal|ungültig|abgelaufen/i).first().waitFor({ timeout: 15_000 }).catch(() => {});
    const txt = await p2.locator("body").innerText().catch(() => "");
    ok(path_(p2) === "/login" && /nur einmal|ungültig|abgelaufen/i.test(txt), "Magic-Link zweimal benutzt → Anmeldeseite mit deutscher Erklärung");
    await p1.context().close();
    await p2.context().close();
  }

  // ── 3. Passwort zurücksetzen ──
  console.log("3. Passwort zurücksetzen");
  const rs = await mkUser("reset");
  await admin.from("accounts").update({ onboarded: true }).in("id", accounts);
  let n = 0;
  for (const form of ["verify", "token_hash"]) {
    const { data } = await admin.auth.admin.generateLink({ type: "recovery", email: rs.email, options: { redirectTo: `${BASE}/auth/confirm?next=/reset` } });
    const page = await fresh();
    await page.goto(form === "verify" ? data.properties.action_link : confirmLink(data.properties.hashed_token, "recovery", "/reset"), { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => u.pathname === "/reset", { timeout: 45_000 }).catch(() => {});
    const newPw = `Neu${++n}Passwort!${stamp}`;
    let set = false;
    if (path_(page) === "/reset") {
      await page.locator('input[name="password"]').first().fill(newPw);
      await page.locator('button[type="submit"]').first().click();
      await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 45_000 }).catch(() => {});
      set = !(await anon().auth.signInWithPassword({ email: rs.email, password: newPw })).error;
    }
    ok(set, `Passwort zurücksetzen (${form}): /reset erreicht, neues Passwort gilt → ${path_(page)}`);
    await page.context().close();
  }

  // ── 4. E-Mail-Adresse ändern ──
  console.log("4. E-Mail-Adresse ändern");
  const ec = await mkUser("change");
  const newEmail = `mail-neu-${stamp}@example.com`;
  const cur = await admin.auth.admin.generateLink({ type: "email_change_current", email: ec.email, newEmail, options: { redirectTo: `${BASE}/auth/confirm` } });
  const nxt = await admin.auth.admin.generateLink({ type: "email_change_new", email: ec.email, newEmail, options: { redirectTo: `${BASE}/auth/confirm` } });
  if (cur.error || nxt.error) ok(false, `E-Mail ändern: Links erzeugen — ${(cur.error || nxt.error).message}`);
  else {
    // Eingeloggt (wie in echt: der Nutzer hat die Änderung im Profil angestoßen).
    const page = await fresh();
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="email"]').first().fill(ec.email);
    await page.locator('input[name="password"]').first().fill(PW);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => /\/(app|onboarding)/.test(u.pathname), { timeout: 45_000 });
    for (const [label, r] of [["erster Link", cur], ["zweiter Link", nxt]]) {
      await page.goto(confirmLink(r.data.properties.hashed_token, "email_change"), { waitUntil: "domcontentloaded" });
      await page.getByTestId("email-notice").waitFor({ timeout: 30_000 }).catch(() => {});
      const notice = (await page.getByTestId("email-notice").innerText().catch(() => "")).replace(/\s+/g, " ");
      ok(path_(page) === "/app/settings/profil" && notice.length > 0 && !/ungültig oder abgelaufen/.test(notice), `E-Mail ändern (${label}): Profil mit klarer Meldung („${notice.slice(0, 90)}“)`);
    }
    await page.context().close();
    const { data: u } = await admin.auth.admin.getUserById(ec.uid);
    ok(u?.user?.email === newEmail, `E-Mail ändern: nach beiden Bestätigungen gilt die neue Adresse (${u?.user?.email})`);
  }

  // ── 5. Team-Einladung (neue Person) ──
  console.log("5. Team-Einladung");
  const owner = await mkUser("owner");
  const ownerAcc = accounts[accounts.length - 1];
  await admin.from("accounts").update({ onboarded: true, plan: "pro", name: `Einlade-Probe ${stamp}` }).eq("id", ownerAcc);
  const op = await fresh();
  await op.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await op.locator('input[name="email"]').first().fill(owner.email);
  await op.locator('input[name="password"]').first().fill(PW);
  await op.locator('button[type="submit"]').first().click();
  await op.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 45_000 });
  await op.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded" });
  const invitee = `mail-gast-${stamp}@example.com`;
  await op.locator("#invite-email").fill(invitee);
  await op.getByRole("button", { name: /Einladen/ }).click();
  await op.locator('[role="status"]').first().waitFor({ timeout: 30_000 }).catch(() => {});
  const status = (await op.locator('[role="status"]').first().innerText().catch(() => "")).replace(/\s+/g, " ");
  console.log(`    Rückmeldung: „${status.slice(0, 160)}“`);
  const shownLink = status.match(/https?:\/\/\S+\/invite\/[a-f0-9]+/)?.[0] ?? null;
  if (shownLink) ok(shownLink.startsWith(BASE), `Einladungs-Link zeigt auf die Live-App (${shownLink.slice(0, 50)}…)`);
  const { data: inv } = await admin.from("invitations").select("token, status").eq("account_id", ownerAcc).eq("email", invitee).single();
  ok(!!inv?.token, "Einladung gespeichert");
  await op.context().close();
  const gp = await fresh();
  await gp.goto(`${BASE}/invite/${inv.token}`, { waitUntil: "domcontentloaded" });
  const pwField = gp.locator('input[type="password"]').first();
  await pwField.waitFor({ timeout: 30_000 }).catch(() => {});
  await pwField.fill(PW).catch(() => {});
  await gp.getByRole("button", { name: /beitreten/i }).first().click().catch(() => {});
  await gp.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 60_000 }).catch(() => {});
  const { data: gu } = await admin.from("account_members").select("user_id, role").eq("account_id", ownerAcc);
  const joined = (gu ?? []).length === 2;
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const guest = list?.users?.find((u) => u.email === invitee);
  if (guest) await track(guest.id);
  ok(joined && path_(gp).startsWith("/app"), `Einladung angenommen: neue Person ist im Team und in der App → ${path_(gp)}`);
  await gp.context().close();
} finally {
  await browser.close();
  for (const acc of [...new Set(accounts)]) await admin.from("accounts").delete().eq("id", acc);
  for (const uid of [...new Set(users)]) await admin.auth.admin.deleteUser(uid).catch(() => {});
}
console.log(failed ? `\n✗ ${failed} Prüfung(en) fehlgeschlagen` : "\n✓ Alle E-Mail-Links funktionieren");
process.exit(failed ? 1 : 0);
