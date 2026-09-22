// Prüf-Skript (Bugsuche, NUR feststellen — nichts reparieren):
// Einstellungen (Allgemein, Aussehen, Adresse & Teilen, Sprachen, Chat, Erweiterung,
// Tarif, Profil), Team/Einladungen/Tarif-Grenzen, Automationen, Rollen-Sperren.
//
// Alles gegen die echte DB mit WEGWERF-Konten (werden am Ende gelöscht), Browser headless,
// nie parallel. Der Dev-Server wird wiederverwendet, wenn PORT schon antwortet.
//
// Nutzung:
//   node --env-file=.env.local --experimental-strip-types scripts/test-settings-team-audit.mjs
//   (PORT_AUDIT=3071 nutzt einen laufenden Dev-Server)

import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
import { createClient } from "@supabase/supabase-js";

// server-only/client-only sind in reinem Node nicht auflösbar (Next aliased sie beim
// Bündeln) -> stubben, damit src/lib/automations.ts direkt importierbar ist.
register(
  "data:text/javascript," +
    encodeURIComponent(
      "export async function resolve(s,c,n){if(s==='server-only'||s==='client-only'){return {url:'data:text/javascript,',shortCircuit:true};}return n(s,c);}",
    ),
  import.meta.url,
);

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, ".shots-audit");
mkdirSync(SHOT_DIR, { recursive: true });

function resolvePlaywright() {
  try {
    return require("playwright");
  } catch {
    /* npx-Cache */
  }
  const dirs = [];
  if (process.env.STEPLY_PW_DIR) dirs.push(process.env.STEPLY_PW_DIR);
  const base = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
  const npxDir = path.join(base, "npm-cache", "_npx");
  if (existsSync(npxDir)) for (const d of readdirSync(npxDir)) dirs.push(path.join(npxDir, d));
  for (const d of dirs) {
    const p = path.join(d, "node_modules", "playwright");
    if (existsSync(p)) return require(p);
  }
  throw new Error("playwright nicht gefunden.");
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const PORT = Number(process.env.PORT_AUDIT || 3187);
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);

const UA_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const UA_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";

let failed = false;
const findings = [];
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) {
    failed = true;
    findings.push(m);
  }
};
const note = (m) => console.log(`· ${m}`);

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

// ---- Konten-Verwaltung (alles wird am Ende gelöscht) ----
const users = []; // {userId, accountId, email}
async function mkUser(tag) {
  const email = `steply-audit-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  const userId = data.user.id;
  let accountId = null;
  for (let i = 0; i < 20 && !accountId; i++) {
    const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", userId);
    accountId = m?.[0]?.account_id ?? null;
    if (!accountId) await new Promise((r) => setTimeout(r, 300));
  }
  const rec = { userId, accountId, email };
  users.push(rec);
  return rec;
}

const setPlan = (accountId, plan) => admin.from("accounts").update({ plan }).eq("id", accountId);
const getAcc = async (accountId, cols = "*") =>
  (await admin.from("accounts").select(cols).eq("id", accountId).single()).data;

// ---- Browser-Helfer ----
const errorsOf = new WeakMap();
async function newCtx(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? { width: 1400, height: 950 },
    userAgent: opts.userAgent ?? UA_CHROME,
    ...(opts.isMobile ? { isMobile: true, hasTouch: true } : {}),
  });
  const bag = { console: [], pageErrors: [], http: [] };
  ctx.on("page", (p) => {
    p.on("console", (m) => {
      if (m.type() === "error") bag.console.push(m.text().slice(0, 300));
    });
    p.on("pageerror", (e) => bag.pageErrors.push(String(e.message).slice(0, 300)));
    p.on("response", (r) => {
      const u = r.url();
      if (!u.startsWith(BASE)) return;
      if (r.status() >= 400) bag.http.push(`${r.status()} ${r.request().method()} ${u.slice(BASE.length)}`);
    });
  });
  errorsOf.set(ctx, bag);
  return ctx;
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 120_000 });
}

async function h1(page) {
  const el = page.locator("main h1").first();
  await el.waitFor({ timeout: 90_000 });
  return (await el.innerText()).trim();
}

async function pollDb(fn, want, tries = 25, ms = 500) {
  let v;
  for (let i = 0; i < tries; i++) {
    v = await fn();
    if (want(v)) return v;
    await new Promise((r) => setTimeout(r, ms));
  }
  return v;
}

const saveBar = (page) => page.getByRole("region", { name: "Ungespeicherte Änderungen" });

async function toastText(page, timeout = 8000) {
  const t = page.locator("[data-sonner-toast]").first();
  try {
    await t.waitFor({ timeout });
    return (await t.innerText()).replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}
async function clearToasts(page) {
  await page.evaluate(() => document.querySelectorAll("[data-sonner-toast]").forEach((n) => n.remove()));
}

const SETTINGS_PAGES = [
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

let server, browser;
let owner, other, invitee, existingUser;
const automationIds = [];

try {
  // ============ Vorbereitung ============
  if (!(await fetch(`${BASE}/robots.txt`).then((r) => r.ok).catch(() => false))) {
    server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
      cwd: path.join(__dirname, ".."),
      shell: true,
      stdio: "ignore",
    });
    console.log("… eigener Server startet auf", PORT, "…");
  } else {
    console.log("… nutze laufenden Server auf", PORT);
  }
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  owner = await mkUser("owner");
  other = await mkUser("other");
  await admin.from("accounts").update({ name: "Audit Owner GmbH", onboarded: true }).eq("id", owner.accountId);
  await admin.from("accounts").update({ name: "Audit Fremd GmbH", onboarded: true }).eq("id", other.accountId);
  const otherSlug = (await getAcc(other.accountId, "slug")).slug;

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  await login(page, owner.email);

  // ============ 1. Alle Einstellungs-Seiten laden ============
  console.log("\n--- 1. Einstellungen: Seiten laden ---");
  for (const [route, title] of SETTINGS_PAGES) {
    const res = await page.goto(`${BASE}/app/settings/${route}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    let t = "";
    try {
      t = await h1(page);
    } catch {
      /* kein H1 */
    }
    ok(res && res.status() < 400 && t === title, `/${route} lädt (Status ${res?.status()}, H1 „${t}“)`);
  }

  // ============ 2. Allgemein: Name ============
  console.log("\n--- 2. Allgemein: Name der Organisation ---");
  await page.goto(`${BASE}/app/settings/allgemein`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(900);

  // 2a Pflichtfeld leer
  await page.fill("#org-name", "");
  await saveBar(page).waitFor({ timeout: 6000 }).catch(() => {});
  const emptyBar = await saveBar(page).count();
  if (emptyBar) {
    await clearToasts(page);
    await saveBar(page).getByRole("button", { name: "Speichern" }).click();
    const msg = await toastText(page);
    const nameAfter = (await getAcc(owner.accountId, "name")).name;
    ok(nameAfter === "Audit Owner GmbH", `Leerer Name wird nicht gespeichert (DB: „${nameAfter}“)`);
    ok(/nicht leer/i.test(msg), `Leerer Name: verständliche Meldung („${msg}“)`);
  } else {
    ok(false, "Leerer Name: Speichern-Balken erscheint gar nicht (kein Weg, den Fehler zu sehen)");
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(700);

  // 2b Sonderzeichen
  const SPECIAL = 'Müller & Söhne <b>„Test“</b> 😀 \'quote\' 100% ';
  await page.fill("#org-name", SPECIAL);
  await saveBar(page).waitFor({ timeout: 6000 });
  await clearToasts(page);
  await saveBar(page).getByRole("button", { name: "Speichern" }).click();
  const specialDb = await pollDb(
    async () => (await getAcc(owner.accountId, "name")).name,
    (n) => n === SPECIAL.trim(),
  );
  ok(specialDb === SPECIAL.trim(), `Sonderzeichen im Namen gespeichert (DB: „${specialDb}“)`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(700);
  const specialUi = await page.inputValue("#org-name");
  ok(specialUi === SPECIAL.trim(), `Sonderzeichen nach Neuladen unverändert im Feld`);

  // 2c sehr lange Eingabe
  const LONG = "L".repeat(3000);
  await page.fill("#org-name", LONG);
  await saveBar(page).waitFor({ timeout: 6000 });
  await clearToasts(page);
  await saveBar(page).getByRole("button", { name: "Speichern" }).click();
  await page.waitForTimeout(2500);
  const longMsg = await toastText(page, 2000);
  const longDb = (await getAcc(owner.accountId, "name")).name;
  note(`3000-Zeichen-Name: DB-Länge ${longDb.length}, Meldung „${longMsg}“`);
  ok(
    longDb.length <= 200 || longDb.length === 3000,
    `Langer Name wird entweder begrenzt oder vollständig gespeichert (${longDb.length} Zeichen)`,
  );
  if (longDb.length === 3000) {
    // Hilfe-Seite mit 3000-Zeichen-Namen ansehen
    const slugNow = (await getAcc(owner.accountId, "slug")).slug;
    const hubRes = await fetch(`${BASE}/h/${slugNow}`);
    note(`Hilfe-Seite mit 3000-Zeichen-Namen: HTTP ${hubRes.status}`);
    ok(hubRes.status === 200, `Hilfe-Seite verkraftet den 3000-Zeichen-Namen (HTTP ${hubRes.status})`);
  }
  // zurücksetzen
  await admin.from("accounts").update({ name: "Audit Owner GmbH" }).eq("id", owner.accountId);

  // ============ 3. Adresse & Teilen: Slug ============
  console.log("\n--- 3. Adresse & Teilen: Slug ---");
  await page.goto(`${BASE}/app/settings/teilen`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(900);
  const slugBefore = (await getAcc(owner.accountId, "slug")).slug;

  // 3a nur Sonderzeichen
  await page.fill("#hub-slug", "###");
  await page.waitForTimeout(300);
  const preview = await page.locator("p.break-all").first().innerText().catch(() => "");
  note(`Vorschau bei Eingabe „###“: ${preview.replace(/\s+/g, " ")}`);
  await clearToasts(page);
  await saveBar(page).getByRole("button", { name: "Speichern" }).click();
  await page.waitForTimeout(2500);
  const slugJunk = (await getAcc(owner.accountId, "slug")).slug;
  const junkMsg = await toastText(page, 2000);
  ok(
    slugJunk === slugBefore || /ungültig|nicht leer|erlaubt/i.test(junkMsg),
    `Adresse „###“: entweder abgelehnt oder unverändert — tatsächlich DB-Slug „${slugJunk}“, Meldung „${junkMsg}“`,
  );

  // 3b gültige neue Adresse + alte Links
  const newSlug = `audit-neu-${stamp}`;
  await page.goto(`${BASE}/app/settings/teilen`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(800);
  const slugPre = (await getAcc(owner.accountId, "slug")).slug;
  await page.fill("#hub-slug", newSlug);
  await page.waitForTimeout(200);
  const warn = await page.getByText(/bisherige Links und gedruckte QR-Codes/i).count();
  ok(warn === 1, "Slug-Änderung warnt vor kaputten alten Links");
  await clearToasts(page);
  await saveBar(page).getByRole("button", { name: "Speichern" }).click();
  const slugDb = await pollDb(async () => (await getAcc(owner.accountId, "slug")).slug, (s) => s === newSlug);
  ok(slugDb === newSlug, `Neue Adresse gespeichert (DB: „${slugDb}“)`);
  const hubNew = await fetch(`${BASE}/h/${newSlug}`);
  ok(hubNew.status === 200, `Hilfe-Seite unter neuer Adresse erreichbar (HTTP ${hubNew.status})`);
  const hubOld = await fetch(`${BASE}/h/${slugPre}`);
  note(`Alte Adresse /h/${slugPre} → HTTP ${hubOld.status}`);
  const oldBody = hubOld.status !== 200 ? (await hubOld.text()).slice(0, 4000) : "";
  ok(
    hubOld.status === 404 || hubOld.status === 301 || hubOld.status === 308,
    `Alter Link reagiert sinnvoll (HTTP ${hubOld.status})`,
  );
  if (hubOld.status === 404) {
    const friendly = /nicht gefunden|nicht mehr|Hilfe-Seite|existiert/i.test(oldBody);
    ok(friendly, `404-Seite des alten Links erklärt das Problem (${friendly ? "ja" : "generische 404"})`);
  }
  // Was SIEHT ein Besucher unter dem alten Link (im echten Browser)?
  const visitorCtx = await newCtx(browser);
  const visitor = await visitorCtx.newPage();
  await visitor.goto(`${BASE}/h/${slugPre}`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  await visitor.waitForTimeout(2500);
  const visText = (await visitor.locator("body").innerText()).replace(/\s+/g, " ").trim();
  const visTitle = await visitor.title();
  await visitor.screenshot({ path: path.join(SHOT_DIR, "alter-link.png"), fullPage: true });
  note(`Alter Link im Browser: Titel „${visTitle}“, sichtbarer Text „${visText.slice(0, 160)}“`);
  ok(
    visText.length > 20,
    `Alter Link zeigt einen erklärenden Text (sichtbarer Text ${visText.length} Zeichen)`,
  );
  await visitorCtx.close();

  // 3c Einbetten/QR/Chat übernehmen den neuen Slug
  await page.reload({ waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(600);
  const teilenHtml = await page.content();
  ok(teilenHtml.includes(`/h/${newSlug}`), "Teilen-Seite zeigt Link/iFrame mit neuer Adresse");
  const qrAlt = page.locator('img[alt="QR-Code zur Hilfe-Seite"]');
  const qrSrc = await qrAlt.getAttribute("src");
  ok(!!qrSrc && decodeURIComponent(qrSrc).includes(`/h/${newSlug}`), `QR-Code nutzt die neue Adresse`);
  await page.goto(`${BASE}/app/settings/chat`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(400);
  ok((await page.content()).includes(`account=${newSlug}`), "Chat-Einbettcode nutzt die neue Adresse");

  // 3d belegte Adresse
  await page.goto(`${BASE}/app/settings/teilen`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(800);
  await page.fill("#hub-slug", otherSlug);
  await clearToasts(page);
  await saveBar(page).getByRole("button", { name: "Speichern" }).click();
  await page.waitForTimeout(2500);
  const dupMsg = await toastText(page, 3000);
  const slugAfterDup = (await getAcc(owner.accountId, "slug")).slug;
  ok(slugAfterDup === newSlug, "Belegte Adresse wird nicht übernommen");
  ok(/vergeben|belegt/i.test(dupMsg), `Belegte Adresse: verständliche Meldung („${dupMsg}“)`);

  // 3e sehr lange Adresse + Umlaute
  await page.goto(`${BASE}/app/settings/teilen`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(800);
  const longSlug = `müller-über-straße-${"x".repeat(120)}`;
  await page.fill("#hub-slug", longSlug);
  await clearToasts(page);
  await saveBar(page).getByRole("button", { name: "Speichern" }).click();
  await page.waitForTimeout(2500);
  const slugLong = (await getAcc(owner.accountId, "slug")).slug;
  note(`Lange Adresse mit Umlauten → DB-Slug „${slugLong}“ (${slugLong.length} Zeichen)`);
  ok(slugLong.length <= 60 && /^[a-z0-9-]+$/.test(slugLong), `Lange/Umlaut-Adresse sauber gekürzt`);
  ok(!/-$/.test(slugLong), `Gekürzte Adresse endet nicht auf einem Bindestrich („${slugLong}“)`);
  const hubLong = await fetch(`${BASE}/h/${slugLong}`);
  ok(hubLong.status === 200, `Hilfe-Seite unter gekürzter Adresse erreichbar (HTTP ${hubLong.status})`);

  // ============ 4. Tarif-Anzeige + Sperren ============
  console.log("\n--- 4. Tarif ---");
  for (const [plan, label] of [
    ["free", "Kostenlos"],
    ["pro", "Pro"],
    ["business", "Business"],
  ]) {
    await setPlan(owner.accountId, plan);
    await page.goto(`${BASE}/app/settings/tarif`, { waitUntil: "domcontentloaded" });
    await h1(page);
    await page.waitForTimeout(400);
    const card = page.locator(`[data-plan="${plan}"]`);
    const isCur = (await card.getAttribute("data-current")) === "true";
    const lead = await page.locator("main").innerText();
    ok(isCur && lead.includes(label), `Tarif ${plan}: „${label}“ korrekt als aktiv markiert`);
    const bald = await card.getByText("Bald buchbar").count();
    ok(bald === 0, `Tarif ${plan}: kein „Bald buchbar“ am aktiven Tarif`);
  }

  // Sprachen-Sperre je Tarif
  for (const [plan, expectDisabled] of [
    ["free", true],
    ["pro", true],
    ["business", false],
  ]) {
    await setPlan(owner.accountId, plan);
    await page.goto(`${BASE}/app/settings/sprachen`, { waitUntil: "domcontentloaded" });
    await h1(page);
    await page.waitForTimeout(600);
    const sw = page.locator("#lang-en");
    const disabled = await sw.isDisabled().catch(() => null);
    ok(disabled === expectDisabled, `Sprachen (${plan}): Schalter ${expectDisabled ? "gesperrt" : "frei"} (ist: ${disabled})`);
    const pill = await page.getByText("Business", { exact: false }).count();
    if (expectDisabled) ok(pill > 0, `Sprachen (${plan}): Hinweis auf Business-Tarif sichtbar`);
  }

  // Business: Sprache wirklich einschalten + speichern
  await setPlan(owner.accountId, "business");
  await page.goto(`${BASE}/app/settings/sprachen`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(800);
  await clearToasts(page);
  await page.getByRole("switch", { name: "Englisch" }).click();
  const langsDb = await pollDb(
    async () => (await getAcc(owner.accountId, "languages")).languages,
    (l) => Array.isArray(l) && l.includes("en"),
  );
  ok(Array.isArray(langsDb) && langsDb.includes("en"), `Business: Sprache EN gespeichert (${JSON.stringify(langsDb)})`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(800);
  ok((await page.getByRole("switch", { name: "Englisch" }).getAttribute("aria-checked")) === "true", "Sprache EN ist nach Neuladen noch an");

  // Downgrade: was passiert mit bereits aktiven Sprachen?
  await setPlan(owner.accountId, "free");
  await page.goto(`${BASE}/app/settings/sprachen`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(700);
  const stillOn = (await page.getByRole("switch", { name: "Englisch" }).getAttribute("aria-checked")) === "true";
  const nowDisabled = await page.locator("#lang-en").isDisabled();
  note(`Nach Downgrade auf free: EN angezeigt als ${stillOn ? "AN" : "aus"}, Schalter ${nowDisabled ? "gesperrt" : "frei"}`);
  ok(
    !(stillOn && nowDisabled) || true,
    `Downgrade: EN bleibt an (${stillOn}) und ist gesperrt (${nowDisabled}) — Abwählen ${stillOn && nowDisabled ? "NICHT möglich" : "möglich"}`,
  );
  if (stillOn && nowDisabled) {
    findings.push(
      "Downgrade free: aktive Zusatzsprache bleibt an, Schalter ist gesperrt → der Kunde kann sie nicht mehr abschalten (Abschalten ist laut Code eigentlich immer erlaubt).",
    );
    failed = true;
    console.log("✗ Downgrade: aktive Sprache lässt sich nicht mehr abschalten (Schalter gesperrt)");
  }
  await admin.from("accounts").update({ languages: [] }).eq("id", owner.accountId);

  // KI-Design-Sperre (Aussehen)
  await page.goto(`${BASE}/app/settings/aussehen`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(900);
  const aussehenTxt = await page.locator("main").innerText();
  ok(/Business/i.test(aussehenTxt), "Aussehen (free): KI-Design ist als Business-Funktion gekennzeichnet");
  await page.screenshot({ path: path.join(SHOT_DIR, "aussehen-free.png"), fullPage: true });

  // ============ 5. Erweiterung ============
  console.log("\n--- 5. Steply-Erweiterung ---");
  await page.goto(`${BASE}/app/settings/erweiterung`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.getByTestId("extension-setup").waitFor({ timeout: 20_000 });
  const setupChrome = page.getByTestId("extension-setup");
  ok((await setupChrome.getAttribute("data-browser")) === "chrome", "Chrome-UA: Chrome-Anleitung");
  ok(
    (await page.getByTestId("browser-address").first().innerText()).trim() === "chrome://extensions",
    "Chrome-UA: Adresse chrome://extensions",
  );
  ok((await setupChrome.getAttribute("data-step")) === "1", "Ohne Erweiterung: Schritt 1 von 3");

  // Manueller Code
  await page.getByText("Code manuell eingeben", { exact: false }).click();
  await page.getByRole("button", { name: "Code erzeugen" }).waitFor({ timeout: 10_000 });
  await clearToasts(page);
  await page.getByRole("button", { name: "Code erzeugen" }).click();
  await page.waitForTimeout(3000);
  const conns1 = await admin
    .from("recorder_tokens")
    .select("id, label")
    .eq("account_id", owner.accountId)
    .eq("user_id", owner.userId);
  ok((conns1.data ?? []).length === 1, `Manueller Code legt genau EINE Verbindung an (${(conns1.data ?? []).length})`);
  note(`Verbindungs-Name: „${conns1.data?.[0]?.label}“`);
  await page.waitForTimeout(1500);
  const listShown = await page.getByTestId("recorder-connections").count();
  ok(listShown === 1, "Verbindungsliste erscheint nach dem Erzeugen");

  // Zweimal „Neuen Code erzeugen" → Karteileichen?
  await page.getByRole("button", { name: "Neuen Code erzeugen" }).click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Neuen Code erzeugen" }).click();
  await page.waitForTimeout(2500);
  const conns3 = await admin
    .from("recorder_tokens")
    .select("id, label")
    .eq("account_id", owner.accountId)
    .eq("user_id", owner.userId);
  note(`Nach 3× „Code erzeugen“: ${(conns3.data ?? []).length} Verbindungen in der DB`);
  ok(
    (conns3.data ?? []).length <= 1,
    `„Neuen Code erzeugen“ ersetzt den alten Code statt Karteileichen anzulegen (${(conns3.data ?? []).length} Verbindungen)`,
  );

  // Trennen
  await page.reload({ waitUntil: "domcontentloaded" });
  await h1(page);
  await page.getByTestId("recorder-connections").waitFor({ timeout: 20_000 });
  const rows = page.getByTestId("recorder-connection");
  const rowCount = await rows.count();
  ok(rowCount === (conns3.data ?? []).length, `Liste zeigt alle ${rowCount} Verbindungen`);
  await clearToasts(page);
  await rows.first().getByRole("button", { name: /trennen/i }).click();
  await page.waitForTimeout(2500);
  const afterCut = await admin
    .from("recorder_tokens")
    .select("id")
    .eq("account_id", owner.accountId)
    .eq("user_id", owner.userId);
  ok(
    (afterCut.data ?? []).length === rowCount - 1,
    `„Trennen“ entfernt genau eine Verbindung (${rowCount} → ${(afterCut.data ?? []).length})`,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(1200);
  const rowsAfter = await page.getByTestId("recorder-connection").count();
  ok(rowsAfter === (afterCut.data ?? []).length, `Liste nach Neuladen korrekt (${rowsAfter})`);
  await admin.from("recorder_tokens").delete().eq("account_id", owner.accountId);

  // Edge-UA
  const edgeCtx = await newCtx(browser, { userAgent: UA_EDGE });
  const edgePage = await edgeCtx.newPage();
  await login(edgePage, owner.email);
  await edgePage.goto(`${BASE}/app/settings/erweiterung`, { waitUntil: "domcontentloaded" });
  await h1(edgePage);
  await edgePage.getByTestId("extension-setup").waitFor({ timeout: 20_000 });
  ok(
    (await edgePage.getByTestId("extension-setup").getAttribute("data-browser")) === "edge",
    "Edge-UA: Edge-Anleitung erkannt",
  );
  ok(
    (await edgePage.getByTestId("browser-address").first().innerText()).trim() === "edge://extensions",
    "Edge-UA: Adresse edge://extensions",
  );
  const edgeBag = errorsOf.get(edgeCtx);
  await edgeCtx.close();
  if (edgeBag.pageErrors.length) note(`Edge-Kontext JS-Fehler: ${edgeBag.pageErrors.join(" | ")}`);

  // ============ 6. Team / Einladungen / Grenzen ============
  console.log("\n--- 6. Team ---");
  await setPlan(owner.accountId, "free");
  await page.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(600);
  const seatsFree = await page.getByTestId("team-seats").innerText();
  ok(seatsFree.trim() === "1 von 1 Platz", `Free: Platz-Zähler „${seatsFree.trim()}“`);
  const inviteBtn = page.getByRole("button", { name: /Einladen/ });
  ok(await inviteBtn.isDisabled(), "Free: „Einladen“ ist gesperrt");
  ok(
    /kostenlosen Tarif arbeiten Sie allein/i.test(await page.locator("main").innerText()),
    "Free: Hinweis „Im kostenlosen Tarif arbeiten Sie allein“",
  );

  // Pro
  await setPlan(owner.accountId, "pro");
  await page.reload({ waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(600);
  ok((await page.getByTestId("team-seats").innerText()).trim() === "1 von 5 Plätzen", "Pro: Zähler „1 von 5 Plätzen“");
  ok(!(await page.getByRole("button", { name: /Einladen/ }).isDisabled()), "Pro: „Einladen“ freigeschaltet");

  // Einladung erzeugen (Mailversand darf fehlschlagen — Link muss kommen)
  const inviteEmail = `steply-audit-invitee-${stamp}@example.com`;
  await page.fill("#invite-email", inviteEmail);
  await page.selectOption("#invite-role", "editor");
  await page.getByRole("button", { name: /Einladen/ }).click();
  const statusBox = page.locator('[role="status"]').first();
  await statusBox.waitFor({ timeout: 20_000 });
  const statusTxt = await statusBox.innerText();
  const linkMatch = statusTxt.match(/https?:\/\/\S+\/invite\/\w+/);
  ok(!!linkMatch, `Einladung liefert einen Beitritts-Link (Text: „${statusTxt.replace(/\s+/g, " ").slice(0, 120)}“)`);
  const inviteLink = linkMatch ? linkMatch[0].replace(/^https?:\/\/[^/]+/, BASE) : null;
  await page.waitForTimeout(1500);
  const seatsAfterInvite = await page.getByTestId("team-seats").innerText();
  ok(seatsAfterInvite.trim() === "2 von 5 Plätzen", `Zähler nach Einladung: „${seatsAfterInvite.trim()}“ (erwartet 2 von 5)`);

  // Dieselbe Adresse nochmal einladen → keine Dubletten
  await page.fill("#invite-email", inviteEmail);
  await page.getByRole("button", { name: /Einladen/ }).click();
  await page.waitForTimeout(2500);
  const invRows = await admin
    .from("invitations")
    .select("id, status")
    .eq("account_id", owner.accountId)
    .eq("email", inviteEmail)
    .eq("status", "pending");
  ok((invRows.data ?? []).length === 1, `Doppelte Einladung erzeugt keine Dublette (${(invRows.data ?? []).length} offen)`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(800);
  const seats2 = await page.getByTestId("team-seats").innerText();
  ok(seats2.trim() === "2 von 5 Plätzen", `Zähler nach erneuter Einladung: „${seats2.trim()}“`);

  // Grenze über den Einladungslink: auf free downgraden, dann annehmen
  const freshToken = (
    await admin
      .from("invitations")
      .select("token")
      .eq("account_id", owner.accountId)
      .eq("email", inviteEmail)
      .eq("status", "pending")
      .maybeSingle()
  ).data?.token;
  await setPlan(owner.accountId, "free");
  const c1 = await newCtx(browser);
  const p1 = await c1.newPage();
  await p1.goto(`${BASE}/invite/${freshToken}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await p1.waitForTimeout(1200);
  const pwField = p1.locator('input[type="password"]').first();
  if (await pwField.count()) {
    await pwField.fill(PW);
    const confirm2 = p1.locator('input[type="password"]').nth(1);
    if (await confirm2.count()) await confirm2.fill(PW);
    await p1.locator('button[type="submit"]').first().click();
    await p1.waitForTimeout(4000);
  }
  const bodyFull = await p1.locator("body").innerText();
  const joinedDespiteLimit = await admin
    .from("account_members")
    .select("user_id")
    .eq("account_id", owner.accountId);
  ok(
    (joinedDespiteLimit.data ?? []).length === 1,
    `Tarif-Grenze greift auch beim Annehmen (Mitglieder: ${(joinedDespiteLimit.data ?? []).length})`,
  );
  ok(/Team ist voll|keine weiteren Personen/i.test(bodyFull), `Annehmen über Grenze: verständliche Meldung`);
  note(`Annehmen-über-Grenze Seitentext: ${bodyFull.replace(/\s+/g, " ").slice(0, 200)}`);
  // Aufräumen: evtl. angelegter Auth-User
  const leaked = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const leakedUser = (leaked.data?.users ?? []).find((u) => u.email === inviteEmail);
  if (leakedUser) {
    users.push({ userId: leakedUser.id, accountId: null, email: inviteEmail });
    findings.push(
      `Beim abgelehnten Beitritt (Team voll) wurde trotzdem ein Auth-Konto für ${inviteEmail} angelegt (Karteileiche).`,
    );
    console.log("✗ Team voll: Auth-Konto wurde trotzdem angelegt");
    failed = true;
  } else {
    ok(true, "Team voll: es bleibt kein halbes Konto zurück");
  }
  await c1.close();

  // Jetzt Pro: annehmen mit NEUEM Konto
  await setPlan(owner.accountId, "pro");
  const c2 = await newCtx(browser);
  const p2 = await c2.newPage();
  await p2.goto(`${BASE}/invite/${freshToken}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await p2.waitForTimeout(1200);
  const pw2 = p2.locator('input[type="password"]').first();
  ok(await pw2.count(), "Einladungsseite zeigt ein Passwort-Formular für neue Konten");
  await pw2.fill(PW);
  const conf2 = p2.locator('input[type="password"]').nth(1);
  if (await conf2.count()) await conf2.fill(PW);
  await p2.locator('button[type="submit"]').first().click();
  await p2.waitForURL(/\/app/, { timeout: 60_000 }).catch(() => {});
  await p2.waitForTimeout(2500);
  const membersNow = await admin.from("account_members").select("user_id, role").eq("account_id", owner.accountId);
  ok((membersNow.data ?? []).length === 2, `Neues Konto ist beigetreten (${(membersNow.data ?? []).length} Mitglieder)`);
  const joinedRow = (membersNow.data ?? []).find((m) => m.user_id !== owner.userId);
  ok(joinedRow?.role === "editor", `Beigetretene Rolle ist „Bearbeiter“ (${joinedRow?.role})`);
  const inviteeAuth = (await admin.auth.admin.listUsers({ page: 1, perPage: 200 })).data.users.find(
    (u) => u.email === inviteEmail,
  );
  if (inviteeAuth && !users.some((u) => u.userId === inviteeAuth.id)) {
    invitee = { userId: inviteeAuth.id, accountId: null, email: inviteEmail };
    users.push(invitee);
  } else {
    invitee = users.find((u) => u.email === inviteEmail);
  }
  // Link ein zweites Mal öffnen
  await p2.goto(`${BASE}/invite/${freshToken}`, { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(1500);
  ok(/\/app/.test(p2.url()), `Verbrauchter Einladungslink führt sauber in die App (${new URL(p2.url()).pathname})`);
  const c2bag = errorsOf.get(c2);
  if (c2bag.pageErrors.length) note(`Einladungs-Kontext JS-Fehler: ${c2bag.pageErrors.join(" | ")}`);

  // Einladung für BESTEHENDES Konto (other)
  await page.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(700);
  await page.fill("#invite-email", other.email);
  await page.selectOption("#invite-role", "member");
  await page.getByRole("button", { name: /Einladen/ }).click();
  await page.locator('[role="status"]').first().waitFor({ timeout: 20_000 });
  const link2 = (await page.locator('[role="status"]').first().innerText()).match(/https?:\/\/\S+\/invite\/\w+/);
  ok(!!link2, "Einladung an bestehendes Konto liefert Link");
  const token2 = link2 ? link2[0].split("/invite/")[1] : null;

  const c3 = await newCtx(browser);
  const p3 = await c3.newPage();
  await login(p3, other.email);
  await p3.goto(`${BASE}/invite/${token2}`, { waitUntil: "domcontentloaded" });
  await p3.waitForTimeout(1500);
  const joinBtn = p3.getByRole("button", { name: /beitreten|annehmen/i }).first();
  ok(await joinBtn.count(), "Eingeloggtes bestehendes Konto sieht eine Bestätigungs-Abfrage");
  if (await joinBtn.count()) {
    await joinBtn.click();
    await p3.waitForTimeout(4000);
  }
  const members3 = await admin.from("account_members").select("user_id, role").eq("account_id", owner.accountId);
  ok((members3.data ?? []).length === 3, `Bestehendes Konto beigetreten (${(members3.data ?? []).length} Mitglieder)`);
  const otherRole = (members3.data ?? []).find((m) => m.user_id === other.userId)?.role;
  ok(otherRole === "member", `Bestehendes Konto hat Rolle „Mitarbeiter“ (${otherRole})`);

  // ============ 7. Rollen-Sperren (Mitarbeiter) ============
  console.log("\n--- 7. Rollen: Mitarbeiter ---");
  const GUARDED = [
    "/app/settings/allgemein",
    "/app/settings/team",
    "/app/settings/aussehen",
    "/app/settings/teilen",
    "/app/settings/sprachen",
    "/app/settings/chat",
    "/app/settings/erweiterung",
    "/app/settings/tarif",
    "/app/automationen",
    "/app/assistent/wissen",
  ];
  for (const route of GUARDED) {
    const res = await p3.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await p3.waitForURL((u) => u.pathname === "/app/lernen", { timeout: 15_000 }).catch(() => {});
    const u = new URL(p3.url()).pathname;
    ok(u === "/app/lernen", `Mitarbeiter: ${route} → ${u} (HTTP ${res?.status()})`);
  }
  await p3.goto(`${BASE}/app/settings/profil`, { waitUntil: "domcontentloaded" });
  await p3.waitForTimeout(500);
  ok(new URL(p3.url()).pathname === "/app/settings/profil", "Mitarbeiter darf ins eigene Profil");
  // Mitarbeiter per REST (Server-Ebene)
  const memberRest = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  await memberRest.auth.signInWithPassword({ email: other.email, password: PW });
  const memUpd = await memberRest.from("accounts").update({ name: "Gekapert" }).eq("id", owner.accountId).select("id");
  const nameStill = (await getAcc(owner.accountId, "name")).name;
  ok(nameStill !== "Gekapert", `Mitarbeiter kann den Organisationsnamen NICHT per REST ändern (DB: „${nameStill}“)`);
  const memRead = await memberRest.from("automations").select("id").eq("account_id", owner.accountId);
  note(`Mitarbeiter liest automations per REST: ${(memRead.data ?? []).length} Zeilen, Fehler: ${memRead.error?.message ?? "—"}`);
  const memInv = await memberRest.from("invitations").select("token").eq("account_id", owner.accountId);
  ok(
    !(memInv.data ?? []).some((r) => r.token),
    `Mitarbeiter kann keine Einladungs-Token lesen (${(memInv.data ?? []).length} Zeilen, Fehler: ${memInv.error?.code ?? "—"})`,
  );

  // ============ 8. Rolle ändern / entfernen / verlassen ============
  console.log("\n--- 8. Team: Rolle, Entfernen, Verlassen ---");
  await page.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(900);
  const roleSel = page.locator(`select[aria-label="Rolle von ${other.email}"]`);
  ok(await roleSel.count(), "Inhaber sieht eine Rollen-Auswahl je Mitglied");
  await clearToasts(page);
  await roleSel.selectOption("editor");
  const roleDb = await pollDb(
    async () =>
      (await admin.from("account_members").select("role").eq("account_id", owner.accountId).eq("user_id", other.userId).single())
        .data?.role,
    (r) => r === "editor",
  );
  ok(roleDb === "editor", `Rolle geändert auf Bearbeiter (DB: ${roleDb})`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(900);
  ok(
    (await page.locator(`select[aria-label="Rolle von ${other.email}"]`).inputValue()) === "editor",
    "Geänderte Rolle steht auch nach Neuladen",
  );

  // Letzter Inhaber: eigene Rolle herabstufen?
  const ownerSel = page.locator(`select[aria-label="Rolle von ${owner.email}"]`);
  ok((await ownerSel.count()) === 0, "Letzter Inhaber hat keine Rollen-Auswahl (kann sich nicht selbst herabstufen)");

  // Entfernen
  page.once("dialog", (d) => d.accept());
  await clearToasts(page);
  await page.getByRole("button", { name: `${other.email} entfernen` }).click();
  const gone = await pollDb(
    async () => (await admin.from("account_members").select("user_id").eq("account_id", owner.accountId)).data ?? [],
    (l) => l.length === 2,
  );
  ok(gone.length === 2, `Mitglied entfernt (${gone.length} verbleibend)`);
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(800);
  ok(
    (await page.locator("main").innerText()).includes("Mitglieder (2)"),
    "Mitglieder-Zähler nach Entfernen korrekt",
  );

  // Entferntes Mitglied: was sieht es?
  await p3.goto(`${BASE}/app/lernen`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => {});
  await p3.waitForTimeout(1500);
  const p3path = new URL(p3.url()).pathname + new URL(p3.url()).search;
  note(`Entferntes Mitglied landet auf: ${p3path}`);
  ok(
    /\/login|\/app/.test(p3path),
    `Entferntes Mitglied wird sauber umgeleitet (${p3path})`,
  );
  await c3.close();

  // Organisation verlassen (Bearbeiter = invitee)
  const c4 = await newCtx(browser);
  const p4 = await c4.newPage();
  await login(p4, inviteEmail);
  await p4.goto(`${BASE}/app/settings/profil`, { waitUntil: "domcontentloaded" });
  await h1(p4);
  await p4.waitForTimeout(800);
  p4.once("dialog", (d) => d.accept());
  await p4.getByRole("button", { name: /verlassen/ }).click();
  await p4.waitForTimeout(5000);
  const after = await admin.from("account_members").select("user_id").eq("account_id", owner.accountId);
  ok((after.data ?? []).length === 1, `„Organisation verlassen“ funktioniert (${(after.data ?? []).length} Mitglied)`);
  const p4path = new URL(p4.url()).pathname + new URL(p4.url()).search;
  note(`Nach dem Verlassen ohne andere Organisation: ${p4path}`);
  ok(/\/login/.test(p4path), `Nach dem Verlassen sauber auf der Anmeldeseite (${p4path})`);
  await c4.close();

  // Letzter Inhaber darf nicht gehen
  await page.goto(`${BASE}/app/settings/profil`, { waitUntil: "domcontentloaded" });
  await h1(page);
  await page.waitForTimeout(700);
  const leaveBtn = page.getByRole("button", { name: /verlassen/ });
  ok(await leaveBtn.isDisabled(), "Letzter Inhaber: „verlassen“ ist gesperrt");
  ok(
    /einzige Inhaber/i.test(await page.locator("main").innerText()),
    "Letzter Inhaber: Grund wird erklärt",
  );

  // ============ 9. Automationen ============
  console.log("\n--- 9. Automationen ---");
  const { convertTutorialToAutomation } = await import("../src/lib/automations.ts");
  // Tutorial mit zwei klickbaren Schritten + einem Eingabefeld seeden.
  const { data: tut } = await admin
    .from("tutorials")
    .insert({
      account_id: owner.accountId,
      title: "Audit-Ablauf",
      status: "draft",
      visibility: "public",
      site_domains: ["audit.example"],
    })
    .select("id")
    .single();
  const stepIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  await admin.from("steps").insert([
    {
      id: stepIds[0],
      tutorial_id: tut.id,
      title: "Anmelden klicken",
      selector: { css: "#login", text: "Anmelden" },
      page_url: "https://audit.example/",
      position: 1,
      highlights: [],
    },
    {
      id: stepIds[1],
      tutorial_id: tut.id,
      title: "E-Mail eintragen",
      selector: { css: "#mail", role: "textbox", text: "E-Mail" },
      page_url: "https://audit.example/",
      position: 2,
      highlights: [],
    },
    {
      id: stepIds[2],
      tutorial_id: tut.id,
      title: "Absenden",
      selector: { css: "#send", text: "Absenden" },
      page_url: "https://audit.example/",
      position: 3,
      highlights: [],
    },
  ]);
  await admin.from("step_branches").insert([
    { step_id: stepIds[0], label: null, target_step_id: stepIds[1], position: 0 },
    { step_id: stepIds[1], label: null, target_step_id: stepIds[2], position: 0 },
  ]);
  await admin.from("tutorials").update({ root_step_id: stepIds[0] }).eq("id", tut.id);
  const conv = await convertTutorialToAutomation(admin, owner.accountId, tut.id);
  automationIds.push(conv.automationId);
  ok(!!conv.automationId, "Anleitung lässt sich in eine Automation umwandeln");

  // Ehemaliges Mitglied (aus dem Team entfernt) darf nichts mehr sehen.
  const exMemberRead = await memberRest.from("automations").select("id").eq("account_id", owner.accountId);
  ok(
    (exMemberRead.data ?? []).length === 0,
    `Entferntes Mitglied liest keine Automationen mehr (${(exMemberRead.data ?? []).length} Zeilen)`,
  );
  const exMemberTut = await memberRest.from("tutorials").select("id").eq("account_id", owner.accountId);
  ok(
    (exMemberTut.data ?? []).length === 0,
    `Entferntes Mitglied liest keine Anleitungen mehr (${(exMemberTut.data ?? []).length} Zeilen)`,
  );
  const exMemberWrite = await memberRest
    .from("automations")
    .update({ title: "Gekapert" })
    .eq("id", conv.automationId)
    .select("id");
  const titleGuard = (await admin.from("automations").select("title").eq("id", conv.automationId).single()).data?.title;
  ok(titleGuard !== "Gekapert", `Fremdes Konto kann die Automation nicht umbenennen (DB: „${titleGuard}“)`);

  await page.goto(`${BASE}/app/automationen`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const listTxt = await page.locator("main").innerText();
  ok(/Audit-Ablauf/.test(listTxt), "Automation erscheint in der Liste");
  ok(/Noch nie ausgeführt/.test(listTxt), "Liste zeigt „Noch nie ausgeführt“");
  await page.screenshot({ path: path.join(SHOT_DIR, "automationen-liste.png"), fullPage: true });

  await page.goto(`${BASE}/app/automationen/${conv.automationId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const detailTxt = await page.locator("main").innerText();
  note(`Automations-Detail zeigt: ${detailTxt.replace(/\s+/g, " ").slice(0, 900)}`);
  ok(
    /Steply-Erweiterung/i.test(detailTxt),
    "Automations-Detail erklärt, dass die Ausführung über die Erweiterung läuft",
  );
  await page.screenshot({ path: path.join(SHOT_DIR, "automation-detail.png"), fullPage: true });

  // Umbenennen
  const renameBtn = page.getByRole("button", { name: "Umbenennen" });
  if (await renameBtn.count()) {
    await renameBtn.click();
    await page.waitForTimeout(400);
    const input = page.locator("main input").first();
    await input.fill("Audit-Ablauf umbenannt");
    await page.getByRole("button", { name: "Speichern" }).first().click();
    const titleDb = await pollDb(
      async () => (await admin.from("automations").select("title").eq("id", conv.automationId).single()).data?.title,
      (t) => t === "Audit-Ablauf umbenannt",
    );
    ok(titleDb === "Audit-Ablauf umbenannt", `Automation umbenannt (DB: „${titleDb}“)`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    ok(
      (await page.locator("main").innerText()).includes("Audit-Ablauf umbenannt"),
      "Neuer Name steht nach Neuladen",
    );
  } else {
    ok(false, "Automations-Detail: kein „Umbenennen“ gefunden");
  }

  // Leerer Name
  if (await page.getByRole("button", { name: "Umbenennen" }).count()) {
    await page.getByRole("button", { name: "Umbenennen" }).click();
    await page.waitForTimeout(400);
    const input = page.locator("main input").first();
    await input.fill("   ");
    await page.getByRole("button", { name: "Speichern" }).first().click();
    await page.waitForTimeout(2000);
    const titleAfterEmpty = (await admin.from("automations").select("title").eq("id", conv.automationId).single()).data
      ?.title;
    ok(titleAfterEmpty === "Audit-Ablauf umbenannt", `Leerer Automations-Name wird nicht gespeichert (DB: „${titleAfterEmpty}“)`);
    const stillEditing = await page.locator("main input.text-lg").count();
    note(`Nach leerem Namen: Eingabefeld ${stillEditing ? "noch offen" : "geschlossen"}, Rückmeldung an den Nutzer?`);
  }

  // Fremde Automation (anderes Konto) → 404
  const foreignRes = await fetch(`${BASE}/app/automationen/${conv.automationId}`);
  note(`Automations-Detail ohne Anmeldung: HTTP ${foreignRes.status}`);
  const badRes = await page.goto(`${BASE}/app/automationen/00000000-0000-0000-0000-000000000000`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(2000);
  const badTxt = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
  note(`Unbekannte Automation: HTTP ${badRes?.status()}, sichtbar „${badTxt.slice(0, 140)}“`);
  ok(/nicht gefunden/i.test(badTxt), `Unbekannte Automation zeigt eine 404-Seite (HTTP ${badRes?.status()})`);
  ok(badRes?.status() === 404, `Unbekannte Automation liefert HTTP 404 (ist: ${badRes?.status()})`);

  // Lauf-Historie
  const runIns = await admin.from("automation_runs").insert({
    automation_id: conv.automationId,
    account_id: owner.accountId,
    status: "failed",
    mode: "semi",
    detail: "Testlauf fehlgeschlagen",
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });
  ok(!runIns.error, `Testlauf angelegt (${runIns.error?.message ?? "ok"})`);
  await page.goto(`${BASE}/app/automationen/${conv.automationId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  const withRun = await page.locator("main").innerText();
  ok(/Testlauf fehlgeschlagen|Fehlgeschlagen|fehlgeschlagen/i.test(withRun), "Lauf-Historie zeigt den fehlgeschlagenen Lauf");

  // Zeitplan ein-/ausschalten
  const schedSwitch = page.getByLabel("Automatisch ausführen");
  if (await schedSwitch.count()) {
    await clearToasts(page);
    await schedSwitch.click();
    await page.waitForTimeout(2500);
    const schedTxt = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    note(`Zeitplan nach dem Einschalten: ${schedTxt.slice(schedTxt.indexOf("ZEITPLAN"), schedTxt.indexOf("ZEITPLAN") + 400)}`);
    const saveSched = page.getByRole("button", { name: "Speichern", exact: true }).first();
    if (await saveSched.count()) {
      await saveSched.click();
      await page.waitForTimeout(2500);
    }
    const schedDb = (await admin.from("automations").select("schedule").eq("id", conv.automationId).single()).data
      ?.schedule;
    note(`Zeitplan in der DB: ${JSON.stringify(schedDb)}`);
    ok(!!schedDb, `Zeitplan wird gespeichert (${JSON.stringify(schedDb)})`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const backOn = await page.getByLabel("Automatisch ausführen").isChecked();
    ok(backOn === !!schedDb, `Zeitplan-Schalter steht nach Neuladen richtig (${backOn})`);
  } else {
    ok(false, "Automations-Detail: kein Zeitplan-Schalter gefunden");
  }

  // ============ 10. Mobil 390px ============
  console.log("\n--- 10. Mobil (390px) ---");
  const mob = await newCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true });
  const mp = await mob.newPage();
  await login(mp, owner.email);
  for (const [route] of SETTINGS_PAGES) {
    await mp.goto(`${BASE}/app/settings/${route}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await h1(mp).catch(() => {});
    await mp.waitForTimeout(600);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 1, `Mobil /${route}: keine horizontale Scrollleiste (${overflow}px)`);
    await mp.screenshot({ path: path.join(SHOT_DIR, `m-${route}.png`), fullPage: true });
  }
  await mp.goto(`${BASE}/app/automationen`, { waitUntil: "domcontentloaded" });
  await mp.waitForTimeout(800);
  const ovA = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(ovA <= 1, `Mobil /app/automationen: keine horizontale Scrollleiste (${ovA}px)`);
  await mp.screenshot({ path: path.join(SHOT_DIR, "m-automationen.png"), fullPage: true });
  await mp.goto(`${BASE}/app/automationen/${conv.automationId}`, { waitUntil: "domcontentloaded" });
  await mp.waitForTimeout(1000);
  const ovD = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(ovD <= 1, `Mobil Automations-Detail: keine horizontale Scrollleiste (${ovD}px)`);
  await mp.screenshot({ path: path.join(SHOT_DIR, "m-automation-detail.png"), fullPage: true });
  // Löschen
  const delBtn = page.getByRole("button", { name: /Automation löschen/i }).first();
  if (await delBtn.count()) {
    await delBtn.click();
    await page.waitForTimeout(800);
    const confirmDel = page.getByRole("button", { name: /Endgültig löschen/i }).first();
    await confirmDel.click();
    await page.waitForTimeout(3000);
    const stillThere = (await admin.from("automations").select("id").eq("id", conv.automationId)).data ?? [];
    ok(stillThere.length === 0, `Automation gelöscht (${stillThere.length} übrig)`);
    ok(/\/app\/automationen$/.test(new URL(page.url()).pathname), `Nach dem Löschen zurück in der Liste (${new URL(page.url()).pathname})`);
  } else {
    ok(false, "Automations-Detail: kein „Löschen“ gefunden");
  }

  const mobBag = errorsOf.get(mob);
  await mob.close();
  if (mobBag.pageErrors.length) note(`Mobil JS-Fehler: ${mobBag.pageErrors.join(" | ")}`);

  // ============ 11. Admin-Bereich (nur oberflächlich) ============
  console.log("\n--- 11. Admin-Bereich ---");
  const adminRes = await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForURL((u) => u.pathname === "/app", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const adminPath = new URL(page.url()).pathname;
  const adminTxt = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
  note(`Normaler Nutzer auf /admin: HTTP ${adminRes?.status()} → ${adminPath}; sichtbar „${adminTxt.slice(0, 120)}“`);
  ok(adminPath === "/app", `Normaler Nutzer wird von /admin weggeleitet (${adminPath})`);
  ok(!/Vorlage|Template/i.test(adminTxt) || adminPath === "/app", "Keine Admin-Inhalte sichtbar");

  // ============ 12. Fehler-Sammlung ============
  console.log("\n--- 12. Gesammelte Browser-/HTTP-Fehler ---");
  const bag = errorsOf.get(ctx);
  const http = bag.http.filter((h) => !/\/_next\/|favicon|\.map$/.test(h));
  const uniq = [...new Set(http)];
  note(`HTTP ≥400 (Hauptkontext): ${uniq.length ? uniq.join(" | ") : "keine"}`);
  note(`JS-Fehler: ${bag.pageErrors.length ? [...new Set(bag.pageErrors)].join(" | ") : "keine"}`);
  const consErr = [...new Set(bag.console)].filter((c) => !/Download the React DevTools|Warning:/.test(c));
  note(`Konsole (error): ${consErr.length ? consErr.join(" | ") : "keine"}`);
  ok(bag.pageErrors.length === 0, `Keine unbehandelten JS-Fehler im Hauptkontext (${bag.pageErrors.length})`);
} catch (e) {
  ok(false, "Abbruch: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const id of automationIds) await admin.from("automations").delete().eq("id", id).then(() => {}, () => {});
  for (const u of users) {
    if (u.accountId) await admin.from("accounts").delete().eq("id", u.accountId).then(() => {}, () => {});
  }
  for (const u of users) await admin.auth.admin.deleteUser(u.userId).catch(() => {});
  // Verwaiste Konten der Wegwerf-Nutzer (Einladungs-Konten legen keins an, aber sicher ist sicher).
  if (server) {
    try {
      spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore", shell: true });
    } catch {
      /* egal */
    }
  }
}

console.log("\n===== ZUSAMMENFASSUNG =====");
if (findings.length) {
  console.log(`${findings.length} Befund(e):`);
  for (const f of findings) console.log("  ✗ " + f);
} else {
  console.log("Keine Befunde.");
}
process.exit(failed ? 1 : 0);
