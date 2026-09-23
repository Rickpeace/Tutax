// Bereichs-Durchlauf „wie ein echter Nutzer“ (headless, deutsche Oberflaeche) — ergaenzt den
// Kern-Durchlauf (test-kern-durchlauf.mjs) um Bereiche, die dort nicht vorkommen:
//   A Automationen · B Onboarding · C Bibliothek-Extras · D Hinweise/Glocke/Strg+K
//   E Admin-Logik (ohne UI) · F Hilfe-Seite-Extras · G Anmeldung · H Einstellungen
//
// Prueft Verhalten + Datenbank und protokolliert JS-Fehler, 4xx/5xx und englische/rohe
// Fehlertexte. Wegwerf-Konten werden am Ende geloescht (auch bei Abbruch).
//
// Nutzung (gegen einen laufenden Produktions-Build — `next build` + `next start`):
//   TEST_BASE=http://localhost:3294 node --experimental-strip-types --env-file=.env.local scripts/test-areas-e2e.mjs
//   PHASES=A,C ... (nur bestimmte Bereiche) · SKIP_AI=1 (kein KI-Aufruf in D)
//   PURGE=1 ... (nur Reste abgebrochener Laeufe loeschen; aeltere als 2 h raeumt jeder Lauf selbst)
// (--experimental-strip-types nur fuer Phase E, die src/lib/template-forks.ts direkt laedt.)
// Exit-Code 1, sobald ein Befund oder ein unerwarteter JS-/HTTP-Fehler auftritt.
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { setRecorderToken } from "./_recorder-token.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, ".shots-areas");
mkdirSync(SHOT_DIR, { recursive: true });

function resolvePlaywright() {
  try {
    return require("playwright");
  } catch {
    /* npx-Cache */
  }
  const dirs = [];
  if (process.env.STEPLY_PW_DIR) dirs.push(path.join(process.env.STEPLY_PW_DIR, "node_modules", "playwright"));
  const base = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
  const npxDir = path.join(base, "npm-cache", "_npx");
  if (existsSync(npxDir)) {
    for (const d of readdirSync(npxDir)) dirs.push(path.join(npxDir, d, "node_modules", "playwright"));
  }
  for (const p of dirs) if (existsSync(p)) return require(p);
  throw new Error("playwright nicht gefunden.");
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const BASE = process.env.TEST_BASE || "http://localhost:3294";
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const PHASES = (process.env.PHASES || "A,B,C,D,E,F,G,H").split(",").map((s) => s.trim().toUpperCase());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Protokoll ─────────────────────────────────────────────────────────────────
const findings = [];
let passed = 0;
function bug(title, detail) {
  findings.push({ phase: phaseLabel, title, detail });
  console.log(`\n!! ${title}\n   ${detail}`);
}
function ok(msg) {
  passed++;
  console.log(`   ok: ${msg}`);
}
function info(msg) {
  console.log(`   .. ${msg}`);
}
function check(cond, okMsg, bugTitle, detail = "") {
  if (cond) ok(okMsg);
  else bug(bugTitle, detail || okMsg);
  return !!cond;
}

// Englische Next-Standardtexte / rohe Fehler, die nie ein Nutzer sehen darf.
const RAW_ERROR = /Server Components render|omitted in production|An error occurred|Internal Server Error|Unexpected token|undefined|\[object Object\]|TypeError|violates|duplicate key|JSON/;

const consoleErrors = [];
const httpErrors = [];
let phaseLabel = "start";
// Erwartete 4xx (bewusst provoziert) je Muster erlauben.
const expectedHttp = [];
function watch(page) {
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Browser meldet bewusst provozierte 4xx als Konsolenfehler — die zaehlen ueber httpErrors.
    if (/Failed to load resource: the server responded with a status of 4\d\d/.test(t)) return;
    consoleErrors.push({ phase: phaseLabel, url: page.url(), text: t });
    console.log(`   [console] ${t.slice(0, 300)}`);
  });
  page.on("pageerror", (e) => {
    consoleErrors.push({ phase: phaseLabel, url: page.url(), text: "pageerror: " + e.message });
    console.log(`   [pageerror] ${e.message.slice(0, 300)}`);
  });
  page.on("response", (r) => {
    const s = r.status();
    if (s < 400) return;
    const u = r.url();
    if (u.includes("/_next/") && s === 404) return;
    if (expectedHttp.some((re) => re.test(u))) return;
    httpErrors.push({ phase: phaseLabel, status: s, url: u, method: r.request().method() });
    console.log(`   [http ${s}] ${r.request().method()} ${u.slice(0, 200)}`);
  });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true }).catch(() => {});
}
async function overflowPx(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
async function toastText(page, ms = 10_000) {
  try {
    const t = page.locator("[data-sonner-toast]").last();
    await t.waitFor({ timeout: ms });
    return (await t.innerText()).replace(/\s+/g, " ").trim();
  } catch {
    return null;
  }
}
async function mainText(page) {
  return (await page.locator("main").last().innerText().catch(() => "")).replace(/\s+/g, " ");
}
async function bodyText(page) {
  return (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
}
/** Wartet, bis der sichtbare Text passt (Client-Navigation rendert verzoegert). */
async function waitText(page, re, ms = 20_000, scope = "body") {
  const end = Date.now() + ms;
  let t = "";
  while (Date.now() < end) {
    t = (await page.locator(scope).last().innerText().catch(() => "")).replace(/\s+/g, " ");
    if (re.test(t)) return t;
    await sleep(300);
  }
  return t;
}
/** Wartet auf einen Toast, dessen Text passt (aeltere Toasts werden uebergangen). */
async function toastMatching(page, re, ms = 15_000) {
  const end = Date.now() + ms;
  let last = null;
  while (Date.now() < end) {
    const all = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
    for (const x of all) {
      last = x.replace(/\s+/g, " ").trim();
      if (re.test(last)) return last;
    }
    await sleep(250);
  }
  return last;
}
async function settle(page, ms = 800) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await sleep(ms);
}
async function go(page, p, opts = {}) {
  const r = await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded", timeout: 120_000, ...opts });
  await settle(page, opts.settle ?? 800);
  return r;
}

// ── Wegwerf-Konten ────────────────────────────────────────────────────────────
const cleanup = { users: [], accounts: [], automations: [] };
async function mkUser(tag, { plan = "free", onboarded = true, name } = {}) {
  const email = `steply-areas-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error("createUser: " + error.message);
  const userId = data.user.id;
  cleanup.users.push(userId);
  let accountId = null;
  for (let i = 0; i < 10 && !accountId; i++) {
    const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", userId);
    accountId = m?.[0]?.account_id ?? null;
    if (!accountId) await sleep(500);
  }
  if (!accountId) throw new Error("Kein Konto fuer neuen Nutzer");
  cleanup.accounts.push(accountId);
  const patch = { plan, onboarded };
  if (name) patch.name = name;
  await admin.from("accounts").update(patch).eq("id", accountId);
  const { data: acc } = await admin.from("accounts").select("slug, name").eq("id", accountId).single();
  return { email, userId, accountId, slug: acc.slug, name: acc.name };
}

async function login(page, email, next) {
  await go(page, `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PW);
  await page.getByRole("button", { name: /^Anmelden$/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  await settle(page);
}

let browser;
async function newCtx(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE", ...opts });
  const page = await ctx.newPage();
  watch(page);
  return { ctx, page };
}

// Lineare Sofort-Anleitung (mit Selektoren) direkt in der DB anlegen — wie die Erweiterung.
async function seedLinear(accountId, title, steps, { decisionAt, status = "draft" } = {}) {
  const { data: tut, error } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title, status, visibility: "public", site_domains: ["portal.example"] })
    .select("id")
    .single();
  if (error) throw new Error("seed tutorial: " + error.message);
  const ids = steps.map(() => crypto.randomUUID());
  const rows = steps.map((s, i) => ({
    id: ids[i],
    tutorial_id: tut.id,
    title: s.title,
    selector: s.selector ?? null,
    page_url: "https://portal.example/login",
    is_decision: decisionAt === i,
    position: i + 1,
  }));
  const ins = await admin.from("steps").insert(rows);
  if (ins.error) throw new Error("seed steps: " + ins.error.message);
  const branches = [];
  for (let i = 0; i < ids.length - 1; i++) branches.push({ step_id: ids[i], label: null, target_step_id: ids[i + 1], position: 0 });
  if (branches.length) await admin.from("step_branches").insert(branches);
  await admin.from("tutorials").update({ root_step_id: ids[0] }).eq("id", tut.id);
  return tut.id;
}

// Karten-Menue einer Anleitung in der Bibliothek oeffnen.
async function openCardMenu(page, title) {
  const card = page.locator("div.group").filter({ hasText: title }).first();
  await card.waitFor({ timeout: 60_000 });
  await card.getByRole("button", { name: "Aktionen" }).click();
  await sleep(300);
}

// ═════════════════════════════════════════════════════════════════════════════
async function phaseA() {
  phaseLabel = "A Automationen";
  console.log("\n=== A — Automationen ===");
  const u = await mkUser("auto", { plan: "free" });
  const { ctx, page } = await newCtx();
  try {
    await login(page, u.email);
    // Leerer Zustand
    await go(page, "/app/automationen");
    let t = await mainText(page);
    check(/Noch keine Automationen/.test(t), "Leerer Zustand erklaert den Weg", "Automationen: leerer Zustand fehlt", t.slice(0, 200));

    // Sofort-Anleitungen anlegen: eine ausfuehrbare, eine ohne Selektoren, eine mit Frage
    await seedLinear(u.accountId, "Beleg abrufen " + stamp, [
      { title: "Cookie-Banner schliessen", selector: { role: "button", text: "Akzeptieren" } },
      { title: "Anmelden", selector: { role: "button", text: "Anmelden" } },
      { title: "E-Mail eingeben", selector: { role: "textbox", text: "E-Mail" } },
      { title: "Belege oeffnen", selector: { role: "link", text: "Belege" } },
    ]);
    await seedLinear(u.accountId, "Handgebaut " + stamp, [
      { title: "Schritt eins" },
      { title: "Schritt zwei" },
    ]);
    await seedLinear(
      u.accountId,
      "Mit Frage " + stamp,
      [
        { title: "Frage", selector: { role: "button", text: "Ja" } },
        { title: "Weiter", selector: { role: "button", text: "Weiter" } },
      ],
      { decisionAt: 0 },
    );

    // Umwandeln einer Anleitung ohne ausfuehrbare Schritte -> sprechende Meldung (nicht generisch)
    await go(page, "/app");
    await openCardMenu(page, "Handgebaut " + stamp);
    await page.getByRole("menuitem", { name: /Als Automation nutzen/ }).click();
    let msg = await toastText(page, 20_000);
    info(`Toast (zu wenige Schritte): ${msg}`);
    check(
      msg && /Schritt|Klick|Aufnahme|Sofort/i.test(msg) && !/nicht geklappt/.test(msg),
      "Umwandeln ohne ausfuehrbare Schritte nennt den Grund",
      "„Als Automation nutzen“ zeigt bei ungeeigneter Anleitung nur eine generische Fehlermeldung",
      `Toast: „${msg}“ — der Grund (zu wenige ausfuehrbare Schritte) geht im Produktions-Build verloren.`,
    );
    await page.locator("[data-sonner-toast]").first().waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});

    await openCardMenu(page, "Mit Frage " + stamp);
    await page.getByRole("menuitem", { name: /Als Automation nutzen/ }).click();
    msg = await toastText(page, 20_000);
    info(`Toast (Verzweigung): ${msg}`);
    check(
      msg && /Verzweig|Frage/i.test(msg),
      "Umwandeln mit Verzweigung nennt den Grund",
      "„Als Automation nutzen“ verschweigt, dass Verzweigungen nicht gehen",
      `Toast: „${msg}“`,
    );
    await page.locator("[data-sonner-toast]").first().waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});

    // Erfolgreiche Umwandlung -> Detailseite
    await openCardMenu(page, "Beleg abrufen " + stamp);
    await page.getByRole("menuitem", { name: /Als Automation nutzen/ }).click();
    await page.waitForURL(/\/app\/automationen\/[0-9a-f-]{36}/, { timeout: 60_000 });
    const autoId = page.url().split("/app/automationen/")[1].split(/[?#]/)[0];
    cleanup.automations.push(autoId);
    t = await waitText(page, /Schritte \(\d+\)/i, 30_000);
    await shot(page, "A1-detail");
    const { count: autoSteps } = await admin.from("automation_steps").select("id", { count: "exact", head: true }).eq("automation_id", autoId);
    check(/Schritte \(4\)/i.test(t) && autoSteps === 4, "Detail zeigt 4 Schritte", "Automation: Schrittzahl stimmt nicht", `DB ${autoSteps}, Anzeige ${(t.match(/Schritte \(\d+\)/i) || ["?"])[0]}`);
    check(/E-Mail/.test(t) && /Angaben/.test(t), "Angabe „E-Mail“ erkannt", "Automation: Angabe (Parameter) fehlt", t.slice(0, 300));

    // Umbenennen (leer -> Hinweis, dann echter Name)
    await page.getByRole("button", { name: "Umbenennen" }).click();
    const nameIn = page.getByLabel("Name der Automation");
    await nameIn.fill("   ");
    await nameIn.press("Enter");
    msg = await toastMatching(page, /Namen/, 5000);
    check(msg && /Namen/.test(msg), "Leerer Name wird abgewiesen", "Automation: leerer Name ohne Hinweis", `Toast: ${msg}`);
    await nameIn.fill("Belege holen " + stamp);
    await nameIn.press("Enter");
    await sleep(2000);
    let { data: autoRow } = await admin.from("automations").select("title, schedule, params").eq("id", autoId).single();
    check(autoRow.title === "Belege holen " + stamp, "Automation umbenannt", "Automation umbenennen speichert nicht", `DB: ${autoRow.title}`);

    // Angaben: Typ auf „Geheim“, Pflicht aus -> Speichern
    const typeSel = page.locator("table select").first();
    await typeSel.selectOption("secret");
    await page.locator('table input[type="checkbox"]').first().uncheck();
    await page.locator("section").filter({ hasText: "Angaben" }).getByRole("button", { name: "Speichern" }).click();
    await sleep(2000);
    ({ data: autoRow } = await admin.from("automations").select("title, schedule, params").eq("id", autoId).single());
    const p0 = autoRow.params?.[0];
    check(p0 && p0.type === "secret" && p0.required === false, "Angaben gespeichert (Geheim, optional)", "Automation: Angaben speichern wirkt nicht", JSON.stringify(autoRow.params));

    // Zeitplan: monatlich am 31., 07:30
    await page.getByText("Automatisch ausführen").click();
    const sched = page.locator("section").filter({ hasText: "Zeitplan" });
    await sched.locator("select").first().selectOption("monthly");
    await sched.locator("select").nth(1).selectOption("31");
    await sched.getByLabel("Stunde").selectOption("7");
    await sched.getByLabel("Minute").selectOption("30");
    t = await waitText(page, /letzten Tag des Monats/, 5000);
    check(/letzten Tag des Monats/.test(t), "Hinweis fuer Monatsende sichtbar", "Zeitplan: Monatsende-Hinweis fehlt");
    check(!/Dieser Ablauf hat Pflicht-Angaben/.test(t), "Keine Pflicht-Warnung (Angabe ist optional)", "Zeitplan warnt vor Pflicht-Angaben, obwohl keine Pflicht ist");
    await sched.getByRole("button", { name: "Speichern" }).click();
    msg = await toastText(page, 10_000);
    await sleep(1000);
    ({ data: autoRow } = await admin.from("automations").select("schedule").eq("id", autoId).single());
    check(
      autoRow.schedule && autoRow.schedule.freq === "monthly" && autoRow.schedule.day === 31 && autoRow.schedule.hour === 7 && autoRow.schedule.minute === 30,
      "Zeitplan gespeichert",
      "Zeitplan speichert nicht",
      JSON.stringify(autoRow.schedule) + " / Toast: " + msg,
    );
    // Nach Neuladen weiter sichtbar?
    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page, 1200);
    t = await mainText(page);
    check(/Läuft am 31\./.test(t), "Zeitplan ueberlebt Neuladen", "Zeitplan nach Neuladen weg", t.slice(0, 400));
    // Zeitplan entfernen
    await page.getByText("Automatisch ausführen").click();
    await sched.getByRole("button", { name: "Speichern" }).click();
    await sleep(2000);
    ({ data: autoRow } = await admin.from("automations").select("schedule").eq("id", autoId).single());
    check(autoRow.schedule === null, "Zeitplan entfernt", "Zeitplan entfernen wirkt nicht", JSON.stringify(autoRow.schedule));

    // Ungueltiger Zeitplan direkt an die Action (Server-Validierung) — sprechender Text?
    // (Die Oberflaeche laesst nur gueltige Werte zu; der Server muss trotzdem deutsch ablehnen.)

    // Bedingung: Schritt 1 „nur wenn vorhanden“, dann wieder „immer ausfuehren“
    const firstStep = page.locator("ol > li").first();
    await firstStep.getByRole("button", { name: /nur ausführen, wenn vorhanden/ }).click();
    await sleep(2500);
    const { data: stepsAfter } = await admin.from("automation_steps").select("id, position, condition, jump").eq("automation_id", autoId).order("position");
    check(stepsAfter[0].condition?.kind === "element", "Schritt optional gemacht", "„nur ausführen, wenn vorhanden“ speichert nicht", JSON.stringify(stepsAfter[0].condition));
    await page.locator("ol > li").first().getByRole("button", { name: "immer ausführen" }).click();
    await sleep(2500);
    const { data: s1 } = await admin.from("automation_steps").select("condition").eq("id", stepsAfter[0].id).single();
    check(s1.condition === null, "Bedingung entfernt", "„immer ausführen“ entfernt die Bedingung nicht", JSON.stringify(s1.condition));

    // Sprung: Schritt 2 („Anmelden“) — wenn nicht da, weiter bei Schritt 4
    await shot(page, "A2-bedingung");
    const step2 = page.locator("ol > li").nth(1);
    const jumpToggle = step2.getByRole("button", { name: /Block ab hier überspringen/ });
    if (await jumpToggle.count()) {
      await jumpToggle.click();
      await sleep(400);
      const jumpSel = step2.getByLabel("Ziel-Schritt für den Block-Übersprung");
      const opts = await jumpSel.locator("option").allInnerTexts();
      info(`Sprungziele: ${opts.join(" | ")}`);
      const idx = opts.findIndex((o) => /^Schritt 4/.test(o));
      await jumpSel.selectOption({ index: idx });
      await sleep(2500);
      const { data: s2 } = await admin.from("automation_steps").select("jump").eq("id", stepsAfter[1].id).single();
      check(s2.jump && s2.jump.to_position === stepsAfter[3].position, "Sprung gesetzt", "Sprung wird nicht gespeichert", JSON.stringify(s2.jump));
      t = await mainText(page);
      info(`Sprung-Anzeige: ${(t.match(/(überspring|weiter bei)[^.]{0,80}/i) || [""])[0]}`);
      const rm = page.locator("ol > li").nth(1).getByRole("button", { name: /Sprung entfernen/ });
      if (await rm.count()) {
        await rm.click();
        await sleep(2500);
        const { data: s2b } = await admin.from("automation_steps").select("jump").eq("id", stepsAfter[1].id).single();
        check(s2b.jump === null, "Sprung entfernt", "„Sprung entfernen“ wirkt nicht", JSON.stringify(s2b.jump));
      } else bug("Automation: kein „Sprung entfernen“ nach dem Setzen", "Der gesetzte Sprung laesst sich nicht wieder entfernen.");
    } else bug("Automation: Einstieg „Block ab hier überspringen“ fehlt", "Bei Schritt 2 gibt es keinen Sprung-Einstieg.");

    // Lauf-Historie ueber die Erweiterungs-API
    const token = crypto.randomUUID();
    await setRecorderToken(admin, u.accountId, token);
    const post = (body) =>
      fetch(`${BASE}/api/recorder/automation-runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...body }) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
    const r1 = await post({ event: "start", automationId: autoId, mode: "auto", trigger: "scheduled" });
    const r1f = await post({ event: "finish", runId: r1.json.runId, status: "failed", detail: "Element „Belege“ nicht gefunden." });
    const r2 = await post({ event: "start", automationId: autoId, mode: "semi" });
    check(r1.status === 200 && r1f.status === 200 && r2.status === 200, "Laeufe per API angelegt", "Lauf-API lehnt ab", JSON.stringify([r1, r1f, r2]));
    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page, 1200);
    t = await mainText(page);
    check(/geplant/.test(t) && /manuell/.test(t) && /nicht gefunden/.test(t), "Lauf-Historie zeigt Ausloeser + Detail", "Lauf-Historie unvollstaendig", t.slice(-500));
    await shot(page, "A3-laeufe");

    // Liste: Karte mit letztem Lauf
    await go(page, "/app/automationen");
    t = await mainText(page);
    check(t.includes("Belege holen " + stamp) && /1 Automation\b/.test(t), "Liste zeigt die Automation", "Automationen-Liste unvollstaendig", t.slice(0, 300));

    // Mobil 390 px: Detail ohne Querscrollen
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, `/app/automationen/${autoId}`);
    const ov = await overflowPx(page);
    check(ov <= 1, "Detail mobil ohne Querscrollen", "Automation-Detail mobil breiter als der Bildschirm", `${ov} px`);
    await shot(page, "A4-mobil");
    await page.setViewportSize({ width: 1280, height: 900 });

    // Unbekannte ID -> Nicht gefunden
    await go(page, "/app/automationen/00000000-0000-0000-0000-000000000000");
    t = await bodyText(page);
    check(/nicht gefunden/i.test(t), "Unbekannte Automation zeigt „Nicht gefunden“", "Unbekannte Automation ohne Nicht-gefunden-Seite", t.slice(0, 200));

    // Loeschen
    await go(page, `/app/automationen/${autoId}`);
    await page.getByRole("button", { name: /Automation löschen/ }).click();
    await page.getByRole("button", { name: "Endgültig löschen" }).click();
    await page.waitForURL(/\/app\/automationen$/, { timeout: 30_000 });
    await settle(page);
    const { data: gone } = await admin.from("automations").select("id").eq("id", autoId);
    check(gone.length === 0, "Automation geloescht", "Automation loeschen wirkt nicht");
    t = await waitText(page, /Noch keine Automationen/, 15_000);
    await shot(page, "A5-nach-loeschen");
    check(/Noch keine Automationen/.test(t), "Liste nach Loeschen leer", "Geloeschte Automation steht weiter in der Liste", t.slice(0, 200));
  } catch (e) {
    bug("Phase A abgebrochen", String(e?.stack || e));
    await shot(page, "A-fehler");
  } finally {
    await ctx.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
const doc = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

// Veroeffentlichte Anleitung mit Ja/Nein-Frage direkt anlegen (wie nach „Veroeffentlichen“).
async function seedPublishedBranching(accountId, title, slug) {
  const { data: tut, error } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title, slug, status: "published", visibility: "public", published_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) throw new Error("seed published: " + error.message);
  const id = { start: crypto.randomUUID(), q: crypto.randomUUID(), yes: crypto.randomUUID(), no: crypto.randomUUID(), end: crypto.randomUUID() };
  const insS = await admin.from("steps").insert([
    { id: id.start, tutorial_id: tut.id, position: 1, title: "Portal oeffnen", body: doc("Oeffnen Sie das Kundenportal."), is_decision: false },
    { id: id.q, tutorial_id: tut.id, position: 2, title: "Haben Sie schon ein Konto?", body: doc("Waehlen Sie aus."), is_decision: true },
    { id: id.yes, tutorial_id: tut.id, position: 3, title: "Anmelden", body: doc("Melden Sie sich an."), is_decision: false },
    { id: id.no, tutorial_id: tut.id, position: 4, title: "Registrieren", body: doc("Legen Sie ein Konto an."), is_decision: false },
    { id: id.end, tutorial_id: tut.id, position: 5, title: "Beleg hochladen", body: doc("Laden Sie den Beleg hoch."), is_decision: false },
  ]);
  if (insS.error) throw new Error("seed steps: " + insS.error.message);
  const insB = await admin.from("step_branches").insert([
    { step_id: id.start, label: null, target_step_id: id.q, position: 0 },
    { step_id: id.q, label: "Ja", target_step_id: id.yes, position: 0, color: "#18a999" },
    { step_id: id.q, label: "Nein", target_step_id: id.no, position: 1, color: "#d3543a" },
    { step_id: id.yes, label: null, target_step_id: id.end, position: 0 },
    { step_id: id.no, label: null, target_step_id: id.end, position: 0 },
  ]);
  if (insB.error) throw new Error("seed branches: " + insB.error.message);
  await admin.from("tutorials").update({ root_step_id: id.start }).eq("id", tut.id);
  return { tutorialId: tut.id, stepIds: id };
}

// ═════════════════════════════════════════════════════════════════════════════
async function phaseB() {
  phaseLabel = "B Onboarding";
  console.log("\n=== B — Onboarding ===");
  const email = `steply-areas-ob-${stamp}@example.com`;
  const { ctx, page } = await newCtx();
  let accountId = null;
  try {
    await go(page, "/signup");
    await page.locator("#account_name").fill("Areas Onboarding GmbH");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(PW);
    await page.locator("form").getByRole("button").last().click();
    await page.waitForURL(/\/(app|onboarding)/, { timeout: 90_000 });
    // IDs fuer Aufraeumen
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const userId = link?.user?.id;
    if (userId) cleanup.users.push(userId);
    const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", userId);
    accountId = mem?.[0]?.account_id;
    if (accountId) cleanup.accounts.push(accountId);
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 }).catch(() => {});
    check(page.url().includes("/onboarding"), "Neue Registrierung landet im Einrichtungs-Assistenten", "Kein Onboarding nach Registrierung", page.url());
    await page.getByRole("button", { name: /Los geht/ }).click();
    await page.locator("#ob-name").waitFor({ timeout: 20_000 });
    check((await page.locator("#ob-name").inputValue()) === "Areas Onboarding GmbH", "Name aus der Registrierung vorbelegt", "Onboarding: Name aus der Registrierung fehlt", await page.locator("#ob-name").inputValue());
    // Zurueck-Knopf des Browsers mitten im Assistenten
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
    await settle(page, 1500);
    info(`Browser-Zurueck im Onboarding -> ${page.url()}`);
    if (!/\/onboarding/.test(page.url())) await go(page, "/onboarding");
    const losGehts = page.getByRole("button", { name: /Los geht/ });
    if (await losGehts.count()) await losGehts.click();
    await page.locator("#ob-name").fill("Areas Onboarding Eins");
    await page.locator("#ob-web").fill("https://www.areas-onboarding.example");
    await shot(page, "B1-onboarding");
    await page.getByRole("button", { name: /Fertig & loslegen/ }).click();
    await page.waitForURL(/\/app(\?|$|\/)/, { timeout: 60_000 });
    const { data: acc } = await admin.from("accounts").select("name, slug, onboarded").eq("id", accountId).single();
    const { data: th } = await admin.from("themes").select("source_url").eq("account_id", accountId).maybeSingle();
    check(acc.onboarded && acc.name === "Areas Onboarding Eins" && th?.source_url === "https://www.areas-onboarding.example", "Onboarding speichert Name, Website, Merker", "Onboarding speichert nicht vollstaendig", JSON.stringify({ acc, th }));

    // Zweite Person (Bearbeiter) in derselben Organisation — schon angemeldet (die Anmeldung
    // selbst leert alle Seiten-Caches und darf die Cache-Pruefung unten nicht verfaelschen).
    const editor = await mkUserPlain("ob-editor");
    await admin.from("account_members").insert({ account_id: accountId, user_id: editor.userId, role: "editor" });
    await admin.auth.admin.updateUserById(editor.userId, { user_metadata: { active_account_id: accountId } });
    const e2 = await newCtx();
    await login(e2.page, editor.email);

    // Hilfe-Seite einmal aufrufen (Cache fuellen), danach Name in der erneuten Einrichtung aendern.
    const hub = await ctx.newPage();
    watch(hub);
    await hub.goto(`${BASE}/h/${acc.slug}`, { waitUntil: "domcontentloaded" });
    await settle(hub);
    await hub.goto(`${BASE}/h/${acc.slug}`, { waitUntil: "domcontentloaded" });
    await settle(hub);
    check((await bodyText(hub)).includes("Areas Onboarding Eins"), "Hilfe-Seite zeigt den Namen", "Hilfe-Seite zeigt den Organisationsnamen nicht");

    // „Einrichtung erneut zeigen“
    await go(page, "/app/settings/allgemein");
    await page.getByRole("button", { name: "Einrichtung erneut zeigen" }).click();
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
    await settle(page);
    const { data: acc2 } = await admin.from("accounts").select("onboarded").eq("id", accountId).single();
    info(`Nach „Einrichtung erneut zeigen“: onboarded=${acc2.onboarded}`);
    // Die andere Person darf davon nichts merken.
    await go(e2.page, "/app/automationen");
    check(!/\/onboarding/.test(e2.page.url()), "Andere Bearbeiter werden nicht in die Einrichtung gezwungen", "„Einrichtung erneut zeigen“ zwingt das ganze Team in die Einrichtung", `Bearbeiter landet auf ${e2.page.url()} statt in der App.`);
    await e2.ctx.close();

    await page.getByRole("button", { name: /Los geht/ }).click();
    await page.locator("#ob-web").waitFor({ timeout: 20_000 });
    const web = await page.locator("#ob-web").inputValue();
    check(web === "https://www.areas-onboarding.example", "Erneute Einrichtung zeigt die gespeicherte Website", "Erneute Einrichtung: Website-Feld leer, obwohl gespeichert", `Feld: „${web}“`);
    await page.locator("#ob-name").fill("Areas Onboarding Zwei");
    await page.getByRole("button", { name: /Fertig & loslegen/ }).click();
    await page.waitForURL(/\/app(\?|$|\/)/, { timeout: 60_000 });
    await hub.goto(`${BASE}/h/${acc.slug}`, { waitUntil: "domcontentloaded" });
    await settle(hub, 1500);
    const hubTxt = await bodyText(hub);
    check(hubTxt.includes("Areas Onboarding Zwei"), "Neuer Name sofort auf der Hilfe-Seite", "Namensaenderung im Onboarding erreicht die Hilfe-Seite nicht (Cache)", `Hilfe-Seite zeigt: ${hubTxt.slice(0, 160)}`);
    await hub.close();

    // Erneut oeffnen und „Ueberspringen“ -> zurueck in die App, nichts veraendert
    await go(page, "/app/settings/allgemein");
    await page.getByRole("button", { name: "Einrichtung erneut zeigen" }).click();
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByRole("button", { name: /Los geht/ }).click();
    await page.getByRole("button", { name: "Überspringen" }).click();
    await page.waitForURL(/\/app(\?|$|\/)/, { timeout: 60_000 });
    const { data: acc3 } = await admin.from("accounts").select("name, onboarded").eq("id", accountId).single();
    check(acc3.onboarded && acc3.name === "Areas Onboarding Zwei", "Ueberspringen laesst alles wie es war", "Ueberspringen veraendert Daten", JSON.stringify(acc3));
    // Direkter Aufruf ohne „erneut“ -> sofort in die App
    await go(page, "/onboarding");
    check(!/\/onboarding/.test(page.url()), "Eingerichtete Organisation: /onboarding leitet in die App", "/onboarding zeigt den Assistenten erneut ohne Aufforderung", page.url());
    // Mobil 390 px
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, "/app/settings/allgemein");
    const ov = await overflowPx(page);
    check(ov <= 1, "Einstellungen/Allgemein mobil ohne Querscrollen", "Einstellungen/Allgemein mobil breiter als der Bildschirm", `${ov} px`);
  } catch (e) {
    bug("Phase B abgebrochen", String(e?.stack || e));
    await shot(page, "B-fehler");
  } finally {
    await ctx.close();
  }
}

// Nutzer OHNE eigene Verwendung des automatisch angelegten Kontos (wird trotzdem aufgeraeumt).
async function mkUserPlain(tag) {
  return mkUser(tag, { plan: "free" });
}

// ═════════════════════════════════════════════════════════════════════════════
async function phaseC() {
  phaseLabel = "C Bibliothek";
  console.log("\n=== C — Bibliothek-Extras ===");
  const u = await mkUser("lib", { plan: "free" });
  const { ctx, page } = await newCtx();
  try {
    // Grosses Konto: eine Anleitung mit 1000 Schritten, danach eine kleine mit 2 Schritten.
    const { data: big } = await admin.from("tutorials").insert({ account_id: u.accountId, title: "Riesige Anleitung", status: "draft", visibility: "public" }).select("id").single();
    for (let b = 0; b < 2; b++) {
      const rows = Array.from({ length: 500 }, (_, i) => ({ tutorial_id: big.id, position: b * 500 + i + 1, title: `Schritt ${b * 500 + i + 1}` }));
      const r = await admin.from("steps").insert(rows);
      if (r.error) throw new Error("big steps: " + r.error.message);
    }
    const small = await seedLinear(u.accountId, "Kleine Anleitung", [{ title: "Eins" }, { title: "Zwei" }]);
    await login(page, u.email);
    await go(page, "/app");
    await page.getByText("Kleine Anleitung").first().waitFor({ timeout: 60_000 });
    const smallCard = page.locator("div.group").filter({ hasText: "Kleine Anleitung" }).first();
    const smallTxt = (await smallCard.innerText()).replace(/\s+/g, " ");
    check(/2 Schritte/.test(smallTxt), "Schrittzahl stimmt auch bei >1000 Schritten im Konto", "Bibliothek zeigt „0 Schritte“, sobald das Konto mehr als 1000 Schritte hat", `Karte „Kleine Anleitung“: ${smallTxt.slice(0, 120)}`);
    const bigTxt = (await page.locator("div.group").filter({ hasText: "Riesige Anleitung" }).first().innerText()).replace(/\s+/g, " ");
    check(/1000 Schritte/.test(bigTxt), "Grosse Anleitung zeigt 1000 Schritte", "Schrittzahl der grossen Anleitung falsch", bigTxt.slice(0, 120));
    const sw = smallCard.getByRole("switch").first();
    if (await sw.count()) check(await sw.isEnabled(), "Veroeffentlichen-Schalter der kleinen Anleitung aktiv", "Veroeffentlichen-Schalter gesperrt (Anleitung gilt faelschlich als leer)");
    await shot(page, "C1-bibliothek");

    // Auf 5 Anleitungen auffuellen -> Gratis-Grenze
    for (const t of ["Drei", "Vier", "Fuenf"]) await seedLinear(u.accountId, `Anleitung ${t}`, [{ title: "A" }]);
    await go(page, "/app");
    await openCardMenu(page, "Kleine Anleitung");
    await page.getByRole("menuitem", { name: "Duplizieren" }).click();
    await page.waitForURL(/\/app\/settings\/tarif/, { timeout: 30_000 }).catch(() => {});
    await settle(page);
    const { count: nAfterDup } = await admin.from("tutorials").select("id", { count: "exact", head: true }).eq("account_id", u.accountId);
    const tarifTxt = await bodyText(page);
    check(nAfterDup === 5 && /Grenze erreicht/.test(tarifTxt), "Duplizieren an der Gratis-Grenze fuehrt zur Tarif-Seite", "Duplizieren an der Gratis-Grenze ohne Erklaerung", `url=${page.url()} Anzahl=${nAfterDup} Seite: ${tarifTxt.slice(0, 200)}`);
    const dupToast = await page.locator("[data-sonner-toast]").allInnerTexts();
    check(!dupToast.some((t) => /Dupliziert/.test(t)), "Kein falscher „Dupliziert“-Toast an der Grenze", "An der Gratis-Grenze meldet die Bibliothek „Dupliziert“, obwohl nichts kopiert wurde", dupToast.join(" | "));
    // Upgrade-Weg: Tarif-Seite nennt einen Weg zu Pro
    check(/Pro/.test(tarifTxt), "Tarif-Seite zeigt den Weg zu Pro", "Tarif-Seite ohne Upgrade-Hinweis", tarifTxt.slice(0, 300));
    await shot(page, "C2-tarif-grenze");

    // Neue Anleitung an der Grenze
    await go(page, "/app");
    await page.getByRole("button", { name: /Neue Anleitung/i }).first().click();
    await page.getByRole("dialog").waitFor({ timeout: 15_000 });
    const dlgTxt = (await page.getByRole("dialog").innerText()).replace(/\s+/g, " ");
    info(`Dialog „Neue Anleitung“ an der Grenze: ${dlgTxt.slice(0, 200)}`);
    const selfBtn = page.getByRole("button", { name: "Selbst bauen" });
    if (await selfBtn.count()) {
      await selfBtn.click();
      await page.locator("#title").fill("Sechste");
      await page.getByRole("button", { name: /Erstellen & bearbeiten/i }).click();
      await page.waitForURL(/\/app\/(settings\/tarif|tutorials\/)/, { timeout: 30_000 }).catch(() => {});
      await settle(page);
      check(/\/app\/settings\/tarif/.test(page.url()), "Neue Anleitung an der Grenze -> Tarif-Seite", "Sechste Anleitung trotz Gratis-Grenze angelegt", page.url());
    }

    // Kategorien: zwei anlegen, umbenennen auf vorhandenen Namen, loeschen mit Inhalt
    const { data: cats } = await admin.from("categories").insert([
      { account_id: u.accountId, name: "Belege", position: 0 },
      { account_id: u.accountId, name: "Lohn", position: 1 },
    ]).select("id, name");
    await admin.from("tutorials").update({ category_id: cats[0].id }).eq("id", small);
    await go(page, "/app");
    const row = page.locator('[data-testid="category-row"]').filter({ hasText: "Belege" }).first();
    await row.hover();
    await row.getByTestId("category-menu").click();
    await page.getByTestId("category-rename").click();
    await page.getByTestId("category-rename-input").fill("lohn");
    await page.getByTestId("category-rename-save").click();
    await sleep(1500);
    const errTxt = await page.getByTestId("category-rename-error").innerText().catch(() => "");
    check(errTxt && !RAW_ERROR.test(errTxt), "Umbenennen auf vorhandenen Namen: deutsche Meldung", "Kategorie-Umbenennen auf vorhandenen Namen ohne verstaendliche Meldung", `Meldung: „${errTxt}“`);
    await page.keyboard.press("Escape");
    await sleep(500);
    await row.hover();
    await row.getByTestId("category-menu").click();
    await page.getByTestId("category-delete").click();
    const cdlg = page.getByTestId("confirm-dialog");
    await cdlg.waitFor({ timeout: 10_000 });
    const cdTxt = (await cdlg.innerText()).replace(/\s+/g, " ");
    check(/Sonstiges|1 Anleitung/.test(cdTxt), "Loesch-Abfrage nennt die Folgen", "Kategorie-Loeschen verschweigt, was mit den Anleitungen passiert", cdTxt);
    await cdlg.getByRole("button", { name: /löschen/i }).last().click();
    await sleep(2000);
    const { data: smallRow } = await admin.from("tutorials").select("category_id").eq("id", small).single();
    check(smallRow.category_id === null, "Anleitung nach Kategorie-Loeschen unter „Sonstiges“", "Anleitung verschwindet mit der Kategorie", JSON.stringify(smallRow));

    // Karten-Menue: Loeschen mit Abfrage
    await openCardMenu(page, "Anleitung Fuenf");
    await page.getByRole("menuitem", { name: /Löschen/ }).click();
    const del = page.getByRole("dialog");
    await del.waitFor({ timeout: 10_000 });
    await del.getByRole("button", { name: /löschen/i }).last().click();
    await sleep(2500);
    const { count: nAfterDel } = await admin.from("tutorials").select("id", { count: "exact", head: true }).eq("account_id", u.accountId);
    check(nAfterDel === 4, "Anleitung ueber das Karten-Menue geloescht", "Loeschen ueber das Karten-Menue wirkt nicht", `Anzahl: ${nAfterDel}`);
    t: {
      const txt = await waitText(page, /4 Anleitungen/, 10_000, "main");
      check(/4 Anleitungen/.test(txt) && !txt.includes("Anleitung Fuenf"), "Bibliothek sofort aktualisiert", "Geloeschte Anleitung bleibt in der Bibliothek stehen", txt.slice(0, 200));
    }
    // Mobil
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, "/app");
    const ov = await overflowPx(page);
    check(ov <= 1, "Bibliothek mobil ohne Querscrollen", "Bibliothek mobil breiter als der Bildschirm", `${ov} px`);
  } catch (e) {
    bug("Phase C abgebrochen", String(e?.stack || e));
    await shot(page, "C-fehler");
  } finally {
    await ctx.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
async function phaseD() {
  phaseLabel = "D Hinweise";
  console.log("\n=== D — Glocke, Hinweise, Strg+K ===");
  const u = await mkUser("alerts", { plan: "free" });
  const { ctx, page } = await newCtx();
  try {
    const slug = `pruefen-${stamp}`;
    const { tutorialId } = await seedPublishedBranching(u.accountId, "Beleg pruefen", slug);
    const issues = [{ step: "1. Portal oeffnen", problem: "Der Knopf heisst jetzt „Kundenbereich“.", suggestion: "„Kundenbereich“ statt „Portal“ nennen." }];
    const { data: alerts } = await admin.from("change_alerts").insert([
      { tutorial_id: tutorialId, severity: "warning", summary: "Portal heisst jetzt Kundenbereich", details: { issues } },
      { tutorial_id: tutorialId, severity: "info", summary: "Zweiter Hinweis", details: {} },
    ]).select("id");
    await admin.from("tutorials").update({ freshness: "stale" }).eq("id", tutorialId);
    await login(page, u.email);
    await go(page, "/app");
    // Glocke
    const bell = page.getByRole("button", { name: /Hinweise|Benachrichtigungen|Glocke/i }).first();
    if (await bell.count()) {
      await bell.click();
      await sleep(600);
      const pop = (await page.locator("[data-slot=popover-content], [role=dialog]").last().innerText().catch(() => "")).replace(/\s+/g, " ");
      check(/Portal heisst jetzt Kundenbereich/.test(pop), "Glocke zeigt den offenen Hinweis", "Glocke zeigt den Hinweis nicht", pop.slice(0, 200));
      await page.keyboard.press("Escape");
    } else bug("Glocke nicht gefunden", "Kein Knopf fuer Hinweise in der Kopfleiste.");
    await go(page, "/app/alerts");
    let t = await mainText(page);
    check(/2 offen/.test(t), "Hinweis-Seite listet 2 offene", "Hinweis-Seite zaehlt falsch", t.slice(0, 200));
    // Uebernehmen im Gratis-Tarif -> deutscher Pro-Hinweis
    const apply = page.getByRole("button", { name: /übernehmen/i }).first();
    if (await apply.count()) {
      await apply.click();
      const msg = await toastMatching(page, /Pro|Tarif/, 15_000);
      check(msg && /Pro/.test(msg) && !RAW_ERROR.test(msg), "Uebernehmen im Gratis-Tarif: Pro-Hinweis", "Uebernehmen im Gratis-Tarif ohne verstaendliche Meldung", `Toast: ${msg}`);
    } else info("Kein „Übernehmen“-Knopf sichtbar");
    // Ignorieren + Erledigt
    const cards = page.locator("main li, main article").filter({ hasText: "Zweiter Hinweis" });
    await page.getByRole("button", { name: "Ignorieren" }).last().click();
    await sleep(2000);
    await page.getByRole("button", { name: "Erledigt" }).first().click();
    await sleep(2500);
    const { data: st } = await admin.from("change_alerts").select("id, status").in("id", alerts.map((a) => a.id));
    const { data: tutFresh } = await admin.from("tutorials").select("freshness").eq("id", tutorialId).single();
    check(st.every((a) => a.status !== "open") && tutFresh.freshness === "ok", "Hinweise erledigt/ignoriert, Anleitung wieder aktuell", "Hinweise schliessen wirkt nicht vollstaendig", JSON.stringify({ st, tutFresh }));
    t = await waitText(page, /Alles aktuell|keine offenen|Keine offenen/i, 10_000, "main");
    info(`Leerer Zustand Hinweise: ${t.slice(0, 160)}`);
    void cards;

    // Pro: Vorschlag uebernehmen -> Hilfe-Seite zeigt den neuen Text sofort (ein KI-Aufruf)
    if (process.env.SKIP_AI !== "1") {
      await admin.from("accounts").update({ plan: "pro" }).eq("id", u.accountId);
      const { data: a3 } = await admin.from("change_alerts").insert({
        tutorial_id: tutorialId, severity: "warning", summary: "Portal umbenannt", details: { issues },
      }).select("id").single();
      const hub = await ctx.newPage();
      watch(hub);
      await hub.goto(`${BASE}/h/${u.slug}/${slug}`, { waitUntil: "domcontentloaded" });
      await settle(hub);
      await hub.reload({ waitUntil: "domcontentloaded" });
      await settle(hub);
      const before = await bodyText(hub);
      await go(page, "/app/alerts");
      await page.getByRole("button", { name: /Änderung übernehmen/ }).first().click();
      const okMsg = await toastMatching(page, /übernommen|Fehler|nicht/i, 60_000);
      info(`Uebernehmen (Pro): ${okMsg}`);
      const { data: s1 } = await admin.from("steps").select("title, body").eq("tutorial_id", tutorialId).eq("position", 1).single();
      const newTitle = s1.title;
      check(newTitle !== "Portal oeffnen" || JSON.stringify(s1.body).includes("Kundenbereich"), "Vorschlag in den Schritt uebernommen", "„Änderung übernehmen“ aendert den Schritt nicht", JSON.stringify(s1).slice(0, 200));
      await hub.reload({ waitUntil: "domcontentloaded" });
      await settle(hub, 1500);
      const after = await bodyText(hub);
      check(after !== before && after.includes(newTitle), "Hilfe-Seite zeigt den uebernommenen Text sofort", "Nach „Änderung übernehmen“ zeigt die Hilfe-Seite weiter den alten Text (Cache)", `Neuer Titel „${newTitle}“, Hilfe-Seite: ${after.slice(0, 200)}`);
      await hub.close();
      await admin.from("change_alerts").delete().eq("id", a3.id);
    }

    // Strg+K: Navigation + Anleitung finden
    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder("Suchen oder Befehl eingeben …");
    await input.waitFor({ timeout: 10_000 });
    await input.fill("Automat");
    await sleep(500);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/app\/automationen/, { timeout: 20_000 }).catch(() => {});
    check(/\/app\/automationen/.test(page.url()), "Strg+K: Navigation per Enter", "Strg+K-Navigation fuehrt nicht zum Ziel", page.url());
    await page.keyboard.press("Control+k");
    await input.fill("Beleg pr");
    await page.getByRole("option", { name: /Beleg pruefen/ }).waitFor({ timeout: 15_000 });
    await page.getByRole("option", { name: /Beleg pruefen/ }).click();
    await page.waitForURL(/\/app\/tutorials\//, { timeout: 30_000 }).catch(() => {});
    check(page.url().includes(tutorialId), "Strg+K: Anleitung oeffnen", "Strg+K oeffnet die gefundene Anleitung nicht", page.url());
    // Nach Schliessen + Wiederoeffnen keine alten Treffer
    await go(page, "/app");
    await page.keyboard.press("Control+k");
    await input.fill("Be");
    await sleep(100);
    await page.keyboard.press("Escape");
    await sleep(1500);
    await page.keyboard.press("Control+k");
    await sleep(800);
    const stale = await page.getByRole("option", { name: /Beleg pruefen/ }).count();
    check(stale === 0, "Strg+K: nach Schliessen keine alten Treffer", "Strg+K zeigt beim Oeffnen alte Treffer einer abgebrochenen Suche");
    await page.keyboard.press("Escape");
  } catch (e) {
    bug("Phase D abgebrochen", String(e?.stack || e));
    await shot(page, "D-fehler");
  } finally {
    await ctx.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
async function phaseF() {
  phaseLabel = "F Hilfe-Seite";
  console.log("\n=== F — Hilfe-Seite-Extras ===");
  const u = await mkUser("hub", { plan: "pro" });
  const { ctx, page } = await newCtx();
  let htmlServer = null;
  try {
    const tslug = `beleg-${stamp}`;
    await seedPublishedBranching(u.accountId, "Beleg einreichen", tslug);
    // Druckansicht
    let r = await go(page, `/h/${u.slug}/${tslug}/drucken`);
    let t = await bodyText(page);
    check(r.status() === 200 && /Portal oeffnen/.test(t) && /Registrieren/.test(t) && /Anmelden/.test(t), "Druckansicht zeigt alle Schritte beider Aeste", "Druckansicht unvollstaendig", t.slice(0, 300));
    await shot(page, "F1-drucken");
    // 404 / weiche 404
    for (const p of [`/h/gibt-es-nicht-${stamp}`, `/h/${u.slug}/gibt-es-nicht`, `/h/${u.slug}/gibt-es-nicht/drucken`]) {
      await go(page, p);
      t = await bodyText(page);
      const html = await page.content();
      const robots = (html.match(/<meta name="robots" content="([^"]+)"/) || [])[1] || null;
      check(/nicht gefunden/i.test(t) && /noindex/.test(robots || ""), `Nicht gefunden + noindex: ${p}`, `Fehlende Nicht-gefunden-Seite: ${p}`, `robots=${robots} Text: ${t.slice(0, 120)}`);
    }
    // sitemap + robots
    const sm = await fetch(`${BASE}/sitemap.xml`).then((x) => x.text());
    check(sm.includes(`/h/${u.slug}/${tslug}`), "Sitemap enthaelt die neue Anleitung", "Anleitung fehlt in der Sitemap");
    const rb = await fetch(`${BASE}/robots.txt`).then((x) => x.text());
    check(/Sitemap:/i.test(rb) && /Disallow: \/app/.test(rb), "robots.txt sperrt /app, nennt Sitemap", "robots.txt unvollstaendig", rb.slice(0, 200));
    // QR: nicht angemeldet -> 401, angemeldet -> PNG (auch mit der Adresse, unter der die App laeuft)
    const qrUrl = `${BASE}/api/qr?url=${encodeURIComponent(`${BASE}/h/${u.slug}/${tslug}`)}`;
    r = await fetch(qrUrl);
    check(r.status === 401, "QR ohne Anmeldung abgewiesen", "QR-Route ohne Anmeldung offen", String(r.status));
    await login(page, u.email);
    const qr = await page.request.get(qrUrl);
    check(qr.status() === 200 && (qr.headers()["content-type"] || "").includes("image/png"), "„QR-Code oeffnen“ liefert ein PNG", "„QR-Code oeffnen“ liefert eine rohe Fehlermeldung statt eines QR-Codes", `Status ${qr.status()}: ${(await qr.text()).slice(0, 120)}`);
    const qrBad = await page.request.get(`${BASE}/api/qr?url=${encodeURIComponent("https://evil.example/h/x")}`);
    check(qrBad.status() === 400, "QR fuer fremde Adressen abgewiesen", "QR-Route erzeugt Codes fuer fremde Adressen", String(qrBad.status()));
    // Bubble-Skript + iFrame auf einer fremden Test-Seite
    const js = await fetch(`${BASE}/h/embed.js?account=${u.slug}`);
    const jsTxt = await js.text();
    check(js.status === 200 && /javascript/.test(js.headers.get("content-type") || "") && jsTxt.includes("/chat?embedded=1"), "embed.js wird ausgeliefert", "embed.js fehlerhaft", `${js.status} ${js.headers.get("content-type")}`);
    const http = await import("node:http");
    const html = `<!doctype html><html lang="de"><body><h1>Kanzlei-Website</h1>
      <iframe id="hub" src="${BASE}/h/${u.slug}" width="100%" height="600" style="border:0"></iframe>
      <script src="${BASE}/h/embed.js?account=${u.slug}"></script></body></html>`;
    htmlServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });
    await new Promise((res) => htmlServer.listen(0, "127.0.0.1", res));
    const port = htmlServer.address().port;
    const ext = await ctx.newPage();
    watch(ext);
    await ext.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await sleep(4000);
    const frames = ext.frames().map((f) => f.url());
    info(`Frames auf der Test-Seite: ${frames.join(" | ")}`);
    const hubFrame = ext.frames().find((f) => f.url().startsWith(`${BASE}/h/${u.slug}`) && !f.url().includes("/chat"));
    const hubFrameTxt = hubFrame ? await hubFrame.locator("body").innerText().catch(() => "") : "";
    check(hubFrame && /Beleg einreichen/.test(hubFrameTxt), "Hilfe-Seite laesst sich per iFrame einbetten", "Hilfe-Seite im iFrame leer/gesperrt", hubFrameTxt.slice(0, 120));
    const bubbleSrc = await ext.evaluate(() => [...document.querySelectorAll("iframe")].map((f) => f.src).find((s) => s.includes("/chat?embedded=1")) || "");
    check(bubbleSrc.includes(`/h/${u.slug}/chat?embedded=1`), "Chat-Bubble-iFrame wird eingefuegt", "embed.js fuegt keinen Chat ein", bubbleSrc);
    await ext.close();
    // Chat-Seite (Pro) direkt
    await go(page, `/h/${u.slug}/chat?embedded=1`);
    t = await bodyText(page);
    info(`Chat-Seite (Pro): ${t.slice(0, 120)}`);

    // Mobil: Wizard mit Verzweigung + Feedback
    const m = await newCtx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await m.page.goto(`${BASE}/h/${u.slug}/${tslug}`, { waitUntil: "domcontentloaded" });
    await settle(m.page, 1200);
    const ovM = await overflowPx(m.page);
    check(ovM <= 1, "Wizard mobil ohne Querscrollen", "Wizard mobil breiter als der Bildschirm", `${ovM} px`);
    await m.page.getByRole("button", { name: /Ich komme hier nicht weiter/ }).first().click().catch(() => {});
    await sleep(1500);
    // Durch den Nein-Ast bis ans Ende
    const stuckSent = await waitText(m.page, /Danke|weitergeleitet|gemeldet/i, 5000);
    info(`Nach „nicht weiter“: ${(stuckSent.match(/[^.]*(Danke|gemeldet)[^.]*\./) || [""])[0]}`);
    for (let i = 0; i < 10; i++) {
      if (await m.page.getByText("War diese Anleitung hilfreich?").count()) break;
      const no = m.page.locator('button[data-tx="btn"]').filter({ hasText: /^\s*Nein\s*$/ });
      if (await no.count()) {
        await no.first().click();
      } else {
        const next = m.page.getByRole("button", { name: /^(Weiter|Fertig)/ }).first();
        if (!(await next.count())) break;
        await next.click();
      }
      await sleep(700);
    }
    t = await bodyText(m.page);
    check(/War diese Anleitung hilfreich\?/.test(t), "Ende des Nein-Asts erreicht (Feedback-Frage)", "Wizard kommt mobil nicht ans Ende", t.slice(0, 200));
    await shot(m.page, "F2-wizard-mobil");
    await m.page.getByRole("button", { name: "Ja", exact: true }).last().click().catch(() => {});
    await sleep(2500);
    const { data: ev } = await admin.from("events").select("type, helpful, question").eq("account_id", u.accountId).eq("type", "feedback");
    check(ev.some((e) => e.helpful === true) && ev.some((e) => /^\[Schritt\]/.test(e.question || "")), "Feedback + „nicht weiter“ gespeichert", "Feedback aus dem Wizard kommt nicht an", JSON.stringify(ev));
    await m.ctx.close();

    // Sprach-Umschalter (Business + Englisch) — eigenes Konto, damit kein alter Cache stoert
    const b = await mkUser("hub-en", { plan: "business" });
    await admin.from("accounts").update({ languages: ["en"] }).eq("id", b.accountId);
    await seedPublishedBranching(b.accountId, "Beleg einreichen", `en-${stamp}`);
    await go(page, `/h/${b.slug}`);
    const sw = page.getByRole("link", { name: /English|EN/ }).first();
    if (await sw.count()) {
      await sw.click();
      await page.waitForURL(/lang=en/, { timeout: 15_000 }).catch(() => {});
      await settle(page);
    } else await go(page, `/h/${b.slug}?lang=en`);
    t = await bodyText(page);
    check(/lang=en/.test(page.url()) && /How can we help|Search|guides/i.test(t), "Hilfe-Seite auf Englisch umschaltbar", "Sprachumschalter zeigt keine englische Oberflaeche", `${page.url()} :: ${t.slice(0, 200)}`);
  } catch (e) {
    bug("Phase F abgebrochen", String(e?.stack || e));
    await shot(page, "F-fehler");
  } finally {
    if (htmlServer) htmlServer.close();
    await ctx.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
async function phaseG() {
  phaseLabel = "G Anmeldung";
  console.log("\n=== G — Anmeldung ===");
  const u = await mkUser("auth", { plan: "free" });
  const other = await mkUser("auth2", { plan: "free" });
  const { ctx, page } = await newCtx();
  try {
    // Falsches Passwort
    await go(page, "/login");
    await page.locator("#email").fill(u.email);
    await page.locator("#password").fill("falsch-falsch");
    await page.getByRole("button", { name: /^Anmelden$/ }).click();
    let t = await waitText(page, /falsch|ungültig/i, 15_000);
    check(/E-Mail oder Passwort ist falsch/.test(t), "Falsches Passwort: deutsche Meldung", "Login-Fehler nicht deutsch", t.slice(0, 200));
    // Registrierung mit vorhandener Adresse / zu kurzem Passwort
    await go(page, "/signup");
    await page.locator("#email").fill(other.email);
    await page.locator("#password").fill("kurz");
    const minLen = await page.locator("#password").getAttribute("minlength");
    t = await bodyText(page);
    check(minLen === "8" && /Mindestens 8 Zeichen/.test(t), "Zu kurzes Passwort: Feld verlangt 8 Zeichen (mit Hinweis)", "Registrierung: Passwort-Laenge nicht erklaert", `minlength=${minLen}`);
    await page.locator("#password").fill(PW);
    await page.locator("form").getByRole("button").last().click();
    t = await waitText(page, /existiert|registriert|bereits|already/i, 45_000);
    await sleep(1500);
    t = await bodyText(page);
    await shot(page, "G1-signup-vorhanden");
    info(`Registrierung mit vorhandener Adresse -> ${page.url()} :: ${t.slice(0, 160)}`);
    check(!RAW_ERROR.test(t) && !/already/i.test(t), "Vorhandene Adresse: keine englische Meldung", "Registrierung mit vorhandener Adresse zeigt englischen Text", t.slice(0, 200));

    // Magic Link (per Admin erzeugt — keine echte Mail)
    const { data: ml } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.email });
    await go(page, `/auth/confirm?token_hash=${ml.properties.hashed_token}&type=magiclink&next=/app/automationen`);
    check(/\/app\/automationen/.test(page.url()), "Magic Link meldet an und fuehrt zu next", "Magic Link fuehrt nicht in die App", page.url());
    // Derselbe Link ein zweites Mal -> verbraucht -> verstaendlicher Hinweis
    await go(page, "/logout");
    await go(page, `/auth/confirm?token_hash=${ml.properties.hashed_token}&type=magiclink`);
    t = await bodyText(page);
    info(`Verbrauchter Link -> ${page.url()}`);
    check(/ungültig|abgelaufen/i.test(t), "Verbrauchter Link: Hinweis auf der Anmeldeseite", "Abgelaufener/verbrauchter E-Mail-Link landet ohne jede Erklaerung auf der Anmeldeseite", `Seite ${page.url()}: ${t.slice(0, 160)}`);
    // Fragment-Fehler (Standard-Supabase-Mail, abgelaufen)
    await go(page, "/auth/hash?next=/app#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    await sleep(1500);
    t = await bodyText(page);
    check(/\/login/.test(page.url()) && !/Email link is invalid/.test(t), "Abgelaufener #-Link -> Anmeldeseite ohne englischen Text", "Abgelaufener #-Link zeigt englischen Text", t.slice(0, 160));

    // Passwort zuruecksetzen per Link
    const { data: rec } = await admin.auth.admin.generateLink({ type: "recovery", email: u.email });
    await go(page, `/auth/confirm?token_hash=${rec.properties.hashed_token}&type=recovery&next=/reset`);
    check(/\/reset/.test(page.url()), "Zuruecksetzen-Link fuehrt zu /reset", "Zuruecksetzen-Link landet falsch", page.url());
    await page.locator("#password").fill("Neu12345!x");
    await page.locator("form").getByRole("button").last().click();
    await page.waitForURL(/\/app/, { timeout: 30_000 }).catch(() => {});
    check(/\/app/.test(page.url()), "Neues Passwort gesetzt -> App", "Neues Passwort setzen scheitert", page.url());
    await admin.auth.admin.updateUserById(u.userId, { password: PW });

    // Abmelden + Sitzung weg -> ?next
    await go(page, "/logout");
    check(/\/login/.test(page.url()), "Abmelden fuehrt zur Anmeldung", "Abmelden fuehrt nicht zur Anmeldung", page.url());
    await go(page, "/app/settings/teilen");
    const u1 = new URL(page.url());
    check(u1.pathname === "/login" && u1.searchParams.get("next") === "/app/settings/teilen", "Ohne Sitzung: /login?next=…", "Geschuetzte Seite ohne Sitzung leitet falsch um", page.url());
    await page.locator("#email").fill(u.email);
    await page.locator("#password").fill(PW);
    await page.getByRole("button", { name: /^Anmelden$/ }).click();
    await page.waitForURL(/\/app\/settings\/teilen/, { timeout: 30_000 }).catch(() => {});
    check(/\/app\/settings\/teilen/.test(page.url()), "Nach Anmeldung zurueck zur gewuenschten Seite", "Anmeldung ignoriert ?next", page.url());
    // Sitzung abgelaufen (Cookies weg) mitten in der App
    await ctx.clearCookies();
    await go(page, "/app/automationen");
    check(/\/login\?.*next=%2Fapp%2Fautomationen/.test(page.url()), "Abgelaufene Sitzung -> Anmeldung mit next", "Abgelaufene Sitzung ohne Rueckweg", page.url());
  } catch (e) {
    bug("Phase G abgebrochen", String(e?.stack || e));
    await shot(page, "G-fehler");
  } finally {
    await ctx.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
async function phaseH() {
  phaseLabel = "H Einstellungen";
  console.log("\n=== H — Einstellungen ===");
  const u = await mkUser("set", { plan: "free" });
  const other = await mkUser("set2", { plan: "free" });
  const { ctx, page } = await newCtx();
  try {
    const tslug = `anl-${stamp}`;
    await seedPublishedBranching(u.accountId, "Einstellungs-Test", tslug);
    await login(page, u.email);
    // Allgemein: Name
    await go(page, "/app/settings/allgemein");
    await page.locator("#org-name").fill("Areas Settings GmbH");
    await page.getByRole("button", { name: /Speichern/ }).first().click();
    let msg = await toastMatching(page, /gespeichert|Fehler|nicht/i, 10_000);
    const { data: acc } = await admin.from("accounts").select("name").eq("id", u.accountId).single();
    check(acc.name === "Areas Settings GmbH", "Organisationsname gespeichert", "Organisationsname speichert nicht", `${acc.name} / ${msg}`);
    let t = await bodyText(page);
    check(/Organisation löschen/.test(t) && /Support/.test(t), "Loeschen-Hinweis vorhanden", "Organisation-loeschen-Text fehlt");
    // Adresse aendern
    await go(page, "/app/settings/teilen");
    const newSlug = `areas-neu-${stamp}`;
    await page.locator("#hub-slug").fill(newSlug);
    t = await bodyText(page);
    check(/bisherige Links/.test(t), "Warnung vor kaputten Links beim Adress-Wechsel", "Keine Warnung beim Adress-Wechsel");
    await page.locator("#hub-slug").press("Enter");
    msg = await toastMatching(page, /Adresse|vergeben|Fehler/i, 10_000);
    const { data: acc2 } = await admin.from("accounts").select("slug").eq("id", u.accountId).single();
    check(acc2.slug === newSlug, "Adresse der Hilfe-Seite geaendert", "Adress-Wechsel speichert nicht", `${acc2.slug} / ${msg}`);
    const oldHub = await fetch(`${BASE}/h/${u.slug}`).then((x) => x.text());
    info(`Alte Adresse /h/${u.slug}: ${/nicht gefunden/i.test(oldHub) ? "Nicht gefunden" : "liefert Inhalt"}`);
    const newHub = await fetch(`${BASE}/h/${newSlug}/${tslug}`).then((x) => x.text());
    check(newHub.includes("Einstellungs-Test"), "Neue Adresse zeigt die Anleitung", "Neue Hilfe-Seiten-Adresse zeigt die Anleitung nicht");
    // Vergebene Adresse
    await page.locator("#hub-slug").fill(other.slug);
    await page.locator("#hub-slug").press("Enter");
    msg = await toastMatching(page, /vergeben/i, 10_000);
    check(msg && /vergeben/.test(msg), "Vergebene Adresse: deutsche Meldung", "Vergebene Adresse ohne verstaendliche Meldung", String(msg));
    // Profil: E-Mail-Wechsel auf vorhandene / eigene Adresse
    await go(page, "/app/settings/profil");
    await page.locator("#new-email").fill(other.email);
    await page.locator("#email-current-password").fill(PW); // seit Audit 23.09. Pflicht
    await page.getByRole("button", { name: "E-Mail ändern" }).click();
    msg = await toastMatching(page, /.+/, 15_000);
    info(`E-Mail auf vergebene Adresse: ${msg}`);
    check(msg && !/Fast geschafft/.test(msg) && !/[a-z]+ [a-z]+ (has|already|with)/i.test(msg), "Vergebene E-Mail: deutsche Ablehnung", "E-Mail-Wechsel auf vergebene Adresse zeigt englischen Text oder falschen Erfolg", String(msg));
    await page.locator("[data-sonner-toast]").first().waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
    await page.locator("#new-email").fill(u.email);
    await page.locator("#email-current-password").fill(PW); // seit Audit 23.09. Pflicht
    await page.getByRole("button", { name: "E-Mail ändern" }).click();
    msg = await toastMatching(page, /.+/, 15_000);
    info(`E-Mail auf eigene Adresse: ${msg}`);
    check(msg && !/Fast geschafft/.test(msg), "Eigene Adresse: kein falsches „Links verschickt“", "E-Mail-Wechsel auf die eigene Adresse meldet falschen Erfolg („Bestaetigungs-Links verschickt“)", String(msg));
    // Tarif / Erweiterung / Profil mobil
    for (const p of ["/app/settings/tarif", "/app/settings/erweiterung", "/app/settings/profil", "/app/settings/teilen"]) {
      await go(page, p);
      t = await mainText(page);
      check(t.length > 80 && !RAW_ERROR.test(t), `${p} laedt`, `${p} leer oder mit Rohfehler`, t.slice(0, 160));
      await page.setViewportSize({ width: 390, height: 844 });
      await settle(page, 400);
      const ov = await overflowPx(page);
      check(ov <= 1, `${p} mobil ohne Querscrollen`, `${p} mobil breiter als der Bildschirm`, `${ov} px`);
      await page.setViewportSize({ width: 1280, height: 900 });
    }
  } catch (e) {
    bug("Phase H abgebrochen", String(e?.stack || e));
    await shot(page, "H-fehler");
  } finally {
    await ctx.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// E — Admin-Logik ohne Oberflaeche (Richards Admin-Login ist hier nicht moeglich): Loeschen
// einer Vorlage darf abgeschaltete/verborgene Kunden-Kopien NICHT oeffentlich machen.
// Vorlagen bleiben dabei im Entwurf — so sehen echte Kunden sie nie in ihrer Bibliothek.
async function phaseE() {
  phaseLabel = "E Admin-Logik";
  console.log("\n=== E — Admin-Logik (Vorlage loeschen) ===");
  let mod;
  try {
    mod = await import(pathToFileURL(path.join(__dirname, "..", "src", "lib", "template-forks.ts")).href);
  } catch (e) {
    info(`uebersprungen (Start mit --experimental-strip-types noetig): ${String(e?.message || e).slice(0, 120)}`);
    return;
  }
  const u = await mkUser("tpl", { plan: "pro" });
  const { ctx, page } = await newCtx();
  const tplIds = [];
  const mk = async (tag, enabled) => {
    const slug = `vorlage-${tag}-${stamp}`;
    const { data: tpl, error } = await admin
      .from("tutorials")
      .insert({ account_id: null, is_template: true, title: `Vorlage ${tag}`, status: "draft", slug, visibility: "public" })
      .select("id")
      .single();
    if (error) throw new Error("Vorlage: " + error.message);
    tplIds.push(tpl.id);
    const { data: fork } = await admin
      .from("tutorials")
      .insert({ account_id: u.accountId, title: `Kopie ${tag}`, status: "published", visibility: "public", slug, published_at: new Date().toISOString() })
      .select("id")
      .single();
    await admin.from("steps").insert({ tutorial_id: fork.id, position: 1, title: `Schritt ${tag}`, is_decision: false });
    await admin.from("account_templates").insert({ account_id: u.accountId, template_id: tpl.id, enabled, forked_tutorial_id: fork.id });
    return { tplId: tpl.id, forkId: fork.id, slug };
  };
  const visible = async (slug) => {
    await go(page, `/h/${u.slug}/${slug}`);
    return !/nicht gefunden/i.test(await bodyText(page));
  };
  try {
    // 1) Nachstellung des alten Verhaltens: Vorlage einfach loeschen -> Kopie taucht auf
    const a = await mk("alt", false);
    await admin.from("tutorials").delete().eq("id", a.tplId);
    info(`Ohne Schutz: abgeschaltete Kopie nach dem Loeschen oeffentlich = ${await visible(a.slug)}`);
    // 2) Mit retireHiddenTemplateForks (wie deleteTemplate jetzt): abgeschaltet + zurueckgezogen
    const b = await mk("aus", false);
    const c = await mk("an", true); // Vorlage zurueckgezogen (Entwurf), Kopie aktiviert -> auch verborgen
    const r1 = await mod.retireHiddenTemplateForks(admin, b.tplId);
    const r2 = await mod.retireHiddenTemplateForks(admin, c.tplId);
    await admin.from("tutorials").delete().in("id", [b.tplId, c.tplId]);
    check(r1.length === 1 && r2.length === 1, "Verborgene Kopien erkannt", "Verborgene Kopien nicht erkannt", JSON.stringify({ r1, r2 }));
    const vb = await visible(b.slug);
    const vc = await visible(c.slug);
    check(!vb && !vc, "Nach dem Loeschen der Vorlage bleiben verborgene Kopien unsichtbar", "Loeschen einer Vorlage macht abgeschaltete Kunden-Kopien oeffentlich", `abgeschaltet sichtbar=${vb}, zurueckgezogen sichtbar=${vc}`);
    const { data: forks } = await admin.from("tutorials").select("id, status").in("id", [b.forkId, c.forkId]);
    check(forks.every((f) => f.status === "draft"), "Kopien bleiben als Entwurf erhalten", "Kopien verloren/falscher Status", JSON.stringify(forks));
  } catch (e) {
    bug("Phase E abgebrochen", String(e?.stack || e));
  } finally {
    if (tplIds.length) await admin.from("tutorials").delete().in("id", tplIds).is("account_id", null);
    await ctx.close();
  }
}

// Reste abgebrochener Laeufe (Prozess von aussen beendet -> kein finally) wegraeumen:
// NUR Wegwerf-Nutzer dieses Skripts (steply-areas-…@example.com) und deren Konten, in denen
// sie allein sind, plus Entwurfs-Vorlagen aus Phase E. `minAgeMs` schuetzt parallele Laeufe.
async function purgeLeftovers(minAgeMs) {
  const re = /^steply-areas-[a-z0-9-]+-\d+@example\.com$/;
  let n = 0;
  for (let pageNo = 1; pageNo < 50; pageNo++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pageNo, perPage: 200 });
    if (error || !data?.users?.length) break;
    for (const usr of data.users) {
      if (!re.test(usr.email || "")) continue;
      if (Date.now() - new Date(usr.created_at).getTime() < minAgeMs) continue;
      const { data: mems } = await admin.from("account_members").select("account_id").eq("user_id", usr.id);
      for (const m of mems ?? []) {
        const { count } = await admin.from("account_members").select("user_id", { count: "exact", head: true }).eq("account_id", m.account_id);
        if ((count ?? 0) <= 1) await admin.from("accounts").delete().eq("id", m.account_id);
      }
      await admin.auth.admin.deleteUser(usr.id).catch(() => {});
      n++;
    }
    if (data.users.length < 200) break;
  }
  const { data: tpls } = await admin.from("tutorials").select("id, slug, created_at").eq("is_template", true).is("account_id", null).like("slug", "vorlage-%");
  const oldTpls = (tpls ?? []).filter((t) => /^vorlage-(alt|aus|an)-\d+$/.test(t.slug || "") && Date.now() - new Date(t.created_at).getTime() >= minAgeMs);
  if (oldTpls.length) await admin.from("tutorials").delete().in("id", oldTpls.map((t) => t.id)).is("account_id", null);
  if (n || oldTpls.length) info(`Reste frueherer Laeufe entfernt: ${n} Nutzer, ${oldTpls.length} Vorlagen`);
}

const PHASE_FNS = { A: phaseA, B: phaseB, C: phaseC, D: phaseD, E: phaseE, F: phaseF, G: phaseG, H: phaseH };

if (process.env.PURGE === "1") {
  await purgeLeftovers(0);
  process.exit(0);
}
try {
  await purgeLeftovers(2 * 60 * 60 * 1000);
  const res = await fetch(`${BASE}/robots.txt`).catch(() => null);
  if (!res || res.status !== 200) throw new Error("Server nicht erreichbar: " + BASE + " (erst `next build` + `next start`)");
  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  for (const p of PHASES) {
    if (PHASE_FNS[p]) await PHASE_FNS[p]();
  }
} catch (e) {
  bug("Skript-Abbruch", String(e?.stack || e));
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const a of cleanup.automations) await admin.from("automations").delete().eq("id", a).then(() => {}, () => {});
  for (const a of cleanup.accounts) await admin.from("accounts").delete().eq("id", a).then(() => {}, () => {});
  for (const u of cleanup.users) await admin.auth.admin.deleteUser(u).catch(() => {});
}

writeFileSync(path.join(SHOT_DIR, "bericht.json"), JSON.stringify({ findings, consoleErrors, httpErrors }, null, 2), "utf8");
console.log("\n──────── Zusammenfassung ────────");
console.log(`ok: ${passed}, Befunde: ${findings.length}, JS-Fehler: ${consoleErrors.length}, HTTP 4xx/5xx: ${httpErrors.length}`);
for (const f of findings) console.log(`  [${f.phase}] ${f.title}`);
for (const c of consoleErrors) console.log(`  [js ${c.phase}] ${c.text.slice(0, 200)}`);
for (const h of httpErrors) console.log(`  [http ${h.phase}] ${h.status} ${h.method} ${h.url.slice(0, 160)}`);
process.exit(findings.length || consoleErrors.length || httpErrors.length ? 1 : 0);
