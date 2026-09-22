// „Texte mit KI verbessern“ im Anleitungs-Editor (09/2026) — End-to-End, headless.
// Echter Login gegen die echte DB mit einem WEGWERF-Konto, eigener `next dev`, echte KI.
// Prüft: Eintrag im „…“-Menü öffnet den Dialog; Knopf über dem Ablauf → Dialog mit Vorschlägen
// alt → neu (Häkchen an); „Übernehmen“ → DB hat neue Texte (Wert „account“ + Enter erhalten,
// formatierter Text unverändert); „Rückgängig“ → alte Titel/Texte (inkl. Formatierung) zurück;
// Stunden-Zähler im app_metadata zählt die Läufe. Screenshot des Dialogs.
//
// Nutzung:  node --env-file=.env.local scripts/test-improve-texts-ui.mjs
//           (TEST_PORT=… für einen anderen Port, SHOT_DIR=… für den Screenshot-Ordner)
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
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

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const PORT = Number(process.env.TEST_PORT || 3047);
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const email = `tutax-kitexte-${stamp}@example.com`;
const SHOT_DIR = process.env.SHOT_DIR || os.tmpdir();

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

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

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 120_000 });
}

const para = (text) => ({ type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] });
const BOLD = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Wichtig: ", marks: [{ type: "bold" }] }, { type: "text", text: "Klicken Sie auf „Confirm“." }] }],
};
const SEED = [
  { title: "Klicken Sie auf „Home“", body: para(""), selector: { role: "link", text: "Home" } },
  { title: "Klicken Sie auf „Account menu“", body: para(""), selector: { role: "button", text: "Account menu" } },
  {
    title: "„account“ in „Search query“ eingeben",
    body: para("Geben Sie „account“ ein und bestätigen Sie mit Enter."),
    selector: { role: "textbox", text: "Search query" },
    interaction: { enter: true },
  },
  { title: "Klicken Sie auf „Confirm“", body: BOLD, selector: { role: "button", text: "Confirm" } },
];

let server, browser, userId, accountId;
try {
  const created = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const { data: members } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = members[0].account_id;
  await admin.from("accounts").update({ name: "KI-Texte-Test GmbH", onboarded: true, plan: "business" }).eq("id", accountId);

  const { data: tut, error: tErr } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title: "Kontoinformationen auf X ansehen", status: "draft", visibility: "public", in_lernen: false, site_domains: ["x.com"] })
    .select("id")
    .single();
  if (tErr) throw tErr;
  const tutorialId = tut.id;
  const { data: stepRows, error: sErr } = await admin
    .from("steps")
    .insert(SEED.map((s, i) => ({ tutorial_id: tutorialId, position: i + 1, is_decision: false, ...s })))
    .select("id, position");
  if (sErr) throw sErr;
  const ids = stepRows.sort((a, b) => a.position - b.position).map((s) => s.id);
  await admin.from("tutorials").update({ root_step_id: ids[0] }).eq("id", tutorialId);
  const { error: bErr } = await admin
    .from("step_branches")
    .insert(ids.slice(0, -1).map((id, i) => ({ step_id: id, label: null, target_step_id: ids[i + 1], position: 0 })));
  if (bErr) throw bErr;
  const readSteps = async () => {
    const { data } = await admin.from("steps").select("id, title, body").in("id", ids);
    return ids.map((id) => data.find((d) => d.id === id));
  };
  const plain = (b) => JSON.stringify(b ?? null);

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], { cwd: path.join(__dirname, ".."), shell: true, stdio: "ignore" });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  await login(page);
  await page.goto(`${BASE}/app/tutorials/${tutorialId}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.getByTestId("improve-texts").waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  const dialog = page.getByTestId("improve-texts-dialog");

  // ---- 1) „…“-Menü öffnet denselben Dialog ----
  await page.getByTestId("editor-more").click();
  const menuItem = page.getByTestId("menu-improve-texts");
  await menuItem.waitFor({ timeout: 10_000 });
  ok(await menuItem.isVisible(), "„…“-Menü: Eintrag „Texte mit KI verbessern“ sichtbar");
  await menuItem.click();
  await dialog.waitFor({ timeout: 10_000 });
  ok(true, "Menü-Eintrag öffnet den Dialog");
  await page.getByTestId("improve-texts-list").or(page.getByTestId("improve-texts-error")).or(page.getByTestId("improve-texts-empty")).waitFor({ timeout: 60_000 });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 10_000 });

  // ---- 2) Knopf über dem Ablauf → Vorschläge ----
  const before = await readSteps();
  await page.getByTestId("improve-texts").click();
  await dialog.waitFor({ timeout: 10_000 });
  const list = page.getByTestId("improve-texts-list");
  await list.or(page.getByTestId("improve-texts-error")).or(page.getByTestId("improve-texts-empty")).waitFor({ timeout: 60_000 });
  ok(await list.isVisible(), "Dialog zeigt Vorschläge");
  const boxes = list.locator('input[type="checkbox"]');
  const n = await boxes.count();
  ok(n >= 2, `mind. 2 Vorschläge (${n})`);
  let allChecked = true;
  for (let i = 0; i < n; i++) allChecked &&= await boxes.nth(i).isChecked();
  ok(allChecked, "alle Häkchen standardmäßig an");
  console.log("  Dialog-Inhalt:\n  " + (await list.innerText()).replace(/\n/g, "\n  "));
  const shot = path.join(SHOT_DIR, `steply-ki-texte-dialog-${stamp}.png`);
  await dialog.screenshot({ path: shot });
  console.log(`· Screenshot: ${shot}`);
  ok((await readSteps()).every((s, i) => s.title === before[i].title), "Vorschläge ändern noch nichts in der DB");

  // ---- 3) Übernehmen ----
  await page.getByTestId("improve-texts-apply").click();
  await page.getByText(/Schritte? verbessert/).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const after = await readSteps();
  const changed = after.filter((s, i) => s.title !== before[i].title).length;
  ok(changed === n, `DB: ${changed} Titel geändert (= Anzahl Vorschläge ${n})`);
  console.log("  Nachher (DB): " + after.map((s) => s.title).join(" | "));
  const s3 = after[2];
  ok(!after.some((s) => /^Klicken Sie/.test(s.title) && before.find((b) => b.id === s.id).title !== s.title),
    "neue Titel sind keine „Klicken Sie …“-Vorlagen");
  ok(`${s3.title} ${plain(s3.body)}`.includes("account"), "Eingabe-Schritt: Wert „account“ erhalten");
  ok(/Enter/i.test(`${s3.title} ${plain(s3.body)}`), "Eingabe-Schritt: Enter erhalten");
  ok(plain(after[3].body) === plain(before[3].body) && plain(after[3].body).includes("bold"), "formatierter Text (fett) bleibt unverändert");
  const flow = await page.locator("main").last().innerText();
  ok(after.every((s) => flow.includes(s.title)), "Ablauf zeigt die neuen Titel sofort");

  // ---- 4) Rückgängig ----
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await page.getByText("Alte Texte wiederhergestellt").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const undone = await readSteps();
  ok(undone.every((s, i) => s.title === before[i].title), "Rückgängig: alte Titel zurück");
  ok(undone.every((s, i) => plain(s.body) === plain(before[i].body)), "Rückgängig: alte Texte (inkl. Formatierung) zurück");
  const flow2 = await page.locator("main").last().innerText();
  ok(before.every((s) => flow2.includes(s.title)), "Ablauf zeigt wieder die alten Titel");

  // ---- 5) Kostenbremse: Zähler im app_metadata ----
  const { data: u } = await admin.auth.admin.getUserById(userId);
  const runs = u.user.app_metadata?.ai_text_runs;
  ok(runs && runs.n >= 2 && runs.h === Math.floor(Date.now() / 3_600_000), `Stunden-Zähler: ${JSON.stringify(runs)}`);
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
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    console.log(`· Wegwerf-Nutzer gelöscht: ${!error}`);
  }
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ „Texte mit KI verbessern“ verifiziert.");
process.exit(failed ? 1 : 0);
