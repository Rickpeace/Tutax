// Cache-Regression (24.09.2026, Vercel-ISR-Writes): Schritt-Änderungen verwerfen nur noch den Cache
// DIESER Anleitung, nicht mehr den der ganzen Hilfe-Seite. Prüft live, dass die Änderung trotzdem
// sofort auf der Anleitungsseite erscheint und die Übersicht weiter stimmt.
// Nutzung:  TEST_BASE=https://tutax-ivory.vercel.app node --env-file=.env.local scripts/test-cache-step-edit.mjs
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
let failed = 0;
const ok = (c, m) => {
  console.log(`${c ? "  ✓" : "  ✗"} ${m}`);
  if (!c) failed++;
};
const stamp = Date.now().toString(36);
const email = `cache-${stamp}@example.com`;
const slug = `cache-${stamp}`;
const { data: u } = await admin.auth.admin.createUser({ email, password: "Probe12345!", email_confirm: true });
const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", u.user.id).single();
await admin.from("accounts").update({ onboarded: true, plan: "pro", slug, name: "Cache Test" }).eq("id", m.account_id);
const { data: t } = await admin
  .from("tutorials")
  .insert({ account_id: m.account_id, title: `Cache-Anleitung ${stamp}`, status: "published", visibility: "public", slug: `anl-${stamp}` })
  .select("id")
  .single();
const { data: st } = await admin.from("steps").insert({ tutorial_id: t.id, title: `Alt ${stamp}`, position: 0 }).select("id").single();
await admin.from("tutorials").update({ root_step_id: st.id }).eq("id", t.id);

const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
try {
  const pub = await (await browser.newContext()).newPage();
  const tutUrl = `${BASE}/h/${slug}/anl-${stamp}`;
  await pub.goto(tutUrl, { waitUntil: "networkidle" });
  ok((await pub.getByText(`Alt ${stamp}`).count()) > 0, "Anleitungsseite zeigt den alten Schritt (Cache gefüllt)");
  await pub.goto(`${BASE}/h/${slug}`, { waitUntil: "networkidle" });
  ok((await pub.getByText(`Cache-Anleitung ${stamp}`).count()) > 0, "Übersicht zeigt die Anleitung");

  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("Probe12345!");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((x) => x.pathname.startsWith("/app"), { timeout: 45000 });
  await page.goto(`${BASE}/app/tutorials/${t.id}`, { waitUntil: "networkidle" });
  await page.getByText(`Alt ${stamp}`).first().click();
  await page.locator("#step-title").fill(`Neu ${stamp}`);
  await page.getByRole("button", { name: "Speichern" }).first().click();
  for (let i = 0; i < 30; i++) {
    const { data } = await admin.from("steps").select("title").eq("id", st.id).single();
    if (data.title === `Neu ${stamp}`) break;
    await page.waitForTimeout(500);
  }
  await pub.waitForTimeout(1500);
  await pub.goto(tutUrl, { waitUntil: "networkidle" });
  ok((await pub.getByText(`Neu ${stamp}`).count()) > 0, "Nach dem Speichern zeigt die Anleitungsseite sofort den neuen Schritt");
  await pub.goto(`${BASE}/h/${slug}`, { waitUntil: "networkidle" });
  ok((await pub.getByText(`Cache-Anleitung ${stamp}`).count()) > 0, "Übersicht stimmt weiter");
} finally {
  await browser.close();
  await admin.from("accounts").delete().eq("id", m.account_id);
  await admin.auth.admin.deleteUser(u.user.id);
}
console.log(failed ? `\n✗ ${failed} Prüfung(en) fehlgeschlagen.` : "\n✓ Schritt-Änderung erscheint sofort, ohne die ganze Hilfe-Seite zu verwerfen.");
process.exitCode = failed ? 1 : 0;
