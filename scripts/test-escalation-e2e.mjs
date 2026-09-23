// Kontakt/Eskalation im Hilfe-Chat: Wählt der Bot bei einer Wissenslücke die fachlich
// passende Person, fällt er sonst auf den allgemeinen Kontakt zurück, und erscheint die
// Kontaktbox im echten Chat-Widget? Unsichere Links (javascript:) dürfen nie gespeichert
// bzw. angezeigt werden. Dazu die Einstellungsseite „Persönlicher Kontakt" im Browser:
// Auto-Einschalten, Feldprüfung, kompakte Personen-Karten, Vorschau, Speichern, mobil.
// Screenshots → scripts/.shots-escalation (gitignored über .shots*).
// Echte DB + echte KI, Dev-Server lokal; Wegwerf-Konto wird am Ende gelöscht.
//
// Nutzung:  node --env-file=.env.local scripts/test-escalation-e2e.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
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

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const PORT = 3033;
const BASE = `http://localhost:${PORT}`;
const stamp = String(process.hrtime.bigint()).slice(-8);
const slug = `esc-${stamp}`;
const email = `tutax-esc-${stamp}@example.com`;
const SHOT_DIR = path.join(__dirname, ".shots-escalation");
mkdirSync(SHOT_DIR, { recursive: true });

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", email);
  await page.fill("#password", "Test12345!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(`${BASE}/robots.txt`)).status === 200) return true;
    } catch {
      /* noch nicht bereit */
    }
    await sleep(1000);
  }
  return false;
}

async function ask(question) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountSlug: slug, question }),
  });
  let answer = "";
  let meta = null;
  for (const line of (await r.text()).split("\n").filter(Boolean)) {
    const o = JSON.parse(line);
    if (o.delta) answer += o.delta;
    if (o.answer) answer += o.answer;
    if (o.meta) meta = o.meta;
  }
  return { answer, meta };
}

const setEscalation = async (escalation) => {
  const { error } = await admin.from("accounts").update({ escalation }).eq("id", accountId);
  if (error) throw error;
};

const GENERAL = {
  enabled: true,
  message: "Unser Team hilft Ihnen gern persönlich.",
  contactName: "Team Nordlicht",
  email: "team@example.com",
  phone: "+49 40 123",
};
const EXPERTS = [
  { name: "Frau Müller", expertise: "Lohnabrechnung, Minijobs, Arbeitnehmer", email: "mueller@example.com" },
  { name: "Herr Schmidt", expertise: "Technik, DATEV-Zugang, Login-Probleme", calendarUrl: "https://cal.example.com/schmidt" },
];

let server, browser, userId, accountId;
try {
  const created = await admin.auth.admin.createUser({
    email,
    password: "Test12345!",
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  accountId = (await admin.from("account_members").select("account_id").eq("user_id", userId)).data[0].account_id;
  // KI-Assistent + persönlicher Kontakt sind Pro (23.09.2026) -> Test-Konto hochstufen.
  await admin.from("accounts").update({ name: "Nordlicht Steuerberatung", slug, onboarded: true, plan: "pro" }).eq("id", accountId);
  const { error: tErr } = await admin.from("tutorials").insert(
    ["DATEV SmartLogin einrichten", "Belege mit DATEV Upload mobil hochladen", "Steuerbescheid im Postfach finden"].map(
      (title, i) => ({ account_id: accountId, title, slug: `t-${i}`, status: "published", visibility: "public" }),
    ),
  );
  if (tErr) throw tErr;

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: path.join(__dirname, ".."),
    shell: true,
    stdio: "ignore",
  });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });

  // 0) Einstellungsseite „Persönlicher Kontakt" wie ein Mensch bedienen.
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await ctx.newPage();
    await login(page);
    await page.goto(`${BASE}/app/assistent/eskalation`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    const status = page.getByTestId("contact-status");
    await status.waitFor({ timeout: 90_000 });
    await page.waitForTimeout(1200); // Hydration
    ok(await page.getByRole("link", { name: "Persönlicher Kontakt" }).first().isVisible(), "Tab heißt „Persönlicher Kontakt“");
    ok(
      (await status.getAttribute("data-tone")) === "off" && (await status.innerText()).includes("Ausgeschaltet"),
      "Start: Status „Ausgeschaltet“",
    );

    await page.fill("#esc-email", "team@example.com");
    ok((await page.getByTestId("contact-switch").getAttribute("aria-checked")) === "true", "Erste E-Mail schaltet automatisch ein");
    ok((await status.getAttribute("data-tone")) === "on", "Status wird „Aktiv“");

    await page.fill("#esc-phone", "ruf mich an");
    ok(await page.getByText("Bitte eine gültige Telefonnummer eingeben.").isVisible(), "Ungültige Telefonnummer wird am Feld markiert");
    ok(await page.getByRole("button", { name: "Speichern" }).isDisabled(), "Speichern gesperrt, solange ein Feld ungültig ist");
    await page.fill("#esc-phone", "+49 40 123");
    await page.fill("#esc-name", "Team Nordlicht");

    await page.getByRole("button", { name: /Zuständige Person hinzufügen/ }).click();
    const editor = page.getByTestId("person-editor");
    await editor.getByPlaceholder("Name, z. B. Julia Meier").fill("Frau Müller");
    await editor.getByLabel("Zuständig für").fill("Lohnabrechnung, Minijobs");
    await editor.getByLabel("E-Mail").fill("mueller@example.com");
    await editor.getByRole("button", { name: "Fertig" }).click();
    const card = page.getByTestId("person-card");
    ok((await card.count()) === 1, "Person erscheint als kompakte Karte");
    const cardText = await card.innerText();
    ok(cardText.includes("Lohnabrechnung") && cardText.includes("Minijobs"), "Karte zeigt Themen als Chips");
    ok(
      cardText.includes("mueller@example.com") && cardText.includes("vom allgemeinen Kontakt"),
      "Karte zeigt eigene E-Mail + geerbte Telefonnummer",
    );

    const preview = page.getByTestId("contact-preview");
    await preview.getByRole("button", { name: "Frage zu Lohnabrechnung" }).click();
    const pbox = await preview.getByTestId("preview-box").innerText();
    ok(
      pbox.includes("mueller@example.com") && pbox.includes("+49 40 123") && pbox.includes("Frau Müller"),
      "Vorschau: Frau Müller mit ihrer E-Mail + Team-Telefon",
    );
    await preview.getByRole("button", { name: "Sonstige Frage" }).click();
    ok((await preview.getByTestId("preview-box").innerText()).includes("team@example.com"), "Vorschau: sonstige Frage → allgemeiner Kontakt");
    ok((await page.getByTestId("save-state").innerText()).includes("Ungespeicherte Änderungen"), "Hinweis „Ungespeicherte Änderungen“");
    await page.screenshot({ path: path.join(SHOT_DIR, "1-kontakt-desktop.png"), fullPage: true });

    await page.getByRole("button", { name: "Speichern" }).click();
    await page.getByTestId("save-state").getByText("Alles gespeichert").waitFor({ timeout: 20_000 });
    const { data: accRow } = await admin.from("accounts").select("escalation").eq("id", accountId).single();
    const e = accRow.escalation;
    ok(
      e.enabled === true && e.email === "team@example.com" && e.phone === "+49 40 123" && e.contactName === "Team Nordlicht",
      "DB: allgemeiner Kontakt gespeichert",
    );
    ok(e.experts?.length === 1 && e.experts[0].name === "Frau Müller" && e.experts[0].email === "mueller@example.com", "DB: Person gespeichert");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("person-card").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800);
    ok((await page.locator("#esc-email").inputValue()) === "team@example.com", "Nach Neuladen: Werte bleiben");
    ok((await page.getByTestId("save-state").innerText()).includes("Alles gespeichert"), "Nach Neuladen: „Alles gespeichert“");

    // Mobil prüfen, solange die Person noch da ist.
    const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mp = await mob.newPage();
    await login(mp);
    await mp.goto(`${BASE}/app/assistent/eskalation`, { waitUntil: "domcontentloaded" });
    await mp.getByTestId("person-card").waitFor({ timeout: 60_000 });
    await mp.waitForTimeout(800);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 1, `Mobil 390 px: keine horizontale Scrollleiste (${overflow}px)`);
    await mp.screenshot({ path: path.join(SHOT_DIR, "2-kontakt-mobil.png"), fullPage: true });
    await mob.close();

    await page.getByTestId("person-card").getByRole("button", { name: /bearbeiten/ }).click();
    await page.getByTestId("person-editor").getByRole("button", { name: "Person entfernen" }).click();
    ok((await page.getByTestId("person-card").count()) === 0, "Person entfernen");
    await page.getByTestId("contact-switch").click();
    ok((await status.getAttribute("data-tone")) === "off", "Schalter aus → Status „Ausgeschaltet“");
    ok((await page.getByTestId("contact-preview").getByTestId("preview-box").count()) === 0, "Vorschau ohne Kontaktbox, wenn ausgeschaltet");
    await ctx.close();
  }

  // 1) Fachliche Zuordnung.
  await setEscalation({ ...GENERAL, experts: EXPERTS });
  const lohn = await ask("Wie werden Minijobber bei der Lohnabrechnung versteuert?");
  const lohnVals = (lohn.meta?.escalation?.methods ?? []).map((m) => m.value);
  console.log(`   Lohn: status=${lohn.meta?.status} box=${JSON.stringify(lohn.meta?.escalation)}`);
  ok(lohn.meta?.status === "no_answer", "Lohnfrage = Wissenslücke");
  ok(lohnVals.includes("mailto:mueller@example.com"), "Lohnfrage → Frau Müller (ihre E-Mail)");
  ok(lohnVals.includes("tel:+49 40 123"), "Fehlender Kontaktweg der Person → allgemeine Telefonnummer ergänzt");
  ok(/Frau Müller/.test(lohn.meta?.escalation?.message ?? ""), "Hinweis nennt Frau Müller als Ansprechperson");

  const tech = await ask("Mein DATEV-Zugang ist gesperrt, ich komme nicht mehr rein. Was tun?");
  const techVals = (tech.meta?.escalation?.methods ?? []).map((m) => m.value);
  console.log(`   Technik: status=${tech.meta?.status} box=${JSON.stringify(tech.meta?.escalation)}`);
  ok(tech.meta?.status === "no_answer", "Technikfrage = Wissenslücke");
  ok(techVals.includes("https://cal.example.com/schmidt"), "Technikfrage → Herr Schmidt (sein Kalender)");

  // 2) Nur allgemeiner Kontakt.
  await setEscalation({ ...GENERAL, experts: [] });
  const gen = await ask("Wie hoch ist der Grundfreibetrag 2026?");
  const genVals = (gen.meta?.escalation?.methods ?? []).map((m) => m.value);
  ok(gen.meta?.status === "no_answer" && genVals.includes("mailto:team@example.com"), "Ohne Fachleute → allgemeiner Kontakt");
  ok(gen.meta?.escalation?.message === GENERAL.message, "Eigener Hinweistext erscheint");

  // 3) Themenfremd / beantwortbar → keine Kontaktbox.
  const off = await ask("Wie backe ich ein Sauerteigbrot?");
  ok(off.meta?.status === "off_topic" && off.meta?.escalation == null, "Themenfremd → keine Kontaktbox");

  // 4) Kontaktbox im echten Chat-Widget (Hilfe-Seite).
  await setEscalation({ ...GENERAL, experts: EXPERTS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${BASE}/h/${slug}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.getByRole("button", { name: "Hilfe-Assistent" }).first().click();
  await page.getByPlaceholder("Frage stellen …").fill("Wie werden Minijobber bei der Lohnabrechnung versteuert?");
  await page.getByRole("button", { name: "Senden" }).click();
  const mail = page.locator('a[href="mailto:mueller@example.com"]');
  ok(await mail.waitFor({ timeout: 45_000 }).then(() => true, () => false), "Widget zeigt Kontakt-Knopf „mueller@example.com“");

  // 5) Unsichere Links: javascript:-Kalender darf nie als Link ausgeliefert werden.
  await setEscalation({ ...GENERAL, email: "", phone: "", calendarUrl: "javascript:alert(document.cookie)", experts: [] });
  const bad = await ask("Wie hoch ist der Grundfreibetrag 2026?");
  const badVals = (bad.meta?.escalation?.methods ?? []).map((m) => m.value);
  ok(!badVals.some((v) => /^javascript:/i.test(v)), `Kein javascript:-Link in der Kontaktbox (${badVals.join(", ") || "–"})`);
} catch (e) {
  console.error("✗ Abbruch:", e instanceof Error ? e.message : e);
  failed = true;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { shell: true });
    else server.kill("SIGTERM");
  }
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Eskalation: Fehler" : "\n✓ Eskalation live verifiziert.");
process.exit(failed ? 1 : 0);
