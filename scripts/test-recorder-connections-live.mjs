// Steply-Erweiterung: MEHRERE Verbindungen pro Person (eine je Browser/Gerät, Migration 0041).
// Echter Login gegen die echte DB (Wegwerf-Konten, werden am Ende gelöscht), Dev-Server lokal,
// Browser headless. Die Erweiterung wird im Browser nachgestellt (Content-Script-Vertrag:
// DOM-Marker data-steply-recorder + postMessage „steply-pair" -> GET /api/recorder/me ->
// „steply-pair-result"), zwei Browser-Kontexte mit Chrome- bzw. Edge-User-Agent.
//
// ZWEI MODI (automatisch erkannt):
//   * NACH Migration 0041 (Voll-Test): Chrome + Edge verbinden -> BEIDE Tokens gültig;
//     Namen „Chrome · Windows" / „Edge · macOS"; „dieser Browser"; „Neu verbinden" ersetzt nur
//     die eigene Verbindung; zuletzt genutzt wird gepflegt; „Trennen" macht nur diese eine
//     ungültig; 11. Verbindung -> die am längsten ungenutzte fliegt; Team-Entfernen -> ALLE
//     Verbindungen der Person weg.
//   * VOR Migration 0041 (Rückwärts-Kompatibilität): Verbinden + Code funktionieren wie
//     bisher (eine Verbindung je Person, die neue ersetzt die alte), Liste ohne „Trennen".
//
// Nutzung:  node --env-file=.env.local scripts/test-recorder-connections-live.mjs
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
  if (process.env.STEPLY_PW_DIR) {
    const p = path.join(process.env.STEPLY_PW_DIR, "node_modules", "playwright");
    if (existsSync(p)) return require(p);
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

const PORT = Number(process.env.PORT_CONN || 3041);
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const E = { owner: `tutax-conn-owner-${stamp}@example.com`, ed: `tutax-conn-ed-${stamp}@example.com` };
const UA = {
  chrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
};

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
      const r = await fetch(`${BASE}/robots.txt`);
      if (r.status === 200) return true;
    } catch {
      /* noch nicht bereit */
    }
    await sleep(1000);
  }
  return false;
}

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

async function me(token) {
  if (!token) return 0;
  const r = await fetch(`${BASE}/api/recorder/me`, { headers: { Authorization: `Bearer ${token}` } });
  return r.status;
}

async function rowsOf(accountId, userId, cols) {
  const { data, error } = await admin
    .from("recorder_tokens")
    .select(cols)
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Nachgestellte Erweiterung (Vertrag wie extension/content.js + background.js).
function fakeExtension() {
  // Beim Init gibt es documentElement ggf. noch nicht -> zusätzlich nach dem Parsen setzen.
  const mark = () => document.documentElement?.setAttribute("data-steply-recorder", "9.9.9");
  mark();
  document.addEventListener("DOMContentLoaded", mark);
  window.addEventListener("message", async (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.__steply !== true || d.type !== "steply-pair") return;
    let okPair = false;
    let account;
    try {
      const r = await fetch(d.appUrl + "/api/recorder/me", { headers: { Authorization: "Bearer " + d.token } });
      const body = await r.json().catch(() => ({}));
      okPair = r.status === 200 && !!body.account;
      account = body.account;
    } catch {
      /* nicht verbunden */
    }
    if (okPair) localStorage.setItem("__fakeExtToken", d.token);
    window.postMessage(
      { __steply: true, type: "steply-pair-result", ok: okPair, account, error: okPair ? undefined : "abgelehnt" },
      location.origin,
    );
  });
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 90_000 });
}

async function openSettings(page) {
  await page.goto(`${BASE}/app/settings/erweiterung`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByTestId("extension-status").waitFor({ timeout: 60_000 });
  // Status erst nach der Erkennung (setTimeout 0) aussagekräftig.
  await page.waitForFunction(
    () => document.querySelector('[data-testid="extension-status"]')?.getAttribute("data-state") !== "wait",
    null,
    { timeout: 30_000 },
  );
}

async function pairVia(page, buttonName) {
  await page.getByRole("button", { name: buttonName }).click();
  await page.getByText(/Steply-Erweiterung verbunden/).first().waitFor({ timeout: 60_000 });
  // Aufräumen (Trennen der alten Verbindung) + Refresh laufen nach dem Toast weiter.
  await page.getByRole("button", { name: buttonName }).waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
  await sleep(1500);
  return page.evaluate(() => localStorage.getItem("__fakeExtToken"));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Gibt den neu erzeugten Code zurück. Gewartet wird auf den NEUEN Wert im Code-Feld: die
// Server-Aktion antwortet erst nach Anlegen + Aufräumen (10er-Grenze). Ein Warten auf den
// Toast reicht nicht — der vom vorigen Aufruf ist oft noch sichtbar (Test-Race).
async function manualCode(page) {
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
  const token = await handle.jsonValue();
  if (!UUID_RE.test(token)) throw new Error("Kein neuer Code im Feld");
  return token;
}

// Status-Karte: auf den erwarteten Titel WARTEN (die Erkennung der Erweiterung + „dieser
// Browser" kommen per setTimeout nach dem Laden; ein sofortiges count() war ein Test-Race).
async function statusIs(page, title) {
  return page
    .getByTestId("extension-status")
    .locator("b", { hasText: new RegExp("^" + title + "$") })
    .waitFor({ timeout: 15_000 })
    .then(() => true, () => false);
}

const users = new Set();
const accounts = new Set();
let server, browser;
try {
  // ---------- Modus erkennen ----------
  const probe = await admin.from("recorder_tokens").select("id, label, last_used_at").limit(1);
  const migrated = !probe.error;
  console.log(migrated ? "… Migration 0041 ist angewendet -> Voll-Test" : "… Migration 0041 fehlt -> Rückwärts-Kompatibilitäts-Test");

  // ---------- Wegwerf-Inhaber ----------
  const cu = await admin.auth.admin.createUser({ email: E.owner, password: PW, email_confirm: true });
  if (cu.error) throw cu.error;
  const ownerId = cu.data.user.id;
  users.add(ownerId);
  const { data: om } = await admin.from("account_members").select("account_id").eq("user_id", ownerId);
  const accId = om[0].account_id;
  accounts.add(accId);
  await admin.from("accounts").update({ name: `Verbindungen Test ${stamp}`, onboarded: true, plan: "business" }).eq("id", accId);

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], { cwd: path.join(__dirname, ".."), shell: true, stdio: "ignore" });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const mkCtx = async (ua) => {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 950 }, userAgent: ua });
    await ctx.addInitScript(fakeExtension);
    return ctx;
  };
  const chrome = await (await mkCtx(UA.chrome)).newPage();
  const edge = await (await mkCtx(UA.edge)).newPage();
  await login(chrome, E.owner);
  await login(edge, E.owner);

  // ---------- Chrome verbinden ----------
  await openSettings(chrome);
  if (process.env.DEBUG_CONN) console.log("  Status:", await chrome.getByTestId("extension-status").innerText(), await chrome.evaluate(() => document.documentElement.getAttribute("data-steply-recorder")));
  ok(await statusIs(chrome, "Installiert – noch nicht verbunden"), "Chrome: „Installiert – noch nicht verbunden“");
  const tChrome = await pairVia(chrome, "Jetzt verbinden");
  ok((await me(tChrome)) === 200, "Chrome: verbunden, Token gültig");

  // ---------- Edge verbinden (der eigentliche Fehler: Chrome flog raus) ----------
  await openSettings(edge);
  const tEdge = await pairVia(edge, "Diesen Browser verbinden");
  ok((await me(tEdge)) === 200, "Edge: verbunden, Token gültig");

  if (!migrated) {
    // Altes Verhalten bleibt stabil, bis die Migration angewendet ist.
    const rows = await rowsOf(accId, ownerId, "token");
    ok(rows.length === 1 && rows[0].token === tEdge, "Vor 0041: eine Verbindung je Person (Edge ersetzt Chrome wie bisher)");
    ok((await me(tChrome)) === 401, "Vor 0041: Chrome-Token ersetzt (bekanntes Altverhalten)");
    await openSettings(edge);
    ok((await edge.getByTestId("recorder-connection").count()) === 1, "Vor 0041: Liste zeigt die eine Verbindung");
    ok((await edge.getByRole("button", { name: /trennen/ }).count()) === 0, "Vor 0041: kein „Trennen“ (keine Kennung)");
    await manualCode(edge);
    ok((await rowsOf(accId, ownerId, "token")).length === 1, "Vor 0041: Code manuell erzeugen funktioniert");
  } else {
    let rows = await rowsOf(accId, ownerId, "id, token, label, created_at, last_used_at");
    ok(rows.length === 2, `Zwei Verbindungen in der DB (${rows.length})`);
    ok((await me(tChrome)) === 200 && (await me(tEdge)) === 200, "Chrome UND Edge gültig – Edge hat Chrome NICHT getrennt");
    const rowChrome = rows.find((r) => r.token === tChrome);
    const rowEdge = rows.find((r) => r.token === tEdge);
    ok(rowChrome?.label === "Chrome · Windows" && rowEdge?.label === "Edge · macOS",
      `Namen aus dem User-Agent: „${rowChrome?.label}“ / „${rowEdge?.label}“`);

    // ---------- Liste + „dieser Browser" + Token nie im HTML ----------
    await openSettings(chrome);
    ok(await statusIs(chrome, "Installiert – verbunden"), "Chrome: Status „Installiert – verbunden“ (dieser Browser)");
    ok((await chrome.getByTestId("recorder-connection").count()) === 2, "Liste „Ihre verbundenen Browser“ zeigt 2 Einträge");
    const thisRow = chrome.locator(`[data-connection-id="${rowChrome.id}"]`);
    ok((await thisRow.getByText("dieser Browser").count()) === 1, "Chrome-Eintrag als „dieser Browser“ markiert");
    const listText = await chrome.getByTestId("recorder-connections").innerText();
    ok((listText.match(/verbunden am \d/g) ?? []).length === 2 && (listText.match(/zuletzt genutzt/g) ?? []).length === 2,
      "Liste zeigt „verbunden am …“ und „zuletzt genutzt …“ (beide Tokens wurden schon benutzt)");
    const html = await chrome.content();
    ok(!html.includes(tChrome) && !html.includes(tEdge), "Kein Token im Seiten-HTML (nur Kennungen)");

    // ---------- Neu verbinden ersetzt nur die EIGENE Verbindung ----------
    const tChrome2 = await pairVia(chrome, "Neu verbinden");
    rows = await rowsOf(accId, ownerId, "id, token");
    ok(rows.length === 2 && (await me(tChrome)) === 401 && (await me(tChrome2)) === 200 && (await me(tEdge)) === 200,
      `Neu verbinden (Chrome): alte Chrome-Verbindung ersetzt, Edge bleibt (${rows.length} Zeilen)`);
    const rowChrome2 = rows.find((r) => r.token === tChrome2);

    // ---------- zuletzt genutzt ----------
    let lastUsed = null;
    for (let i = 0; i < 20 && !lastUsed; i++) {
      await sleep(500);
      lastUsed = (await rowsOf(accId, ownerId, "token, last_used_at")).find((r) => r.token === tEdge)?.last_used_at;
    }
    ok(!!lastUsed, "Nutzung setzt „zuletzt genutzt“ (last_used_at)");
    await me(tEdge);
    await sleep(1500);
    const lastUsed2 = (await rowsOf(accId, ownerId, "token, last_used_at")).find((r) => r.token === tEdge)?.last_used_at;
    ok(lastUsed2 === lastUsed, "„zuletzt genutzt“ ist gedrosselt (zweiter Aufruf schreibt nicht)");
    await openSettings(edge);
    ok((await edge.locator(`[data-connection-id="${rowEdge.id}"]`).getByText(/zuletzt genutzt/).count()) === 1,
      "Liste zeigt „zuletzt genutzt …“");

    // ---------- Trennen (in Edge die Chrome-Verbindung) ----------
    await edge.locator(`[data-connection-id="${rowChrome2.id}"]`).getByRole("button", { name: /trennen/ }).click();
    await edge.getByText(/getrennt\./).first().waitFor({ timeout: 30_000 });
    ok((await me(tChrome2)) === 401 && (await me(tEdge)) === 200, "Trennen: nur diese Verbindung ungültig, Edge läuft weiter");
    await sleep(1000);
    ok((await edge.getByTestId("recorder-connection").count()) === 1, "Trennen: Liste aktualisiert (1 Eintrag)");

    // ---------- „Neuen Code erzeugen“ ersetzt den ungenutzten Vorgänger (QA 09/2026) ----------
    // In DERSELBEN Seiten-Sitzung wird der eben erzeugte, nie eingelöste Code ersetzt —
    // sonst sammelten sich bei jedem Klick dauerhaft gültige Karteileichen an.
    await openSettings(edge);
    const codeA = await manualCode(edge);
    const codeB = await manualCode(edge);
    ok((await me(codeA)) === 401, "Neuer Code ersetzt den ungenutzten Vorgänger derselben Sitzung");
    ok(
      (await rowsOf(accId, ownerId, "id")).length === 2,
      `… und hinterlässt keine Karteileiche (${(await rowsOf(accId, ownerId, "id")).length} Zeilen)`,
    );

    // ---------- Begrenzung: max. 10, die am längsten ungenutzte fliegt ----------
    // Jeder weitere Code kommt aus einer FRISCHEN Seiten-Sitzung (Neuladen) — dann ersetzt
    // er nichts, und die Begrenzung lässt sich wie bisher prüfen.
    const codes = [codeB];
    while ((await rowsOf(accId, ownerId, "id")).length < 10) {
      await openSettings(edge);
      codes.push(await manualCode(edge));
    }
    ok((await rowsOf(accId, ownerId, "id")).length === 10, "10 Verbindungen möglich");
    // Edge gerade benutzt -> darf nicht fliegen; der älteste ungenutzte Code schon.
    await admin.from("recorder_tokens").update({ last_used_at: new Date().toISOString() }).eq("token", tEdge);
    await openSettings(edge); // frische Sitzung -> der 11. Code ersetzt keinen Vorgänger
    const code11 = await manualCode(edge);
    rows = await rowsOf(accId, ownerId, "token, label");
    ok(rows.length === 10, `11. Verbindung: weiterhin 10 (${rows.length})`);
    ok(!rows.some((r) => r.token === codes[0]) && (await me(codes[0])) === 401, "11. Verbindung: die am längsten ungenutzte ist entfernt");
    ok((await me(tEdge)) === 200 && (await me(codes[1])) === 200 && (await me(code11)) === 200,
      "11. Verbindung: kürzlich genutzte, neuere und die neue bleiben gültig");
    ok(rows.some((r) => r.label === "Edge · macOS (Code)"), "Manueller Code ist als „(Code)“ benannt");

    // ---------- Team-Entfernen löscht ALLE Verbindungen der Person ----------
    const ce = await admin.auth.admin.createUser({ email: E.ed, password: PW, email_confirm: true });
    if (ce.error) throw ce.error;
    const edId = ce.data.user.id;
    users.add(edId);
    for (const m of (await admin.from("account_members").select("account_id").eq("user_id", edId)).data ?? []) accounts.add(m.account_id);
    const mi = await admin.from("account_members").insert({ account_id: accId, user_id: edId, role: "editor" });
    if (mi.error) throw mi.error;
    await admin.auth.admin.updateUserById(edId, { user_metadata: { active_account_id: accId } });
    const ep = await (await mkCtx(UA.chrome)).newPage();
    await login(ep, E.ed);
    await openSettings(ep);
    await manualCode(ep);
    await openSettings(ep); // frische Sitzung -> zweiter Code ersetzt den ersten nicht
    await manualCode(ep);
    const edRows = await rowsOf(accId, edId, "token");
    const edStatus = await Promise.all(edRows.map((r) => me(r.token)));
    ok(edRows.length === 2 && edStatus.every((s) => s === 200), `Bearbeiter: zwei eigene Verbindungen gültig (${edStatus.join(",")})`);
    await edge.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    // Seit Commit 807cab2 Steply-Dialog statt Browser-confirm(): dort „Entfernen“ bestätigen.
    await edge.getByRole("button", { name: `${E.ed} entfernen` }).click();
    await edge.getByRole("button", { name: "Entfernen", exact: true }).click({ timeout: 20_000 });
    await edge.getByText("wurde aus dem Team entfernt").waitFor({ timeout: 30_000 });
    const after = await Promise.all(edRows.map((r) => me(r.token)));
    ok(after.every((s) => s === 401) && (await rowsOf(accId, edId, "token")).length === 0,
      `Team-Entfernen: ALLE Verbindungen der Person weg (${after.join(",")})`);
    ok((await me(tEdge)) === 200, "Team-Entfernen: Verbindungen des Inhabers unberührt");
  }
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) killPort(PORT);
  for (const a of accounts) await admin.from("accounts").delete().eq("id", a).then(() => {}, () => {});
  for (const u of users) await admin.auth.admin.deleteUser(u).catch(() => {});
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Erweiterungs-Verbindungen verifiziert.");
process.exit(failed ? 1 : 0);
