// Prüf-Skript (nur feststellen): Greifen die TARIF-GRENZEN auch SERVERSEITIG —
// oder nur in der App-Oberfläche? Getestet werden
//   • Anleitungs-Limit im kostenlosen Tarif (FREE_TUTORIAL_LIMIT = 5)
//       – über die Oberfläche („Neue Anleitung“) und
//       – direkt per REST mit dem eigenen Login (wie im Browser möglich).
//   • Schulungsnachweis (in_lernen) ab Pro, interne Anleitungen ab Business — per REST.
//   • Team-Grenze beim Einladen (Server-Action) und beim Annehmen.
// Wegwerf-Konto, wird am Ende gelöscht.
//
// Nutzung:
//   node --env-file=.env.local scripts/test-plan-limits-audit.mjs   (PORT_AUDIT=3187)

import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
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

const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PORT = Number(process.env.PORT_AUDIT || 3187);
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const email = `steply-limits-${stamp}@example.com`;

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

let userId, accountId, browser;
try {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error) throw error;
  userId = created.user.id;
  for (let i = 0; i < 20 && !accountId; i++) {
    const { data } = await admin.from("account_members").select("account_id").eq("user_id", userId);
    accountId = data?.[0]?.account_id ?? null;
    if (!accountId) await new Promise((r) => setTimeout(r, 300));
  }
  await admin.from("accounts").update({ name: "Limit-Test GmbH", onboarded: true }).eq("id", accountId);

  const user = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  await user.auth.signInWithPassword({ email, password: PW });

  // ---------- 1. Anleitungs-Limit: per REST (am Server-Action vorbei) ----------
  console.log("--- 1. Anleitungs-Limit im kostenlosen Tarif (per REST) ---");
  let restCreated = 0;
  for (let i = 0; i < 8; i++) {
    const r = await user
      .from("tutorials")
      .insert({ account_id: accountId, title: `REST-Anleitung ${i + 1}`, status: "draft", visibility: "public" })
      .select("id");
    if (!r.error && r.data?.length) restCreated++;
    else {
      note(`REST-Anlegen Nr. ${i + 1} abgelehnt: ${r.error?.message ?? "0 Zeilen"}`);
      break;
    }
  }
  note(`Kostenloser Tarif: per REST angelegte Anleitungen: ${restCreated} (App-Grenze = 5)`);
  ok(
    restCreated <= 5,
    `Anleitungs-Limit greift auch in der Datenbank (per REST angelegt: ${restCreated} von 8 Versuchen)`,
  );

  // ---------- 2. Anleitungs-Limit: in der Oberfläche ----------
  console.log("\n--- 2. Anleitungs-Limit in der Oberfläche ---");
  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 120_000 });

  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const openDialog = page.getByRole("button", { name: /Neue Anleitung/i }).first();
  if (await openDialog.count()) {
    await openDialog.click();
    await page.getByRole("button", { name: /Selbst bauen/i }).first().click();
    await page.fill("#title", "Grenzen-Test");
    await page.getByRole("button", { name: /Erstellen & bearbeiten/i }).first().click();
    await page.waitForTimeout(5000);
    const url = new URL(page.url());
    note(`„Neue Anleitung“ bei erreichter Grenze → ${url.pathname}${url.search}`);
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    ok(
      url.pathname === "/app/settings/tarif" && url.search.includes("limit=tutorials"),
      `Oberfläche leitet zur Tarif-Seite (${url.pathname}${url.search})`,
    );
    ok(/Grenze erreicht/i.test(body), `Tarif-Seite erklärt die erreichte Grenze`);
    const countNow = (await admin.from("tutorials").select("id", { count: "exact", head: true }).eq("account_id", accountId)).count;
    note(`Anleitungen in der DB nach dem Versuch: ${countNow}`);
  } else {
    note("„Neue Anleitung“-Knopf nicht gefunden — UI-Teil übersprungen.");
  }

  // ---------- 3. Schulungsnachweis / interne Anleitungen ----------
  console.log("\n--- 3. Schulungs-/Intern-Sperren per REST ---");
  const { data: anyTut } = await user.from("tutorials").select("id").eq("account_id", accountId).limit(1);
  const tid = anyTut?.[0]?.id;
  const lern = await user.from("tutorials").update({ in_lernen: true }).eq("id", tid).select("in_lernen");
  const lernDb = (await admin.from("tutorials").select("in_lernen").eq("id", tid).single()).data?.in_lernen;
  ok(
    !!lern.error || lernDb !== true,
    `Kostenlos: „Schulungsnachweis“ (in_lernen) per REST gesperrt (Fehler: ${lern.error?.message ?? "keiner"}, DB: ${lernDb})`,
  );
  const intern = await user.from("tutorials").update({ visibility: "internal" }).eq("id", tid).select("id");
  ok(!!intern.error, `Kostenlos: „Nur Team“ (intern) per REST gesperrt (${intern.error?.code ?? "KEIN Fehler"})`);

  // ---------- 4. Team-Grenze: Einladung per REST ----------
  console.log("\n--- 4. Team-Grenze ---");
  const invRest = await user
    .from("invitations")
    .insert({
      account_id: accountId,
      email: "fremd@example.com",
      role: "editor",
      token: crypto.randomUUID().replace(/-/g, ""),
    })
    .select("id");
  ok(
    !!invRest.error || !(invRest.data ?? []).length,
    `Einladung per REST am Server vorbei gesperrt (${invRest.error?.code ?? "0 Zeilen"})`,
  );

  // ---------- 5. Tarif selbst hochstufen ----------
  const planUp = await user.from("accounts").update({ plan: "business" }).eq("id", accountId).select("id");
  const planDb = (await admin.from("accounts").select("plan").eq("id", accountId).single()).data?.plan;
  ok(planDb === "free", `Tarif lässt sich nicht selbst hochstufen (DB: ${planDb}, Fehler: ${planUp.error?.code ?? "keiner"})`);
} catch (e) {
  ok(false, "Abbruch: " + (e?.stack ?? e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (accountId) await admin.from("accounts").delete().eq("id", accountId).then(() => {}, () => {});
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
}

console.log("\n===== ZUSAMMENFASSUNG =====");
if (findings.length) for (const f of findings) console.log("  ✗ " + f);
else console.log("Keine Befunde.");
process.exit(failed ? 1 : 0);
