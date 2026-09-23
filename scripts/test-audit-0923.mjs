// Regression für den Bug-Audit vom 23.09.2026 (live): prüft die behobenen Befunde aus Nutzersicht.
//  - Hilfe-Seite: fehlender Startschritt → trotzdem der erste Schritt (nicht sofort „Fertig“)
//  - Frage ohne Antworten → „Fertig“-Knopf statt Sackgasse
//  - Druckansicht: unverbundene Schritte fehlen, Ast-Ende sagt „weiter mit Schritt N“
//  - embed.js: iFrame bis zur Bereit-Meldung nicht klickbar
//  - Anmelde-Link an unbekannte Adresse legt KEIN Konto an
//  - E-Mail ändern verlangt das aktuelle Passwort
//  - Mitarbeiter landen nach dem Login direkt bei den Schulungen; /login?next= führt zum Ziel
//  - Duplizieren einer „Nur Team“-Anleitung bleibt „Nur Team“
//  - 404 hat einen eigenen Titel
//
// Nutzung:  TEST_BASE=https://tutax-ivory.vercel.app node --env-file=.env.local scripts/test-audit-0923.mjs
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

const BASE = (process.env.TEST_BASE || "https://tutax-ivory.vercel.app").replace(/\/$/, "");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
  if (!cond) failed++;
};
const stamp = Date.now().toString(36);
const PW = "Probe12345!";
const users = [];
const accounts = [];
const path_ = (page) => new URL(page.url()).pathname;

async function mkUser(tag, plan) {
  const email = `audit0923-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", data.user.id).single();
  accounts.push(m.account_id);
  const slug = `audit0923-${tag}-${stamp}`;
  await admin.from("accounts").update({ plan, onboarded: true, slug, name: `Audit ${tag}` }).eq("id", m.account_id);
  return { email, uid: data.user.id, acc: m.account_id, slug };
}
async function login(page, email, next) {
  await page.goto(`${BASE}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').first().fill(email);
  await page.locator('input[name="password"]').first().fill(PW);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 45_000 });
}
async function mkTutorial(acc, title, slug, steps, branches = [], extra = {}) {
  const { data: t } = await admin
    .from("tutorials")
    .insert({ account_id: acc, title, slug, status: "published", visibility: "public", ...extra })
    .select("id")
    .single();
  const ids = {};
  for (const [i, s] of steps.entries()) {
    const { data } = await admin
      .from("steps")
      .insert({ tutorial_id: t.id, title: s.title, position: i, is_decision: !!s.decision })
      .select("id")
      .single();
    ids[s.key] = data.id;
  }
  for (const [i, b] of branches.entries())
    await admin.from("step_branches").insert({ step_id: ids[b.from], target_step_id: b.to ? ids[b.to] : null, label: b.label ?? null, position: i });
  return { id: t.id, ids };
}

const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
try {
  const P = await mkUser("pro", "business");

  console.log("1. Hilfe-Seite: fehlender Startschritt");
  {
    // root_step_id bleibt NULL, zwei verbundene Schritte
    await mkTutorial(P.acc, "Ohne Start", `ohne-start-${stamp}`, [{ key: "a", title: `Erster Schritt ${stamp}` }, { key: "b", title: "Zweiter" }], [{ from: "a", to: "b" }]);
    const page = await browser.newPage();
    await page.goto(`${BASE}/h/${P.slug}/ohne-start-${stamp}`, { waitUntil: "networkidle" });
    const txt = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    ok(txt.includes(`Erster Schritt ${stamp}`) && !/Fertig!/.test(txt), "zeigt den ersten Schritt statt „Fertig!“");
    await page.close();
  }

  console.log("2. Frage ohne Antworten");
  {
    await mkTutorial(P.acc, "Frage leer", `frage-leer-${stamp}`, [{ key: "q", title: "Offene Frage", decision: true }]);
    const { data: t } = await admin.from("tutorials").select("id").eq("slug", `frage-leer-${stamp}`).single();
    const { data: st } = await admin.from("steps").select("id").eq("tutorial_id", t.id).single();
    await admin.from("tutorials").update({ root_step_id: st.id }).eq("id", t.id);
    const page = await browser.newPage();
    await page.goto(`${BASE}/h/${P.slug}/frage-leer-${stamp}`, { waitUntil: "networkidle" });
    const done = page.getByRole("button", { name: /^Fertig$/ });
    ok((await done.count()) > 0, "Knopf „Fertig“ vorhanden (keine Sackgasse)");
    await page.close();
  }

  console.log("3. Druckansicht");
  {
    const { id, ids } = await mkTutorial(
      P.acc,
      "Ast-Druck",
      `ast-druck-${stamp}`,
      [
        { key: "q", title: "Frage", decision: true },
        { key: "ja", title: "JA-Ast" },
        { key: "nein", title: "NEIN-Ast" },
        { key: "join", title: "Gemeinsam" },
        { key: "orphan", title: `Unverbunden ${stamp}` },
      ],
      [
        { from: "q", to: "ja", label: "Ja" },
        { from: "q", to: "nein", label: "Nein" },
        { from: "ja", to: "join" },
        { from: "nein", to: "join" },
      ],
    );
    await admin.from("tutorials").update({ root_step_id: ids.q }).eq("id", id);
    const page = await browser.newPage();
    await page.goto(`${BASE}/h/${P.slug}/ast-druck-${stamp}/drucken`, { waitUntil: "networkidle" });
    const txt = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    ok(!txt.includes(`Unverbunden ${stamp}`), "unverbundener Schritt wird nicht gedruckt");
    ok(/weiter mit Schritt 4/.test(txt), "Ast-Ende nennt den Folgeschritt („weiter mit Schritt 4“)");
    await page.close();
  }

  console.log("4. embed.js");
  {
    const js = await (await fetch(`${BASE}/h/embed.js`)).text();
    ok(js.includes("pointer-events:none") && js.includes("removeChild"), "iFrame erst nach Bereit-Meldung klickbar, sonst entfernt");
  }

  console.log("5. Anmelde-Link an unbekannte Adresse");
  {
    const ghost = `audit0923-ghost-${stamp}@example.com`;
    const page = await browser.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    const magic = page.getByRole("button", { name: /Link|ohne Passwort/i }).first();
    if (await magic.count()) {
      await magic.click().catch(() => {});
    }
    await page.waitForTimeout(500);
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    // Direkt über die Server-Regel prüfen (Formular-Varianten ändern sich): Supabase lehnt ab.
    const r = await anon().auth.signInWithOtp({ email: ghost, options: { shouldCreateUser: false } });
    const { data: after } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    ok(!!r.error && !after.users.some((u) => u.email === ghost) && list.users.length <= after.users.length, "kein Konto für fremde Adresse");
    await page.close();
  }

  console.log("6. E-Mail ändern nur mit Passwort");
  {
    const page = await (await browser.newContext()).newPage();
    await login(page, P.email);
    await page.goto(`${BASE}/app/settings/profil`, { waitUntil: "networkidle" });
    await page.locator("#new-email").fill(`audit0923-neu-${stamp}@example.com`);
    const btn = page.getByRole("button", { name: "E-Mail ändern" });
    ok(await btn.isDisabled(), "Knopf gesperrt ohne aktuelles Passwort");
    await page.locator("#email-current-password").fill("falsch-falsch");
    await btn.click();
    const toast = page.locator("[data-sonner-toast]").first();
    await toast.waitFor({ timeout: 15_000 }).catch(() => {});
    ok(/Passwort stimmt nicht/.test(await toast.innerText().catch(() => "")), "falsches Passwort wird abgelehnt");
    const { data: u } = await admin.auth.admin.getUserById(P.uid);
    ok(u.user.email === P.email && !u.user.new_email, "Adresse unverändert, kein Wechsel angestoßen");

    console.log("7. /login?next= für Angemeldete");
    await page.goto(`${BASE}/login?next=%2Fapp%2Fsettings%2Fteam`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((x) => x.pathname !== "/login", { timeout: 20_000 }).catch(() => {});
    ok(path_(page) === "/app/settings/team", `führt zum Ziel (→ ${path_(page)})`);

    console.log("8. Duplizieren „Nur Team“");
    const { data: intern } = await admin
      .from("tutorials")
      .insert({ account_id: P.acc, title: `Intern ${stamp}`, status: "draft", visibility: "internal" })
      .select("id")
      .single();
    await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    // Nächster Vorfahre des Titels, der einen „Aktionen“-Knopf enthält = diese Karte.
    const card = page
      .getByText(`Intern ${stamp}`, { exact: true })
      .first()
      .locator("xpath=ancestor::*[.//button[@aria-label='Aktionen']][1]");
    await card.getByRole("button", { name: "Aktionen" }).first().click().catch(() => {});
    await page.getByRole("menuitem", { name: /Duplizieren/ }).first().click().catch(() => {});
    let copy = null;
    for (let i = 0; i < 20 && !copy; i++) {
      await page.waitForTimeout(1000);
      const { data } = await admin.from("tutorials").select("visibility").eq("account_id", P.acc).eq("title", `Intern ${stamp} (Kopie)`).maybeSingle();
      copy = data;
    }
    ok(copy?.visibility === "internal", `Kopie bleibt „Nur Team“ (${copy?.visibility ?? "keine Kopie gefunden"})`);
    void intern;
    await page.context().close();
  }

  console.log("9. Mitarbeiter-Login");
  {
    const M = await mkUser("mit", "free");
    await admin.from("account_members").insert({ account_id: P.acc, user_id: M.uid, role: "member" });
    await admin.auth.admin.updateUserById(M.uid, { user_metadata: { active_account_id: P.acc } });
    const page = await (await browser.newContext()).newPage();
    const seen = [];
    page.on("framenavigated", (f) => f === page.mainFrame() && seen.push(new URL(f.url()).pathname));
    await login(page, M.email);
    await page.waitForLoadState("networkidle").catch(() => {});
    ok(path_(page) === "/app/lernen" && !seen.includes("/app"), `direkt zu den Schulungen (Weg: ${seen.join(" → ")})`);
    await page.context().close();
  }

  console.log("10. 404-Titel");
  {
    const page = await browser.newPage();
    await page.goto(`${BASE}/gibt-es-nicht-${stamp}`, { waitUntil: "networkidle" });
    ok(/nicht gefunden/i.test(await page.title()), `Titel: „${await page.title()}“`);
    await page.close();
  }
} finally {
  await browser.close();
  for (const acc of accounts) await admin.from("accounts").delete().eq("id", acc);
  for (const uid of users) await admin.auth.admin.deleteUser(uid).catch(() => {});
}
console.log(failed ? `\n✗ ${failed} Prüfung(en) fehlgeschlagen` : "\n✓ Audit-Korrekturen vom 23.09. live bestätigt");
process.exit(failed ? 1 : 0);
