// Welle 37, Fix 1 — REPRO + DIAGNOSE des Login-Automations-Bugs (Repro-Pflicht).
//
// Symptom (Richard, live): Die Automation füllt E-Mail + Passwort auf der Steply-Login-Seite
// und klickt „Anmelden". Die Anmeldung PASSIERT serverseitig (Cookie gesetzt), aber die Seite
// bleibt/„reloaded" auf /login statt per React-Client-Navigation zur App zu gehen.
//
// Vorgehen: EXAKT unsere content.js-Sequenz gegen einen lokalen PROD-Build (next start). Die
// Funktionen execFill / execPointerGesture / execFormForSubmit / execClick werden LIVE aus
// extension/content.js extrahiert und injiziert — der Repro testet den AUSGELIEFERTEN Code.
//
// ── DIAGNOSE (was dieser Repro empirisch zeigt) ─────────────────────────────────────────────
// Ein React-19-Form-Action (`<form action={fn}>`) hat ZWEI Submission-Wege:
//   (a) React-abgefangen  → fetch mit `Next-Action`-Header, KEINE Voll-Navigation, Redirect
//       läuft als React-Client-Navigation → /app.  (RICHTIG)
//   (b) React-umgangen (native Formular-Submission) → VOLL-Dokument-POST, KEINE Client-Nav,
//       Seite lädt komplett neu.  (die „reload"-Symptomklasse — FALSCH)
// `el.click()` UND `form.requestSubmit(el)` laufen im hydrierten Zustand beide über (a). Nur
// eine NATIVE Submission (`form.submit()`) erzwingt (b). form.requestSubmit(el) ist die
// standardkonforme programmatische Submission: GENAU EIN submit-Event, das React exakt wie
// einen echten Klick behandelt — kein synthetischer Klick, dessen native Default-Submission
// unter ungünstigem Timing (b) auslösen könnte. Deshalb ist es die robuste Wahl.
//
// EHRLICHKEIT: In einem sauberen lokalen PROD-Build ließ sich die exakte „bleibt auf /login"-
// Symptomatik NICHT erzeugen — jede echte Anmeldung navigierte von /login WEG (React fing
// el.click() korrekt ab, auch im echten Isolated-World eines MV3-Content-Scripts, auch nahe
// der Hydration-Grenze). Der Repro belegt daher die FEHLER-KLASSE (native Submission = Voll-
// Reload) und verifiziert den Fix (requestSubmit → /app als Client-Navigation) sowie die
// Gegenprobe (Nicht-Submit-Klick unverändert). Der echte Auslöser liegt in der Live-Umgebung.
//
// Nutzung (Playwright liegt NICHT im Repo, sondern im Scratch-Ordner):
//   node --env-file=.env.local scripts/repro-login-exec.mjs
// Voraussetzung: `npm run build` gelaufen (next start braucht .next).

import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);

// ── Playwright aus dem Scratch-Ordner laden (bewusst NICHT im Repo). CJS → require. ─────────
const PW_DIR = process.env.STEPLY_PW_DIR || "C:/Users/Richa/AppData/Local/Temp/steply-pw";
const pwEntry = `${PW_DIR}/node_modules/playwright/index.js`;
if (!existsSync(pwEntry)) {
  console.error("✗ Playwright nicht gefunden unter", pwEntry, "\n  (STEPLY_PW_DIR setzen oder Scratch-Ordner anlegen).");
  process.exit(2);
}
const { chromium } = require(pwEntry);

// ── content.js-Funktionen live extrahieren (Balanced-Brace-Scan). ──────────────────────────
const contentSrc = readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
function extractFn(src, name) {
  const sig = `function ${name}(`;
  const start = src.indexOf(sig);
  if (start < 0) throw new Error(`Funktion ${name} nicht in content.js gefunden`);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  return src.slice(start, i);
}
const INJECT = [
  extractFn(contentSrc, "execFormForSubmit"),
  extractFn(contentSrc, "execPointerGesture"),
  extractFn(contentSrc, "execClick"),
  extractFn(contentSrc, "execFill"),
  // Die ALTE (vor dem Fix ausgelieferte) rohe Klick-Sequenz — nur zur Kontrast-Ausgabe.
  "function execClickOld(el){ execPointerGesture(el); el.click(); return { ok: true }; }",
  "window.__steplyExec = { execClick, execClickOld, execFill };",
].join("\n\n");

// ── Supabase-Admin (Wegwerf-User wie die test-*-live-Skripte). ─────────────────────────────
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_SECRET = process.env.SUPABASE_SECRET_KEY;
if (!SUPA_URL || !SUPA_SECRET) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY fehlen (mit --env-file=.env.local starten).");
  process.exit(2);
}
const admin = createClient(SUPA_URL, SUPA_SECRET, { auth: { persistSession: false } });

const PORT = Number(process.env.REPRO_PORT || 3021);
const BASE = `http://localhost:${PORT}`;
const stamp = Date.now();
const EMAIL = `steply-repro-login-${stamp}@example.com`;
const PASSWORD = "ReproTest12345!";

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };

let server;
let userId = null;

async function waitForServer(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/login`);
      if (r.status === 200) return true;
    } catch { /* noch nicht bereit */ }
    await new Promise((res) => setTimeout(res, 1000));
  }
  return false;
}

function newTracker(page) {
  const reqs = [];
  page.on("request", (r) => {
    const h = r.headers();
    reqs.push({ method: r.method(), url: r.url(), type: r.resourceType(), nextAction: !!h["next-action"] });
  });
  return reqs;
}
async function hasAuthCookie(context) {
  const cookies = await context.cookies();
  return cookies.some((c) => /auth-token/.test(c.name) && c.value && c.value.length > 0);
}
async function fillLogin(page) {
  await page.evaluate(({ email, pass }) => {
    window.__steplyExec.execFill(document.querySelector("#email"), email);
    window.__steplyExec.execFill(document.querySelector("#password"), pass);
  }, { email: EMAIL, pass: PASSWORD });
}
// Nach dem Klick auf eine Navigation (weg von /login) warten.
async function settle(page, ms = 8000) {
  await page.waitForURL(/\/(app|onboarding)(\/|$|\?)/, { timeout: ms }).catch(() => {});
  await page.waitForTimeout(400);
}
const isLogin = (u) => /\/login(\/|$|\?)/.test(u);
const leftLogin = (u) => /\/(app|onboarding)(\/|$|\?)/.test(u);

try {
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (cErr) throw new Error("createUser: " + cErr.message);
  userId = created.user.id;
  ok(!!userId, "Wegwerf-User angelegt");

  console.log(`… next start auf Port ${PORT} …`);
  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, PORT: String(PORT) }, stdio: "ignore", shell: true,
  });
  const up = await waitForServer();
  ok(up, "Server erreichbar (/login)");
  if (!up) throw new Error("Server nicht erreichbar");

  const browser = await chromium.launch();

  // ── INFO (Kontrast): alte rohe Klick-Sequenz (el.click()) im sauberen PROD-Build ──────────
  // Nur zur Dokumentation: hier fängt React el.click() korrekt ab → /app. Nicht assertiert,
  // weil die exakte „bleibt auf /login"-Symptomatik lokal NICHT erzeugbar ist.
  {
    const context = await browser.newContext();
    await context.addInitScript(INJECT);
    const page = await context.newPage();
    const reqs = newTracker(page);
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await fillLogin(page);
    await page.waitForTimeout(150);
    reqs.length = 0;
    await page.evaluate(() => window.__steplyExec.execClickOld(document.querySelector('form button[type="submit"]')));
    await settle(page);
    const docNav = reqs.find((r) => r.type === "document");
    console.log("\n── INFO: alte rohe Klick-Sequenz (Zeiger-Gesten + el.click()) ──");
    console.log("   End-URL:", page.url(), "| Voll-Reload:", docNav ? `JA (${docNav.method} ${docNav.url})` : "nein");
    console.log("   → im sauberen PROD-Build fängt React el.click() ab; die Live-Symptomatik ist lokal nicht erzeugbar.");
    await context.close();
  }

  // ── DIAGNOSE / VORHER: React-umgangene native Submission = VOLL-RELOAD (die Symptomklasse) ─
  {
    const context = await browser.newContext();
    await context.addInitScript(INJECT);
    const page = await context.newPage();
    const reqs = newTracker(page);
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await fillLogin(page);
    await page.waitForTimeout(150);
    reqs.length = 0;
    // form.submit() umgeht React vollständig → native Formular-Submission.
    await page.evaluate(() => document.querySelector("form").submit());
    await settle(page);
    const docNav = reqs.find((r) => r.type === "document");
    const nextAction = reqs.find((r) => r.nextAction);
    console.log("\n── VORHER-Klasse (React umgangen: native form.submit()) ──");
    console.log("   Voll-Dokument-Navigation:", docNav ? `${docNav.method} ${docNav.url}` : "keine");
    console.log("   React-Action-Fetch (Next-Action):", nextAction ? "ja" : "KEINER");
    ok(!!docNav && !nextAction,
      "VORHER-Klasse: React-umgangene Submission macht einen Voll-Reload (kein React-Client-Redirect)");
    await context.close();
  }

  // ── NACHHER (FIX): echtes execClick → form.requestSubmit(button) → React-Client-Nav → /app ─
  {
    const context = await browser.newContext();
    await context.addInitScript(INJECT);
    const page = await context.newPage();
    const reqs = newTracker(page);
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await fillLogin(page);
    await page.waitForTimeout(150);
    reqs.length = 0;
    await page.evaluate(() => window.__steplyExec.execClick(document.querySelector('form button[type="submit"]')));
    await settle(page);
    const url = page.url();
    const cookie = await hasAuthCookie(context);
    const docNav = reqs.find((r) => r.type === "document");
    const nextAction = reqs.find((r) => r.nextAction);
    console.log("\n── NACHHER (execClick → form.requestSubmit(button)) ──");
    console.log("   End-URL:", url, "| Session-Cookie:", cookie ? "GESETZT" : "fehlt");
    console.log("   React-Action-Fetch (Next-Action):", nextAction ? "ja" : "keiner",
      "| Voll-Reload:", docNav ? `JA (${docNav.url})` : "nein (Client-Navigation)");
    ok(leftLogin(url), `NACHHER: navigiert von /login WEG zur App — war ${url}`);
    ok(cookie, "NACHHER: Session-Cookie gesetzt (Anmeldung erfolgreich)");
    ok(!docNav, "NACHHER: React-Client-Navigation statt Voll-Reload (kein Dokument-POST)");
    await context.close();
  }

  // ── GEGENPROBE: Nicht-Submit-Button via execClick → el.click() (unverändert) ──────────────
  {
    const context = await browser.newContext();
    await context.addInitScript(INJECT);
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    const switched = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const toggle = btns.find((b) => /Magic Link/i.test(b.textContent || "") && b.getAttribute("type") === "button");
      if (!toggle) return { found: false };
      window.__steplyExec.execClick(toggle);
      return { found: true };
    });
    await page.waitForTimeout(400);
    const submitText = await page.evaluate(() => {
      const s = document.querySelector('form button[type="submit"]');
      return s ? (s.textContent || "").trim() : "";
    });
    const url = page.url();
    console.log("\n── GEGENPROBE (Nicht-Submit-Button via execClick) ──");
    console.log("   Umschalter gefunden:", switched.found, "| Submit-Button-Text danach:", JSON.stringify(submitText), "| URL:", url);
    ok(switched.found, "GEGENPROBE: Modus-Umschalter (type=button) gefunden");
    ok(/Magic Link/i.test(submitText), `GEGENPROBE: Nicht-Submit-Klick wirkt weiter (Modus umgeschaltet) — Button jetzt „${submitText}"`);
    ok(isLogin(url), `GEGENPROBE: keine Navigation (URL bleibt /login) — war ${url}`);
    await context.close();
  }

  await browser.close();
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  try {
    if (userId) await admin.auth.admin.deleteUser(userId);
  } catch (e) {
    console.warn("Cleanup-Warnung (User):", e.message);
  }
  if (server && server.pid) {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore", shell: true });
      } else {
        process.kill(-server.pid, "SIGKILL");
      }
    } catch { server.kill("SIGKILL"); }
  }
}

console.log(failed
  ? "\n✗ Repro FEHLGESCHLAGEN."
  : "\n✓ Repro grün: Fehler-Klasse belegt (native Submission = Voll-Reload) + Fix verifiziert (requestSubmit → App als Client-Navigation) + Gegenprobe ok.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);
