// Welle 50b — App-Navigation nach dem Entwurf „App-Makeover“ (Kopfleiste, Glocke, Avatar-Menü,
// Handy-Leiste mit „Mehr“-Blatt, ⌘K, Seitenköpfe, Automation-Schritte ab 1, Schulungen).
// Echter Login gegen die echte DB (Wegwerf-Konto + zweite Organisation, am Ende gelöscht),
// Dev-Server lokal, Playwright headless. Screenshots → SHOT_DIR (Standard: scripts/.shots-app-shell).
//
// Nutzung:  node --env-file=.env.local scripts/test-app-shell.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, ".shots-app-shell");
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

const PORT = Number(process.env.PORT_SHELL || 3025);
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const email = `tutax-shell-${stamp}@example.com`;
const USER_NAME = "Katrin Probe";

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const shot = (page, name) => page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: false });

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

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 90_000 });
}

let server, browser, userId, accountId, secondAccountId;
try {
  // ---------- Seed ----------
  const created = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
    user_metadata: { full_name: USER_NAME },
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const { data: members } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = members[0].account_id;
  await admin.from("accounts").update({ name: "Kanzlei Shell-Test", onboarded: true }).eq("id", accountId);
  const { data: acc } = await admin.from("accounts").select("slug").eq("id", accountId).single();
  const slug = acc.slug;

  // Zweite Organisation (für „Organisation wechseln“).
  const { data: acc2, error: acc2Err } = await admin
    .from("accounts")
    .insert({ name: "Zweite Kanzlei Test", slug: `shell-zwei-${stamp}`, onboarded: true })
    .select("id")
    .single();
  if (acc2Err) throw acc2Err;
  secondAccountId = acc2.id;
  const { error: memErr } = await admin
    .from("account_members")
    .insert({ account_id: secondAccountId, user_id: userId, role: "editor" });
  if (memErr) throw memErr;

  // Anleitungen: eine öffentliche (mit Hinweis), eine „Nur Team“ (Schulung, veröffentlicht).
  const { data: tRows, error: tErr } = await admin
    .from("tutorials")
    .insert([
      { account_id: accountId, title: "Belege hochladen", status: "draft", visibility: "public" },
      {
        account_id: accountId,
        title: "Neue Kollegen einarbeiten",
        status: "published",
        visibility: "internal",
        slug: `einarbeiten-${stamp}`,
      },
    ])
    .select("id, title");
  if (tErr) throw tErr;
  const pubId = tRows.find((t) => t.title === "Belege hochladen").id;
  const internId = tRows.find((t) => t.title === "Neue Kollegen einarbeiten").id;
  const { data: sRows, error: sErr } = await admin
    .from("steps")
    .insert([
      { tutorial_id: internId, position: 0, title: "Zugang anlegen" },
      { tutorial_id: pubId, position: 0, title: "Beleg wählen" },
    ])
    .select("id, tutorial_id");
  if (sErr) throw sErr;
  await admin
    .from("tutorials")
    .update({ root_step_id: sRows.find((s) => s.tutorial_id === internId).id })
    .eq("id", internId);
  const { error: cErr } = await admin.from("tutorial_completions").insert({
    tutorial_id: internId,
    user_id: userId,
    account_id: accountId,
    completed_at: "2026-07-03T10:00:00Z",
  });
  if (cErr) throw cErr;

  // Glocke: 1 offener Hinweis (warning) + 2 offene Fragen → Zähler 3.
  const { error: alErr } = await admin.from("change_alerts").insert({
    tutorial_id: pubId,
    severity: "warning",
    summary: "Die Website hat sich geändert",
    status: "open",
  });
  if (alErr) throw alErr;
  const { error: evErr } = await admin.from("events").insert([
    { account_id: accountId, type: "chat", status: "no_answer", question: "Wie ändere ich meine Bankverbindung?" },
    { account_id: accountId, type: "chat", status: "no_answer", question: "Wie ändere ich meine Bankverbindung?" },
    { account_id: accountId, type: "chat", status: "no_answer", question: "Wo finde ich die Lohnabrechnung?" },
  ]);
  if (evErr) throw evErr;

  // Automation mit 0-basierten Positionen (Altbestand) + Angaben email/pw.
  const { data: auto, error: auErr } = await admin
    .from("automations")
    .insert({
      account_id: accountId,
      title: "Belege monatlich hochladen",
      site_domains: ["duo.datev.de"],
      params: [
        { key: "email", label: "E-Mail", type: "text", required: true, source: "manual" },
        { key: "pw", label: "Passwort", type: "secret", required: true, source: "manual" },
      ],
    })
    .select("id")
    .single();
  if (auErr) throw auErr;
  const { error: asErr } = await admin.from("automation_steps").insert([
    { automation_id: auto.id, position: 0, title: "E-Mail eingeben", action: "fill", param_key: "email" },
    { automation_id: auto.id, position: 1, title: "Passwort eingeben", action: "fill", param_key: "pw" },
    { automation_id: auto.id, position: 2, title: "Auf „Anmelden“ klicken", action: "click" },
  ]);
  if (asErr) throw asErr;

  // ---------- Server ----------
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: path.join(__dirname, ".."),
    shell: true,
    stdio: "ignore",
  });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });

  // ================= Desktop =================
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await login(page);
  await page.getByText("Belege hochladen").first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(800);

  // Kopfleiste: 4 Pills in der richtigen Reihenfolge, „Anleitungen“ aktiv.
  const pills = await page.locator('nav[aria-label="Hauptbereiche"] a').allInnerTexts();
  ok(
    JSON.stringify(pills.map((p) => p.trim())) ===
      JSON.stringify(["Anleitungen", "Schulungen", "Automationen", "KI-Assistent"]),
    `Kopfleiste: 4 Pills (${pills.join(" · ")})`,
  );
  ok(
    (await page.locator('nav[aria-label="Hauptbereiche"] a[aria-current="page"]').innerText()).trim() ===
      "Anleitungen",
    "Pill „Anleitungen“ ist aktiv",
  );
  ok(await page.getByText("Strg K").first().isVisible(), "Suchfeld zeigt „Strg K“");
  const help = page.locator('header a[aria-label="Hilfe-Seite in neuem Tab öffnen"]');
  ok(await help.isVisible(), "Knopf „Hilfe-Seite“ sichtbar");
  ok((await help.getAttribute("href")) === `/h/${slug}`, `Hilfe-Seite-Knopf zeigt auf /h/${slug}`);
  ok((await help.getAttribute("target")) === "_blank", "Hilfe-Seite öffnet in neuem Tab");
  ok(await page.locator("header").getByRole("button", { name: /Neue Anleitung/ }).isVisible(), "„+ Neue Anleitung“ bleibt");
  // Einheitlicher Seitenkopf: 26px/Black.
  const h1Size = await page.locator("main:visible h1").first().evaluate((e) => getComputedStyle(e).fontSize);
  ok(h1Size === "26px", `Anleitungen: H1 26px (${h1Size})`);
  // Bereichsfilter-Beschriftungen.
  const bereich = (
    await page.locator("aside:visible").first().locator("button").allInnerTexts()
  ).map((t) => t.replace(/\s*\d+\s*$/, "").trim());
  ok(
    ["Alle", "Hilfe-Seite", "Team"].every((l) => bereich.includes(l)),
    `Bereichsfilter: „Alle · Hilfe-Seite · Team“ (${bereich.slice(0, 3).join(" · ")})`,
  );
  await shot(page, "01-kopfleiste.png");

  // Glocke → Popover mit beiden Abschnitten, Zähler = 1 + 2.
  const bellCount = (await page.getByTestId("bell-count").innerText()).trim();
  ok(bellCount === "3", `Glocke: Zähler = Hinweise + offene Fragen (${bellCount})`);
  await page.getByRole("button", { name: /^Hinweise/ }).click();
  const pop = page.locator('[data-slot="popover-content"]');
  await pop.waitFor({ timeout: 10_000 });
  ok(await pop.getByText("Aktualität prüfen").isVisible(), "Glocke: Abschnitt „Aktualität prüfen“");
  ok(await pop.getByText("Offene Fragen").isVisible(), "Glocke: Abschnitt „Offene Fragen“");
  ok(await pop.getByText("„Belege hochladen“ wirkt veraltet").isVisible(), "Glocke: Hinweis zur Anleitung");
  ok(await pop.getByText("„Wie ändere ich meine Bankverbindung?“").isVisible(), "Glocke: offene Frage");
  ok(await pop.getByText("2× gefragt", { exact: false }).isVisible(), "Glocke: Häufigkeit der Frage");
  ok((await pop.getByRole("link", { name: "Alle" }).count()) === 2, "Glocke: je ein „Alle“-Link");
  await page.waitForTimeout(400); // Einblend-Animation abwarten
  await shot(page, "02-glocke.png");
  await pop.getByRole("link", { name: "Alle" }).first().click();
  await page.waitForURL(/\/app\/alerts/, { timeout: 60_000 });
  await page.getByRole("heading", { name: "Aktualität prüfen" }).waitFor({ timeout: 60_000 });
  ok(true, "„Alle“ führt zu „Aktualität prüfen“");
  ok((await page.locator("main:visible").getByText("warning", { exact: true }).count()) === 0, "Kein englischer Chip „warning“");
  ok(await page.locator("main:visible").getByText("Prüfen", { exact: true }).isVisible(), "Deutscher Chip „Prüfen“");
  await page.waitForTimeout(400);
  await shot(page, "03-aktualitaet.png");

  // Avatar-Menü.
  await page.getByRole("button", { name: "Konto-Menü" }).click();
  const menu = page.getByRole("menu").first();
  await menu.waitFor({ timeout: 10_000 });
  const menuText = await menu.innerText();
  ok(menuText.includes(USER_NAME) && menuText.includes(email), "Avatar-Menü: Name + E-Mail oben");
  for (const label of ["Organisation wechseln", "Mein Profil", "Einstellungen", "Steply-Hilfe", "Abmelden"]) {
    ok(menuText.includes(label), `Avatar-Menü: „${label}“`);
  }
  ok(!menuText.includes("Hilfe-Seite öffnen"), "Avatar-Menü: „Hilfe-Seite öffnen“ ist raus");
  ok(!menuText.includes("Admin"), "Avatar-Menü: kein Admin für Nicht-Admins");
  ok(
    (await menu.getByRole("menuitem", { name: /Mein Profil/ }).getAttribute("href")) === "/app/settings/profil",
    "„Mein Profil“ → /app/settings/profil",
  );
  await menu.getByText("Organisation wechseln").hover();
  await page.getByRole("menuitem", { name: /Zweite Kanzlei Test/ }).waitFor({ timeout: 10_000 });
  ok(true, "„Organisation wechseln“ zeigt die zweite Organisation");
  await shot(page, "04-avatar-menue.png");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ⌘K.
  await page.keyboard.press("Control+k");
  const dlg = page.getByRole("dialog");
  await dlg.waitFor({ timeout: 10_000 });
  const allText = await dlg.innerText();
  ok(!/tutorial/i.test(allText), "⌘K: keine „Tutorial“-Texte");
  for (const l of ["Anleitungen", "Schulungen", "Automationen", "KI-Assistent", "Wissensdatenbank", "Offene Fragen", "Hinweise", "Einstellungen", "Hilfe-Seite", "Neue Anleitung"]) {
    ok(allText.includes(l), `⌘K: Eintrag „${l}“`);
  }
  await page.waitForTimeout(400); // Einblend-Animation abwarten
  await shot(page, "05-cmdk.png");
  await page.keyboard.type("Autom");
  await page.waitForTimeout(500);
  const opt = dlg.getByRole("option", { name: /Automationen/ });
  ok(await opt.first().isVisible(), "⌘K findet „Automationen“");
  await opt.first().click();
  await page.waitForURL(/\/app\/automationen$/, { timeout: 60_000 });
  await page.getByText("Belege monatlich hochladen").waitFor({ timeout: 60_000 });
  ok(true, "⌘K „Automationen“ navigiert zur Liste");
  ok(await page.getByText("2 Angaben").isVisible(), "Automationen-Liste: „2 Angaben“ statt Parameter");
  const autoH1 = await page.locator("main:visible h1").first().evaluate((e) => getComputedStyle(e).fontSize);
  ok(autoH1 === "26px", `Automationen: H1 26px (${autoH1})`);
  await shot(page, "06-automationen.png");

  // ⌘K „Neue Anleitung“ öffnet den Dialog.
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog").waitFor({ timeout: 10_000 });
  await page.keyboard.type("Neue Anl");
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Neue Anleitung" }).waitFor({ timeout: 10_000 });
  ok(true, "⌘K „Neue Anleitung“ öffnet den Erstell-Dialog");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Automation-Detail: Schritte ab 1, lesbare Angaben.
  await page.getByText("Belege monatlich hochladen").click();
  await page.waitForURL(/\/app\/automationen\/.+/, { timeout: 60_000 });
  await page.getByTestId("step-no").first().waitFor({ timeout: 60_000 });
  const nos = (await page.getByTestId("step-no").allInnerTexts()).map((s) => s.trim());
  ok(JSON.stringify(nos) === JSON.stringify(["1", "2", "3"]), `Automation: Schritte starten bei 1 (${nos.join(",")})`);
  const mainText = await page.locator("main:visible").innerText();
  ok(/ANGABEN/i.test(mainText) && !/PARAMETER|SCHLÜSSEL/i.test(mainText), "Automation: „Angaben“ statt Parameter/Schlüssel");
  ok((await page.locator("main:visible code").count()) === 0, "Automation: keine Code-Chips (email/pw)");
  ok(!/Extension/.test(mainText), "Automation: „Steply-Erweiterung“ statt Extension");
  await shot(page, "07-automation-detail.png");
  await page.screenshot({ path: path.join(SHOT_DIR, "07b-automation-detail-voll.png"), fullPage: true });

  // Schulungen.
  await page.locator('nav[aria-label="Hauptbereiche"]').getByText("Schulungen").click();
  await page.waitForURL(/\/app\/lernen$/, { timeout: 60_000 });
  await page.getByRole("heading", { name: "Schulungen" }).waitFor({ timeout: 60_000 });
  ok(await page.getByText("Interne Anleitungen für Ihr Team – mit Schulungsnachweis.").isVisible(), "Schulungen: Erklärzeile");
  ok(await page.getByText("Absolviert am 3. Juli 2026").isVisible(), "Schulungen: Datum lesbar");
  await shot(page, "08-schulungen.png");
  await page.getByText("Neue Kollegen einarbeiten").click();
  await page.waitForURL(/\/app\/lernen\/.+/, { timeout: 60_000 });
  await page.getByRole("heading", { name: "Schulungsnachweis" }).waitFor({ timeout: 60_000 });
  const rec = page.locator("section:visible", {
    has: page.getByRole("heading", { name: "Schulungsnachweis" }),
  });
  ok(await rec.getByText(USER_NAME).isVisible(), "Nachweis: Name statt nur E-Mail");
  ok(await rec.getByText("am 3. Juli 2026").isVisible(), "Nachweis: Datum lesbar");
  ok(await page.getByRole("link", { name: /Schulungen/ }).first().isVisible(), "Zurück-Link heißt „Schulungen“");
  await page.screenshot({ path: path.join(SHOT_DIR, "09-schulung-nachweis.png"), fullPage: true });

  // KI-Assistent: Pills + Seitenkopf.
  await page.locator('nav[aria-label="Hauptbereiche"]').getByText("KI-Assistent").click();
  await page.waitForURL(/\/app\/assistent\/wissen/, { timeout: 60_000 });
  await page.getByRole("heading", { name: "KI-Assistent" }).waitFor({ timeout: 60_000 });
  const tabs = await page.locator('nav[aria-label="Bereiche des KI-Assistenten"] a').allInnerTexts();
  ok(tabs.length === 3, `KI-Assistent: 3 Reiter als Pills (${tabs.join(" · ")})`);
  const kiH1 = await page.getByRole("heading", { name: "KI-Assistent" }).evaluate((e) => getComputedStyle(e).fontSize);
  ok(kiH1 === "26px", `KI-Assistent: H1 26px (${kiH1})`);
  await page.getByRole("heading", { name: "Wissensdatenbank" }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(500);
  await shot(page, "10-ki-assistent.png");

  // Schmaler Desktop (1024): Kopfleiste passt ohne horizontales Scrollen.
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.getByText("Belege hochladen").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(600);
  const hdrOverflow = await page.evaluate(() => {
    const h = document.querySelector("header");
    return h ? h.scrollWidth - h.clientWidth : -1;
  });
  ok(hdrOverflow <= 0, `1024px: Kopfleiste ohne Überlauf (${hdrOverflow}px)`);
  await shot(page, "11-kopfleiste-1024.png");

  // ================= Handy (390px) =================
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mob.newPage();
  await login(mp);
  await mp.getByText("Belege hochladen").first().waitFor({ timeout: 90_000 });
  await mp.waitForTimeout(800);
  const bar = mp.locator('nav[aria-label="Hauptnavigation"]');
  const barText = (await bar.innerText()).replace(/\s+/g, " ");
  for (const l of ["Anleitungen", "Schulungen", "Neu", "Automationen", "Mehr"]) {
    ok(barText.includes(l), `Handy-Leiste: „${l}“`);
  }
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow <= 1, `Handy: keine horizontale Scrollleiste (${overflow}px)`);
  const cut = await bar.locator("a span.truncate").evaluateAll((els) =>
    els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent),
  );
  ok(cut.length === 0, `Handy-Leiste: keine abgeschnittenen Beschriftungen (${cut.join(", ") || "–"})`);
  await shot(mp, "20-mobil-leiste.png");

  await bar.getByRole("button", { name: "Mehr" }).tap();
  const sheet = mp.getByRole("dialog", { name: "Mehr" });
  await sheet.waitFor({ timeout: 10_000 });
  const sheetText = await sheet.innerText();
  for (const l of ["KI-Assistent", "Hilfe-Seite ansehen", "Einstellungen", "Steply-Hilfe"]) {
    ok(sheetText.includes(l), `Mehr-Blatt: „${l}“`);
  }
  ok(
    (await sheet.getByRole("link", { name: /Hilfe-Seite ansehen/ }).getAttribute("href")) === `/h/${slug}`,
    "Mehr-Blatt: „Hilfe-Seite ansehen“ → eigene Hilfe-Seite",
  );
  await mp.waitForTimeout(400);
  await shot(mp, "21-mobil-mehr.png");
  const geo = await mp.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Hauptnavigation"]').getBoundingClientRect();
    const pop = document.querySelector('[role="dialog"][aria-label="Mehr"]').getBoundingClientRect();
    return { navTop: Math.round(nav.top), popBottom: Math.round(pop.bottom), popW: Math.round(pop.width) };
  });
  ok(
    Math.abs(geo.popBottom - geo.navTop) <= 3 && geo.popW >= 385,
    `Mehr-Blatt sitzt volle Breite direkt über der Leiste (${JSON.stringify(geo)})`,
  );
  await sheet.getByRole("link", { name: /KI-Assistent/ }).tap();
  await mp.waitForURL(/\/app\/assistent/, { timeout: 60_000 });
  ok(true, "Mehr-Blatt: „KI-Assistent“ navigiert");
  await mp.waitForTimeout(500);
  ok(!(await sheet.isVisible()), "Mehr-Blatt schließt nach dem Navigieren");
  const kiOverflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(kiOverflow <= 1, `Handy KI-Assistent: keine Überbreite (${kiOverflow}px) — Leiste bleibt im Bild`);
  await shot(mp, "24-mobil-ki-assistent.png");
  await bar.getByRole("button", { name: "Mehr" }).tap();
  await sheet.waitFor({ timeout: 10_000 });
  await bar.getByRole("button", { name: "Mehr" }).tap();
  await mp.waitForTimeout(500);
  ok(!(await sheet.isVisible()), "„Mehr“ erneut tippen schließt das Blatt");

  await bar.getByRole("link", { name: /Automationen/ }).tap();
  await mp.waitForURL(/\/app\/automationen$/, { timeout: 60_000 });
  await mp.getByText("Belege monatlich hochladen").waitFor({ timeout: 60_000 });
  ok(true, "Handy: Automationen erreichbar");
  await mp.waitForTimeout(400);
  await shot(mp, "22-mobil-automationen.png");

  await bar.getByRole("button", { name: "Neue Anleitung" }).tap();
  await mp.getByRole("heading", { name: "Neue Anleitung" }).waitFor({ timeout: 10_000 });
  ok(true, "Handy: „Neu“ öffnet den Erstell-Dialog");
  await mp.waitForTimeout(500); // Einblend-Animation abwarten
  await shot(mp, "23-mobil-neu.png");
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
  if (secondAccountId) await admin.from("accounts").delete().eq("id", secondAccountId).then(() => {}, () => {});
  if (accountId) await admin.from("accounts").delete().eq("id", accountId).then(() => {}, () => {});
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ App-Navigation (Welle 50b) verifiziert.");
process.exit(failed ? 1 : 0);
