// Tarif-Sichtprüfung: je ein Wegwerf-Konto Gratis / Pro / Business, Screenshots der Seiten,
// auf denen sich die Tarife unterscheiden. Headless, räumt am Ende alles weg.
// Nutzung:  TEST_BASE=http://localhost:3097 SHOT_DIR=… node --env-file=.env.local scripts/shoot-plan-audit.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
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
const OUT = process.env.SHOT_DIR || path.join(process.cwd(), "scripts", ".shots-plan");
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const stamp = Date.now().toString(36);
const PW = "Probe12345!";

async function makeAccount(plan) {
  const email = `plan-shot-${plan}-${stamp}@example.com`;
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", u.user.id).single();
  const accountId = mem.account_id;
  const slug = `plan-shot-${plan}-${stamp}`;
  await admin.from("accounts").update({ onboarded: true, slug, name: `Kanzlei ${plan}`, plan }).eq("id", accountId);
  await admin.from("themes").update({ tokens: { colors: { primary: "#1d4ed8" } }, mode: "manual" }).eq("account_id", accountId);
  const { data: tut } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title: "Beleg hochladen", status: "published", visibility: "public", slug: "beleg-hochladen" })
    .select("id")
    .single();
  const { data: step } = await admin.from("steps").insert({ tutorial_id: tut.id, title: "Portal öffnen", position: 0 }).select("id").single();
  await admin.from("tutorials").update({ root_step_id: step.id }).eq("id", tut.id);
  return { plan, email, userId: u.user.id, accountId, slug, tutId: tut.id };
}

const PAGES = (a) => [
  ["bibliothek", "/app"],
  ["editor", `/app/tutorials/${a.tutId}`],
  ["tarif", "/app/settings/tarif"],
  ["aussehen", "/app/settings/aussehen"],
  ["sprachen", "/app/settings/sprachen"],
  ["team", "/app/settings/team"],
  ["assistent", "/app/assistent/wissen"],
  ["chat-einstellung", "/app/settings/chat"],
  ["hilfe-seite", `/h/${a.slug}`],
];

const accs = [];
const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
try {
  for (const plan of ["free", "pro", "business"]) accs.push(await makeAccount(plan));
  for (const a of accs) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await p.locator('input[name="email"]').first().fill(a.email);
    await p.locator('input[name="password"]').first().fill(PW);
    await p.locator('button[type="submit"]').first().click();
    await p.waitForURL(/\/app/, { timeout: 60_000 });
    for (const [name, url] of PAGES(a)) {
      await p.goto(`${BASE}${url}`, { waitUntil: "networkidle", timeout: 90_000 }).catch(() => {});
      await p.waitForTimeout(1200);
      const file = path.join(OUT, `${a.plan}-${name}.png`);
      await p.screenshot({ path: file, fullPage: true });
      console.log("📸", path.basename(file));
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  for (const a of accs) {
    await admin.from("accounts").delete().eq("id", a.accountId);
    await admin.auth.admin.deleteUser(a.userId);
  }
}
console.log("Fertig:", OUT);
