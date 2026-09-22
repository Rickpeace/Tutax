// Welle 50d — Kopf im Anleitungs-Editor (Entwurf „App-Makeover“ §4) + Schritt-Panel.
// Echter Login gegen die echte DB (Wegwerf-Konto im Business-Tarif, wird am Ende gelöscht),
// Dev-Server lokal. Prüft:
//   - Steuerzeile: Status-Schalter (Entwurf/Veröffentlicht), Segment „Hilfe-Seite | Nur Team",
//     Schalter „Mit Schulungsnachweis" (nur bei Hilfe-Seite), keine „·“-Trenner
//   - Nachweis-Schalter wirkt in der DB (in_lernen), „Nur Team" wirkt (visibility=internal),
//     Nachweis-Schalter dann ausgeblendet, Kurzbeschreibung ohne „(erscheint auf der Hilfe-Seite)"
//   - Veröffentlichen per Schalter wirkt (status=published) und zurück (draft)
//   - Schritt-Panel: „Erweitert (für Automationen)" standardmäßig eingeklappt; ohne Änderungen
//     nur „Gespeichert" (kein ausgegrauter Speichern-Knopf), mit Änderungen Speichern/Verwerfen
//   - mobil 390 px: keine horizontale Scrollleiste
// Screenshots → SHOT_DIR (Standard: scripts/.shots-builder-header, gitignored über .shots*).
//
// Nutzung:  node --env-file=.env.local scripts/test-builder-header.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, ".shots-builder-header");
mkdirSync(SHOT_DIR, { recursive: true });

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

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const PORT = 3027;
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const email = `tutax-bhead-${stamp}@example.com`;

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

/** Wartet, bis eine Spalte der Anleitung in der DB den erwarteten Wert hat. */
async function dbWait(tutorialId, col, expected, tries = 25) {
  let val;
  for (let i = 0; i < tries; i++) {
    const { data } = await admin.from("tutorials").select(col).eq("id", tutorialId).single();
    val = data?.[col];
    if (val === expected) return val;
    await new Promise((r) => setTimeout(r, 600));
  }
  return val;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

let server, browser, userId, accountId;
try {
  const created = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const { data: members } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = members[0].account_id;
  await admin
    .from("accounts")
    .update({ name: "Editor-Kopf Test GmbH", onboarded: true, plan: "business" })
    .eq("id", accountId);

  const { data: cat, error: catErr } = await admin
    .from("categories")
    .insert({ account_id: accountId, name: "Zugang & Konto", position: 0 })
    .select("id")
    .single();
  if (catErr) throw catErr;
  const { data: tut, error: tErr } = await admin
    .from("tutorials")
    .insert({
      account_id: accountId,
      title: "Passwort zurücksetzen",
      status: "draft",
      visibility: "public",
      in_lernen: false,
      category_id: cat.id,
      site_domains: ["login.datev.de"],
    })
    .select("id")
    .single();
  if (tErr) throw tErr;
  const tutorialId = tut.id;
  const { data: stepRows, error: sErr } = await admin
    .from("steps")
    .insert(
      ["Anmelden", "Menü öffnen", "Passwort ändern"].map((title, i) => ({
        tutorial_id: tutorialId,
        position: i + 1,
        title,
        is_decision: false,
      })),
    )
    .select("id, position");
  if (sErr) throw sErr;
  // Linearer Ablauf wie im Editor: Wurzel + je eine Weiter-Kante.
  const ids = stepRows.sort((a, b) => a.position - b.position).map((s) => s.id);
  await admin.from("tutorials").update({ root_step_id: ids[0] }).eq("id", tutorialId);
  const { error: bErr } = await admin.from("step_branches").insert(
    ids.slice(0, -1).map((id, i) => ({ step_id: id, label: null, target_step_id: ids[i + 1], position: 0 })),
  );
  if (bErr) throw bErr;

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: path.join(__dirname, ".."),
    shell: true,
    stdio: "ignore",
  });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  await login(page);
  await page.goto(`${BASE}/app/tutorials/${tutorialId}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  const controls = page.getByTestId("editor-controls");
  await controls.waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1200); // Hydration

  // ---- Steuerzeile ----
  const status = controls.getByRole("switch").first();
  ok((await status.innerText()).includes("Entwurf"), "Status-Schalter zeigt „Entwurf“");
  ok((await status.getAttribute("aria-checked")) === "false", "Status-Schalter ist aus");
  const seg = controls.getByRole("radiogroup", { name: "Wer sieht die Anleitung?" });
  ok(await seg.isVisible(), "Segment „Hilfe-Seite | Nur Team“ sichtbar");
  const segHelp = seg.getByRole("radio", { name: "Hilfe-Seite" });
  const segTeam = seg.getByRole("radio", { name: "Nur Team" });
  ok((await segHelp.getAttribute("aria-checked")) === "true", "„Hilfe-Seite“ ist gewählt");
  const nachweis = controls.getByRole("switch", { name: /Mit Schulungsnachweis/ });
  ok(await nachweis.isVisible(), "Schalter „Mit Schulungsnachweis“ sichtbar (bei Hilfe-Seite)");
  ok(await controls.getByText("Zugang & Konto").isVisible(), "Kategorie-Pill in der Steuerzeile");
  ok(await controls.getByText("login.datev.de").isVisible(), "Website-Pill in der Steuerzeile");
  // Welle 53: seltene Aktionen im „…“-Menü; die Steuerzeile bricht bei 1440 px nicht um.
  await controls.getByTestId("editor-more").click();
  ok(await page.getByRole("menuitem", { name: /Aktualität prüfen/ }).isVisible(), "„Aktualität prüfen“ (im „…“-Menü) statt „Jetzt prüfen“");
  await page.keyboard.press("Escape");
  const rowTops = await controls.evaluate((el) => new Set([...el.children].filter((c) => c.getBoundingClientRect().width > 0).map((c) => Math.round(c.getBoundingClientRect().top))).size);
  ok(rowTops === 1, `Steuerzeile einzeilig bei 1440 px (${rowTops} Zeile(n))`);
  // Base UI: <Button render={<Link/>}> trägt role="button" — daher über den Text + href prüfen.
  const preview = controls.locator(`a[href="/app/preview/${tutorialId}"]`);
  ok((await preview.count()) === 1 && (await preview.innerText()).includes("Vorschau"), "„Vorschau“ in der Steuerzeile");
  const headerText = await page.locator("main").last().evaluate((m) => {
    const h1 = m.querySelector("h1");
    const box = h1?.closest("div.mb-6");
    return box ? box.textContent : "";
  });
  ok(headerText.length > 0 && !headerText.includes("·"), "Keine „·“-Trenner im Editor-Kopf");
  ok(
    (await page.getByTestId("editor-description").innerText()).includes("(erscheint auf der Hilfe-Seite)"),
    "Kurzbeschreibung (Hilfe-Seite) nennt die Hilfe-Seite",
  );
  await page.screenshot({ path: path.join(SHOT_DIR, "1-editor-kopf-desktop.png"), clip: { x: 0, y: 0, width: 1400, height: 420 } });

  // ---- Nachweis-Schalter → DB in_lernen ----
  await nachweis.click();
  ok((await dbWait(tutorialId, "in_lernen", true)) === true, "Nachweis-Schalter setzt in_lernen=true (DB)");
  ok((await nachweis.getAttribute("aria-checked")) === "true", "Nachweis-Schalter steht auf an");

  // ---- Nur Team → DB visibility ----
  await segTeam.click();
  ok((await dbWait(tutorialId, "visibility", "internal")) === "internal", "„Nur Team“ setzt visibility=internal (DB)");
  await page.waitForTimeout(400);
  ok((await segTeam.getAttribute("aria-checked")) === "true", "„Nur Team“ ist gewählt");
  ok((await controls.getByRole("switch", { name: /Mit Schulungsnachweis/ }).count()) === 0, "Nachweis-Schalter bei „Nur Team“ ausgeblendet");
  const descTeam = await page.getByTestId("editor-description").innerText();
  ok(descTeam.includes("Kurzbeschreibung ergänzen") && !descTeam.includes("erscheint auf der Hilfe-Seite"), `Kurzbeschreibung bei „Nur Team“ neutral („${descTeam}“)`);
  await page.screenshot({ path: path.join(SHOT_DIR, "2-editor-kopf-nur-team.png"), clip: { x: 0, y: 0, width: 1400, height: 420 } });

  // ---- Veröffentlichen per Schalter ----
  await status.click();
  ok((await dbWait(tutorialId, "status", "published")) === "published", "Status-Schalter veröffentlicht (DB status=published)");
  await controls.getByRole("switch").first().getByText("Veröffentlicht").waitFor({ timeout: 20_000 });
  ok(true, "Schalter zeigt „Veröffentlicht“ (auch bei „Nur Team“, kein „Freigegeben“)");
  await page.waitForTimeout(500);
  await status.click();
  ok((await dbWait(tutorialId, "status", "draft")) === "draft", "Zurück auf Entwurf (DB status=draft)");

  // ---- Schritt-Panel ----
  await page.locator("main").last().getByText("Anmelden").first().click();
  const saveState = page.getByTestId("step-save-state");
  await saveState.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
  ok((await saveState.getByText("Gespeichert").count()) === 1, "Schritt-Panel: „Gespeichert“ ohne Änderungen");
  ok((await saveState.getByRole("button", { name: /Speichern/ }).count()) === 0, "Kein ausgegrauter „Speichern“-Knopf daneben");
  const adv = page.getByTestId("step-advanced");
  const advBtn = adv.getByRole("button", { name: /Erweitert \(für Automationen\)/ });
  ok((await advBtn.getAttribute("aria-expanded")) === "false", "„Erweitert (für Automationen)“ standardmäßig eingeklappt");
  ok((await adv.getByText("Bedingung", { exact: true }).count()) === 0, "Bedingung eingeklappt nicht sichtbar");
  await page.screenshot({ path: path.join(SHOT_DIR, "3-schritt-panel.png"), fullPage: false });
  await advBtn.click();
  ok(await adv.getByText("Bedingung", { exact: true }).isVisible(), "Aufgeklappt: Bedingung sichtbar");
  await page.locator("#step-title").fill("Anmelden bei DATEV");
  ok(await saveState.getByRole("button", { name: /Speichern/ }).isEnabled(), "Mit Änderungen: „Speichern“ aktiv");
  ok((await saveState.getByText("Gespeichert").count()) === 0, "Mit Änderungen: kein „Gespeichert“ mehr");
  await adv.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOT_DIR, "4-schritt-panel-erweitert.png"), fullPage: false });
  await saveState.getByRole("button", { name: "Verwerfen" }).click();
  ok((await saveState.getByText("Gespeichert").count()) === 1, "Verwerfen: wieder „Gespeichert“");

  // ---- Mobil 390 px ----
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mob.newPage();
  await login(mp);
  await mp.goto(`${BASE}/app/tutorials/${tutorialId}`, { waitUntil: "domcontentloaded" });
  await mp.getByTestId("editor-controls").waitFor({ timeout: 60_000 });
  await mp.waitForTimeout(800);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow <= 1, `Mobil 390 px: keine horizontale Scrollleiste (${overflow}px)`);
  const ctlOverflow = await mp.getByTestId("editor-controls").evaluate((el) => el.scrollWidth - el.clientWidth);
  ok(ctlOverflow <= 1, `Mobil: Steuerzeile bricht sauber um (${ctlOverflow}px)`);
  await mp.screenshot({ path: path.join(SHOT_DIR, "5-editor-kopf-mobil.png"), fullPage: false });

  // ---- Standard-Anleitungen (nur wenn Vorlagen existieren) ----
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.getByText("Passwort zurücksetzen").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
  const tpl = page.getByTestId("template-section");
  if (await tpl.count()) {
    ok(await tpl.getByRole("heading", { name: "Standard-Anleitungen von Steply" }).isVisible(), "Standard-Anleitungen: Überschrift im Seitenkopf-Stil");
    const rows = tpl.getByTestId("template-row");
    const n = await rows.count();
    ok(n > 0 && (await tpl.getByRole("switch").count()) === n, `Standard-Anleitungen: ein Schalter je Zeile (${n})`);
    ok((await tpl.getByRole("switch").first().innerText()).includes("Auf der Hilfe-Seite"), "Schalter heißt „Auf der Hilfe-Seite“");
    await tpl.scrollIntoViewIfNeeded();
    await tpl.screenshot({ path: path.join(SHOT_DIR, "6-standard-anleitungen.png") });
    await mp.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
    await mp.getByTestId("template-section").waitFor({ timeout: 60_000 });
    await mp.waitForTimeout(600);
    const o2 = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(o2 <= 1, `Mobil Anleitungen mit Standard-Anleitungen: keine Überbreite (${o2}px)`);
    await mp.getByTestId("template-section").screenshot({ path: path.join(SHOT_DIR, "7-standard-anleitungen-mobil.png") });
  } else {
    console.log("· keine Standard-Anleitungen im System – Abschnitt übersprungen");
  }
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
  if (accountId) await admin.from("accounts").delete().eq("id", accountId).then(() => {}, () => {});
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Editor-Kopf + Schritt-Panel verifiziert.");
process.exit(failed ? 1 : 0);
