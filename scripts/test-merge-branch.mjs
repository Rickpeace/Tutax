// Runde 5 (Neukunden-Test): Nach einer Frage lässt sich ein Antwort-Weg über „Danach weiter mit“
// wieder mit dem Hauptweg zusammenführen. Prüft live im Editor: Q(Ja→A→C, Nein→B→Ende),
// bei B „Danach weiter mit: C“ → DB-Kante B→C, Ablauf zeigt C als gemeinsamen Folgeschritt.
// Nutzung:  TEST_BASE=http://localhost:3456 node --env-file=.env.local scripts/test-merge-branch.mjs
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
  const npxDir = path.join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
  for (const d of existsSync(npxDir) ? readdirSync(npxDir) : []) {
    const p = path.join(npxDir, d, "node_modules", "playwright");
    if (existsSync(p)) return require(p);
  }
  throw new Error("playwright nicht gefunden.");
}
const BASE = (process.env.TEST_BASE || "http://localhost:3456").replace(/\/$/, "");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
let failed = 0;
const ok = (c, m) => {
  console.log(`${c ? "  ✓" : "  ✗"} ${m}`);
  if (!c) failed++;
};
const stamp = Date.now().toString(36);
const email = `merge-${stamp}@example.com`;
const { data: u } = await admin.auth.admin.createUser({ email, password: "Probe12345!", email_confirm: true });
const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", u.user.id).single();
await admin.from("accounts").update({ onboarded: true, slug: `merge-${stamp}` }).eq("id", m.account_id);
const { data: t } = await admin.from("tutorials").insert({ account_id: m.account_id, title: "Zusammenführen", status: "draft" }).select("id").single();
const mk = async (title, position, is_decision = false) =>
  (await admin.from("steps").insert({ tutorial_id: t.id, title, position, is_decision }).select("id").single()).data.id;
const Q = await mk(`Frage ${stamp}`, 0, true);
const A = await mk(`Ja-Weg ${stamp}`, 1);
const B = await mk(`Nein-Weg ${stamp}`, 2);
const C = await mk(`Gemeinsam ${stamp}`, 3);
await admin.from("step_branches").insert([
  { step_id: Q, label: "Ja", target_step_id: A, position: 0 },
  { step_id: Q, label: "Nein", target_step_id: B, position: 1 },
  { step_id: A, label: null, target_step_id: C, position: 0 },
]);
await admin.from("tutorials").update({ root_step_id: Q }).eq("id", t.id);

const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await page.goto(`${BASE}/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("Probe12345!");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((x) => x.pathname.startsWith("/app"), { timeout: 45000 });
  await page.goto(`${BASE}/app/tutorials/${t.id}`, { waitUntil: "networkidle" });
  await page.getByText(`Nein-Weg ${stamp}`).first().click();
  const trigger = page.getByRole("combobox", { name: "Danach weiter mit" });
  await trigger.waitFor({ timeout: 15000 });
  ok(true, "„Danach weiter mit“ ist beim normalen Schritt sichtbar");
  await trigger.click();
  await page.getByRole("option", { name: new RegExp(`Gemeinsam ${stamp}`) }).click();
  let edge = null;
  for (let i = 0; i < 30; i++) {
    const { data } = await admin.from("step_branches").select("target_step_id").eq("step_id", B);
    if (data?.length) {
      edge = data;
      break;
    }
    await page.waitForTimeout(500);
  }
  ok(edge?.length === 1 && edge[0].target_step_id === C, "DB: Nein-Weg führt jetzt zu „Gemeinsam“");
  await page.goto(`${BASE}/app/tutorials/${t.id}`, { waitUntil: "networkidle" });
  const flowText = await page.locator("body").innerText();
  ok(/Gemeinsam/.test(flowText), "Nach Neuladen: gemeinsamer Folgeschritt im Ablauf");
} catch (e) {
  ok(false, "Fehler: " + (e?.message || e));
} finally {
  await browser.close();
  await admin.from("accounts").delete().eq("id", m.account_id);
  await admin.auth.admin.deleteUser(u.user.id);
}
console.log(failed ? `\n✗ ${failed} Prüfung(en) fehlgeschlagen.` : "\n✓ Antwort-Weg lässt sich mit dem Hauptweg zusammenführen.");
process.exitCode = failed ? 1 : 0;
