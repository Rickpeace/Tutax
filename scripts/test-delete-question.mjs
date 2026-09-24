// Regression (Regressions-Audit 24.09.2026): „Frage löschen“ im Editor schnitt auf dem Server
// alles nach der Frage ab — der Vorgänger zeigte ins Leere statt auf die Zusammenführung der
// Äste. Prüft live über die echte Oberfläche: A → Frage (Ja→X, Nein→Y) → J; Frage löschen →
// nach Neuladen A → J in der DB und im Editor.
// Nutzung:  TEST_BASE=https://tutax-ivory.vercel.app node --env-file=.env.local scripts/test-delete-question.mjs
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
const email = `qdel-${stamp}@example.com`;
const { data: u } = await admin.auth.admin.createUser({ email, password: "Probe12345!", email_confirm: true });
const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", u.user.id).single();
await admin.from("accounts").update({ onboarded: true, plan: "pro", slug: `qdel-${stamp}` }).eq("id", m.account_id);
const { data: t } = await admin.from("tutorials").insert({ account_id: m.account_id, title: "Frage löschen", status: "draft", slug: `qdel-${stamp}` }).select("id").single();

const mk = async (title, position, is_decision = false) =>
  (await admin.from("steps").insert({ tutorial_id: t.id, title, position, is_decision }).select("id").single()).data.id;
const A = await mk(`Anfang ${stamp}`, 0);
const Q = await mk(`Frage ${stamp}`, 1, true);
const X = await mk(`Ast Ja ${stamp}`, 2);
const Y = await mk(`Ast Nein ${stamp}`, 3);
const J = await mk(`Zusammen ${stamp}`, 4);
await admin.from("step_branches").insert([
  { step_id: A, label: null, target_step_id: Q, position: 0 },
  { step_id: Q, label: "Ja", target_step_id: X, position: 0 },
  { step_id: Q, label: "Nein", target_step_id: Y, position: 1 },
  { step_id: X, label: null, target_step_id: J, position: 0 },
  { step_id: Y, label: null, target_step_id: J, position: 0 },
]);
await admin.from("tutorials").update({ root_step_id: A }).eq("id", t.id);

const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("Probe12345!");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((x) => x.pathname.startsWith("/app"), { timeout: 45000 });

  await page.goto(`${BASE}/app/tutorials/${t.id}`, { waitUntil: "networkidle" });
  await page.getByText(`Frage ${stamp}`).first().click();
  await page.getByRole("button", { name: "Schritt löschen" }).first().click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog")).first();
  await dialog.waitFor({ timeout: 10000 });
  const text = await dialog.innerText();
  ok(text.includes(`Zusammen ${stamp}`), "Bestätigung nennt den Schritt, mit dem es weitergeht");
  await dialog.getByRole("button", { name: "Schritt löschen" }).click();

  let edge = null;
  for (let i = 0; i < 40; i++) {
    const { data: gone } = await admin.from("steps").select("id").eq("id", Q).maybeSingle();
    if (!gone) {
      const { data } = await admin.from("step_branches").select("target_step_id").eq("step_id", A);
      edge = data;
      break;
    }
    await page.waitForTimeout(500);
  }
  ok(edge !== null, "Frage ist in der Datenbank gelöscht");
  ok(edge?.length === 1 && edge[0].target_step_id === J, "Server: Anfang zeigt danach auf die Zusammenführung (nicht ins Leere)");

  await page.goto(`${BASE}/app/tutorials/${t.id}`, { waitUntil: "networkidle" });
  ok((await page.getByText(`Zusammen ${stamp}`).count()) > 0, "Nach Neuladen: Zusammenführungs-Schritt steht weiter im Ablauf");
  ok((await page.getByText("Da ist etwas schiefgelaufen").count()) === 0 && errors.length === 0, "Keine Fehler im Editor");
} finally {
  await browser.close();
  await admin.from("accounts").delete().eq("id", m.account_id);
  await admin.auth.admin.deleteUser(u.user.id);
}
console.log(failed ? `\n✗ ${failed} Prüfung(en) fehlgeschlagen.` : "\n✓ Frage löschen verdrahtet den Ablauf korrekt.");
process.exitCode = failed ? 1 : 0;
