// Welle 51 — Gescheiterte Video-Aufträge werden angezeigt (Kunde Max, 21.07.2026: „KI verarbeitet …“
// erschien und verschwand ohne Tutorial). Echter Login gegen die echte DB (Wegwerf-Konto, wird am
// Ende gelöscht), Dev-Server lokal. Prüft:
//   • Bibliothek: gescheiterter video_job (kind=create, < 7 Tage) erscheint als Hinweiskarte mit
//     Titel + Grund in Klartext; ein alter (10 Tage), ein Export-Fehler (render) und ein fertiger
//     Auftrag erscheinen NICHT; der laufende Auftrag („wird erstellt …“) bleibt unverändert.
//   • Glocke: Zähler enthält den Fehlschlag, Abschnitt „Fehlgeschlagene Videos“.
//   • „Ausblenden“: Karte weg, Glocke synchron (ohne Neuladen), bleibt nach Neuladen weg
//     (localStorage), laufender Auftrag weiter sichtbar.
//   • /api/recorder/video-status: Bearer-Token-Auth, Konto-Grenze (fremder Auftrag = 404),
//     Klartext-Grund, CORS-Preflight.
// Screenshots → SHOT_DIR (Standard: scripts/.shots-video-failed, gitignored über .shots*).
//
// Nutzung:  node --env-file=.env.local scripts/test-video-failed.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { setRecorderToken } from "./_recorder-token.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, ".shots-video-failed");
mkdirSync(SHOT_DIR, { recursive: true });

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

const PORT = Number(process.env.PORT_VIDEO_FAILED || 3028);
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const email = `tutax-vfail-${stamp}@example.com`;
const emailB = `tutax-vfail-b-${stamp}@example.com`;

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

const WORKER_ERROR = "Video konnte nicht verarbeitet werden (evtl. unvollständige Aufnahme). Bitte erneut aufnehmen.";
const daysAgo = (d) => new Date(Date.now() - d * 86400_000).toISOString();

let server, browser, userId, accountId, userB, accountB;
try {
  // ---- Konto A (Test) + Konto B (fremd, für die Konto-Grenze der Status-Route) ----
  const created = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const { data: members } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = members[0].account_id;
  const token = randomUUID();
  await admin.from("accounts").update({ name: "Video Test GmbH", onboarded: true }).eq("id", accountId).then(() => setRecorderToken(admin, accountId, token));

  const createdB = await admin.auth.admin.createUser({ email: emailB, password: PW, email_confirm: true });
  if (createdB.error) throw createdB.error;
  userB = createdB.data.user.id;
  const { data: membersB } = await admin.from("account_members").select("account_id").eq("user_id", userB);
  accountB = membersB[0].account_id;

  const { error: tErr } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title: "Beleg in DATEV hochladen", status: "draft", visibility: "public" });
  if (tErr) throw tErr;

  const job = (o) => ({ account_id: accountId, video_path: `${accountId}/${randomUUID()}.webm`, kind: "create", ...o });
  // Einzeln einfügen: bei gemischten Spalten setzt PostgREST fehlende Felder sonst auf NULL
  // (statt Standardwert) — created_at ist NOT NULL.
  const jobs = [];
  for (const row of [
    job({ title: "Bildschirmaufnahme", status: "failed", error: WORKER_ERROR }),
    job({ title: "Alte Aufnahme", status: "failed", error: WORKER_ERROR, created_at: daysAgo(10), updated_at: daysAgo(10) }),
    job({ title: "Export Lohn", status: "failed", error: "Font fehlt", kind: "render", video_path: null }),
    job({ title: "Laufende Aufnahme", status: "processing", progress: "Schritt 2/5" }),
    job({ title: "Fertige Aufnahme", status: "done" }),
  ]) {
    const { data, error } = await admin.from("video_jobs").insert(row).select("id, title").single();
    if (error) throw error;
    jobs.push(data);
  }
  const failedId = jobs.find((j) => j.title === "Bildschirmaufnahme").id;
  const runningId = jobs.find((j) => j.title === "Laufende Aufnahme").id;
  const { data: foreign, error: fErr } = await admin
    .from("video_jobs")
    .insert({ account_id: accountB, video_path: `${accountB}/x.webm`, title: "Fremd", status: "failed", error: WORKER_ERROR })
    .select("id")
    .single();
  if (fErr) throw fErr;

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: path.join(__dirname, ".."),
    shell: true,
    stdio: "ignore",
  });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  // ---- Status-Route (Erweiterung) ----
  const status = (id, tok) =>
    fetch(`${BASE}/api/recorder/video-status?id=${id}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
  let r = await status(failedId, token);
  let body = await r.json();
  ok(r.status === 200 && body.status === "failed", `Status-Route: gescheiterter Auftrag → failed (${r.status})`);
  ok(
    body.reason === "die Aufnahme ließ sich nicht lesen (möglicherweise unvollständig oder zu kurz)",
    `Status-Route: Grund in Klartext („${body.reason}“)`
  );
  ok(r.headers.get("access-control-allow-origin") === "*", "Status-Route: CORS-Header");
  r = await status(runningId, token);
  body = await r.json();
  ok(body.status === "processing" && body.progress === "Schritt 2/5" && body.reason === null, "Status-Route: laufender Auftrag mit Fortschritt");
  r = await status(foreign.id, token);
  ok(r.status === 404, `Status-Route: Auftrag eines fremden Kontos → 404 (${r.status})`);
  r = await status(failedId, randomUUID());
  ok(r.status === 401, `Status-Route: falscher Token → 401 (${r.status})`);
  r = await status(failedId, "");
  ok(r.status === 401, "Status-Route: ohne Token → 401");
  r = await status("keine-uuid", token);
  ok(r.status === 400, "Status-Route: ungültige ID → 400");
  r = await fetch(`${BASE}/api/recorder/video-status?id=${failedId}`, {
    method: "OPTIONS",
    headers: { Origin: "chrome-extension://abc", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" },
  });
  ok(r.status === 204 && /authorization/i.test(r.headers.get("access-control-allow-headers") || ""), "Status-Route: Preflight erlaubt Authorization");

  // ---- Bibliothek + Glocke (echter Login) ----
  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e && e.message)));
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 60_000 });
  await page.getByText("Beleg in DATEV hochladen").first().waitFor({ timeout: 60_000 });
  const notices = page.getByTestId("failed-video-notice");
  await notices.first().waitFor({ timeout: 20_000 });
  ok((await notices.count()) === 1, `Bibliothek: genau EIN Fehler-Hinweis (${await notices.count()}) — alt/Export/fertig nicht`);
  const text = (await notices.first().innerText()).replace(/\s+/g, " ");
  ok(
    text.includes("Video „Bildschirmaufnahme“ konnte nicht verarbeitet werden – die Aufnahme ließ sich nicht lesen") &&
      text.includes("Bitte erneut aufnehmen."),
    `Bibliothek: Hinweistext („${text.slice(0, 160)}“)`
  );
  ok(!/Alte Aufnahme|Export Lohn|Fertige Aufnahme/.test(await page.locator("main").last().innerText()), "Bibliothek: alte/Export-/fertige Aufträge nicht als Fehler");
  const running = page.getByText("Laufende Aufnahme wird erstellt …");
  ok(await running.isVisible(), "Bibliothek: laufender Auftrag unverändert sichtbar");
  ok(/Schritt 2\/5/.test(await page.locator("main").last().innerText()), "Bibliothek: Fortschritt des laufenden Auftrags");
  await page.screenshot({ path: path.join(SHOT_DIR, "1-bibliothek-fehler.png"), fullPage: false });

  const bellCount = page.getByTestId("bell-count");
  ok((await bellCount.innerText()).trim() === "1", `Glocke: Zähler 1 (${await bellCount.innerText()})`);
  await page.getByRole("button", { name: /Hinweise/ }).click();
  const bellItem = page.getByTestId("bell-failed-video");
  await bellItem.first().waitFor({ timeout: 5000 });
  ok(await page.locator('section[aria-label="Fehlgeschlagene Videos"]').isVisible(), "Glocke: Abschnitt „Fehlgeschlagene Videos“");
  await page.waitForTimeout(500); // Popover-Einblendung abwarten (Screenshot)
  ok((await bellItem.count()) === 1 && /„Bildschirmaufnahme“ konnte nicht verarbeitet werden/.test(await bellItem.innerText()), "Glocke: Eintrag mit Titel");
  ok(/Die Aufnahme ließ sich nicht lesen/.test(await bellItem.innerText()), "Glocke: Grund in Klartext (großgeschrieben)");
  await page.screenshot({ path: path.join(SHOT_DIR, "2-glocke.png"), fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ---- Ausblenden ----
  await notices.first().getByRole("button", { name: "Ausblenden" }).click();
  await page.waitForTimeout(300);
  ok((await notices.count()) === 0, "Ausblenden: Hinweiskarte weg");
  ok((await bellCount.count()) === 0, "Ausblenden: Glocken-Zähler sofort synchron (kein Zähler mehr)");
  ok(await running.isVisible(), "Ausblenden: laufender Auftrag weiter sichtbar");
  const stored = await page.evaluate(() => localStorage.getItem("steply-dismissed-video-jobs"));
  ok(stored && stored.includes(failedId), "Ausblenden: im Browser gemerkt (localStorage, je Auftrags-ID)");
  await page.reload();
  await page.getByText("Beleg in DATEV hochladen").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
  ok((await notices.count()) === 0, "Nach Neuladen: bleibt ausgeblendet");
  await page.getByRole("button", { name: /Hinweise/ }).click();
  await page.waitForTimeout(400);
  ok((await page.locator('section[aria-label="Fehlgeschlagene Videos"]').count()) === 0, "Nach Neuladen: Glocke ohne Abschnitt");
  await page.keyboard.press("Escape");
  await page.screenshot({ path: path.join(SHOT_DIR, "3-ausgeblendet.png"), fullPage: false });

  // ---- Glocke: Ausblenden direkt im Popover (zweiter Fehlschlag) ----
  const { data: second } = await admin
    .from("video_jobs")
    .insert(job({ title: "Zweite Aufnahme", status: "failed", error: "OpenAI 429 rate limit" }))
    .select("id")
    .single();
  await page.reload();
  await page.getByText("Beleg in DATEV hochladen").first().waitFor({ timeout: 60_000 });
  await notices.first().waitFor({ timeout: 20_000 });
  ok(/der KI-Dienst war vorübergehend nicht erreichbar/.test(await notices.first().innerText()), "Zweiter Fehlschlag: anderer Klartext-Grund (KI-Dienst)");
  await page.getByRole("button", { name: /Hinweise/ }).click();
  await bellItem.first().waitFor({ timeout: 5000 });
  await bellItem.first().getByRole("button", { name: /ausblenden/ }).click();
  await page.waitForTimeout(300);
  ok((await notices.count()) === 0, "Glocke-Ausblenden: Bibliotheks-Karte verschwindet mit");
  ok(
    (await page.evaluate(() => localStorage.getItem("steply-dismissed-video-jobs"))).includes(second.id),
    "Glocke-Ausblenden: gemerkt"
  );

  // ---- Mobil: keine horizontale Scrollleiste mit Hinweis ----
  await page.evaluate(() => localStorage.removeItem("steply-dismissed-video-jobs"));
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mob.newPage();
  await mp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await mp.fill("#email", email);
  await mp.fill("#password", PW);
  await mp.click('button[type="submit"]');
  await mp.waitForURL(/\/app/, { timeout: 60_000 });
  await mp.getByTestId("failed-video-notice").first().waitFor({ timeout: 60_000 });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow <= 1, `Mobil: keine horizontale Scrollleiste (${overflow}px)`);
  await mp.screenshot({ path: path.join(SHOT_DIR, "4-mobil.png"), fullPage: false });

  ok(pageErrors.length === 0, "keine Seitenfehler" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : JSON.stringify(e)));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) {
    try {
      spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore", shell: true });
    } catch {
      /* egal */
    }
  }
  // Konten löschen (video_jobs/tutorials hängen per on delete cascade daran).
  for (const acc of [accountId, accountB]) {
    if (acc) await admin.from("accounts").delete().eq("id", acc).then(() => {}, () => {});
  }
  for (const u of [userId, userB]) {
    if (u) await admin.auth.admin.deleteUser(u).catch(() => {});
  }
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Gescheiterte Video-Aufträge: Bibliothek + Glocke + Status-Route verifiziert.");
process.exit(failed ? 1 : 0);
