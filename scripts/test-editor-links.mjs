// Regression (Kunden-Audit 24.09.2026, kritisch): Links im Erklärtext eines Schritts gingen beim
// Speichern verloren ({"type":"link"} ohne Adresse) und der Schritt ließ danach den ganzen Editor
// abstürzen. Prüft live: Link tippen → speichern → Adresse in der DB → Schritt neu öffnen ohne
// Absturz → Link im Editor und auf der Hilfe-Seite.
// Nutzung:  TEST_BASE=https://tutax-ivory.vercel.app node --env-file=.env.local scripts/test-editor-links.mjs
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
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
  if (!cond) failed++;
};
const stamp = Date.now().toString(36);
const email = `links-${stamp}@example.com`;
const URL_ = `https://example.com/steply-${stamp}`;
const { data: u } = await admin.auth.admin.createUser({ email, password: "Probe12345!", email_confirm: true });
const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", u.user.id).single();
const slug = `links-${stamp}`;
await admin.from("accounts").update({ onboarded: true, plan: "pro", slug }).eq("id", m.account_id);
const { data: t } = await admin.from("tutorials").insert({ account_id: m.account_id, title: "Links", status: "draft", slug: `links-${stamp}` }).select("id").single();
const { data: st } = await admin.from("steps").insert({ tutorial_id: t.id, title: `Link-Schritt ${stamp}`, position: 0 }).select("id").single();
await admin.from("tutorials").update({ root_step_id: st.id }).eq("id", t.id);
const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
try {
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("Probe12345!");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((x) => x.pathname.startsWith("/app"), { timeout: 45000 });

  const openStep = async () => {
    await page.goto(`${BASE}/app/tutorials/${t.id}`, { waitUntil: "networkidle" });
    await page.getByText(`Link-Schritt ${stamp}`).first().click();
    await page.locator('[role="textbox"][aria-multiline="true"]').first().waitFor({ timeout: 20000 });
  };
  await openStep();
  const box = page.locator('[role="textbox"][aria-multiline="true"]').first();
  await box.click();
  await page.keyboard.type(`Siehe ${URL_} `); // Leerzeichen löst Autolink aus
  await page.getByRole("button", { name: "Speichern" }).first().click();
  let body = null;
  for (let i = 0; i < 40; i++) {
    const { data } = await admin.from("steps").select("body").eq("id", st.id).single();
    body = JSON.stringify(data.body ?? "");
    if (body.includes("link")) break;
    await page.waitForTimeout(500);
  }
  ok(body?.includes(`"href":"${URL_}"`), "Link wird MIT Adresse gespeichert");

  await openStep();
  const crashed = await page.getByText("Da ist etwas schiefgelaufen").count();
  ok(crashed === 0 && !errors.some((e) => /trim/.test(e)), "Schritt lässt sich wieder öffnen (kein Absturz)");
  ok((await page.locator(`[role="textbox"] a[href="${URL_}"]`).count()) > 0, "Link ist im Editor wieder da");

  // Veröffentlichen per Server-Daten + Hilfe-Seite prüfen
  await admin.from("tutorials").update({ status: "published", visibility: "public" }).eq("id", t.id);
  await page.goto(`${BASE}/h/${slug}/links-${stamp}`, { waitUntil: "networkidle" });
  ok((await page.locator(`a[href="${URL_}"]`).count()) > 0, "Link erscheint auf der Hilfe-Seite");
} finally {
  await browser.close();
  await admin.from("accounts").delete().eq("id", m.account_id);
  await admin.auth.admin.deleteUser(u.user.id);
}
console.log(failed ? `\n✗ ${failed} Prüfung(en) fehlgeschlagen` : "\n✓ Links im Erklärtext bleiben erhalten");
process.exit(failed ? 1 : 0);
