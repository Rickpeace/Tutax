// Organisation wechseln — Nutzer in ZWEI Organisationen (eigene + per Mitgliedschaft).
// Echter Login gegen die echte DB (Wegwerf-Konten, werden am Ende gelöscht), Dev-Server lokal.
// Prüft: Wechsel über „Einstellungen → Allgemein" (Auswahlfeld) UND über das Avatar-Menü
// landet wirklich in der anderen Organisation (Kopfzeile + DB-Metadaten), Auswahlfeld
// bleibt nicht gesperrt hängen.
//
// Nutzung:  node --env-file=.env.local scripts/test-org-switch.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
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

const PORT = Number(process.env.PORT_ORGSWITCH || 3031);
// ORGSWITCH_BASE=https://… -> gegen eine laufende (z. B. Live-)Instanz statt lokalem Server.
const BASE = process.env.ORGSWITCH_BASE || `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const emailA = `tutax-orgswitch-a-${stamp}@example.com`;
const emailB = `tutax-orgswitch-b-${stamp}@example.com`;
const NAME_A = `Org A ${stamp}`;
const NAME_B = `Org B ${stamp}`;

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

async function waitForServer(timeoutMs = 180_000) {
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

/**
 * Test-Server beenden: den Prozess, der den Port WIRKLICH belegt (samt Baum). Die PID aus
 * spawn(shell) ist unter Windows nur die Hülle (cmd/npx) und nicht verlässlich der
 * Next-Prozess -> taskkill darauf ließ Server verwaist zurück. Synchron, damit es vor
 * process.exit() fertig ist.
 */
function killPort(port) {
  const out = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" }).stdout || "";
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols[1]?.endsWith(`:${port}`) && /:0$/.test(cols[2] ?? "") && Number(cols[4]) > 0) pids.add(cols[4]);
  }
  for (const pid of pids) {
    if (Number(pid) === process.pid) continue;
    spawnSync("taskkill", ["/pid", pid, "/f", "/t"], { stdio: "ignore" });
  }
}

async function activeMeta(userId) {
  const { data } = await admin.auth.admin.getUserById(userId);
  return data.user?.user_metadata?.active_account_id ?? null;
}

async function mkUser(email, name) {
  const created = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (created.error) throw created.error;
  const uid = created.data.user.id;
  const { data: members } = await admin.from("account_members").select("account_id").eq("user_id", uid);
  const aid = members[0].account_id;
  await admin.from("accounts").update({ name, onboarded: true }).eq("id", aid);
  return { uid, aid };
}

let server, browser;
const users = [];
const accounts = [];
try {
  const a = await mkUser(emailA, NAME_A);
  const b = await mkUser(emailB, NAME_B);
  users.push(a.uid, b.uid);
  accounts.push(a.aid, b.aid);
  // Nutzer A ist zusätzlich Mitglied in Org B (wie nach angenommener Einladung).
  const ins = await admin.from("account_members").insert({ account_id: b.aid, user_id: a.uid, role: "editor" });
  if (ins.error) throw ins.error;
  await admin.auth.admin.updateUserById(a.uid, { user_metadata: { active_account_id: a.aid } });

  if (!process.env.ORGSWITCH_BASE) {
    server = spawn("npx", ["next", process.env.ORGSWITCH_PROD ? "start" : "dev", "-p", String(PORT)], {
      cwd: path.join(__dirname, ".."),
      shell: true,
      stdio: "ignore",
    });
    console.log("… Server startet auf", PORT, "…");
  } else console.log("… gegen", BASE);
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", emailA);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 90_000 });

  // ---- 1) Wechsel über Einstellungen → Allgemein ----
  await page.goto(`${BASE}/app/settings/allgemein`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  const sel = page.locator('select[aria-label="Organisation wechseln"]');
  await sel.waitFor({ timeout: 90_000 });
  ok((await sel.inputValue()) === a.aid, "Allgemein: Org A ist vorausgewählt");
  await sel.selectOption(b.aid);
  const t0 = Date.now();
  await page.waitForURL((u) => u.pathname === "/app", { timeout: 30_000 }).catch(() => {});
  ok(new URL(page.url()).pathname === "/app", `Allgemein: nach Wechsel auf /app (${Date.now() - t0} ms, URL ${page.url()})`);
  ok((await activeMeta(a.uid)) === b.aid, "Allgemein: DB-Metadaten zeigen Org B");
  await page.goto(`${BASE}/app/settings/allgemein`, { waitUntil: "domcontentloaded" });
  await sel.waitFor({ timeout: 90_000 });
  ok((await sel.inputValue()) === b.aid, "Allgemein: nach Reload ist Org B aktiv");
  ok(!(await sel.isDisabled()), "Allgemein: Auswahlfeld nicht gesperrt");

  // ---- 2) Wechsel über das Avatar-Menü zurück zu Org A — beide Orgs GLEICH benannt
  //         (früher verglich das Menü per Name -> Klick tat nichts). ----
  const SAME = `Gleiche Kanzlei ${stamp}`;
  await admin.from("accounts").update({ name: SAME }).in("id", [a.aid, b.aid]);
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 2 && (await activeMeta(a.uid)) !== a.aid; i++) {
    await page.getByRole("button", { name: "Konto-Menü" }).click();
    await page.getByText("Organisation wechseln").click();
    await page.getByRole("menuitem", { name: SAME }).nth(i).click();
    await page.waitForTimeout(4000);
    await page.waitForLoadState("domcontentloaded");
  }
  ok((await activeMeta(a.uid)) === a.aid, "Avatar-Menü (gleiche Namen): DB-Metadaten zeigen Org A");
  await page.goto(`${BASE}/app/settings/allgemein`, { waitUntil: "domcontentloaded" });
  await sel.waitFor({ timeout: 90_000 });
  ok((await sel.inputValue()) === a.aid, "Avatar-Menü: nach Reload ist Org A aktiv");

  // ---- 3) Server-Aufruf schlägt fehl (wie veralteter Tab nach Deploy / Netz weg):
  //         Feld darf NICHT dauerhaft gesperrt bleiben, danach klappt der Wechsel. ----
  let blocked = 0;
  await page.route("**/app/settings/allgemein", (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) {
      blocked++;
      return route.abort();
    }
    return route.continue();
  });
  await sel.selectOption(b.aid);
  await page.getByText("Wechsel hat nicht geklappt").waitFor({ timeout: 15_000 }).then(
    () => ok(true, "Fehlerfall: Hinweis wird angezeigt"),
    () => ok(false, "Fehlerfall: Hinweis wird angezeigt"),
  );
  await page.unroute("**/app/settings/allgemein");
  await page.waitForTimeout(3000); // Neuladen nach 1,5 s
  await sel.waitFor({ timeout: 90_000 });
  ok(blocked > 0, `Fehlerfall: Server-Aufruf wurde abgefangen (${blocked}x)`);
  ok(!(await sel.isDisabled()), "Fehlerfall: Auswahlfeld nach Neuladen wieder bedienbar");
  ok((await activeMeta(a.uid)) === a.aid, "Fehlerfall: Org unverändert (A)");
  await sel.selectOption(b.aid);
  await page.waitForURL((u) => u.pathname === "/app", { timeout: 30_000 }).catch(() => {});
  ok((await activeMeta(a.uid)) === b.aid, "Fehlerfall: erneuter Versuch wechselt zu Org B");

  if (errors.length) console.log("Browser-Fehler:\n  " + errors.slice(0, 10).join("\n  "));
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) killPort(PORT);
  for (const id of accounts) await admin.from("accounts").delete().eq("id", id).then(() => {}, () => {});
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Organisation wechseln funktioniert (Allgemein + Avatar-Menü).");
process.exit(failed ? 1 : 0);
