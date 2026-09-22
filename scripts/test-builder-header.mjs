// Welle 50d — Kopf im Anleitungs-Editor (Entwurf „App-Makeover“ §4) + Schritt-Panel.
// Echter Login gegen die echte DB (Wegwerf-Konto im Business-Tarif, wird am Ende gelöscht),
// Dev-Server lokal. Prüft:
//   - Welle 54: Knopf „Veröffentlichen“ (koralle, rechts neben „Vorschau“, vor „…“) statt
//     Schalter; veröffentlicht → Etikett „✓ Veröffentlicht“ + „Zurück auf Entwurf“ im „…“-Menü;
//     leere Anleitung gesperrt („Erst Schritte anlegen“)
//   - Zielgruppe: zwei Chips „Hilfe-Seite (für alle)“ / „Team“ (role=group, aria-pressed), alle
//     3 Kombinationen in der DB (public+in_lernen / internal / public), letzter aktiver Chip nicht
//     abwählbar (Tooltip), Hinweis „mit Schulungsnachweis“ (kein Schalter), Tastatur, Pro-Tarif
//     sperrt „Team“; keine „·“-Trenner; einzeilig bei 1400 px
//   - Schritt-Panel: „Erweitert (für Automationen)" standardmäßig eingeklappt; ohne Änderungen
//     nur „Gespeichert" (kein ausgegrauter Speichern-Knopf), mit Änderungen Speichern/Verwerfen
//   - mobil 390 px (Entwurf + veröffentlicht): keine horizontale Scrollleiste, nichts ragt raus
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

const PORT = Number(process.env.TEST_PORT) || 3027;
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

  // ---- Steuerzeile (Welle 54: Veröffentlichen-Knopf + Zielgruppen-Chips) ----
  const shotHead = (name) =>
    page.screenshot({ path: path.join(SHOT_DIR, name), clip: { x: 0, y: 0, width: 1400, height: 420 } });
  ok((await controls.getByRole("switch").count()) === 0, "Kein Status-Schalter mehr im Editor-Kopf");
  const publishBtn = controls.getByTestId("publish-button");
  ok(await publishBtn.isVisible(), "Entwurf: Knopf „Veröffentlichen“ sichtbar");
  ok((await publishBtn.innerText()).includes("Veröffentlichen"), "Knopf heißt „Veröffentlichen“");
  ok(await publishBtn.isEnabled(), "Knopf aktiv (Anleitung hat Schritte)");
  // Reihenfolge rechts: Vorschau · Veröffentlichen · „…“
  const order = await controls.evaluate((el) => {
    const pv = el.querySelector('a[href^="/app/preview/"]');
    const pb = el.querySelector('[data-testid="publish-button"]');
    const more = el.querySelector('[data-testid="editor-more"]');
    if (!pv || !pb || !more) return null;
    return [pv, pb, more].map((n) => n.getBoundingClientRect().left);
  });
  ok(!!order && order[0] < order[1] && order[1] < order[2], `Reihenfolge Vorschau → Veröffentlichen → „…“ (${JSON.stringify(order)})`);
  const bg = await publishBtn.evaluate((b) => getComputedStyle(b).backgroundColor);
  ok(bg === "rgb(239, 106, 78)", `Veröffentlichen ist koralle/primär (${bg})`);

  const group = controls.getByRole("group", { name: "Wer sieht die Anleitung?" });
  ok(await group.isVisible(), "Gruppe „Wer sieht die Anleitung?“ (role=group) sichtbar");
  const chipHelp = group.getByRole("button", { name: "Hilfe-Seite (für alle)" });
  const chipTeam = group.getByRole("button", { name: "Team", exact: true });
  const pressed = async (loc) => (await loc.getAttribute("aria-pressed")) === "true";
  const hint = group.getByTestId("training-proof-hint");
  ok((await pressed(chipHelp)) && !(await pressed(chipTeam)), "Start: nur „Hilfe-Seite (für alle)“ an");
  ok((await hint.count()) === 0, "Ohne Team kein Hinweis „mit Schulungsnachweis“");
  ok(await controls.getByText("Zugang & Konto").isVisible(), "Kategorie-Pill in der Steuerzeile");
  ok(await controls.getByText("login.datev.de").isVisible(), "Website-Pill in der Steuerzeile");
  // Welle 53: seltene Aktionen im „…“-Menü; die Steuerzeile bricht bei 1400 px nicht um.
  await controls.getByTestId("editor-more").click();
  const driftItem = page.getByRole("menuitem", { name: /Aktualität prüfen/ });
  ok(await driftItem.waitFor({ timeout: 5_000 }).then(() => true, () => false), "„Aktualität prüfen“ im „…“-Menü");
  ok((await page.getByTestId("unpublish").count()) === 0, "Entwurf: kein „Zurück auf Entwurf“ im Menü");
  await page.keyboard.press("Escape");
  await driftItem.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  const countRows = () =>
    controls.evaluate((el) => {
      const mids = [...el.children]
        .map((c) => c.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => r.top + r.height / 2)
        .sort((a, b) => a - b);
      let rows = 0;
      let last = -1e9;
      for (const m of mids) {
        if (m - last > 12) rows++;
        last = m;
      }
      return rows;
    });
  ok((await countRows()) === 1, `Steuerzeile einzeilig bei 1400 px (Entwurf, nur Hilfe-Seite)`);
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
  await shotHead("1-kopf-entwurf-desktop.png");
  await shotHead("zielgruppe-1-nur-hilfe-seite.png");

  // Letzter aktiver Chip ist nicht abwählbar (mit Tooltip-Begründung).
  await chipHelp.click({ force: true }); // aria-disabled: Playwright klickt sonst nicht
  await page.waitForTimeout(700);
  ok(await pressed(chipHelp), "Letzter aktiver Chip (Hilfe-Seite) bleibt an");
  ok((await chipHelp.getAttribute("aria-disabled")) === "true", "Letzter aktiver Chip: aria-disabled");
  const tip = page.getByText(/Mindestens eine Zielgruppe bleibt aktiv/).first(); // Tooltip (und Hinweis-Toast)
  await page.mouse.move(5, 5); // nach dem Klick erst weg, dann wieder drauf -> Tooltip
  await page.waitForTimeout(300);
  await chipHelp.hover();
  ok(await tip.waitFor({ timeout: 5_000 }).then(() => true, () => false), "Tooltip erklärt: mindestens eine Zielgruppe bleibt aktiv");
  const dbHelp = await admin.from("tutorials").select("visibility, in_lernen").eq("id", tutorialId).single();
  ok(dbHelp.data.visibility === "public" && dbHelp.data.in_lernen === false, "DB unverändert (public, in_lernen=false)");
  await page.mouse.move(5, 5);

  // Team dazu → beides = public + in_lernen
  await chipTeam.click();
  ok((await dbWait(tutorialId, "in_lernen", true)) === true, "„Team“ dazu: in_lernen=true (DB)");
  ok((await dbWait(tutorialId, "visibility", "public")) === "public", "„Team“ dazu: visibility bleibt public (DB)");
  await page.waitForTimeout(400);
  ok((await pressed(chipHelp)) && (await pressed(chipTeam)), "Beide Chips an");
  ok(await hint.isVisible(), "Hinweis „mit Schulungsnachweis“ neben „Team“");
  ok((await controls.getByRole("switch").count()) === 0, "Schulungsnachweis ist KEIN eigener Schalter");
  await hint.hover();
  ok(
    await page.getByText("Mitarbeiter finden die Anleitung unter Schulungen und bestätigen sie dort.").waitFor({ timeout: 5_000 }).then(() => true, () => false),
    "Hinweis-Tooltip: „Mitarbeiter finden die Anleitung unter Schulungen …“",
  );
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  ok((await countRows()) === 1, "Steuerzeile einzeilig bei 1400 px (beide Zielgruppen + Hinweis)");
  await shotHead("zielgruppe-2-beides.png");

  // Hilfe-Seite ab → nur Team = internal
  await chipHelp.click();
  ok((await dbWait(tutorialId, "visibility", "internal")) === "internal", "Nur „Team“: visibility=internal (DB)");
  await page.waitForTimeout(400);
  ok(!(await pressed(chipHelp)) && (await pressed(chipTeam)), "Nur „Team“ an");
  ok(await hint.isVisible(), "Nur Team: Hinweis „mit Schulungsnachweis“ bleibt");
  const descTeam = await page.getByTestId("editor-description").innerText();
  ok(descTeam.includes("Kurzbeschreibung ergänzen") && !descTeam.includes("erscheint auf der Hilfe-Seite"), `Kurzbeschreibung bei nur Team neutral („${descTeam}“)`);
  await chipTeam.click({ force: true });
  await page.waitForTimeout(700);
  ok(await pressed(chipTeam), "Letzter aktiver Chip (Team) bleibt an");
  ok((await admin.from("tutorials").select("visibility").eq("id", tutorialId).single()).data.visibility === "internal", "DB bleibt internal");
  await shotHead("zielgruppe-3-nur-team.png");

  // Zurück: Hilfe dazu (beides), dann Team ab (nur Hilfe)
  await chipHelp.click();
  ok((await dbWait(tutorialId, "visibility", "public")) === "public", "Hilfe-Seite wieder dazu: public (DB)");
  ok((await dbWait(tutorialId, "in_lernen", true)) === true, "… und Team bleibt (in_lernen=true)");
  await page.waitForTimeout(400);
  await chipTeam.click();
  ok((await dbWait(tutorialId, "in_lernen", false)) === false, "Team ab: in_lernen=false (DB)");
  await page.waitForTimeout(400);
  ok((await pressed(chipHelp)) && !(await pressed(chipTeam)), "Wieder nur Hilfe-Seite");

  // Tastatur: Fokusring + Leertaste schaltet
  await chipHelp.focus();
  await page.keyboard.press("Tab"); // per Tastatur auf „Team“ -> :focus-visible
  const ring = await chipTeam.evaluate((b) => getComputedStyle(b).boxShadow);
  ok(ring && ring !== "none", `Chip hat sichtbaren Fokusring (${ring.slice(0, 40)}…)`);
  await page.keyboard.press("Space");
  ok((await dbWait(tutorialId, "in_lernen", true)) === true, "Tastatur (Leertaste) schaltet „Team“ (DB)");
  await page.waitForTimeout(400);
  await chipTeam.click();
  ok((await dbWait(tutorialId, "in_lernen", false)) === false, "… und wieder aus");
  await page.waitForTimeout(400);

  // ---- Veröffentlichen per Knopf, zurück per „…“-Menü ----
  await publishBtn.click();
  ok((await dbWait(tutorialId, "status", "published")) === "published", "„Veröffentlichen“ wirkt (DB status=published)");
  const badge = controls.getByTestId("published-badge");
  await badge.waitFor({ timeout: 20_000 });
  ok((await badge.innerText()).includes("Veröffentlicht"), "Etikett „✓ Veröffentlicht“ statt Knopf");
  ok((await controls.getByTestId("publish-button").count()) === 0, "Veröffentlicht: kein Veröffentlichen-Knopf mehr");
  const badgeBg = await badge.evaluate((b) => getComputedStyle(b).backgroundColor);
  ok(badgeBg === "rgb(220, 243, 239)", `Etikett ist teal (${badgeBg})`);
  ok((await countRows()) === 1, "Steuerzeile einzeilig bei 1400 px (veröffentlicht)");
  await page.waitForTimeout(400);
  await shotHead("2-kopf-veroeffentlicht-desktop.png");
  await controls.getByTestId("editor-more").click();
  const unpub = page.getByTestId("unpublish");
  await unpub.waitFor({ timeout: 5_000 });
  ok((await unpub.innerText()).includes("Zurück auf Entwurf"), "„…“-Menü: „Zurück auf Entwurf“");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOT_DIR, "3-menue-zurueck-auf-entwurf.png"), clip: { x: 700, y: 0, width: 700, height: 560 } });
  await unpub.click();
  ok((await dbWait(tutorialId, "status", "draft")) === "draft", "„Zurück auf Entwurf“ wirkt (DB status=draft)");
  await controls.getByTestId("publish-button").waitFor({ timeout: 20_000 });
  ok(true, "Danach wieder der Knopf „Veröffentlichen“");

  // ---- Leere Anleitung: Veröffentlichen gesperrt mit Hinweis ----
  {
    const { data: empty } = await admin
      .from("tutorials")
      .insert({ account_id: accountId, title: "Leere Anleitung", status: "draft", visibility: "public" })
      .select("id")
      .single();
    await page.goto(`${BASE}/app/tutorials/${empty.id}`, { waitUntil: "domcontentloaded" });
    const c2 = page.getByTestId("editor-controls");
    await c2.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1000);
    const b2 = c2.getByTestId("publish-button");
    ok(await b2.isDisabled(), "Leere Anleitung: „Veröffentlichen“ gesperrt");
    await c2.getByTestId("empty-lock").hover();
    ok(await page.getByText("Erst Schritte anlegen").first().waitFor({ timeout: 5_000 }).then(() => true, () => false), "Tooltip „Erst Schritte anlegen“");
    await page.mouse.move(5, 5);
  }

  // ---- Ohne Business: „Team“ gesperrt (Tarif-Hinweis), Hilfe-Seite bleibt ----
  await admin.from("accounts").update({ plan: "pro" }).eq("id", accountId);
  await page.goto(`${BASE}/app/tutorials/${tutorialId}`, { waitUntil: "domcontentloaded" });
  await controls.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1200);
  ok((await chipTeam.getAttribute("aria-disabled")) === "true", "Pro-Tarif: „Team“ gesperrt");
  await chipTeam.click({ force: true });
  await page.waitForTimeout(800);
  ok((await admin.from("tutorials").select("in_lernen").eq("id", tutorialId).single()).data.in_lernen === false, "Pro-Tarif: Klick auf „Team“ ändert nichts (DB)");
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  await chipTeam.hover();
  ok(await page.getByText(/im Business-Tarif enthalten/).first().waitFor({ timeout: 5_000 }).then(() => true, () => false), "Hinweis (Toast/Tooltip) nennt den Business-Tarif");
  await page.mouse.move(5, 5);
  await admin.from("accounts").update({ plan: "business" }).eq("id", accountId);
  await page.goto(`${BASE}/app/tutorials/${tutorialId}`, { waitUntil: "domcontentloaded" });
  await controls.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1200);

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

  // ---- Mobil 390 px (Entwurf mit beiden Zielgruppen, dann veröffentlicht) ----
  await admin.from("tutorials").update({ in_lernen: true }).eq("id", tutorialId);
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mob.newPage();
  await login(mp);
  await mp.goto(`${BASE}/app/tutorials/${tutorialId}`, { waitUntil: "domcontentloaded" });
  const mc = mp.getByTestId("editor-controls");
  await mc.waitFor({ timeout: 60_000 });
  await mp.waitForTimeout(800);
  const mobileChecks = async (label) => {
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 1, `Mobil 390 px (${label}): keine horizontale Scrollleiste (${overflow}px)`);
    const ctlOverflow = await mc.evaluate((el) => el.scrollWidth - el.clientWidth);
    ok(ctlOverflow <= 1, `Mobil (${label}): Steuerzeile bricht sauber um (${ctlOverflow}px)`);
    const outside = await mc.evaluate((el) =>
      [...el.querySelectorAll("button, a, span")]
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)).length,
    );
    ok(outside === 0, `Mobil (${label}): kein Element ragt über den Rand (${outside})`);
  };
  await mobileChecks("Entwurf");
  await mp.screenshot({ path: path.join(SHOT_DIR, "4-kopf-entwurf-mobil-390.png"), fullPage: false });
  await mc.getByTestId("publish-button").click();
  ok((await dbWait(tutorialId, "status", "published")) === "published", "Mobil: „Veröffentlichen“ wirkt (DB)");
  await mc.getByTestId("published-badge").waitFor({ timeout: 20_000 });
  await mp.waitForTimeout(500);
  await mobileChecks("veröffentlicht");
  await mp.screenshot({ path: path.join(SHOT_DIR, "5-kopf-veroeffentlicht-mobil-390.png"), fullPage: false });

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
