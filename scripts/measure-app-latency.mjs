// Misst live, wie schnell eingeloggte App-Seiten (Server-Rendering mit Datenbank) antworten und
// wie lange eine typische Server-Aktion (Anleitung umbenennen) bis zur Datenbank braucht.
// Vergleich vorher/nachher, z. B. beim Wechsel der Vercel-Region.
// Nutzung:  TEST_BASE=https://tutax-ivory.vercel.app node --env-file=.env.local scripts/measure-app-latency.mjs
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
const BASE = (process.env.TEST_BASE || "https://tutax-ivory.vercel.app").replace(/\/$/, "");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const stamp = Date.now().toString(36);
const email = `latency-${stamp}@example.com`;
const { data: u } = await admin.auth.admin.createUser({ email, password: "Probe12345!", email_confirm: true });
const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", u.user.id).single();
await admin.from("accounts").update({ onboarded: true, plan: "pro" }).eq("id", m.account_id);
const { data: t } = await admin.from("tutorials").insert({ account_id: m.account_id, title: "Messung", status: "draft" }).select("id").single();
const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
try {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("Probe12345!");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((x) => x.pathname.startsWith("/app"), { timeout: 45000 });
  for (const p of ["/app", "/app/settings/team", `/app/tutorials/${t.id}`]) {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const res = await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" });
      await res?.finished();
      times.push(Date.now() - t0);
    }
    console.log(`${p.padEnd(40)} Median ${median(times)} ms  (${times.join(", ")})`);
  }
  // Server-Aktion: Titel im Editor ändern → bis der neue Titel in der DB steht.
  const act = [];
  for (let i = 0; i < 3; i++) {
    await page.goto(`${BASE}/app/tutorials/${t.id}`, { waitUntil: "networkidle" });
    const name = `Messung ${i} ${stamp}`;
    const edit = page.getByRole("button", { name: "Titel bearbeiten" }).first();
    if (!(await edit.count())) break;
    await edit.click();
    const input = page.getByLabel("Titel der Anleitung");
    await input.fill(name);
    const t0 = Date.now();
    await input.press("Enter");
    for (let k = 0; k < 100; k++) {
      const { data } = await admin.from("tutorials").select("title").eq("id", t.id).single();
      if (data.title === name) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    act.push(Date.now() - t0);
  }
  if (act.length) console.log(`${"Aktion: Titel speichern bis DB".padEnd(40)} Median ${median(act)} ms  (${act.join(", ")})`);
} finally {
  await browser.close();
  await admin.from("accounts").delete().eq("id", m.account_id);
  await admin.auth.admin.deleteUser(u.user.id);
}
