// Kontakt/Eskalation im Hilfe-Chat: Wählt der Bot bei einer Wissenslücke die fachlich
// passende Person, fällt er sonst auf den allgemeinen Kontakt zurück, und erscheint die
// Kontaktbox im echten Chat-Widget? Unsichere Links (javascript:) dürfen nie gespeichert
// bzw. angezeigt werden.
// Echte DB + echte KI, Dev-Server lokal; Wegwerf-Konto wird am Ende gelöscht.
//
// Nutzung:  node --env-file=.env.local scripts/test-escalation-e2e.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const PORT = 3033;
const BASE = `http://localhost:${PORT}`;
const stamp = String(process.hrtime.bigint()).slice(-8);
const slug = `esc-${stamp}`;

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(`${BASE}/robots.txt`)).status === 200) return true;
    } catch {
      /* noch nicht bereit */
    }
    await sleep(1000);
  }
  return false;
}

async function ask(question) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountSlug: slug, question }),
  });
  let answer = "";
  let meta = null;
  for (const line of (await r.text()).split("\n").filter(Boolean)) {
    const o = JSON.parse(line);
    if (o.delta) answer += o.delta;
    if (o.answer) answer += o.answer;
    if (o.meta) meta = o.meta;
  }
  return { answer, meta };
}

const setEscalation = async (escalation) => {
  const { error } = await admin.from("accounts").update({ escalation }).eq("id", accountId);
  if (error) throw error;
};

const GENERAL = {
  enabled: true,
  message: "Unser Team hilft Ihnen gern persönlich.",
  contactName: "Team Nordlicht",
  email: "team@example.com",
  phone: "+49 40 123",
};
const EXPERTS = [
  { name: "Frau Müller", expertise: "Lohnabrechnung, Minijobs, Arbeitnehmer", email: "mueller@example.com" },
  { name: "Herr Schmidt", expertise: "Technik, DATEV-Zugang, Login-Probleme", calendarUrl: "https://cal.example.com/schmidt" },
];

let server, browser, userId, accountId;
try {
  const created = await admin.auth.admin.createUser({
    email: `tutax-esc-${stamp}@example.com`,
    password: "Test12345!",
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  accountId = (await admin.from("account_members").select("account_id").eq("user_id", userId)).data[0].account_id;
  await admin.from("accounts").update({ name: "Nordlicht Steuerberatung", slug, onboarded: true }).eq("id", accountId);
  const { error: tErr } = await admin.from("tutorials").insert(
    ["DATEV SmartLogin einrichten", "Belege mit DATEV Upload mobil hochladen", "Steuerbescheid im Postfach finden"].map(
      (title, i) => ({ account_id: accountId, title, slug: `t-${i}`, status: "published", visibility: "public" }),
    ),
  );
  if (tErr) throw tErr;

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: path.join(__dirname, ".."),
    shell: true,
    stdio: "ignore",
  });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  // 1) Fachliche Zuordnung.
  await setEscalation({ ...GENERAL, experts: EXPERTS });
  const lohn = await ask("Wie werden Minijobber bei der Lohnabrechnung versteuert?");
  const lohnVals = (lohn.meta?.escalation?.methods ?? []).map((m) => m.value);
  console.log(`   Lohn: status=${lohn.meta?.status} box=${JSON.stringify(lohn.meta?.escalation)}`);
  ok(lohn.meta?.status === "no_answer", "Lohnfrage = Wissenslücke");
  ok(lohnVals.includes("mailto:mueller@example.com"), "Lohnfrage → Frau Müller (ihre E-Mail)");
  ok(lohnVals.includes("tel:+49 40 123"), "Fehlender Kontaktweg der Person → allgemeine Telefonnummer ergänzt");
  ok(/Frau Müller/.test(lohn.meta?.escalation?.message ?? ""), "Hinweis nennt Frau Müller als Ansprechperson");

  const tech = await ask("Mein DATEV-Zugang ist gesperrt, ich komme nicht mehr rein. Was tun?");
  const techVals = (tech.meta?.escalation?.methods ?? []).map((m) => m.value);
  console.log(`   Technik: status=${tech.meta?.status} box=${JSON.stringify(tech.meta?.escalation)}`);
  ok(tech.meta?.status === "no_answer", "Technikfrage = Wissenslücke");
  ok(techVals.includes("https://cal.example.com/schmidt"), "Technikfrage → Herr Schmidt (sein Kalender)");

  // 2) Nur allgemeiner Kontakt.
  await setEscalation({ ...GENERAL, experts: [] });
  const gen = await ask("Wie hoch ist der Grundfreibetrag 2026?");
  const genVals = (gen.meta?.escalation?.methods ?? []).map((m) => m.value);
  ok(gen.meta?.status === "no_answer" && genVals.includes("mailto:team@example.com"), "Ohne Fachleute → allgemeiner Kontakt");
  ok(gen.meta?.escalation?.message === GENERAL.message, "Eigener Hinweistext erscheint");

  // 3) Themenfremd / beantwortbar → keine Kontaktbox.
  const off = await ask("Wie backe ich ein Sauerteigbrot?");
  ok(off.meta?.status === "off_topic" && off.meta?.escalation == null, "Themenfremd → keine Kontaktbox");

  // 4) Kontaktbox im echten Chat-Widget (Hilfe-Seite).
  await setEscalation({ ...GENERAL, experts: EXPERTS });
  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${BASE}/h/${slug}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.getByRole("button", { name: "Hilfe-Assistent" }).first().click();
  await page.getByPlaceholder("Frage stellen …").fill("Wie werden Minijobber bei der Lohnabrechnung versteuert?");
  await page.getByRole("button", { name: "Senden" }).click();
  const mail = page.locator('a[href="mailto:mueller@example.com"]');
  ok(await mail.waitFor({ timeout: 45_000 }).then(() => true, () => false), "Widget zeigt Kontakt-Knopf „mueller@example.com“");

  // 5) Unsichere Links: javascript:-Kalender darf nie als Link ausgeliefert werden.
  await setEscalation({ ...GENERAL, email: "", phone: "", calendarUrl: "javascript:alert(document.cookie)", experts: [] });
  const bad = await ask("Wie hoch ist der Grundfreibetrag 2026?");
  const badVals = (bad.meta?.escalation?.methods ?? []).map((m) => m.value);
  ok(!badVals.some((v) => /^javascript:/i.test(v)), `Kein javascript:-Link in der Kontaktbox (${badVals.join(", ") || "–"})`);
} catch (e) {
  console.error("✗ Abbruch:", e instanceof Error ? e.message : e);
  failed = true;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { shell: true });
    else server.kill("SIGTERM");
  }
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Eskalation: Fehler" : "\n✓ Eskalation live verifiziert.");
process.exit(failed ? 1 : 0);
