// Admin-Kundenverwaltung (/admin/kunden) — headless gegen einen laufenden Server.
// Legt vorübergehend einen Wegwerf-Admin + einen Wegwerf-Kunden an und räumt alles wieder weg.
//
// Nutzung:  TEST_BASE=http://localhost:3097 node --env-file=.env.local scripts/test-admin-customers.mjs
//           SKIP_MAIL=1 -> „Passwort-Link schicken“ nicht wirklich auslösen (Mail-Kontingent)
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
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

const BASE = process.env.TEST_BASE || "http://localhost:3097";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
  if (!cond) failed++;
};
const stamp = Date.now().toString(36);
const PW = "Probe12345!";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function mkUser(tag) {
  const email = `admin-kd-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", data.user.id).single();
  return { email, uid: data.user.id, acc: m?.account_id ?? null };
}
async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').first().fill(email);
  await page.locator('input[name="password"]').first().fill(PW);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/app|\/onboarding/, { timeout: 60_000 });
}

const cleanupUsers = [];
const cleanupAccounts = [];
const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
try {
  // ── Aufbau ──
  const boss = await mkUser("admin");
  cleanupUsers.push(boss.uid);
  cleanupAccounts.push(boss.acc);
  await admin.from("accounts").update({ onboarded: true }).eq("id", boss.acc);
  await admin.from("admins").insert({ user_id: boss.uid });

  const owner = await mkUser("owner");
  const editor = await mkUser("editor");
  cleanupUsers.push(owner.uid, editor.uid);
  cleanupAccounts.push(owner.acc, editor.acc);
  const CUST = `Kunde Probe ${stamp}`;
  await admin.from("accounts").update({ name: CUST, onboarded: true, slug: `kunde-probe-${stamp}` }).eq("id", owner.acc);
  // Editor NUR in der Kunden-Org (eigene Org weg) -> muss beim Löschen mit weg
  await admin.from("accounts").delete().eq("id", editor.acc);
  await admin.from("account_members").insert({ account_id: owner.acc, user_id: editor.uid, role: "editor" });
  const { data: tut } = await admin
    .from("tutorials")
    .insert({ account_id: owner.acc, title: "Probe-Anleitung", status: "published", visibility: "public", slug: "probe" })
    .select("id")
    .single();
  // Entwurf mit Schritt + Bild (für die Admin-Vorschau)
  const { data: draft } = await admin
    .from("tutorials")
    .insert({ account_id: owner.acc, title: "Entwurf-Probe", status: "draft", visibility: "public" })
    .select("id")
    .single();
  const draftImg = `${owner.acc}/${draft.id}/schritt.png`;
  await admin.storage.from("tutorial-images").upload(draftImg, PNG, { contentType: "image/png", upsert: true });
  const { data: dStep } = await admin
    .from("steps")
    .insert({ tutorial_id: draft.id, title: "Erster Entwurfsschritt", position: 0, image_path: draftImg, image_width: 1, image_height: 1 })
    .select("id")
    .single();
  await admin.from("tutorials").update({ root_step_id: dStep.id }).eq("id", draft.id);
  await admin.from("invitations").insert({ account_id: owner.acc, email: `einladung-${stamp}@example.com`, role: "member", token: `t${stamp}${Math.random().toString(36).slice(2)}`, status: "pending", invited_by: owner.uid });
  for (const b of ["tutorial-images", "tutorial-images-public", "tutorial-videos"]) {
    await admin.storage.from(b).upload(`${owner.acc}/${tut.id}/probe.png`, PNG, { contentType: "image/png", upsert: true });
  }

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await login(page, boss.email);

  // ── Liste ──
  await page.goto(`${BASE}/admin/kunden`, { waitUntil: "networkidle" });
  ok(await page.getByRole("heading", { name: "Kunden" }).isVisible(), "Liste: Seite „Kunden“ lädt");
  ok(await page.getByTestId("customer-stats").isVisible(), "Liste: Kennzahlen sichtbar");
  const total = await page.getByTestId("customer-row").count();
  ok(total >= 2, `Liste: ${total} Kunden gelistet`);
  await page.getByLabel("Kunden suchen").fill(owner.email);
  await page.waitForTimeout(300);
  ok((await page.getByTestId("customer-row").count()) === 1, "Suche nach Inhaber-E-Mail findet genau den Kunden");
  const row = page.getByTestId("customer-row").first();
  const rowTxt = (await row.innerText()).replace(/\s+/g, " ");
  ok(rowTxt.includes(CUST) && rowTxt.includes("Gratis"), `Zeile zeigt Name + Tarif („${rowTxt.slice(0, 90)}…“)`);
  ok(/\b2\b/.test(rowTxt) && rowTxt.includes("+1") && rowTxt.includes("1/2"), "Zeile zeigt Team (2 +1 Einladung) und Anleitungen (1/2: ein Entwurf)");
  await page.getByLabel("Kunden suchen").fill("");
  await page.getByRole("button", { name: /^Business \(/ }).click();
  const bizRows = await page.getByTestId("customer-row").allInnerTexts();
  ok(bizRows.every((t) => t.includes("Business")), `Filter „Business“ zeigt nur Business (${bizRows.length})`);
  await page.getByRole("button", { name: /^Alle \(/ }).click();

  // ── Details ──
  await page.goto(`${BASE}/admin/kunden/${owner.acc}`, { waitUntil: "networkidle" });
  ok(await page.getByRole("heading", { name: new RegExp(CUST) }).isVisible(), "Details: Kopf mit Name");
  ok((await page.getByTestId("member-row").count()) === 2, "Details: 2 Teammitglieder");
  const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  ok(body.includes("Inhaber") && body.includes("Bearbeiter"), "Details: Rollen Inhaber/Bearbeiter");
  ok(/offene einladungen/i.test(body) && body.includes(`einladung-${stamp}@example.com`), "Details: offene Einladung");
  ok(body.includes("Probe-Anleitung") && body.includes("Veröffentlicht"), "Details: Anleitung mit Status");

  // Admin-Vorschau: auch ENTWÜRFE ansehen (nur lesend, zählt nicht in die Kunden-Statistik)
  const { count: viewsBefore } = await admin.from("events").select("id", { count: "exact", head: true }).eq("account_id", owner.acc);
  await page.getByTestId("tutorial-row").filter({ hasText: "Entwurf-Probe" }).getByTestId("tutorial-preview-link").click();
  await page.waitForURL(/\/admin\/kunden\/.+\/anleitung\//, { timeout: 30_000 });
  await page.getByTestId("admin-preview-bar").waitFor({ timeout: 30_000 });
  const bar = await page.getByTestId("admin-preview-bar").innerText();
  ok(/Entwurf/.test(bar) && bar.includes(CUST), `Vorschau: Leiste zeigt Kunde + „Entwurf“ („${bar.replace(/\s+/g, " ")}“)`);
  ok(await page.getByText("Erster Entwurfsschritt").first().isVisible().catch(() => false), "Vorschau: Schritt des Entwurfs sichtbar");
  // Bild kommt per signierter URL aus dem privaten Speicher — aufs fertige Laden warten.
  const imgOk = await page
    .waitForFunction(() => [...document.images].some((e) => e.src.includes("tutorial-images") && e.complete && e.naturalWidth > 0), null, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!imgOk) console.log("  ℹ Bilder:", JSON.stringify(await page.locator("img").evaluateAll((els) => els.map((e) => [e.src.slice(0, 90), e.naturalWidth, e.complete]))));
  ok(imgOk, "Vorschau: Bild aus dem privaten Speicher lädt");
  await page.waitForTimeout(1500);
  const { count: viewsAfter } = await admin.from("events").select("id", { count: "exact", head: true }).eq("account_id", owner.acc);
  ok((viewsAfter ?? 0) === (viewsBefore ?? 0), "Vorschau: zählt keinen Aufruf in die Kunden-Statistik");
  const wrong = await page.goto(`${BASE}/admin/kunden/${boss.acc}/anleitung/${draft.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const wrongBody = (await page.locator("body").innerText()).replace(/s+/g, " ");
  // PPR: Statuscode/Titel stehen schon fest (weiches 404) — maßgeblich ist, dass KEIN Inhalt durchsickert.
  ok(!wrongBody.includes("Erster Entwurfsschritt") && !wrongBody.includes("Admin-Vorschau") && /nicht gefunden/i.test(wrongBody), `Vorschau: fremde Kombination zeigt „nicht gefunden“ und keinen Inhalt (HTTP ${wrong?.status()})`);
  await page.goto(`${BASE}/admin/kunden/${owner.acc}`, { waitUntil: "networkidle" });

  // Tarif: Gratis -> Pro -> Gratis (mit Bestätigung)
  const sw = page.getByTestId("plan-switch");
  await sw.getByRole("button", { name: "Pro", exact: true }).click();
  const dlg = page.getByRole("alertdialog").or(page.getByRole("dialog")).first();
  await dlg.waitFor({ timeout: 10_000 });
  ok((await dlg.innerText()).includes("Freigeschaltet"), "Tarif: Bestätigung erklärt, was freigeschaltet wird");
  await dlg.getByRole("button", { name: /Auf Pro umstellen/ }).click();
  await page.getByText("Tarif ist jetzt Pro").waitFor({ timeout: 20_000 }).catch(() => {});
  let { data: accRow } = await admin.from("accounts").select("plan").eq("id", owner.acc).single();
  ok(accRow.plan === "pro", `Tarif: DB steht auf „${accRow.plan}“ (erwartet pro)`);
  await page.waitForTimeout(800);
  await sw.getByRole("button", { name: "Gratis", exact: true }).click();
  await dlg.waitFor({ timeout: 10_000 });
  ok((await dlg.innerText()).includes("Gesperrt"), "Tarif: Herabstufen erklärt, was gesperrt wird");
  await dlg.getByRole("button", { name: /Auf Gratis umstellen/ }).click();
  await page.waitForTimeout(2500);
  ({ data: accRow } = await admin.from("accounts").select("plan").eq("id", owner.acc).single());
  ok(accRow.plan === "free", `Tarif: zurück auf „${accRow.plan}“`);

  // Passwort-Link
  if (!process.env.SKIP_MAIL) {
    await page.getByTestId("member-row").first().getByRole("button", { name: /Passwort-Link/ }).click();
    await dlg.waitFor({ timeout: 10_000 });
    await dlg.getByRole("button", { name: "Link schicken" }).click();
    // Die Meldung des Tarif-Wechsels kann noch stehen — gezielt auf die Link-Meldung warten.
    const toast = page.locator("[data-sonner-toast]").filter({ hasText: /verschickt/ }).first();
    await toast.waitFor({ timeout: 20_000 }).catch(() => {});
    const t = await toast.innerText().catch(() => "");
    ok(/verschickt|nicht verschickt/.test(t), `Passwort-Link: deutsche Rückmeldung („${t.replace(/\s+/g, " ").slice(0, 80)}“)`);
  }

  // Löschen: falscher Name gesperrt, richtiger löscht
  await page.goto(`${BASE}/admin/kunden/${owner.acc}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Kunden löschen" }).click();
  const del = page.getByRole("dialog").first();
  await del.waitFor({ timeout: 10_000 });
  await del.getByLabel("Name der Organisation").fill("Falscher Name");
  ok(await del.getByRole("button", { name: "Endgültig löschen" }).isDisabled(), "Löschen: mit falschem Namen gesperrt");
  await del.getByLabel("Name der Organisation").fill(CUST);
  await del.getByRole("button", { name: "Endgültig löschen" }).click();
  await page.waitForURL(/\/admin\/kunden$/, { timeout: 60_000 }).catch(() => {});
  ok(page.url().endsWith("/admin/kunden"), "Löschen: zurück zur Kundenliste");
  const { data: gone } = await admin.from("accounts").select("id").eq("id", owner.acc).maybeSingle();
  ok(!gone, "Löschen: Organisation ist weg");
  const { count: tutLeft } = await admin.from("tutorials").select("id", { count: "exact", head: true }).eq("account_id", owner.acc);
  ok((tutLeft ?? 0) === 0, "Löschen: Anleitungen sind weg");
  let filesLeft = 0;
  for (const b of ["tutorial-images", "tutorial-images-public", "tutorial-videos"]) {
    const { data } = await admin.storage.from(b).list(`${owner.acc}/${tut.id}`);
    filesLeft += (data ?? []).length;
  }
  ok(filesLeft === 0, `Löschen: Dateien in allen Speicher-Bereichen weg (${filesLeft} übrig)`);
  const { data: u1 } = await admin.auth.admin.getUserById(owner.uid);
  const { data: u2 } = await admin.auth.admin.getUserById(editor.uid);
  ok(!u1?.user && !u2?.user, "Löschen: Personen ohne weitere Organisation sind mit entfernt");
  const { data: bossStill } = await admin.auth.admin.getUserById(boss.uid);
  ok(!!bossStill?.user, "Löschen: Admin bleibt unangetastet");

  // Geschützte Organisation
  const { data: steply } = await admin.from("accounts").select("id").eq("slug", "steply").maybeSingle();
  if (steply) {
    await page.goto(`${BASE}/admin/kunden/${steply.id}`, { waitUntil: "networkidle" });
    ok(await page.getByRole("button", { name: "Kunden löschen" }).isDisabled(), "Steply-eigene Organisation: Löschen gesperrt");
  }
  ok(errors.length === 0, `Keine JS-Fehler im Admin (${errors.slice(0, 2).join(" | ")})`);
  await ctx.close();

  // Nicht-Admin kommt nicht hinein
  const outsider = await mkUser("outsider");
  cleanupUsers.push(outsider.uid);
  cleanupAccounts.push(outsider.acc);
  await admin.from("accounts").update({ onboarded: true }).eq("id", outsider.acc);
  const c2 = await browser.newContext();
  const p2 = await c2.newPage();
  await login(p2, outsider.email);
  await p2.goto(`${BASE}/admin/kunden`, { waitUntil: "domcontentloaded" });
  await p2.waitForURL((u) => !u.pathname.startsWith("/admin"), { timeout: 30_000 }).catch(() => {});
  const leaked = (await p2.content()).includes("customer-stats");
  ok(!new URL(p2.url()).pathname.startsWith("/admin") && !leaked, `Nicht-Admin: kein Zugriff (landet auf ${new URL(p2.url()).pathname})`);
  await c2.close();
} finally {
  await browser.close();
  for (const uid of cleanupUsers) await admin.from("admins").delete().eq("user_id", uid);
  for (const acc of cleanupAccounts) if (acc) await admin.from("accounts").delete().eq("id", acc);
  for (const uid of cleanupUsers) await admin.auth.admin.deleteUser(uid).catch(() => {});
}
console.log(failed ? `\n✗ ${failed} Prüfung(en) fehlgeschlagen` : "\n✓ Admin-Kundenverwaltung verifiziert");
process.exit(failed ? 1 : 0);
