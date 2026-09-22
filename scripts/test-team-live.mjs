// Team-Logik Ende-zu-Ende: Einladen, Annehmen (neu / bestehend abgemeldet / bestehend
// angemeldet), falsche Adresse, alte + zurückgezogene Links, Bearbeiter-Rechte, Entfernen.
// Echter Login gegen die echte DB (Wegwerf-Konten, werden am Ende gelöscht), Server lokal.
// Mailversand ist für den Test-Server ABGESCHALTET (RESEND_API_KEY leer) -> die Beitritts-
// Links kommen aus der DB, es gehen keine echten Mails raus.
//
// Nutzung:  node --env-file=.env.local scripts/test-team-live.mjs
//           (TEAM_PROD=1 -> gegen `next start`, vorher `npm run build`)
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
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

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL_, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const PORT = Number(process.env.PORT_TEAM || 3032);
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const mail = (k) => `tutax-team-${k}-${stamp}@example.com`;
const E = { owner: mail("owner"), neu: mail("neu"), best: mail("best"), inapp: mail("inapp"), other: mail("other"), mit: mail("mit") };
const PUB_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
/** Direkter DB-Zugriff MIT dem Login einer Person (wie ein Angreifer im Browser). */
async function asUser(email) {
  const c = createClient(URL_, PUB_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw error;
  return c;
}
async function recorderMe(token) {
  const r = await fetch(`${BASE}/api/recorder/me`, { headers: { Authorization: `Bearer ${token}` } });
  return r.status;
}

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

const createdUsers = new Set();
async function mkUser(email, orgName) {
  const r = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (r.error) throw r.error;
  const uid = r.data.user.id;
  createdUsers.add(uid);
  const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", uid);
  const aid = m[0].account_id;
  await admin.from("accounts").update({ name: orgName, onboarded: true }).eq("id", aid);
  return { uid, aid };
}
async function uidByEmail(email) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data.users.find((u) => u.email === email)?.id ?? null;
}
async function memberships(uid) {
  const { data } = await admin.from("account_members").select("account_id, role").eq("user_id", uid);
  return data ?? [];
}
async function activeMeta(uid) {
  const { data } = await admin.auth.admin.getUserById(uid);
  return data.user?.user_metadata?.active_account_id ?? null;
}
async function pendingToken(accountId, email) {
  const { data } = await admin
    .from("invitations")
    .select("token, role")
    .eq("account_id", accountId)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  return data;
}

async function login(page, email, password = PW) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 90_000 });
}

async function invite(page, email, role = "editor") {
  await page.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.locator("#invite-email").waitFor({ timeout: 90_000 });
  await page.fill("#invite-email", email);
  await page.selectOption("#invite-role", role);
  const btn = page.getByRole("button", { name: "Einladen" });
  // Team voll -> Knopf gesperrt; dann den Hinweis der Seite zurückgeben.
  if (await btn.isDisabled()) return "GESPERRT: " + (await page.locator("main").innerText());
  await btn.click();
  const status = page.locator('[role="status"]');
  await status.waitFor({ timeout: 60_000 });
  return (await status.innerText()).trim();
}

let server, browser;
let ownerAid;
try {
  const owner = await mkUser(E.owner, `Team Test ${stamp}`);
  ownerAid = owner.aid;
  const best = await mkUser(E.best, `Eigene Kanzlei ${stamp}`);
  const inapp = await mkUser(E.inapp, `InApp Kanzlei ${stamp}`);
  const other = await mkUser(E.other, `Andere Kanzlei ${stamp}`);
  // Business, damit „Sprachen" für den Bearbeiter-Check überhaupt schaltbar ist.
  await admin.from("accounts").update({ plan: "business" }).eq("id", ownerAid);

  server = spawn("npx", ["next", process.env.TEAM_PROD ? "start" : "dev", "-p", String(PORT)], {
    cwd: path.join(__dirname, ".."),
    shell: true,
    stdio: "ignore",
    env: { ...process.env, RESEND_API_KEY: "", INVITE_FROM_EMAIL: "" }, // keine echten Mails
  });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const newPage = async () => (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();

  // ================= Inhaber lädt ein =================
  const op = await newPage();
  await login(op, E.owner);
  const r1 = await invite(op, E.neu, "editor");
  ok(/Beitritts-Link|gesendet/.test(r1), `Inhaber: Einladung an neue Adresse angelegt („${r1.slice(0, 60)}…“)`);
  const invNeu = await pendingToken(ownerAid, E.neu);
  ok(!!invNeu && invNeu.role === "editor", "DB: offene Einladung (Bearbeiter) für neue Adresse");

  // ================= 1) Neue Person nimmt an =================
  const np = await newPage();
  await np.goto(`${BASE}/invite/${invNeu.token}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await np.getByText("Passwort festlegen").first().waitFor({ timeout: 60_000 });
  ok(true, "Neu: Beitritts-Seite fragt nach neuem Passwort");
  await np.fill("#invite-password", "kurz");
  await np.getByRole("button", { name: /Passwort setzen/ }).click();
  await np.waitForTimeout(1500);
  // Browser-Prüfung (minLength) oder eigene Meldung — entscheidend: kein Konto, kein Beitritt.
  ok(new URL(np.url()).pathname.startsWith("/invite/") && !(await uidByEmail(E.neu)),
    "Neu: zu kurzes Passwort wird abgelehnt (kein Konto angelegt)");
  await np.fill("#invite-password", PW);
  await np.getByRole("button", { name: /Passwort setzen/ }).click();
  await np.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 90_000 });
  const neuUid = await uidByEmail(E.neu);
  if (neuUid) createdUsers.add(neuUid);
  const neuM = neuUid ? await memberships(neuUid) : [];
  ok(neuM.length === 1 && neuM[0].account_id === ownerAid && neuM[0].role === "editor",
    `Neu: genau EINE Mitgliedschaft (Team, Bearbeiter) – kein eigenes Leer-Konto (${JSON.stringify(neuM.map((m) => m.role))})`);
  ok(new URL(np.url()).pathname === "/app", `Neu: landet direkt in der App (${new URL(np.url()).pathname})`);
  const { data: invNeuAfter } = await admin.from("invitations").select("status").eq("token", invNeu.token).single();
  ok(invNeuAfter.status === "accepted", "DB: Einladung als angenommen markiert");

  // alter Link erneut -> nicht nochmal einlösbar
  const np2 = await newPage();
  await np2.goto(`${BASE}/invite/${invNeu.token}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await np2.waitForURL((u) => u.pathname === "/login", { timeout: 30_000 }).catch(() => {});
  ok(new URL(np2.url()).pathname === "/login", `Alter Link (abgemeldet) -> Anmeldung (${np2.url().replace(BASE, "")})`);

  // ================= 2) Bestehender Nutzer, abgemeldet =================
  await invite(op, E.best, "editor");
  const invBest = await pendingToken(ownerAid, E.best);
  const bp = await newPage();
  await bp.goto(`${BASE}/invite/${invBest.token}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await bp.getByText("Sie haben schon ein Konto").waitFor({ timeout: 60_000 });
  ok(true, "Bestehend: Seite erkennt vorhandenes Konto („anmelden“ statt „Passwort festlegen“)");
  await bp.fill("#invite-password", "falsches-passwort");
  await bp.getByRole("button", { name: /Anmelden & beitreten/ }).click();
  await bp.getByText("Das Passwort stimmt nicht").waitFor({ timeout: 30_000 }).then(
    () => ok(true, "Bestehend: falsches Passwort -> klare Meldung"),
    () => ok(false, "Bestehend: falsches Passwort -> klare Meldung"),
  );
  const { data: bestUser } = await admin.auth.admin.getUserById(best.uid);
  ok(!!bestUser.user, "Bestehend: Passwort wurde NICHT überschrieben (Konto unverändert)");
  await bp.fill("#invite-password", PW);
  await bp.getByRole("button", { name: /Anmelden & beitreten/ }).click();
  await bp.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 90_000 });
  const bestM = await memberships(best.uid);
  ok(bestM.length === 2 && bestM.some((m) => m.account_id === ownerAid && m.role === "editor"),
    "Bestehend: behält eigene Org UND ist jetzt Bearbeiter im Team");
  ok((await activeMeta(best.uid)) === ownerAid, "Bestehend: aktive Org ist direkt das neue Team");

  // ================= 3) Bestehender Nutzer, schon angemeldet =================
  const ip = await newPage();
  await login(ip, E.inapp);
  await invite(op, E.inapp, "owner");
  const invInapp = await pendingToken(ownerAid, E.inapp);
  await ip.goto(`${BASE}/invite/${invInapp.token}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await ip.getByText("Einladung annehmen").waitFor({ timeout: 60_000 });
  ok(await ip.getByText("Inhaber", { exact: true }).isVisible(), "Angemeldet: Bestätigungs-Seite nennt die Rolle (Inhaber)");
  ok((await memberships(inapp.uid)).length === 1, "Angemeldet: KEIN stiller Beitritt vor dem Klick");
  await ip.getByRole("button", { name: /beitreten/ }).click();
  await ip.waitForURL((u) => u.pathname === "/app", { timeout: 90_000 });
  const inM = await memberships(inapp.uid);
  ok(inM.some((m) => m.account_id === ownerAid && m.role === "owner"), "Angemeldet: nach Klick Inhaber im Team");

  // ================= 4) Falsche Adresse angemeldet =================
  await invite(op, mail("fremd"), "editor");
  const invFremd = await pendingToken(ownerAid, mail("fremd"));
  const xp = await newPage();
  await login(xp, E.other);
  await xp.goto(`${BASE}/invite/${invFremd.token}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await xp.getByText("Andere Adresse").waitFor({ timeout: 60_000 }).then(
    () => ok(true, "Falsche Adresse: Hinweis + Abmelden-Angebot"),
    () => ok(false, "Falsche Adresse: Hinweis + Abmelden-Angebot"),
  );
  ok((await memberships(other.uid)).length === 1, "Falsche Adresse: kein Beitritt");

  // ================= 5) Doppelt einladen / zurückziehen =================
  const r5 = await invite(op, E.best, "editor");
  ok(/bereits im Team/.test(r5), `Schon Mitglied -> „bereits im Team“ (${r5.slice(0, 50)})`);
  await op.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded" });
  await op.getByRole("button", { name: /Zurückziehen/ }).first().click();
  await op.getByText("Einladung zurückgezogen").waitFor({ timeout: 30_000 });
  const { data: fremdAfter } = await admin.from("invitations").select("status").eq("token", invFremd.token).single();
  ok(fremdAfter.status === "revoked", "Zurückziehen: Einladung in DB zurückgezogen");
  const rp = await newPage();
  await rp.goto(`${BASE}/invite/${invFremd.token}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await rp.waitForURL((u) => u.pathname === "/login", { timeout: 30_000 }).catch(() => {});
  ok(new URL(rp.url()).pathname === "/login", "Zurückgezogener Link ist ungültig");

  // ================= 6) Was darf der Bearbeiter? =================
  // Team-Seite: keine Einladen-Maske, keine Tokens im Seiteninhalt.
  await invite(op, mail("offen"), "owner"); // offene Inhaber-Einladung, die ein Bearbeiter NICHT sehen darf
  const invOffen = await pendingToken(ownerAid, mail("offen"));
  await np.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await np.getByText(/Mitglieder \(/).waitFor({ timeout: 60_000 });
  ok((await np.locator("#invite-email").count()) === 0, "Bearbeiter: keine Einladen-Maske");
  ok(!(await np.content()).includes(invOffen.token), "Bearbeiter: offener Inhaber-Einladungs-Token NICHT im Seiteninhalt");
  ok((await np.getByRole("button", { name: /entfernen/ }).count()) === 0, "Bearbeiter: kann niemanden entfernen");

  // Bearbeiter ändert den Organisations-Namen: Meldung vs. DB
  await np.goto(`${BASE}/app/settings/allgemein`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await np.locator("#org-name").waitFor({ timeout: 60_000 });
  await np.fill("#org-name", `Umbenannt ${stamp}`);
  await np.getByRole("button", { name: "Speichern" }).click();
  const nameToast = await Promise.race([
    np.getByText("Name gespeichert").waitFor({ timeout: 20_000 }).then(() => "erfolg"),
    np.locator("[data-sonner-toast][data-type=error]").waitFor({ timeout: 20_000 }).then(async () => "fehler"),
  ]).catch(() => "keine");
  const { data: accAfter } = await admin.from("accounts").select("name").eq("id", ownerAid).single();
  const renamed = accAfter.name === `Umbenannt ${stamp}`;
  ok(nameToast === "erfolg" && renamed,
    `Bearbeiter darf Org-Namen ändern: Meldung „${nameToast}“, DB ${renamed ? "geändert" : "NICHT geändert"}`);

  // Bearbeiter schaltet eine Sprache: Meldung vs. DB
  await np.goto(`${BASE}/app/settings/sprachen`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const sw = np.getByRole("switch", { name: "Englisch" });
  await sw.waitFor({ timeout: 60_000 });
  await sw.click();
  const langToast = await Promise.race([
    np.getByText(/Englisch ist an/).waitFor({ timeout: 20_000 }).then(() => "erfolg"),
    np.locator("[data-sonner-toast][data-type=error]").waitFor({ timeout: 20_000 }).then(() => "fehler"),
  ]).catch(() => "keine");
  const { data: langAfter } = await admin.from("accounts").select("languages").eq("id", ownerAid).single();
  const langSaved = (langAfter.languages ?? []).includes("en");
  ok(langToast === "erfolg" && langSaved,
    `Bearbeiter darf Sprachen schalten: Meldung „${langToast}“, DB ${langSaved ? "gespeichert" : "NICHT gespeichert"}`);

  // ================= 6b) Erweiterung: jede Person eigene Verbindung =================
  async function makeCode(page) {
    await page.goto(`${BASE}/app/settings/erweiterung`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.getByText("Code manuell eingeben").click();
    await page.getByRole("button", { name: /Code erzeugen/ }).click();
    await page.getByText("Verbindungs-Code erstellt").waitFor({ timeout: 30_000 });
  }
  await makeCode(op);
  await makeCode(np); // Bearbeiter
  const { data: toks } = await admin.from("recorder_tokens").select("token, user_id").eq("account_id", ownerAid);
  const tOwner = toks?.find((t) => t.user_id === owner.uid)?.token;
  const tEditor = toks?.find((t) => t.user_id === neuUid)?.token;
  ok(!!tOwner && !!tEditor && tOwner !== tEditor, "Erweiterung: Inhaber UND Bearbeiter haben je eine eigene Verbindung");
  ok((await recorderMe(tOwner)) === 200 && (await recorderMe(tEditor)) === 200,
    "Erweiterung: beide Verbindungen gültig – Bearbeiter hat den Inhaber NICHT rausgeworfen");

  // ================= 6c) Mitarbeiter =================
  await invite(op, E.mit, "member");
  const invMit = await pendingToken(ownerAid, E.mit);
  ok(invMit?.role === "member", "Einladung als Mitarbeiter angelegt");
  // Schulung: öffentliche Anleitung MIT Schulungsnachweis (so hat auch Pro Schulungen)
  const tutId = crypto.randomUUID(), stepId = crypto.randomUUID();
  const tIns = await admin.from("tutorials").insert({ id: tutId, account_id: ownerAid, title: `Schulung ${stamp}`, slug: `schulung-${stamp}`, status: "published", visibility: "public", in_lernen: true });
  if (tIns.error) throw tIns.error;
  const sIns = await admin.from("steps").insert({ id: stepId, tutorial_id: tutId, title: "Einziger Schritt", body: null, position: 1, is_decision: false });
  if (sIns.error) throw sIns.error;
  await admin.from("tutorials").update({ root_step_id: stepId }).eq("id", tutId);

  const mp = await newPage();
  await mp.goto(`${BASE}/invite/${invMit.token}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await mp.getByText("Passwort festlegen").first().waitFor({ timeout: 60_000 });
  await mp.fill("#invite-password", PW);
  await mp.getByRole("button", { name: /Passwort setzen/ }).click();
  await mp.waitForURL((u) => u.pathname.startsWith("/app/lernen"), { timeout: 90_000 }).catch(() => {});
  const mitUid = await uidByEmail(E.mit);
  if (mitUid) createdUsers.add(mitUid);
  ok(new URL(mp.url()).pathname === "/app/lernen", `Mitarbeiter landet nach Beitritt in den Schulungen (${new URL(mp.url()).pathname})`);
  await mp.waitForTimeout(1500);
  const navText = await mp.locator('nav[aria-label="Hauptbereiche"]').innerText().catch(() => "");
  ok(navText.includes("Schulungen") && !navText.includes("Anleitungen") && !navText.includes("Automationen"),
    `Mitarbeiter-Navigation zeigt nur „Schulungen“ (${navText.replace(/\s+/g, " ").trim()})`);
  ok((await mp.getByRole("button", { name: /Neue Anleitung/ }).count()) === 0, "Mitarbeiter: kein „Neue Anleitung“-Knopf");
  for (const p of ["/app", "/app/settings/team", "/app/settings/allgemein", "/app/assistent/wissen", "/app/automationen", `/app/tutorials/${tutId}`]) {
    await mp.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await mp.waitForURL((u) => u.pathname === "/app/lernen", { timeout: 20_000 }).catch(() => {});
    ok(new URL(mp.url()).pathname === "/app/lernen", `Mitarbeiter: ${p} gesperrt -> Schulungen`);
  }
  await mp.goto(`${BASE}/app/settings/profil`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await mp.waitForTimeout(1500);
  ok(new URL(mp.url()).pathname === "/app/settings/profil", "Mitarbeiter: eigenes Profil erreichbar");
  // Schulung abschließen
  await mp.goto(`${BASE}/app/lernen/${tutId}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await mp.waitForTimeout(1500);
  // Einziger Schritt -> „Fertig" -> Abschluss-Ansicht mit „Als absolviert markieren".
  await mp.getByRole("button", { name: "Fertig", exact: true }).click({ timeout: 30_000 });
  await mp.getByRole("button", { name: "Als absolviert markieren" }).click({ timeout: 30_000 });
  await mp.getByText(/Absolviert am/).first().waitFor({ timeout: 30_000 }).catch(() => {});
  // Die Anzeige wechselt sofort (optimistisch) — auf den DB-Eintrag kurz warten.
  let comp = [];
  for (let i = 0; i < 20 && !comp.length; i++) {
    comp = (await admin.from("tutorial_completions").select("id").eq("tutorial_id", tutId).eq("user_id", mitUid)).data ?? [];
    if (!comp.length) await new Promise((r) => setTimeout(r, 500));
  }
  const toastErr = await mp.locator("[data-sonner-toast][data-type=error]").allInnerTexts().catch(() => []);
  if (toastErr.length) console.log("  ℹ Fehler-Meldung beim Abschließen:", toastErr.join(" | "));
  ok(comp.length === 1, "Mitarbeiter: Schulung (öffentlich mit Nachweis) als absolviert gespeichert");
  // Angriff am UI vorbei: direkt mit eigenem Login in die DB schreiben
  const mc = await asUser(E.mit);
  const upd = await mc.from("tutorials").update({ title: "gehackt" }).eq("id", tutId).select("id");
  const ins = await mc.from("tutorials").insert({ account_id: ownerAid, title: "Fremd", status: "draft" }).select("id");
  const accU = await mc.from("accounts").update({ name: "gehackt" }).eq("id", ownerAid).select("id");
  const { data: tAfter } = await admin.from("tutorials").select("title").eq("id", tutId).single();
  ok(tAfter.title !== "gehackt" && !(upd.data ?? []).length, "DB: Mitarbeiter kann Anleitung NICHT ändern");
  ok(!!ins.error || !(ins.data ?? []).length, `DB: Mitarbeiter kann KEINE Anleitung anlegen (${ins.error?.code ?? "0 Zeilen"})`);
  ok(!(accU.data ?? []).length, "DB: Mitarbeiter kann Organisation NICHT ändern");
  const ec = await asUser(E.neu);
  const updE = await ec.from("tutorials").update({ title: `Schulung ${stamp} (Bearb.)` }).eq("id", tutId).select("id");
  ok((updE.data ?? []).length === 1, "DB: Bearbeiter darf Anleitung weiterhin ändern");
  // Konto ist hier schon Business -> Versuch, einen ANDEREN Tarif zu setzen.
  const selfUp = await (await asUser(E.owner)).from("accounts").update({ plan: "pro" }).eq("id", ownerAid).select("id");
  ok(!!selfUp.error, "DB: Tarif lässt sich nicht selbst ändern (auch nicht vom Inhaber)");

  // ================= 6d) Rolle ändern =================
  await op.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded" });
  await op.getByLabel(`Rolle von ${E.neu}`).selectOption("member");
  await op.getByText(`${E.neu} ist jetzt Mitarbeiter`).waitFor({ timeout: 30_000 });
  const neuRole = (await memberships(neuUid)).find((m) => m.account_id === ownerAid)?.role;
  ok(neuRole === "member", "Rolle ändern: Bearbeiter -> Mitarbeiter gespeichert");
  ok((await recorderMe(tEditor)) === 401, "Rolle ändern: Erweiterung des neuen Mitarbeiters ist getrennt");
  ok((await recorderMe(tOwner)) === 200, "Rolle ändern: Erweiterung des Inhabers läuft weiter");
  await op.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded" });
  await op.getByLabel(`Rolle von ${E.neu}`).selectOption("editor");
  await op.getByText(`${E.neu} ist jetzt Bearbeiter`).waitFor({ timeout: 30_000 });
  ok((await memberships(neuUid)).find((m) => m.account_id === ownerAid)?.role === "editor", "Rolle ändern: zurück zu Bearbeiter");
  await makeCode(np); // wieder Bearbeiter -> neue Verbindung für den Entfernen-Test
  const tEditor2 = (await admin.from("recorder_tokens").select("token").eq("account_id", ownerAid).eq("user_id", neuUid).maybeSingle()).data?.token;

  // ================= 6e) Team-Grenze je Tarif =================
  await admin.from("accounts").update({ plan: "pro" }).eq("id", ownerAid);
  // Das Test-Team ist hier schon größer als 5 (bestehende Teams werden nicht verkleinert).
  const usedBefore =
    ((await admin.from("account_members").select("user_id", { count: "exact", head: true }).eq("account_id", ownerAid)).count ?? 0) +
    ((await admin.from("invitations").select("id", { count: "exact", head: true }).eq("account_id", ownerAid).eq("status", "pending")).count ?? 0);
  let rLimit = "";
  for (let i = 0; i < 6; i++) {
    rLimit = await invite(op, mail(`platz${i}`), "member");
    if (/erlaubt 5/.test(rLimit) || rLimit.startsWith("GESPERRT")) break;
  }
  // Am gesperrten Knopf vorbei (wie ein Angreifer): der SERVER muss trotzdem ablehnen.
  await op.fill("#invite-email", mail("platzx"));
  await op.$eval('form button[type="submit"]', (b) => { b.disabled = false; });
  await op.locator('form button[type="submit"]').click();
  await op.locator('[role="status"]').waitFor({ timeout: 30_000 });
  const forced = await op.locator('[role="status"]').innerText();
  ok(/erlaubt 5 Personen/.test(forced), `Server lehnt Einladung über der Grenze ab („${forced.slice(0, 50)}…“)`);
  const { count: used } = await admin.from("account_members").select("user_id", { count: "exact", head: true }).eq("account_id", ownerAid);
  const { count: pend } = await admin.from("invitations").select("id", { count: "exact", head: true }).eq("account_id", ownerAid).eq("status", "pending");
  ok(usedBefore >= 5 && /erlaubt 5 Personen/.test(rLimit) && (used ?? 0) + (pend ?? 0) === usedBefore,
    `Pro: ab 5 Personen keine weitere Einladung (${used}+${pend}, vorher ${usedBefore})`);
  await op.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded" });
  ok((await op.getByTestId("team-seats").innerText()).includes(`${usedBefore} von 5`), `Team-Seite zeigt „${usedBefore} von 5 Plätzen“`);
  await admin.from("accounts").update({ plan: "free" }).eq("id", ownerAid);
  const rFree = await invite(op, mail("frei"), "editor");
  ok(/kostenlosen Tarif/.test(rFree), "Kostenlos: keine Einladungen (arbeitet allein)");
  await admin.from("accounts").update({ plan: "business" }).eq("id", ownerAid);

  // ================= 7) Inhaber entfernt Bearbeiter =================
  await op.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded" });
  op.once("dialog", (d) => d.accept());
  await op.getByRole("button", { name: `${E.neu} entfernen` }).click();
  await op.getByText("wurde aus dem Team entfernt").waitFor({ timeout: 30_000 });
  ok((await memberships(neuUid)).length === 0, "Entfernen: Mitgliedschaft in DB gelöscht");
  await np.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await np.waitForTimeout(2000);
  const afterRemove = new URL(np.url()).pathname;
  ok(!afterRemove.startsWith("/app"), `Entfernt: kein Zugriff mehr auf die App (landet auf ${afterRemove})`);
  ok((await np.getByText("aus dem Team entfernt").count()) > 0, "Entfernt: Anmeldeseite erklärt, warum");
  ok(!!tEditor2 && (await recorderMe(tEditor2)) === 401, "Entfernt: Erweiterung der Person hat keinen Zugang mehr");
  // alter/zurückgezogener Link -> Hinweis auf der Anmeldeseite
  await rp.goto(`${BASE}/invite/${invFremd.token}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await rp.waitForURL((u) => u.pathname === "/login", { timeout: 30_000 }).catch(() => {});
  ok((await rp.getByText("nicht mehr gültig").count()) > 0, "Ungültiger Link: Anmeldeseite erklärt, warum");
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) killPort(PORT);
  // Aufräumen: alle Test-Nutzer + deren eigene Orgs (+ Team-Org samt Einladungen via cascade).
  for (const k of Object.keys(E).concat(["fremd", "offen", "frei", "platzx"], [0, 1, 2, 3, 4, 5].map((i) => `platz${i}`))) {
    const id = await uidByEmail(E[k] ?? mail(k)).catch(() => null);
    if (id) createdUsers.add(id);
  }
  for (const uid of createdUsers) {
    const { data: own } = await admin.from("account_members").select("account_id").eq("user_id", uid).eq("role", "owner");
    for (const r of own ?? []) {
      if (r.account_id) await admin.from("accounts").delete().eq("id", r.account_id).then(() => {}, () => {});
    }
  }
  if (ownerAid) await admin.from("accounts").delete().eq("id", ownerAid).then(() => {}, () => {});
  for (const uid of createdUsers) await admin.auth.admin.deleteUser(uid).catch(() => {});
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Team-Logik Ende-zu-Ende verifiziert.");
process.exit(failed ? 1 : 0);
