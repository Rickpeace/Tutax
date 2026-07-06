// Welle 38, Teil A — KALTSTART-REPRO + Diagnose der Login-Automations-Restlücke.
//
// Vorgeschichte: Warm klappt der Login-Automations-Lauf zuverlässig; bei KALTER Seite
// (Vercel-Funktion schlief, Browser frisch gestartet) füllt die Automation E-Mail+Passwort,
// klickt „Anmelden" — und die Seite lädt VOLL neu statt per React-Client-Navigation zur App
// zu gehen. Ursache-Klasse (Welle 37 bewiesen): ein React-19-Form-Action hat ZWEI Wege —
//   (a) React-abgefangen → fetch mit Next-Action-Header, KEINE Voll-Navigation, Redirect als
//       Client-Nav → /app.  (RICHTIG)
//   (b) React-umgangen (native, progressiv erweiterte Submission) → VOLL-Dokument-POST, Seite
//       lädt komplett neu.  (die „reload"-Symptomklasse — FALSCH)
// requestSubmit(button) läuft im HYDRIERTEN Zustand über (a). Feuert der Submit VOR der
// Hydration, greift (b). Die v2.9.6-Sonde soll genau bis zur Hydration warten.
//
// ── DIAGNOSE (was dieser Repro empirisch zeigt) ─────────────────────────────────────────────
// Unter künstlichem Kaltstart (CDP: CPU-Drossel + Fast-3G + Cache aus) ist das Fenster
// „Dokument da, React noch nicht dran" mehrere Sekunden breit (gemessen: Formular sichtbar
// ~1 s, hydriert erst ~3,8 s bei 8x-CPU; ~9,6 s bei 16x; ~14,1 s bei 20x). Zwei bewiesene
// Fakten (s. VORHER/NACHHER unten):
//   • Submit VOR der Hydration  → NATIVER Dokument-POST (Voll-Reload).           [rot]
//   • Submit NACH dem Hydration-Flag (Formular trägt __react*-Keys) → React-Fetch. [grün]
// Der Sonde-PRÄDIKAT (Formular-__react*-Keys = hydriert) ist also KORREKT. Die Restlücke war,
// dass execWaitHydration VOR der Hydration OFFEN durchfiel und dann nativ submittete:
//   (e) Deckel 8 s < echte Kaltstart-Hydration (9,6–14,1 s) → Deckel greift → nativer Submit.
//   (c) isReact hing an window.__next_f / window.next / [data-reactroot]; letzteres gibt es in
//       React 19 nicht, window.next kommt spät (~2,5 s). `script[src*="/_next/"]` steht ~50 ms
//       nach Start — das früheste, robusteste Next-Signal.
//   (Sonde-nicht-verfügbar) MV3-Service-Worker kalt nach Browser-Neustart → ok:false →
//       früher offener Durchfall. Das geteilte DOM-Signal (script[/_next/]) hält den Wartefall.
// FIX (Welle 38): background-Sonde härtet isReact um `script[src*="/_next/"]`; content
// execWaitHydration hebt den Deckel auf 12 s und fällt auf einer erkennbaren Framework-Seite
// NICHT mehr offen durch (weder bei ok:false noch bei kurzzeitig isReact=false). Zusätzlich
// Teil B (Panel): submit-bounced-Netz fängt jeden Restfall zur Laufzeit.
//
// Dieser Repro fährt die AUSGELIEFERTEN Funktionen (execFill/execClick/execFormForSubmit live
// aus content.js) + das AUSGELIEFERTE Sonde-Prädikat (live aus background.js) + den
// AUSGELIEFERTEN Hydration-Deckel (live aus content.js) unter Drossel.
//
// Nutzung:  node --env-file=.env.local scripts/repro-login-coldstart.mjs
// Voraussetzung: `npm run build` gelaufen (next start braucht .next). Playwright im Scratch.

import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);

const PW_DIR = process.env.STEPLY_PW_DIR || "C:/Users/Richa/AppData/Local/Temp/steply-pw";
const pwEntry = `${PW_DIR}/node_modules/playwright/index.js`;
if (!existsSync(pwEntry)) {
  console.error("✗ Playwright nicht gefunden unter", pwEntry, "\n  (STEPLY_PW_DIR setzen oder Scratch-Ordner anlegen).");
  process.exit(2);
}
const { chromium } = require(pwEntry);

// ── Balanced-Brace-Extraktion einer Funktion / eines Arrow-Ausdrucks. ───────────────────────
function braceSlice(src, fromIdx) {
  let i = src.indexOf("{", fromIdx);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error("Klammern nicht balanciert");
}
function extractFn(src, name) {
  const sig = `function ${name}(`;
  const start = src.indexOf(sig);
  if (start < 0) throw new Error(`Funktion ${name} nicht gefunden`);
  return src.slice(start, braceSlice(src, start));
}

const contentSrc = readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
const bgSrc = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");

// AUSGELIEFERTE content.js-Funktionen (live).
const INJECT = [
  extractFn(contentSrc, "execFormForSubmit"),
  extractFn(contentSrc, "execPointerGesture"),
  extractFn(contentSrc, "execClick"),
  extractFn(contentSrc, "execFill"),
  // AUSGELIEFERTES Sonde-Prädikat (live aus background.js: die MAIN-World-func der Sonde).
  (() => {
    const anchor = bgSrc.indexOf("func: () =>");
    if (anchor < 0) throw new Error("Sonde-func nicht in background.js gefunden");
    const arrowStart = bgSrc.indexOf("()", anchor);
    const arrowSrc = bgSrc.slice(arrowStart, braceSlice(bgSrc, arrowStart));
    return `window.__steplyProbe = ${arrowSrc};`;
  })(),
  "window.__steplyExec = { execClick, execFill, execFormForSubmit };",
].join("\n\n");

// AUSGELIEFERTER Hydration-Deckel (live aus content.js execWaitHydration).
const HYDRATION_MAX = (() => {
  const fn = extractFn(contentSrc, "execWaitHydration");
  const m = fn.match(/const\s+MAX\s*=\s*(\d+)/);
  if (!m) throw new Error("MAX in execWaitHydration nicht gefunden");
  return Number(m[1]);
})();

// ── Supabase-Admin (Wegwerf-User wie die test-*-live-Skripte). ─────────────────────────────
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_SECRET = process.env.SUPABASE_SECRET_KEY;
if (!SUPA_URL || !SUPA_SECRET) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY fehlen (mit --env-file=.env.local starten).");
  process.exit(2);
}
const admin = createClient(SUPA_URL, SUPA_SECRET, { auth: { persistSession: false } });

const PORT = Number(process.env.REPRO_PORT || 3022);
const BASE = `http://localhost:${PORT}`;
const stamp = Date.now();
const EMAIL = `steply-cold-${stamp}@example.com`;
const PASSWORD = "ReproTest12345!";
// Drossel-Stärke. 8x reicht für ein zuverlässiges Vor-Hydration-Fenster (~3,8 s Hydration).
const CPU_RATE = Number(process.env.REPRO_CPU || 8);
const RUNS = Number(process.env.REPRO_RUNS || 3);

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

// CDP-Kaltstart-Emulation: CPU-Drossel + Fast-3G + Cache aus.
async function coldThrottle(context, page, cpu = CPU_RATE) {
  const c = await context.newCDPSession(page);
  await c.send("Network.enable");
  await c.send("Network.setCacheDisabled", { cacheDisabled: true });
  await c.send("Network.emulateNetworkConditions", {
    offline: false, latency: 400, downloadThroughput: 200000, uploadThroughput: 100000,
  });
  await c.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  return c;
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
// Felder füllen, SOBALD #email im DOM ist (rohes querySelector-Polling wie der Extension-
// Resolver — NICHT Playwrights Actionability, die unter CPU-Drossel bis nach der Hydration
// warten würde und das Fenster verfehlt). Gibt zurück, ob beim Füllen schon hydriert war.
async function fillWhenPresent(page) {
  return await page.evaluate(async ({ email, pass }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 300 && !document.querySelector("#email"); i++) await sleep(40);
    const form = document.querySelector("form");
    const hydratedAtFill = !!form && Object.keys(form).some((k) => k.indexOf("__react") === 0);
    window.__steplyExec.execFill(document.querySelector("#email"), email);
    window.__steplyExec.execFill(document.querySelector("#password"), pass);
    return { hydratedAtFill };
  }, { email: EMAIL, pass: PASSWORD });
}
// Die AUSGELIEFERTE Warte-Logik nachstellen: Formular markieren, Sonde-Prädikat (live)
// pollen, hydrated/!isReact(+DOM-Framework-Signal)/Deckel exakt wie execWaitHydration.
async function waitHydrationLikeContent(page, maxMs) {
  return await page.evaluate(async (MAX) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const TICK = 250;
    const form = document.querySelector("form");
    if (form) form.setAttribute("data-steply-hydration-probe", "1");
    let looksFramework = false;
    try { looksFramework = !!document.querySelector('script[src*="/_next/"], [data-reactroot]'); } catch (e) {}
    const t0 = Date.now();
    let outcome = "timeout";
    while (Date.now() - t0 < MAX) {
      const res = window.__steplyProbe();
      if (res.hydrated) { outcome = "hydrated"; break; }
      if (!res.isReact && !looksFramework) { outcome = "not-react"; break; }
      await sleep(TICK);
    }
    if (form) form.removeAttribute("data-steply-hydration-probe");
    return { outcome, waitedMs: Date.now() - t0 };
  }, maxMs);
}
async function settleToApp(page, ms = 12000) {
  await page.waitForURL(/\/(app|onboarding)(\/|$|\?)/, { timeout: ms }).catch(() => {});
  await page.waitForTimeout(300);
}
const leftLogin = (u) => /\/(app|onboarding)(\/|$|\?)/.test(u);

try {
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (cErr) throw new Error("createUser: " + cErr.message);
  userId = created.user.id;
  ok(!!userId, "Wegwerf-User angelegt");
  console.log(`  (Sonde-Prädikat + execFill/execClick live extrahiert; Hydration-Deckel = ${HYDRATION_MAX}ms; CPU-Drossel ${CPU_RATE}x)`);

  console.log(`… next start auf Port ${PORT} …`);
  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, PORT: String(PORT) }, stdio: "ignore", shell: true,
  });
  const up = await waitForServer();
  ok(up, "Server erreichbar (/login)");
  if (!up) throw new Error("Server nicht erreichbar");

  const browser = await chromium.launch();

  // ── VORHER / NACHHER, ≥3 Läufe stabil ──────────────────────────────────────────────────
  for (let run = 1; run <= RUNS; run++) {
    console.log(`\n──────── Lauf ${run}/${RUNS} ────────`);

    // VORHER: die Sonde fiel offen durch (Deckel/ok:false/isReact) → Submit VOR der Hydration.
    // Wir stellen die Folge nach: füllen, dann SOFORT requestSubmit (kein wirksames Warten).
    {
      const context = await browser.newContext();
      await context.addInitScript(INJECT);
      const page = await context.newPage();
      await coldThrottle(context, page);
      const reqs = newTracker(page);
      await page.goto(`${BASE}/login`, { waitUntil: "commit" });
      const { hydratedAtFill } = await fillWhenPresent(page);
      reqs.length = 0;
      await page.evaluate(() => window.__steplyExec.execClick(document.querySelector('form button[type="submit"]')));
      await page.waitForTimeout(5000);
      const docPost = reqs.find((r) => r.type === "document" && r.method === "POST");
      const nextAction = reqs.find((r) => r.nextAction);
      // Hinweis: Der native POST FÜHRT die Server-Action progressiv aus (Anmeldung kommt
      // serverseitig durch) — aber als VOLL-Reload. Genau das ist der Bug: die Seite lädt
      // komplett neu (Felder leer), der Lauf stapft blind weiter. Ob danach /app oder der
      // Cookie-Race-Bounce /login?next=%2Fapp steht, ist zweitrangig — der Voll-Reload IST rot.
      console.log(`  VORHER (Submit ohne wirksames Warten): hydriert beim Füllen=${hydratedAtFill}` +
        ` | Dokument-POST(Voll-Reload)=${docPost ? "JA" : "nein"} | Next-Action-Fetch=${nextAction ? "ja" : "nein"} | End-URL=${page.url()}`);
      ok(!hydratedAtFill, `VORHER Lauf ${run}: beim Füllen war React NICHT hydriert (Kaltstart-Fenster getroffen)`);
      ok(!!docPost && !nextAction,
        `VORHER Lauf ${run}: Submit vor Hydration = NATIVER Dokument-POST (Voll-Reload, kein React-Fetch)`);
      await context.close();
    }

    // NACHHER: die AUSGELIEFERTE Warte-Logik (live Prädikat + live Deckel) wartet bis hydriert,
    // DANN requestSubmit → React-Fetch → Client-Nav zur App.
    {
      const context = await browser.newContext();
      await context.addInitScript(INJECT);
      const page = await context.newPage();
      await coldThrottle(context, page);
      const reqs = newTracker(page);
      await page.goto(`${BASE}/login`, { waitUntil: "commit" });
      await fillWhenPresent(page);
      const wait = await waitHydrationLikeContent(page, HYDRATION_MAX);
      reqs.length = 0;
      await page.evaluate(() => window.__steplyExec.execClick(document.querySelector('form button[type="submit"]')));
      await settleToApp(page);
      const url = page.url();
      const cookie = await hasAuthCookie(context);
      const docPost = reqs.find((r) => r.type === "document" && r.method === "POST");
      const nextAction = reqs.find((r) => r.nextAction);
      console.log(`  NACHHER (execWaitHydration): warten→${wait.outcome} nach ${wait.waitedMs}ms` +
        ` | Next-Action-Fetch=${nextAction ? "ja" : "NEIN"} | Dokument-POST=${docPost ? "JA" : "nein"}` +
        ` | Session-Cookie=${cookie ? "gesetzt" : "fehlt"} | End-URL=${url}`);
      ok(wait.outcome === "hydrated", `NACHHER Lauf ${run}: Warten endete bei HYDRATED (kein Deckel-Durchfall)`);
      ok(!!nextAction && !docPost, `NACHHER Lauf ${run}: React-Client-Submit (Next-Action-Fetch, kein Voll-Reload)`);
      ok(leftLogin(url), `NACHHER Lauf ${run}: von /login WEG zur App navigiert — ${url}`);
      ok(cookie, `NACHHER Lauf ${run}: Session-Cookie gesetzt (Anmeldung erfolgreich)`);
      await context.close();
    }
  }

  // ── DIAGNOSE-BELEG (e): echte Kaltstart-Hydration überschreitet den ALTEN 8s-Deckel. ──────
  {
    const context = await browser.newContext();
    await context.addInitScript(
      `window.__t0=performance.now();(function p(){const f=document.querySelector("form");` +
      `if(f&&Object.keys(f).some(k=>k.indexOf("__react")===0)){window.__hyd=Math.round(performance.now()-window.__t0);return}` +
      `setTimeout(p,20)})();`
    );
    const page = await context.newPage();
    await coldThrottle(context, page, 20); // stärkere Drossel = echterer Kaltstart
    await page.goto(`${BASE}/login`, { waitUntil: "commit" });
    await page.waitForFunction(() => window.__hyd != null, { timeout: 30000 }).catch(() => {});
    const hyd = await page.evaluate(() => window.__hyd);
    console.log(`\n── DIAGNOSE (e): Hydration bei 20x-CPU-Drossel = +${hyd}ms ab Dokumentstart (ALTER Deckel war 8000ms).`);
    ok(hyd != null && hyd > 8000,
      `Belegt: echte Kaltstart-Hydration (${hyd}ms) > ALTER 8s-Deckel → Sonde fiel offen durch (Restlücke e)`);
    ok(HYDRATION_MAX > 8000, `Fix: Hydration-Deckel angehoben (jetzt ${HYDRATION_MAX}ms > 8000ms)`);
    await context.close();
  }

  // ── DIAGNOSE-BELEG (c): script[src*="/_next/"] steht VOR dem Formular (deckt das Fenster). ──
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await coldThrottle(context, page);
    await page.goto(`${BASE}/login`, { waitUntil: "commit" });
    const sig = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 300 && !document.querySelector("form"); i++) await sleep(20);
      return {
        formPresent: !!document.querySelector("form"),
        nextScript: !!document.querySelector('script[src*="/_next/"]'),
        reactroot: !!document.querySelector("[data-reactroot]"),
      };
    });
    console.log(`── DIAGNOSE (c): beim Erscheinen des Formulars: script[/_next/]=${sig.nextScript}` +
      ` (gehärtetes isReact-Signal), [data-reactroot]=${sig.reactroot} (React 19: nie vorhanden).`);
    ok(sig.formPresent && sig.nextScript,
      "Belegt: das gehärtete Next-Signal (script[/_next/]) ist schon da, wenn das Formular erscheint (schließt isReact-Loch c)");
    const bgHardened = bgSrc.includes('script[src*="/_next/"]');
    ok(bgHardened, "Fix: background-Sonde härtet isReact um script[src*=\"/_next/\"]");
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
  ? "\n✗ Kaltstart-Repro FEHLGESCHLAGEN."
  : "\n✓ Kaltstart-Repro grün: VORHER nativer Voll-Reload (rot), NACHHER React-Client-Submit → App (grün);" +
    " Restlücken (e: Deckel, c: isReact) belegt + gefixt.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);
