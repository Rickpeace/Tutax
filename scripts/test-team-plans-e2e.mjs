// Team × Tarif Ende-zu-Ende: Pro- und Business-Organisation laden neue UND bestehende Personen
// als Bearbeiter bzw. Mitarbeiter ein; Annehmen über den echten Link (/invite/<token>);
// Bearbeiter nutzt Pro-/Business-Funktionen DER ORGANISATION (KI-Texte, Wissen, Offene Fragen,
// Farben, Erweiterung, Sprachen, „nur Team“); Mitarbeiter nur Schulungen; Grenzen, Neu senden,
// abgelaufene/benutzte Links, Entfernen, Rolle ändern, Verlassen; eigene Gratis-Org behält ihre
// Gratis-Grenzen, solange sie aktiv ist.
// Echter Login gegen die echte DB mit Wegwerf-Konten (werden am Ende gelöscht), Browser headless.
// Mailversand ist für den Test-Server ABGESCHALTET (RESEND_API_KEY leer) -> Links aus der DB.
//
// Nutzung:  npm run build  (einmal)  und dann
//           node --env-file=.env.local scripts/test-team-plans-e2e.mjs
//           TEAMP_DEV=1 -> gegen `next dev` statt `next start`; TEAMP_PORT=… anderer Port.
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolvePlaywright() {
  if (process.env.STEPLY_PW_DIR) {
    const p = path.join(process.env.STEPLY_PW_DIR, "node_modules", "playwright");
    if (existsSync(p)) return require(p);
  }
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

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(URL_, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const PORT = Number(process.env.TEAMP_PORT || 3291);
const BASE = `http://localhost:${PORT}`;
const DEV = !!process.env.TEAMP_DEV;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const mail = (k) => `tutax-teamp-${k}-${stamp}@example.com`;
const E = {
  proOwner: mail("proowner"),
  bizOwner: mail("bizowner"),
  x: mail("x"), // bestehend (Gratis): Pro-Bearbeiter, Business-Mitarbeiter
  y: mail("y"), // bestehend (Gratis): Business-Bearbeiter
  npe: mail("npe"), // neu: Pro-Bearbeiter
  npm: mail("npm"), // neu: Pro-Mitarbeiter
  nbe: mail("nbe"), // neu: Business-Bearbeiter
  nbm: mail("nbm"), // neu: Business-Mitarbeiter
};
const EXTRA = ["fill1", "fill2", "over", "alt"]; // weitere Einladungs-Adressen (werden nie Konten)

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

// ---------- Beobachtung: 500er, Next-Fehlerseiten, englische Standardtexte ----------
const serverErrors = [];
const ENGLISH = /Application error|Something went wrong|Server Components render|omitted in production|An unexpected response was received|Internal Server Error|This page could(n't| not) load/i;
function watch(page, who) {
  page.on("response", (r) => {
    if (r.status() >= 500) serverErrors.push(`${who}: ${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`);
  });
  page.on("pageerror", (e) => serverErrors.push(`${who}: pageerror ${String(e.message).slice(0, 160)}`));
}
async function noEnglish(page, label) {
  const txt = await page.locator("body").innerText().catch(() => "");
  const hit = txt.match(ENGLISH);
  ok(!hit, `${label}: kein englischer Fehlertext${hit ? ` („${hit[0]}“)` : ""}`);
}
async function errorToasts(page) {
  return page.locator("[data-sonner-toast][data-type=error]").allInnerTexts().catch(() => []);
}

async function waitForServer(timeoutMs = 240_000) {
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

/** Test-Server beenden: den Prozess, der den Port belegt (sprachunabhängig, synchron). */
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

// ---------- DB-Helfer ----------
const createdUsers = new Set();
const createdAccounts = new Set();
async function mkUser(email, orgName, plan = "free") {
  const r = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (r.error) throw r.error;
  const uid = r.data.user.id;
  createdUsers.add(uid);
  const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", uid);
  const aid = m[0].account_id;
  createdAccounts.add(aid);
  const upd = await admin.from("accounts").update({ name: orgName, onboarded: true, plan }).eq("id", aid);
  if (upd.error) throw upd.error;
  return { uid, aid };
}
async function uidByEmail(email) {
  for (let page = 1; page < 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const u = data?.users?.find((x) => x.email === email);
    if (u) return u.id;
    if (!data?.users?.length || data.users.length < 1000) return null;
  }
  return null;
}
async function memberships(uid) {
  const { data } = await admin.from("account_members").select("account_id, role").eq("user_id", uid);
  return data ?? [];
}
async function activeMeta(uid) {
  const { data } = await admin.auth.admin.getUserById(uid);
  return data.user?.user_metadata?.active_account_id ?? null;
}
async function pendingInvite(accountId, email) {
  const { data } = await admin
    .from("invitations")
    .select("id, token, role")
    .eq("account_id", accountId)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  return data;
}
async function asUser(email) {
  const c = createClient(URL_, PUB_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw error;
  return c;
}
async function recorderMe(token) {
  const r = await fetch(`${BASE}/api/recorder/me`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}
async function dbWait(fn, pred, tries = 30) {
  let v;
  for (let i = 0; i < tries; i++) {
    v = await fn();
    if (pred(v)) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
  return v;
}

// ---------- UI-Helfer ----------
const path_ = (page) => new URL(page.url()).pathname;
async function go(page, p) {
  await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
}
async function login(page, email) {
  await go(page, "/login");
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 90_000 });
}
async function invite(page, email, role) {
  await go(page, "/app/settings/team");
  await page.locator("#invite-email").waitFor({ timeout: 90_000 });
  await page.fill("#invite-email", email);
  await page.selectOption("#invite-role", role);
  const btn = page.getByRole("button", { name: "Einladen" });
  if (await btn.isDisabled()) return "GESPERRT: " + (await page.locator("main").innerText());
  await btn.click();
  const status = page.locator('[role="status"]');
  await status.waitFor({ timeout: 60_000 });
  return (await status.innerText()).trim();
}
/** Neue Adresse: Passwort festlegen & beitreten. */
async function acceptNew(page, token) {
  await go(page, `/invite/${token}`);
  await page.getByText("Passwort festlegen").first().waitFor({ timeout: 60_000 });
  await page.fill("#invite-password", PW);
  await page.getByRole("button", { name: /Passwort setzen/ }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 90_000 });
}
/** Bestehendes Konto, abgemeldet: mit eigenem Passwort anmelden & beitreten. */
async function acceptExisting(page, token) {
  await go(page, `/invite/${token}`);
  await page.getByText("Sie haben schon ein Konto").waitFor({ timeout: 60_000 });
  await page.fill("#invite-password", PW);
  await page.getByRole("button", { name: /Anmelden & beitreten/ }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 90_000 });
}
/** Bestehendes Konto, angemeldet: Bestätigen. */
async function joinLoggedIn(page, token) {
  await go(page, `/invite/${token}`);
  await page.getByText("Einladung annehmen").waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /beitreten/ }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 90_000 });
}
async function switchOrgViaMenu(page, orgName) {
  await go(page, "/app/settings/profil");
  await page.getByRole("button", { name: "Konto-Menü" }).click();
  await page.getByText("Organisation wechseln").click();
  await page.getByRole("menuitem", { name: orgName }).click();
  await page.waitForURL((u) => u.pathname === "/app" || u.pathname === "/app/lernen", { timeout: 60_000 });
  await page.waitForTimeout(800);
}
async function menuOrgNames(page) {
  await page.getByRole("button", { name: "Konto-Menü" }).click();
  const sub = page.getByText("Organisation wechseln");
  if (!(await sub.waitFor({ timeout: 10_000 }).then(() => true, () => false))) {
    await page.keyboard.press("Escape");
    return [];
  }
  await sub.click();
  // Untermenü öffnet animiert: auf einen Org-Eintrag (enthält den Test-Stempel) warten.
  await page.getByRole("menuitem", { name: new RegExp(stamp) }).first().waitFor({ timeout: 10_000 }).catch(() => {});
  const names = await page.getByRole("menuitem").allInnerTexts();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  return names.map((n) => n.trim());
}
async function makeRecorderCode(page) {
  await go(page, "/app/settings/erweiterung");
  const btn = page.getByRole("button", { name: /Code erzeugen/ });
  if (!(await btn.first().isVisible().catch(() => false))) await page.getByText("Code manuell eingeben").click();
  const field = page.locator("input[readonly]").first();
  const before = (await field.count()) ? await field.inputValue() : "";
  await page.getByRole("button", { name: /Code erzeugen/ }).first().click();
  const handle = await page.waitForFunction(
    (prev) => {
      const v = document.querySelector("input[readonly]")?.value ?? "";
      return /^[0-9a-f-]{36}$/i.test(v) && v !== prev ? v : null;
    },
    before,
    { timeout: 30_000 },
  );
  return handle.jsonValue();
}
async function createTutorialUI(page, title) {
  await go(page, "/app");
  await page.locator("header").getByRole("button", { name: /Neue Anleitung/ }).click();
  await page.getByRole("dialog").getByText("Selbst bauen", { exact: true }).click();
  await page.fill("#title", title);
  await page.locator('form button[type="submit"]').last().click();
  await page.waitForURL((u) => /^\/app\/tutorials\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 90_000 });
  return path_(page).split("/").pop();
}
async function addStepUI(page, title, first) {
  if (first) await page.getByRole("button", { name: /Schritt von Hand anlegen/ }).click();
  else await page.getByRole("button", { name: "Neuen Schritt anlegen" }).first().click();
  const t = page.locator("#step-title");
  await t.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await t.fill(title);
  try {
    await page.getByTestId("step-save-state").getByRole("button", { name: /Speichern/ }).click({ timeout: 30_000 });
  } catch (e) {
    // Diagnose: was liegt über dem Knopf?
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/teamp-save-blocked.png` }).catch(() => {});
    const open = await page.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[role="menu"],[data-open]')]
        .map((el) => `${el.tagName}[role=${el.getAttribute("role")}] ${(el.textContent || "").slice(0, 60)}`),
    ).catch(() => []);
    console.log("  ℹ Offen beim Speichern:", JSON.stringify(open));
    throw e;
  }
  try {
    await page.getByTestId("step-save-state").getByText("Gespeichert").waitFor({ timeout: 30_000 });
  } catch (e) {
    const state = await page.getByTestId("step-save-state").innerText().catch(() => "?");
    const toasts = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
    console.log(`  ℹ Speichern: Status „${state.replace(/\s+/g, " ")}“, Meldungen ${JSON.stringify(toasts)}`);
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/teamp-save-state.png` }).catch(() => {});
    throw e;
  }
}

let server, browser;
const A = {};
try {
  // ================= Aufbau =================
  const proOwner = await mkUser(E.proOwner, `Pro Kanzlei ${stamp}`, "pro");
  const bizOwner = await mkUser(E.bizOwner, `Business Kanzlei ${stamp}`, "business");
  const x = await mkUser(E.x, `X Eigene ${stamp}`, "free");
  const y = await mkUser(E.y, `Y Eigene ${stamp}`, "free");
  A.pro = proOwner.aid;
  A.biz = bizOwner.aid;
  const PRO_NAME = `Pro Kanzlei ${stamp}`, BIZ_NAME = `Business Kanzlei ${stamp}`, Y_NAME = `Y Eigene ${stamp}`, X_NAME = `X Eigene ${stamp}`;

  // Schulung (öffentlich + Team) und ein Entwurf in der Pro-Org, damit Mitarbeiter etwas haben.
  const trainId = crypto.randomUUID(), trainStep = crypto.randomUUID(), draftId = crypto.randomUUID();
  let r = await admin.from("tutorials").insert({ id: trainId, account_id: A.pro, title: `Schulung ${stamp}`, slug: `schulung-${stamp}`, status: "published", visibility: "public", in_lernen: true });
  if (r.error) throw r.error;
  r = await admin.from("steps").insert({ id: trainStep, tutorial_id: trainId, title: "Einziger Schritt", position: 1, is_decision: false });
  if (r.error) throw r.error;
  await admin.from("tutorials").update({ root_step_id: trainStep }).eq("id", trainId);
  await admin.from("tutorials").insert({ id: draftId, account_id: A.pro, title: `Entwurf ${stamp}`, status: "draft", visibility: "public" });
  // Eine offene Chat-Frage (Offene Fragen) in der Pro-Org.
  const GAP_Q = `Wie storniere ich eine Rechnung ${stamp}?`;
  r = await admin.from("events").insert({ account_id: A.pro, type: "chat", status: "no_answer", question: GAP_Q });
  if (r.error) console.log("  ℹ Offene Frage nicht angelegt:", r.error.message);

  const env = { ...process.env, RESEND_API_KEY: "", INVITE_FROM_EMAIL: "" };
  delete env.NODE_OPTIONS;
  server = spawn("npx", ["next", DEV ? "dev" : "start", "-p", String(PORT)], {
    cwd: path.join(__dirname, ".."),
    shell: true,
    stdio: "ignore",
    env,
  });
  console.log(`… Server (${DEV ? "dev" : "start"}) auf ${PORT} …`);
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const newPage = async (who) => {
    const p = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
    watch(p, who);
    return p;
  };

  // ================= 1) Einladen + Annehmen =================
  const po = await newPage("pro-owner");
  await login(po, E.proOwner);
  const bo = await newPage("biz-owner");
  await login(bo, E.bizOwner);

  const inv = {};
  for (const [page, aid, email, role] of [
    [po, A.pro, E.npe, "editor"],
    [po, A.pro, E.npm, "member"],
    [po, A.pro, E.x, "editor"],
    [bo, A.biz, E.nbe, "editor"],
    [bo, A.biz, E.nbm, "member"],
    [bo, A.biz, E.y, "editor"],
    [bo, A.biz, E.x, "member"],
  ]) {
    const msg = await invite(page, email, role);
    const row = await pendingInvite(aid, email);
    ok(!!row && row.role === role && /Beitritts-Link|gesendet/.test(msg), `Einladung ${email.split("-")[2]} als ${role} (${aid === A.pro ? "Pro" : "Business"}) angelegt`);
    inv[`${aid}:${email}`] = row;
  }

  // (a) neue Adressen
  const pNpe = await newPage("npe");
  await acceptNew(pNpe, inv[`${A.pro}:${E.npe}`].token);
  const pNpm = await newPage("npm");
  await acceptNew(pNpm, inv[`${A.pro}:${E.npm}`].token);
  const pNbe = await newPage("nbe");
  await acceptNew(pNbe, inv[`${A.biz}:${E.nbe}`].token);
  const pNbm = await newPage("nbm");
  await acceptNew(pNbm, inv[`${A.biz}:${E.nbm}`].token);
  const U = {};
  for (const k of ["npe", "npm", "nbe", "nbm"]) {
    U[k] = await uidByEmail(E[k]);
    if (U[k]) createdUsers.add(U[k]);
  }
  for (const [k, aid, role, page] of [["npe", A.pro, "editor", pNpe], ["npm", A.pro, "member", pNpm], ["nbe", A.biz, "editor", pNbe], ["nbm", A.biz, "member", pNbm]]) {
    const m = await memberships(U[k]);
    ok(m.length === 1 && m[0].account_id === aid && m[0].role === role,
      `Neu ${k}: genau EINE Mitgliedschaft (${role}) – kein leeres Eigen-Konto (${JSON.stringify(m.map((x) => x.role))})`);
    const want = role === "member" ? "/app/lernen" : "/app";
    await page.waitForURL((u) => u.pathname === want, { timeout: 30_000 }).catch(() => {});
    ok(path_(page) === want, `Neu ${k}: landet auf ${want} (${path_(page)})`);
  }

  // (b) bestehende: X nimmt Pro (abgemeldet) an, danach Business (angemeldet) an
  const pX = await newPage("x");
  await acceptExisting(pX, inv[`${A.pro}:${E.x}`].token);
  ok((await activeMeta(x.uid)) === A.pro, "X: nach Annehmen ist die Pro-Org aktiv");
  await joinLoggedIn(pX, inv[`${A.biz}:${E.x}`].token);
  const xm = await memberships(x.uid);
  ok(xm.length === 3 && xm.some((m) => m.account_id === A.pro && m.role === "editor") && xm.some((m) => m.account_id === A.biz && m.role === "member") && xm.some((m) => m.account_id === x.aid && m.role === "owner"),
    `X: eigene Org (Inhaber) + Pro (Bearbeiter) + Business (Mitarbeiter) (${JSON.stringify(xm.map((m) => m.role))})`);
  ok((await activeMeta(x.uid)) === A.biz, "X: nach zweitem Beitritt ist Business aktiv");
  await pX.waitForURL((u) => u.pathname === "/app/lernen", { timeout: 30_000 }).catch(() => {});
  ok(path_(pX) === "/app/lernen", `X als Business-Mitarbeiter landet in den Schulungen (${path_(pX)})`);
  const xOrgs = await menuOrgNames(pX);
  ok([X_NAME, PRO_NAME, BIZ_NAME].every((o) => xOrgs.some((n) => n.includes(o))),
    `X: Org-Umschalter zeigt alle drei Orgs (${xOrgs.join(" | ")})`);

  const pY = await newPage("y");
  await acceptExisting(pY, inv[`${A.biz}:${E.y}`].token);
  ok((await activeMeta(y.uid)) === A.biz, "Y: nach Annehmen ist die Business-Org aktiv");
  const yOrgs = await menuOrgNames(pY);
  ok([Y_NAME, BIZ_NAME].every((o) => yOrgs.some((n) => n.includes(o))) && !yOrgs.some((n) => n.includes(PRO_NAME)), `Y: Umschalter zeigt eigene + Business (${yOrgs.join(" | ")})`);

  // ================= 2) Bearbeiter in Pro (X) =================
  await switchOrgViaMenu(pX, PRO_NAME);
  ok((await activeMeta(x.uid)) === A.pro, "X: Wechsel in die Pro-Org per Avatar-Menü");
  const tutX = await createTutorialUI(pX, `Bearbeiter-Anleitung ${stamp}`);
  const { data: tRow } = await admin.from("tutorials").select("account_id").eq("id", tutX).single();
  ok(tRow?.account_id === A.pro, "Bearbeiter (Pro): Anleitung angelegt – gehört der Pro-Org");
  await addStepUI(pX, "Rechnung öffnen", true);
  await addStepUI(pX, "Auf Stornieren klicken", false);
  const nSteps = (await admin.from("steps").select("id").eq("tutorial_id", tutX)).data?.length ?? 0;
  ok(nSteps === 2, `Bearbeiter (Pro): 2 Schritte gespeichert (${nSteps})`);
  await pX.getByTestId("editor-controls").getByTestId("publish-button").click();
  await pX.getByTestId("editor-controls").getByTestId("published-badge").waitFor({ timeout: 60_000 }).catch(() => {});
  const pub = await dbWait(async () => (await admin.from("tutorials").select("status").eq("id", tutX).single()).data?.status, (s) => s === "published");
  ok(pub === "published", "Bearbeiter (Pro): Anleitung veröffentlicht");
  // KI-Texte (Pro-Funktion der ORG; X' eigene Org ist gratis)
  await go(pX, `/app/tutorials/${tutX}`);
  const kiBtn = pX.getByTestId("improve-texts");
  ok(await kiBtn.waitFor({ timeout: 60_000 }).then(() => true, () => false), "Bearbeiter (Pro): „Texte mit KI verbessern“ sichtbar");
  if (await kiBtn.isVisible().catch(() => false)) {
    await kiBtn.click();
    const dlg = pX.getByTestId("improve-texts-dialog");
    await dlg.waitFor({ timeout: 10_000 });
    const res = pX.getByTestId("improve-texts-list").or(pX.getByTestId("improve-texts-error")).or(pX.getByTestId("improve-texts-empty"));
    await res.first().waitFor({ timeout: 90_000 }).catch(() => {});
    const dlgText = await dlg.innerText().catch(() => "");
    ok(!/Pro-Tarif|Upgrade/.test(dlgText) && ((await pX.getByTestId("improve-texts-list").count()) > 0 || (await pX.getByTestId("improve-texts-empty").count()) > 0),
      `Bearbeiter (Pro): KI-Vorschläge kommen (kein Tarif-Hinweis) („${dlgText.replace(/\s+/g, " ").slice(0, 80)}…“)`);
    await pX.keyboard.press("Escape");
  }
  await noEnglish(pX, "Editor (Bearbeiter Pro)");
  // Aktualität prüfen (Pro) über die API wie der Knopf
  const drift = await pX.evaluate(async (id) => {
    const r = await fetch(`/api/tutorials/${id}/check`, { method: "POST" });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, tutX);
  ok(drift.s !== 403 && drift.s < 500, `Bearbeiter (Pro): „Aktualität prüfen“ erlaubt (HTTP ${drift.s})`);

  // Wissensdatenbank
  await go(pX, "/app/assistent/wissen");
  await pX.getByRole("button", { name: /Neuer Artikel/ }).first().click();
  await pX.waitForURL((u) => /\/app\/assistent\/wissen\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 60_000 });
  const artId = path_(pX).split("/").pop();
  await pX.getByPlaceholder("Titel des Artikels").fill(`Stornoregeln ${stamp}`);
  await pX.getByRole("button", { name: /Speichern/ }).click();
  await pX.getByText("Gespeichert").first().waitFor({ timeout: 30_000 }).catch(() => {});
  await pX.getByRole("switch").first().click();
  const art = await dbWait(async () => (await admin.from("kb_articles").select("status, title, account_id").eq("id", artId).single()).data, (a) => a?.status === "published");
  ok(art?.status === "published" && art.title === `Stornoregeln ${stamp}` && art.account_id === A.pro, `Bearbeiter (Pro): Wissensartikel angelegt + im KI-Assistenten aktiv (${JSON.stringify(art)})`);
  ok(!(await errorToasts(pX)).length, `Wissen: keine Fehlermeldung (${(await errorToasts(pX)).join(" | ")})`);
  // Offene Fragen
  await go(pX, "/app/assistent/fragen");
  await pX.waitForTimeout(1500);
  const fragenTxt = await pX.locator("main").innerText().catch(() => "");
  ok(path_(pX) === "/app/assistent/fragen" && !/Pro-Tarif|Upgrade/.test(fragenTxt) && fragenTxt.includes(GAP_Q), `Bearbeiter (Pro): Offene Fragen zeigt die Frage, ohne Tarif-Sperre (${path_(pX)})`);
  // Aussehen: Farben (Pro)
  await go(pX, "/app/settings/aussehen");
  const colorIn = pX.locator('input[name="color-primary"]');
  await colorIn.waitFor({ timeout: 60_000 });
  await colorIn.evaluate((el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, "#123456");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await pX.getByRole("region", { name: "Ungespeicherte Änderungen" }).getByRole("button", { name: "Speichern" }).click();
  await pX.getByText("Farben gespeichert").first().waitFor({ timeout: 30_000 }).catch(() => {});
  const th = await dbWait(async () => (await admin.from("themes").select("tokens").eq("account_id", A.pro).single()).data?.tokens, (t) => t?.colors?.primary === "#123456");
  ok(th?.colors?.primary === "#123456", `Bearbeiter (Pro): Farben gespeichert (${th?.colors?.primary})`);
  ok(!(await errorToasts(pX)).length, `Aussehen: keine Fehlermeldung (${(await errorToasts(pX)).join(" | ")})`);
  // Erweiterung verbinden
  const tokX = await makeRecorderCode(pX);
  const meX = await recorderMe(tokX);
  ok(meX.status === 200, `Bearbeiter (Pro): Erweiterung verbunden (/api/recorder/me ${meX.status})`);
  const { data: tokRow } = await admin.from("recorder_tokens").select("account_id, user_id").eq("token", tokX).single();
  ok(tokRow?.account_id === A.pro && tokRow?.user_id === x.uid, "Erweiterung: Verbindung gehört X in der Pro-Org");
  // Team nicht verwaltbar
  await go(pX, "/app/settings/team");
  await pX.getByText(/Mitglieder \(/).waitFor({ timeout: 60_000 }).catch(() => {});
  ok((await pX.locator("#invite-email").count()) === 0 && (await pX.getByRole("button", { name: /entfernen/ }).count()) === 0,
    "Bearbeiter (Pro): Team-Seite ohne Einladen/Entfernen");
  const inviteTry = await pX.evaluate(() => document.body.innerText.includes("Rolle von"));
  ok(!inviteTry, "Bearbeiter (Pro): keine Rollen-Auswahl");
  await noEnglish(pX, "Team-Seite (Bearbeiter)");

  // ================= 2b) Bearbeiter in Business (Y) =================
  await go(pY, "/app/settings/sprachen");
  const sw = pY.getByRole("switch", { name: "Englisch" });
  await sw.waitFor({ timeout: 60_000 });
  await sw.click();
  const langs = await dbWait(async () => (await admin.from("accounts").select("languages").eq("id", A.biz).single()).data?.languages ?? [], (l) => l.includes("en"));
  ok(langs.includes("en"), "Bearbeiter (Business): Sprache Englisch eingeschaltet");
  const tutY = await createTutorialUI(pY, `Intern ${stamp}`);
  await addStepUI(pY, "Interner Schritt", true);
  const controls = pY.getByTestId("editor-controls");
  const group = controls.getByRole("group", { name: "Wer sieht die Anleitung?" });
  await group.getByRole("button", { name: "Team", exact: true }).click();
  await dbWait(async () => (await admin.from("tutorials").select("in_lernen").eq("id", tutY).single()).data?.in_lernen, (v) => v === true);
  await pY.waitForTimeout(600);
  await group.getByRole("button", { name: "Hilfe-Seite (für alle)" }).click();
  const vis = await dbWait(async () => (await admin.from("tutorials").select("visibility").eq("id", tutY).single()).data?.visibility, (v) => v === "internal");
  ok(vis === "internal", `Bearbeiter (Business): „nur Team“ (intern) möglich (${vis})`);
  ok(!(await errorToasts(pY)).length, `Business-Editor: keine Fehlermeldung (${(await errorToasts(pY)).join(" | ")})`);

  // Y wechselt in die EIGENE Gratis-Org: dort gelten Gratis-Grenzen
  await switchOrgViaMenu(pY, Y_NAME);
  ok((await activeMeta(y.uid)) === y.aid, "Y: eigene Gratis-Org aktiv");
  await go(pY, "/app/settings/sprachen");
  const swFree = pY.getByRole("switch", { name: "Englisch" });
  await swFree.waitFor({ timeout: 60_000 });
  ok(await swFree.isDisabled(), "Y (eigene Gratis-Org): Sprachen gesperrt");
  const tutYFree = await createTutorialUI(pY, `Gratis ${stamp}`);
  await addStepUI(pY, "Schritt", true);
  ok((await pY.getByTestId("improve-texts").count()) === 0, "Y (eigene Gratis-Org): kein „Texte mit KI verbessern“");
  const driftFree = await pY.evaluate(async (id) => (await fetch(`/api/tutorials/${id}/check`, { method: "POST" })).status, tutYFree);
  ok(driftFree === 403, `Y (eigene Gratis-Org): „Aktualität prüfen“ gesperrt (HTTP ${driftFree})`);
  await go(pY, "/app/assistent/wissen");
  await pY.waitForTimeout(1500);
  ok((await pY.getByRole("button", { name: /Neuer Artikel/ }).count()) === 0, "Y (eigene Gratis-Org): Wissensdatenbank mit Tarif-Hinweis statt „Neuer Artikel“");
  // Business-Org bleibt unberührt
  const { data: bizAcc } = await admin.from("accounts").select("plan").eq("id", A.biz).single();
  const { data: yAcc } = await admin.from("accounts").select("plan").eq("id", y.aid).single();
  ok(bizAcc.plan === "business" && yAcc.plan === "free", "Tarife: Business bleibt Business, Y' Org bleibt Gratis");
  await switchOrgViaMenu(pY, BIZ_NAME);
  await go(pY, "/app/settings/sprachen");
  await pY.getByRole("switch", { name: "Englisch" }).waitFor({ timeout: 60_000 });
  ok(!(await pY.getByRole("switch", { name: "Englisch" }).isDisabled()), "Y zurück in Business: Sprachen wieder schaltbar");

  // ================= 3) Mitarbeiter (npm in Pro) =================
  const navText = await pNpm.locator('nav[aria-label="Hauptbereiche"]').innerText().catch(() => "");
  ok(navText.includes("Schulungen") && !navText.includes("Anleitungen"), `Mitarbeiter: Navigation nur Schulungen (${navText.replace(/\s+/g, " ").trim()})`);
  for (const p of ["/app", "/app/settings/team", "/app/settings/aussehen", "/app/settings/erweiterung", "/app/assistent/wissen", "/app/assistent/fragen", `/app/tutorials/${tutX}`, "/app/settings/sprachen"]) {
    await go(pNpm, p);
    await pNpm.waitForURL((u) => u.pathname === "/app/lernen", { timeout: 20_000 }).catch(() => {});
    ok(path_(pNpm) === "/app/lernen", `Mitarbeiter: ${p} -> Schulungen`);
  }
  await go(pNpm, "/app/settings/profil");
  await pNpm.waitForTimeout(1200);
  ok(path_(pNpm) === "/app/settings/profil", "Mitarbeiter: Profil erreichbar");
  await go(pNpm, `/app/lernen/${trainId}`);
  await pNpm.getByRole("button", { name: "Fertig", exact: true }).click({ timeout: 30_000 });
  await pNpm.getByRole("button", { name: "Als absolviert markieren" }).click({ timeout: 30_000 });
  const comp = await dbWait(async () => (await admin.from("tutorial_completions").select("id").eq("tutorial_id", trainId).eq("user_id", U.npm)).data ?? [], (c) => c.length === 1);
  ok(comp.length === 1, "Mitarbeiter: Schulung absolviert (DB)");
  const mr = await asUser(E.npm);
  ok(!((await mr.from("tutorials").select("id").eq("id", draftId)).data ?? []).length, "Mitarbeiter (REST): kein Entwurf lesbar");
  ok(((await mr.from("tutorials").select("id").eq("id", trainId)).data ?? []).length === 1, "Mitarbeiter (REST): veröffentlichte Schulung lesbar");
  const kbDraft = await admin.from("kb_articles").insert({ account_id: A.pro, title: `KB-Entwurf ${stamp}`, status: "draft" }).select("id").single();
  ok(!((await mr.from("kb_articles").select("id").eq("id", kbDraft.data?.id)).data ?? []).length, "Mitarbeiter (REST): kein Wissens-Entwurf lesbar");
  // Mitarbeiter kann per API keine Erweiterungs-Verbindung erzeugen / nichts schreiben
  const upd = await mr.from("tutorials").update({ title: "gehackt" }).eq("id", tutX).select("id");
  ok(!(upd.data ?? []).length, "Mitarbeiter (REST): Anleitung nicht änderbar");
  // Business-Mitarbeiter (nbm)
  ok(path_(pNbm) === "/app/lernen", "Business-Mitarbeiter: in den Schulungen");
  await noEnglish(pNbm, "Schulungen (Business-Mitarbeiter)");

  // ================= 4) Grenzen & Kanten =================
  // Pro: Inhaber + npe + npm + X = 4 -> eine offene Einladung = 5 -> nächste abgelehnt
  const fill1 = await invite(po, mail("fill1"), "member");
  ok(/Beitritts-Link|gesendet/.test(fill1), "Pro: 5. Platz (offene Einladung) geht");
  const over = await invite(po, mail("over"), "member");
  ok(/erlaubt 5 Personen/.test(over) || /GESPERRT/.test(over), `Pro voll: klare deutsche Meldung („${over.replace(/\s+/g, " ").slice(0, 90)}“)`);
  await go(po, "/app/settings/team");
  ok((await po.getByTestId("team-seats").innerText()).includes("5 von 5"), "Pro: Team-Seite zeigt „5 von 5 Plätzen“");
  // Server lehnt auch am gesperrten Knopf vorbei ab
  await po.fill("#invite-email", mail("over"));
  await po.$eval('form button[type="submit"]', (b) => { b.disabled = false; });
  await po.locator('form button[type="submit"]').click();
  await po.locator('[role="status"]').waitFor({ timeout: 30_000 });
  ok(/erlaubt 5 Personen/.test(await po.locator('[role="status"]').innerText()), "Pro voll: Server lehnt ab (deutsch)");

  // Neu senden: neuer Link, alter ungültig (abgemeldet + angemeldet)
  const f1 = await pendingInvite(A.pro, mail("fill1"));
  const row = po.locator("li", { hasText: mail("fill1") });
  await row.getByRole("button", { name: /Neu senden/ }).click();
  await po.getByText(/Neue Einladung an/).first().waitFor({ timeout: 30_000 });
  const f1b = await pendingInvite(A.pro, mail("fill1"));
  ok(!!f1b && f1b.token !== f1.token, "Neu senden (auch bei vollem Team): frischer Link");
  const anon = await newPage("anon");
  await go(anon, `/invite/${f1.token}`);
  await anon.waitForURL((u) => u.pathname === "/login", { timeout: 30_000 }).catch(() => {});
  ok(path_(anon) === "/login" && (await anon.getByText("nicht mehr gültig").count()) > 0, "Alter Link (abgemeldet): Anmeldeseite erklärt „nicht mehr gültig“");
  // Angemeldet (npe) öffnet den alten, fremden Link
  await go(pNpe, `/invite/${f1.token}`);
  await pNpe.waitForTimeout(2000);
  const usedTxt = await pNpe.locator("body").innerText();
  ok(/nicht mehr gültig/.test(usedTxt), `Alter Link (angemeldet): klare Meldung statt stiller Weiterleitung (${path_(pNpe)})`);
  // Eigener, schon angenommener Link (angemeldet) -> einfach in die App
  await go(pNpe, `/invite/${inv[`${A.pro}:${E.npe}`].token}`);
  await pNpe.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 30_000 }).catch(() => {});
  ok(path_(pNpe).startsWith("/app"), `Eigener angenommener Link (angemeldet): direkt in die App (${path_(pNpe)})`);
  // Abgelaufen
  await admin.from("invitations").update({ created_at: new Date(Date.now() - 15 * 86400_000).toISOString() }).eq("id", f1b.id);
  await go(anon, `/invite/${f1b.token}`);
  ok((await anon.getByText("Einladung abgelaufen").count()) > 0, "Abgelaufener Link: „Einladung abgelaufen“");
  // Abgelaufene belegt keinen Platz -> neue Einladung geht wieder
  const alt = await invite(po, mail("alt"), "member");
  ok(/Beitritts-Link|gesendet/.test(alt), "Abgelaufene Einladung belegt keinen Platz mehr");
  // Team voll beim ANNEHMEN (Tarif-Downgrade nach dem Einladen)
  await admin.from("accounts").update({ plan: "free" }).eq("id", A.pro);
  const altInv = await pendingInvite(A.pro, mail("alt"));
  await go(anon, `/invite/${altInv.token}`);
  await anon.getByText("Passwort festlegen").first().waitFor({ timeout: 60_000 });
  await anon.fill("#invite-password", PW);
  await anon.getByRole("button", { name: /Passwort setzen/ }).click();
  await anon.getByText(/Team ist voll/).waitFor({ timeout: 30_000 }).then(() => ok(true, "Annehmen bei vollem Team: deutsche Meldung"), () => ok(false, "Annehmen bei vollem Team: deutsche Meldung"));
  ok(!(await uidByEmail(mail("alt"))), "Annehmen bei vollem Team: kein Konto angelegt");
  await admin.from("accounts").update({ plan: "pro" }).eq("id", A.pro);

  // Rolle ändern wirkt sofort: X (Pro) Bearbeiter -> Mitarbeiter
  await go(po, "/app/settings/team");
  await po.getByLabel(`Rolle von ${E.x}`).selectOption("member");
  await po.getByText(`${E.x} ist jetzt Mitarbeiter`).waitFor({ timeout: 30_000 });
  ok((await recorderMe(tokX)).status === 401, "Rolle -> Mitarbeiter: Erweiterung von X getrennt");
  await go(pX, "/app");
  await pX.waitForURL((u) => u.pathname === "/app/lernen", { timeout: 30_000 }).catch(() => {});
  ok(path_(pX) === "/app/lernen", `Rolle -> Mitarbeiter: X' nächster Aufruf landet in den Schulungen (${path_(pX)})`);
  await go(po, "/app/settings/team");
  await po.getByLabel(`Rolle von ${E.x}`).selectOption("editor");
  await po.getByText(`${E.x} ist jetzt Bearbeiter`).waitFor({ timeout: 30_000 });
  await go(pX, "/app");
  await pX.waitForTimeout(1200);
  ok(path_(pX) === "/app", `Rolle -> Bearbeiter: X hat wieder Zugriff (${path_(pX)})`);

  // Veraltete Seite: Inhaber wurde inzwischen herabgestuft -> Einladen gibt deutsche Meldung
  const po2 = await newPage("pro-owner-2");
  await login(po2, E.proOwner);
  await go(po2, "/app/settings/team");
  await po2.locator("#invite-email").waitFor({ timeout: 60_000 });
  // zweiter Inhaber (npe) stuft den ersten herab
  await admin.from("account_members").update({ role: "owner" }).eq("account_id", A.pro).eq("user_id", U.npe);
  await admin.from("account_members").update({ role: "editor" }).eq("account_id", A.pro).eq("user_id", proOwner.uid);
  await po2.fill("#invite-email", mail("over"));
  await po2.$eval('form button[type="submit"]', (b) => { b.disabled = false; }); // Team ist voll -> Knopf gesperrt
  await po2.locator('form button[type="submit"]').click();
  const staleMsg = await po2.locator('[role="status"]').innerText({ timeout: 30_000 }).catch(() => "");
  const staleBody = await po2.locator("body").innerText().catch(() => "");
  ok(/Nur der Inhaber/.test(staleMsg) && !ENGLISH.test(staleBody), `Herabgestufter Inhaber (alte Seite) lädt ein: deutsche Meldung („${staleMsg.slice(0, 60)}“)`);
  // Zurückziehen/Neu senden auf veralteter Seite
  const revokeBtn = po2.getByRole("button", { name: /Zurückziehen/ }).first();
  if (await revokeBtn.isVisible().catch(() => false)) {
    await revokeBtn.click();
    await po2.waitForTimeout(2500);
    const b2 = await po2.locator("body").innerText().catch(() => "");
    const t2 = await errorToasts(po2);
    ok(!ENGLISH.test(b2) && t2.some((t) => /Nur der Inhaber/.test(t)), `Herabgestufter Inhaber zieht zurück: deutsche Meldung statt Absturz (${t2.join(" | ") || b2.slice(0, 80)})`);
  }
  await admin.from("account_members").update({ role: "owner" }).eq("account_id", A.pro).eq("user_id", proOwner.uid);
  await admin.from("account_members").update({ role: "editor" }).eq("account_id", A.pro).eq("user_id", U.npe);

  // Entfernen wirkt sofort: npe aus Pro entfernen
  await go(po, "/app/settings/team");
  await po.getByRole("button", { name: `${E.npe} entfernen` }).click();
  await po.getByRole("button", { name: "Entfernen", exact: true }).click();
  await po.getByText("wurde aus dem Team entfernt").waitFor({ timeout: 30_000 });
  await go(pNpe, "/app");
  await pNpe.waitForTimeout(2500);
  ok(!path_(pNpe).startsWith("/app") && (await pNpe.getByText("aus dem Team entfernt").count()) > 0,
    `Entfernt (nur diese Org): abgemeldet mit Erklärung (${path_(pNpe)})`);

  // Verlassen: X verlässt Business (Mitarbeiter) -> nächste Org aktiv
  await switchOrgViaMenu(pX, BIZ_NAME);
  await go(pX, "/app/settings/profil");
  await pX.getByRole("button", { name: /verlassen/ }).first().click();
  const dlg = pX.getByRole("alertdialog").or(pX.getByRole("dialog")).first();
  await dlg.waitFor({ timeout: 20_000 });
  await dlg.getByRole("button", { name: "Organisation verlassen" }).click();
  await pX.waitForURL((u) => u.pathname === "/app", { timeout: 60_000 }).catch(() => {});
  const xm2 = await memberships(x.uid);
  ok(!xm2.some((m) => m.account_id === A.biz) && xm2.length === 2, "Verlassen: X nicht mehr in Business, andere Orgs bleiben");
  ok([A.pro, x.aid].includes(await activeMeta(x.uid)), "Verlassen: danach ist eine verbliebene Org aktiv");
  // Neuer Business-Mitarbeiter (nur eine Org) verlässt -> abgemeldet mit Erklärung
  await go(pNbm, "/app/settings/profil");
  await pNbm.getByRole("button", { name: /verlassen/ }).first().click();
  const dlg2 = pNbm.getByRole("alertdialog").or(pNbm.getByRole("dialog")).first();
  await dlg2.waitFor({ timeout: 20_000 });
  await dlg2.getByRole("button", { name: "Organisation verlassen" }).click();
  await pNbm.waitForURL((u) => u.pathname === "/login", { timeout: 60_000 }).catch(() => {});
  ok(path_(pNbm) === "/login" && (await pNbm.getByText("Sie haben die Organisation verlassen").count()) > 0,
    `Einzige Org verlassen: abgemeldet mit Erklärung (${path_(pNbm)})`);

  // ================= 5) Querschnitt =================
  ok(serverErrors.length === 0, `Keine 500er / Seitenfehler im Browser (${serverErrors.length})`);
  for (const e of serverErrors.slice(0, 15)) console.log("   ·", e);
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
  for (const e2 of serverErrors.slice(0, 15)) console.log("   ·", e2);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) killPort(PORT);
  for (const k of Object.keys(E)) {
    const id = await uidByEmail(E[k]).catch(() => null);
    if (id) createdUsers.add(id);
  }
  for (const k of EXTRA) {
    const id = await uidByEmail(mail(k)).catch(() => null);
    if (id) createdUsers.add(id);
  }
  for (const uid of createdUsers) {
    const { data: own } = await admin.from("account_members").select("account_id").eq("user_id", uid).eq("role", "owner");
    for (const r of own ?? []) if (r.account_id) createdAccounts.add(r.account_id);
  }
  for (const aid of createdAccounts) await admin.from("accounts").delete().eq("id", aid).then(() => {}, () => {});
  for (const uid of createdUsers) await admin.auth.admin.deleteUser(uid).catch(() => {});
  console.log(`· aufgeräumt: ${createdUsers.size} Nutzer, ${createdAccounts.size} Organisationen`);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Team × Tarif Ende-zu-Ende verifiziert.");
process.exit(failed ? 1 : 0);
