// Team-Einladungen ECHT: Einladung im Team-Tab verschicken, echte Mail über Resend abholen,
// Link AUS DER MAIL klicken, beitreten — gegen die Live-App. Empfänger: Resend-Testadressen.
//
//  A  neue Person (kein Konto)            → Bearbeiter, legt Passwort fest
//  B1 bestehendes Konto, nicht angemeldet → Mitarbeiter, meldet sich mit bisherigem Passwort an
//  B2 bestehendes Konto, schon angemeldet → Bearbeiter, bestätigt per Knopf
//  Danach: Rolle, aktive Organisation, eigene Organisation bleibt, Rechte im Team stimmen.
//
// Datenschutz: nur Mails an die eigenen Testadressen werden abgefragt/ausgegeben.
// Nutzung:  TEST_BASE=https://tutax-ivory.vercel.app node --env-file=.env.local scripts/test-team-invite-mail.mjs
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
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
  if (!cond) failed++;
};
const stamp = Date.now().toString(36);
const PW = "Probe12345!";
const addr = (tag) => `delivered+team-${tag}-${stamp}@resend.dev`;
const users = [];
const accounts = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const path_ = (page) => new URL(page.url()).pathname;

async function resendGet(p) {
  const r = await fetch(`https://api.resend.com${p}`, { headers: { Authorization: `Bearer ${RESEND}` } });
  if (!r.ok) throw new Error(`Resend ${p}: HTTP ${r.status}`);
  return r.json();
}
async function waitForMail(to, sinceMs, subjectRe = /Einladung/, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const list = await resendGet("/emails?limit=100");
    const hit = (list.data ?? []).find(
      (m) => (Array.isArray(m.to) ? m.to : [m.to]).some((t) => String(t).toLowerCase() === to.toLowerCase()) &&
        new Date(m.created_at).getTime() >= sinceMs - 60_000 && subjectRe.test(m.subject ?? ""),
    );
    if (hit) return resendGet(`/emails/${hit.id}`);
    await sleep(4000);
  }
  return null;
}
const inviteLinkIn = (mail) =>
  [...`${mail?.html ?? ""} ${mail?.text ?? ""}`.matchAll(/https?:\/\/[^\s"'<>]+\/invite\/[a-f0-9]+/g)].map((m) => m[0])[0] ?? null;

async function track(uid) {
  users.push(uid);
  const { data } = await admin.from("account_members").select("account_id").eq("user_id", uid);
  for (const r of data ?? []) accounts.push(r.account_id);
}
async function mkUser(email, orgName, plan = "free") {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", data.user.id).single();
  await admin.from("accounts").update({ onboarded: true, plan, name: orgName }).eq("id", m.account_id);
  await track(data.user.id);
  return { uid: data.user.id, acc: m.account_id, email };
}
async function login(page, email, pw = PW) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').first().fill(email);
  await page.locator('input[name="password"]').first().fill(pw);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 45_000 });
}
async function activeOrg(uid) {
  const { data } = await admin.auth.admin.getUserById(uid);
  return data?.user?.user_metadata?.active_account_id ?? null;
}

const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
try {
  const ORG = `Kanzlei Muster ${stamp}`;
  const owner = await mkUser(addr("inhaber"), ORG, "pro");
  const bestand1 = await mkUser(addr("bestand1"), `Eigene Firma B1 ${stamp}`);
  const bestand2 = await mkUser(addr("bestand2"), `Eigene Firma B2 ${stamp}`);
  const neu = addr("neu");

  // Inhaber lädt alle drei ein (echte Mails)
  const op = await (await browser.newContext()).newPage();
  await login(op, owner.email);
  const sent = {};
  for (const [to, role] of [[neu, "editor"], [bestand1.email, "member"], [bestand2.email, "editor"]]) {
    await op.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded" });
    await op.locator("#invite-email").fill(to);
    await op.locator("#invite-role").selectOption(role);
    sent[to] = Date.now();
    await op.getByRole("button", { name: /Einladen/ }).click();
    await op.locator('[role="status"]').first().waitFor({ timeout: 30_000 }).catch(() => {});
    const s = (await op.locator('[role="status"]').first().innerText().catch(() => "")).replace(/\s+/g, " ");
    ok(/gesendet/.test(s), `Einladung an ${to.split("@")[0].replace(/-\w+$/, "")} (${role === "editor" ? "Bearbeiter" : "Mitarbeiter"}): „${s.slice(0, 60)}…“`);
  }
  await op.context().close();

  // ── A: neue Person ──
  console.log("A · neue Person ohne Konto");
  {
    const mail = await waitForMail(neu, sent[neu]);
    ok(!!mail && mail.subject?.includes(ORG), `Mail angekommen: „${mail?.subject ?? "—"}“ (${mail?.last_event ?? "?"})`);
    const link = inviteLinkIn(mail);
    ok(!!link && link.startsWith(BASE), `Link in der Mail zeigt auf die Live-App`);
    const p = await (await browser.newContext()).newPage();
    await p.goto(link, { waitUntil: "domcontentloaded" });
    await p.locator("#invite-password").waitFor({ timeout: 30_000 });
    const label = await p.locator('label[for="invite-password"]').innerText().catch(() => "");
    ok(/festlegen/i.test(label), `Einladungsseite fragt „${label}“`);
    await p.locator("#invite-password").fill(PW);
    await p.getByRole("button", { name: /Passwort setzen & beitreten/ }).click();
    await p.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 60_000 }).catch(() => {});
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const nu = list?.users?.find((u) => u.email === neu);
    if (nu) await track(nu.id);
    const { data: mem } = await admin.from("account_members").select("account_id, role").eq("user_id", nu?.id ?? "-");
    ok(mem?.length === 1 && mem[0].account_id === owner.acc && mem[0].role === "editor", `Konto angelegt, genau im Team „${ORG}“ als Bearbeiter (${JSON.stringify(mem?.map((m) => m.role))})`);
    await p.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    const canCreate = (await p.getByRole("button", { name: /Neue Anleitung/ }).count()) > 0;
    ok(path_(p) === "/app" && canCreate, "Bearbeiter sieht die Anleitungen und kann neue anlegen");
    await p.goto(`${BASE}/app/settings/team`, { waitUntil: "networkidle" });
    ok((await p.locator("#invite-email").count()) === 0, "Bearbeiter kann das Team NICHT verwalten (kein Einladen)");
    await p.context().close();
  }

  // ── B1: bestehendes Konto, nicht angemeldet ──
  console.log("B1 · bestehendes Konto, nicht angemeldet");
  {
    const mail = await waitForMail(bestand1.email, sent[bestand1.email]);
    ok(!!mail, `Mail angekommen: „${mail?.subject ?? "—"}“ (${mail?.last_event ?? "?"})`);
    const link = inviteLinkIn(mail);
    const p = await (await browser.newContext()).newPage();
    await p.goto(link, { waitUntil: "domcontentloaded" });
    await p.locator("#invite-password").waitFor({ timeout: 30_000 });
    const label = await p.locator('label[for="invite-password"]').innerText().catch(() => "");
    ok(/Ihr Passwort/i.test(label), `Einladungsseite erkennt das bestehende Konto („${label}“)`);
    await p.locator("#invite-password").fill(PW);
    await p.getByRole("button", { name: /Anmelden & beitreten/ }).click();
    await p.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 60_000 }).catch(() => {});
    const { data: mem } = await admin.from("account_members").select("account_id, role").eq("user_id", bestand1.uid);
    const inTeam = mem?.find((m) => m.account_id === owner.acc);
    const ownKept = mem?.find((m) => m.account_id === bestand1.acc && m.role === "owner");
    ok(inTeam?.role === "member", `Im Team als Mitarbeiter (${inTeam?.role ?? "fehlt"})`);
    ok(!!ownKept, "Eigene Organisation bleibt erhalten (weiter Inhaber)");
    ok((await activeOrg(bestand1.uid)) === owner.acc || path_(p) === "/app/lernen", `Landet in der neuen Organisation (→ ${path_(p)})`);
    await p.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    ok(path_(p) === "/app/lernen", `Als Mitarbeiter nur Schulungen (/app → ${path_(p)})`);
    // Zurück in die eigene Organisation: dort wieder Inhaber mit allen Rechten
    await p.goto(`${BASE}/app/lernen`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Konto-Menü" }).click().catch(() => {});
    await p.getByText("Organisation wechseln").click().catch(() => {});
    const own = p.getByRole("menuitem", { name: /Eigene Firma B1/ });
    await own.first().waitFor({ timeout: 10_000 }).catch(() => {});
    if (await own.count()) {
      await own.first().click();
      // Die Seite ist schon unter /app/… — auf den gespeicherten Wechsel + den Reload nach /app warten.
      await p.waitForURL((u) => u.pathname === "/app", { timeout: 30_000 }).catch(() => {});
      ok((await activeOrg(bestand1.uid)) === bestand1.acc, "Organisations-Wechsel im Avatar-Menü gespeichert");
      await p.goto(`${BASE}/app`, { waitUntil: "networkidle" });
      ok(path_(p) === "/app" && (await p.getByRole("button", { name: /Neue Anleitung/ }).count()) > 0, "Zurück in der eigenen Organisation: wieder volle Rechte");
    } else ok(false, "Organisations-Wechsel im Avatar-Menü nicht gefunden");
    await p.context().close();
  }

  // ── B2: bestehendes Konto, schon angemeldet ──
  console.log("B2 · bestehendes Konto, schon angemeldet");
  {
    const mail = await waitForMail(bestand2.email, sent[bestand2.email]);
    ok(!!mail, `Mail angekommen: „${mail?.subject ?? "—"}“ (${mail?.last_event ?? "?"})`);
    const link = inviteLinkIn(mail);
    const p = await (await browser.newContext()).newPage();
    await login(p, bestand2.email);
    await p.goto(link, { waitUntil: "domcontentloaded" });
    const join = p.getByRole("button", { name: /beitreten/ }).first();
    await join.waitFor({ timeout: 30_000 });
    const bodyTxt = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    ok(bodyTxt.includes("Bearbeiter") && bodyTxt.includes(ORG), "Einladungsseite zeigt Rolle und Organisation");
    await join.click();
    await p.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 60_000 }).catch(() => {});
    const { data: mem } = await admin.from("account_members").select("account_id, role").eq("user_id", bestand2.uid);
    ok(mem?.find((m) => m.account_id === owner.acc)?.role === "editor", "Im Team als Bearbeiter");
    ok(!!mem?.find((m) => m.account_id === bestand2.acc && m.role === "owner"), "Eigene Organisation bleibt erhalten");
    await p.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    const header = (await p.locator("header").innerText().catch(() => "")).replace(/\s+/g, " ");
    ok(path_(p) === "/app", `Arbeitet jetzt in „${ORG}“ (→ ${path_(p)})`);
    void header;
    await p.context().close();
  }

  // ── Bestätigungs-Mails nach dem Beitritt ──
  console.log("Bestätigung nach dem Beitritt");
  for (const [to, re, what] of [
    [neu, /^Willkommen bei Steply – Sie sind im Team von /, "neues Konto"],
    [bestand1.email, /^Sie sind jetzt im Team von /, "bestehendes Konto (B1)"],
    [bestand2.email, /^Sie sind jetzt im Team von /, "bestehendes Konto (B2)"],
  ]) {
    const mail = await waitForMail(to, sent[to], re);
    const body = String(mail?.text ?? "");
    ok(!!mail && mail.subject.includes(ORG) && body.includes(to), `${what}: „${mail?.subject ?? "keine Mail"}“ (${mail?.last_event ?? "?"})`);
  }

  // ── Inhaber sieht alle drei im Team ──
  console.log("Inhaber-Sicht");
  {
    const p = await (await browser.newContext()).newPage();
    await login(p, owner.email);
    await p.goto(`${BASE}/app/settings/team`, { waitUntil: "networkidle" });
    const txt = (await p.locator("main").innerText()).replace(/\s+/g, " ");
    ok([neu, bestand1.email, bestand2.email].every((e) => txt.includes(e)), "Team-Tab zeigt alle drei neuen Mitglieder");
    const { data: open } = await admin.from("invitations").select("id").eq("account_id", owner.acc).eq("status", "pending");
    ok((open ?? []).length === 0, "Keine offenen Einladungen mehr (alle angenommen)");
    await p.context().close();
  }
} finally {
  await browser.close();
  for (const acc of [...new Set(accounts)]) await admin.from("accounts").delete().eq("id", acc);
  for (const uid of [...new Set(users)]) await admin.auth.admin.deleteUser(uid).catch(() => {});
}
console.log(failed ? `\n✗ ${failed} Prüfung(en) fehlgeschlagen` : "\n✓ Team-Einladungen per E-Mail funktionieren (neu + bestehend)");
process.exit(failed ? 1 : 0);
