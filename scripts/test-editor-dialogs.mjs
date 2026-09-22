// Editor-Dialoge statt Browser-confirm/prompt/alert (UX-Audit-Restpunkte 09/2026).
// Echter Login gegen die echte DB mit einem WEGWERF-Konto (Business), eigener `next dev`.
// Prüft: kein nativer Browser-Dialog; Link-Dialog (ungültige Adresse -> Fehler im Dialog,
// gültige -> https-Link im Text); Verwerfen-Abfrage beim Schließen; Schritt löschen mit
// Steply-Bestätigung (Abbrechen löscht nicht, Bestätigen löscht + Toast).
//
// Nutzung:  node --env-file=.env.local scripts/test-editor-dialogs.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
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

const PORT = Number(process.env.TEST_PORT || 3029);
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const email = `tutax-edlg-${stamp}@example.com`;

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

let server, browser, userId, accountId;
try {
  const created = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const { data: members } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = members[0].account_id;
  await admin.from("accounts").update({ name: "Dialog-Test GmbH", onboarded: true, plan: "business" }).eq("id", accountId);

  const { data: tut, error: tErr } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title: "Dialog-Test", status: "draft", visibility: "public", in_lernen: false })
    .select("id")
    .single();
  if (tErr) throw tErr;
  const tutorialId = tut.id;
  const { data: stepRows, error: sErr } = await admin
    .from("steps")
    .insert(
      ["Anmelden", "Menü öffnen", "Abmelden"].map((title, i) => ({
        tutorial_id: tutorialId,
        position: i + 1,
        title,
        body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `Text ${i + 1}` }] }] },
        is_decision: false,
      })),
    )
    .select("id, position");
  if (sErr) throw sErr;
  const ids = stepRows.sort((a, b) => a.position - b.position).map((s) => s.id);
  await admin.from("tutorials").update({ root_step_id: ids[0] }).eq("id", tutorialId);
  const { error: bErr } = await admin
    .from("step_branches")
    .insert(ids.slice(0, -1).map((id, i) => ({ step_id: id, label: null, target_step_id: ids[i + 1], position: 0 })));
  if (bErr) throw bErr;

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], { cwd: path.join(__dirname, ".."), shell: true, stdio: "ignore" });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const native = [];
  page.on("dialog", async (d) => {
    native.push(`${d.type()}: ${d.message()}`);
    await d.dismiss();
  });
  await login(page);
  await page.goto(`${BASE}/app/tutorials/${tutorialId}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.getByTestId("editor-controls").waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  const panel = page.getByTestId("step-editor-panel");
  const card = (t) => page.locator("main").last().getByRole("button", { name: t }).first();

  // ---- Link-Dialog ----
  await card("Anmelden").click();
  await panel.waitFor({ timeout: 20_000 });
  const pm = panel.locator(".ProseMirror");
  await pm.click();
  await page.keyboard.press("End");
  await page.keyboard.down("Shift");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.up("Shift");
  await panel.getByRole("button", { name: "Link einfügen" }).click();
  const linkDlg = page.getByTestId("link-dialog");
  ok(await linkDlg.waitFor({ timeout: 10_000 }).then(() => true, () => false), "„Link einfügen“ öffnet den Steply-Dialog");
  const url = linkDlg.getByLabel("Link-Adresse");
  await url.fill("keine adresse");
  await linkDlg.getByRole("button", { name: "Link setzen" }).click();
  await page.waitForTimeout(400);
  ok(await linkDlg.isVisible(), "Ungültige Adresse: Dialog bleibt offen");
  ok(await linkDlg.getByText("Bitte eine gültige http(s)-Adresse angeben.").isVisible().catch(() => false), "Ungültige Adresse: Fehlermeldung im Dialog");
  ok((await pm.locator("a").count()) === 0, "Ungültige Adresse: kein Link gesetzt");
  await url.fill("beispiel.de/hilfe");
  await linkDlg.getByRole("button", { name: "Link setzen" }).click();
  await page.waitForTimeout(400);
  ok(!(await linkDlg.isVisible().catch(() => false)), "Gültige Adresse: Dialog schließt");
  ok((await pm.locator("a").first().getAttribute("href").catch(() => null)) === "https://beispiel.de/hilfe", "Link mit https:// ergänzt gesetzt");
  const jsLink = async () => {
    await panel.getByRole("button", { name: "Link entfernen" }).click();
    await page.keyboard.press("End");
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.up("Shift");
    await panel.getByRole("button", { name: "Link einfügen" }).click();
    await url.fill("javascript:alert(1)");
    await linkDlg.getByRole("button", { name: "Link setzen" }).click();
    await page.waitForTimeout(300);
    const stillOpen = await linkDlg.isVisible();
    await linkDlg.getByRole("button", { name: "Abbrechen" }).click();
    return stillOpen;
  };
  ok(await jsLink(), "javascript:-Adresse wird abgewiesen");

  // ---- Verwerfen-Abfrage beim Schließen (ungespeicherter Text) ----
  await panel.getByRole("button", { name: "Editor schließen" }).click();
  const conf = page.getByTestId("confirm-dialog");
  ok(await conf.waitFor({ timeout: 10_000 }).then(() => true, () => false), "Schließen mit Änderungen fragt im Steply-Dialog");
  await conf.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await page.waitForTimeout(300);
  ok(await panel.isVisible(), "„Weiter bearbeiten“: Panel bleibt offen");
  await panel.getByRole("button", { name: "Verwerfen" }).first().click();
  await page.waitForTimeout(300);

  // ---- Schritt löschen ----
  await card("Menü öffnen").click();
  await page.waitForTimeout(800);
  await panel.getByRole("button", { name: /Schritt löschen/ }).click();
  await conf.waitFor({ timeout: 10_000 });
  ok((await conf.innerText()).includes("direkt mit dem nächsten Schritt weiter"), "Löschen-Dialog nennt die Folge (linearer Schritt)");
  await conf.getByRole("button", { name: "Abbrechen" }).click();
  await page.waitForTimeout(800);
  ok(!!(await admin.from("steps").select("id").eq("id", ids[1]).maybeSingle()).data, "Abbrechen löscht nicht");
  await panel.getByRole("button", { name: /Schritt löschen/ }).click();
  await conf.getByRole("button", { name: "Schritt löschen" }).click();
  ok(await page.locator("[data-sonner-toast]", { hasText: "Schritt gelöscht" }).waitFor({ timeout: 10_000 }).then(() => true, () => false), "Toast „Schritt gelöscht“");
  let gone = false;
  for (let i = 0; i < 20 && !gone; i++) {
    gone = !(await admin.from("steps").select("id").eq("id", ids[1]).maybeSingle()).data;
    if (!gone) await new Promise((r) => setTimeout(r, 500));
  }
  ok(gone, "Schritt gelöscht (DB)");
  const { data: br } = await admin.from("step_branches").select("target_step_id").eq("step_id", ids[0]);
  ok(br?.[0]?.target_step_id === ids[2], "Ablauf verbindet Schritt 1 direkt mit Schritt 3");

  ok(native.length === 0, `Kein Browser-Dialog (confirm/prompt/alert) aufgetaucht${native.length ? ": " + native.join(" | ") : ""}`);
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

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Editor-Dialoge verifiziert.");
process.exit(failed ? 1 : 0);
