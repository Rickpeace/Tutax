// Beweis: Im Endkunden-Player (Wizard → ViewerImage) blitzt beim Durchklicken KEIN Bild ohne
// seine Verpixelung auf, und Markierungen erscheinen nie zeitversetzt zum Bild (Commit f0908fc).
//
// Ablauf: legt per Service-Client (admin) ein Wegwerf-Pro-Konto + ein veröffentlichtes,
// öffentliches Tutorial mit 4 Schritten an (je eigenes Bild, per sharp erzeugt; Schritt 1–3 mit
// 1–2 Verpixelungen + 1 Rechteck, Schritt 4 nur Rechteck), startet einen eigenen `next dev` auf
// einem freien Port und misst in headless Chromium (1440×900 und 390×844, je einmal mit ~700 ms
// Verzögerung auf JEDER Bildantwort und einmal ohne):
//   • Ein requestAnimationFrame-Sampler (page.addInitScript) protokolliert in JEDEM Frame für das
//     Schritt-Bild (und die Lightbox): currentSrc, computed opacity, complete/naturalWidth, die
//     backdrop-filter-Blur-Divs samt Prozent-Positionen und die SVG-Markierungen ([data-mark]).
//   • Durchklicken mit Weiter/Zurück (ruhig UND schnell hintereinander), Lightbox einmal öffnen.
//   • Assertions je Frame: Ist ein Bild sichtbar (opacity>0, complete, naturalWidth>0), müssen
//     GENAU die Blur-Divs seines eigenen Schritts da sein (Zuordnung Bild-URL → Schritt) und
//     GENAU seine Rechteck-Markierung (keine fehlende, keine eines anderen Schritts). Zusätzlich:
//     keine Markierungen über einem noch nicht geladenen, aber deckenden Bild.
//
// Wahl der Bilder (bewusst): Die öffentliche Kopie im Bucket `tutorial-images-public` ist hier
// das UNVERPIXELTE Original (beim echten Veröffentlichen brennt copyImagesToPublic die Blurs ein).
// So misst der Test ausschließlich die Wirkung des Viewers — ein Aufblitzen wäre im Klartext zu
// sehen, statt vom eingebrannten Blur kaschiert zu werden. Die private Kopie (`tutorial-images`)
// liegt wie beim normalen Weg daneben. Beide werden am Ende gelöscht.
//
// Nutzung:  node --env-file=.env.local scripts/test-viewer-blur-flash.mjs
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import sharp from "sharp";

const require = createRequire(import.meta.url);

// Playwright lokal, aus STEPLY_PW_DIR ODER aus dem npx-Cache auflösen.
function resolvePlaywright() {
  try {
    return require("playwright");
  } catch {
    /* nicht lokal installiert */
  }
  if (process.env.STEPLY_PW_DIR) {
    const p = path.join(process.env.STEPLY_PW_DIR, "node_modules", "playwright");
    if (existsSync(p)) return require(p);
  }
  const base = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
  const npxDir = path.join(base, "npm-cache", "_npx");
  if (existsSync(npxDir)) {
    for (const d of readdirSync(npxDir)) {
      const p = path.join(npxDir, d, "node_modules", "playwright");
      if (existsSync(p)) return require(p);
    }
  }
  throw new Error("playwright nicht gefunden (weder lokal noch im npx-Cache).");
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const PRIV = "tutorial-images";
const PUB = "tutorial-images-public";

const stamp = Date.now();
const SLUG = `blurflash-${stamp}`;
const TUT_SLUG = "durchklicken";
const uuid = () => crypto.randomUUID();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 1200;
const H = 700;
const DELAY_MS = 700;

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

// ---- Testinhalt ------------------------------------------------------------
// Jede Markierung an einer eigenen Stelle, damit „Markierung eines anderen Schritts“ auffällt.
const STEPS = [
  {
    color: "#1d4ed8",
    blurs: [
      { x: 0.05, y: 0.62, w: 0.4, h: 0.12 },
      { x: 0.55, y: 0.08, w: 0.3, h: 0.1 },
    ],
    rect: { x: 0.1, y: 0.3, w: 0.25, h: 0.15 },
  },
  { color: "#047857", blurs: [{ x: 0.5, y: 0.5, w: 0.35, h: 0.15 }], rect: { x: 0.6, y: 0.2, w: 0.2, h: 0.2 } },
  {
    color: "#b45309",
    blurs: [
      { x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
      { x: 0.3, y: 0.75, w: 0.45, h: 0.1 },
    ],
    rect: { x: 0.4, y: 0.4, w: 0.3, h: 0.12 },
  },
  { color: "#7c3aed", blurs: [], rect: { x: 0.05, y: 0.05, w: 0.15, h: 0.3 } },
];

/** Gut sichtbares, je Schritt verschiedenes Bild: Farbfläche, Gitter, großer Text, „Klartext“. */
async function makeImage(i) {
  const s = STEPS[i];
  const lines = [];
  for (let x = 0; x <= W; x += 60) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#fff" stroke-opacity=".25"/>`);
  for (let y = 0; y <= H; y += 60) lines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#fff" stroke-opacity=".25"/>`);
  const secrets = s.blurs
    .map(
      (b) =>
        `<text x="${(b.x + 0.01) * W}" y="${(b.y + b.h * 0.7) * H}" font-family="Arial" font-size="34" font-weight="bold" fill="#fff">IBAN DE12 3456 7890 ${i}${i}${i}</text>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="${s.color}"/>
    ${lines.join("")}
    <circle cx="${W * 0.85}" cy="${H * 0.8}" r="${60 + i * 20}" fill="#fff" fill-opacity=".35"/>
    <text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-family="Arial" font-size="140" font-weight="bold" fill="#fff">SCHRITT ${i + 1}</text>
    ${secrets}
  </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer();
}

const highlightsOf = (i) => [
  ...STEPS[i].blurs.map((b, j) => ({ id: `s${i}b${j}`, type: "blur", ...b })),
  { id: `s${i}r`, type: "rect", ...STEPS[i].rect, strokeWidth: 3 },
];

// ---- Setup-Helfer ----------------------------------------------------------
let userId, accId, server, browser, tutId;
const paths = [];

function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", rej);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

async function waitForServer(base, timeoutMs = 150_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${base}/api/recorder/guide-handshake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (r.status === 401 || r.status === 400) return true;
    } catch {
      /* noch nicht bereit */
    }
    await sleep(1000);
  }
  return false;
}

// ---- Browser-Sampler (läuft in der Seite) ----------------------------------
// Protokolliert in jedem Animation-Frame den Zustand des Schritt-Bildes (button.cursor-zoom-in)
// und der Lightbox ([role=dialog]). rAF läuft direkt vor Stil/Layout/Paint — der protokollierte
// DOM-Stand ist also der, der in diesem Frame gemalt wird.
function samplerInit() {
  const vs = (window.__vs = { on: false, phase: "", frames: [] });
  const probe = (img) => {
    if (!img) return null;
    const wrap = img.parentElement;
    const blurs = [...wrap.children]
      .filter((el) => el.tagName === "DIV" && /blur/.test(el.style.backdropFilter || el.style.webkitBackdropFilter || ""))
      .map((el) => [el.style.left, el.style.top, el.style.width, el.style.height].map(parseFloat));
    const svg = wrap.querySelector(":scope > svg");
    const sw = svg ? parseFloat(svg.getAttribute("width")) : 0;
    const sh = svg ? parseFloat(svg.getAttribute("height")) : 0;
    const marks =
      svg && sw > 0 && sh > 0
        ? [...svg.querySelectorAll("[data-mark]")].map((m) => ({
            type: m.getAttribute("data-mark"),
            x: parseFloat(m.getAttribute("x")) / sw,
            y: parseFloat(m.getAttribute("y")) / sh,
            w: parseFloat(m.getAttribute("width")) / sw,
            h: parseFloat(m.getAttribute("height")) / sh,
          }))
        : [];
    return {
      src: img.currentSrc || img.src,
      op: parseFloat(getComputedStyle(img).opacity),
      complete: img.complete,
      nw: img.naturalWidth,
      blurs,
      marks,
    };
  };
  const tick = (t) => {
    requestAnimationFrame(tick);
    if (!vs.on) return;
    vs.frames.push({
      t: Math.round(t),
      phase: vs.phase,
      w: probe(document.querySelector("button.cursor-zoom-in img")),
      lb: probe(document.querySelector('[role="dialog"] img[src*="tutorial-images-public"]')),
    });
  };
  requestAnimationFrame(tick);
}

// ---- Auswertung --------------------------------------------------------------
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const stepOf = (src) => {
  const m = /\/step(\d)-\d+\.webp/.exec(src || "");
  return m ? Number(m[1]) : null;
};

/** Prüft EINEN Frame-Zustand; gibt eine Liste von Verstößen (Strings) zurück. */
function checkProbe(p) {
  if (!p) return [];
  const visible = p.op > 0 && p.complete && p.nw > 0;
  if (!visible) {
    // Deckendes, aber noch nicht geladenes Bild: der Browser zeigt ggf. noch das vorige —
    // Markierungen darüber wären die eines anderen Schritts.
    if (p.op > 0 && !p.complete && p.marks.length) return ["marks-over-unloaded"];
    return [];
  }
  const k = stepOf(p.src);
  if (k == null) return ["unknown-src"];
  const exp = STEPS[k];
  const v = [];
  const blurOk =
    p.blurs.length === exp.blurs.length &&
    exp.blurs.every((b) =>
      p.blurs.some(
        ([l, t, w, h]) => near(l, b.x * 100, 0.2) && near(t, b.y * 100, 0.2) && near(w, b.w * 100, 0.2) && near(h, b.h * 100, 0.2),
      ),
    );
  if (!blurOk) v.push(p.blurs.length < exp.blurs.length ? "blur-missing" : "blur-wrong");
  const r = exp.rect;
  const rectOk =
    p.marks.length === 1 &&
    p.marks[0].type === "rect" &&
    near(p.marks[0].x, r.x, 0.01) &&
    near(p.marks[0].y, r.y, 0.01) &&
    near(p.marks[0].w, r.w, 0.01) &&
    near(p.marks[0].h, r.h, 0.01);
  if (!rectOk) v.push(p.marks.length === 0 ? "rect-missing" : "marks-wrong");
  return v;
}

function evaluate(frames, label, { delayed }) {
  const counts = {};
  const examples = [];
  const visiblePerStep = [0, 0, 0, 0];
  let lbVisible = 0;
  let wizHidden = 0;
  let violatingFrames = 0;
  for (const f of frames) {
    let bad = false;
    for (const [which, p] of [
      ["wizard", f.w],
      ["lightbox", f.lb],
    ]) {
      if (p && p.op > 0 && p.complete && p.nw > 0) {
        if (which === "wizard") {
          const k = stepOf(p.src);
          if (k != null) visiblePerStep[k]++;
        } else lbVisible++;
      } else if (which === "wizard" && p) wizHidden++;
      for (const v of checkProbe(p)) {
        bad = true;
        const key = `${which}:${v}`;
        counts[key] = (counts[key] ?? 0) + 1;
        if (examples.length < 6)
          examples.push(`${key} [${f.phase}] src=Schritt ${stepOf(p.src) != null ? stepOf(p.src) + 1 : "?"} op=${p.op} complete=${p.complete} blurs=${p.blurs.length} marks=${JSON.stringify(p.marks.map((m) => m.type))}`);
      }
    }
    if (bad) violatingFrames++;
  }
  console.log(`  ${label}: ${frames.length} Frames, ${violatingFrames} mit Verstoß, sichtbar je Schritt ${visiblePerStep.join("/")}, Lightbox sichtbar ${lbVisible}, Schritt-Bild unsichtbar/ladend ${wizHidden}`);
  for (const [k, n] of Object.entries(counts)) console.log(`    · ${k}: ${n} Frames`);
  for (const e of examples) console.log(`    z. B. ${e}`);
  ok(frames.length > 100, `${label}: Sampler lief (${frames.length} Frames)`);
  ok(visiblePerStep.every((n) => n >= 5), `${label}: jedes Schritt-Bild war sichtbar (Abdeckung)`);
  ok(lbVisible >= 5, `${label}: Lightbox-Bild war sichtbar`);
  if (delayed) ok(wizHidden > 0 || violatingFrames > 0, `${label}: Verzögerung griff (Ladezustände beobachtet)`);
  ok(violatingFrames === 0, `${label}: kein Frame mit Bild ohne eigene Verpixelung/Markierung`);
  return { frames: frames.length, violatingFrames, counts };
}

// ---- Durchklicken ------------------------------------------------------------
async function run(base, vp, delayed) {
  const label = `${vp.name} ${delayed ? `+${DELAY_MS}ms` : "ohne Verzögerung"}`;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  try {
    await ctx.addInitScript(samplerInit);
    const page = await ctx.newPage();
    if (delayed) {
      await page.route(/\/storage\/v1\/object\/public\/tutorial-images-public\//, async (route) => {
        await sleep(DELAY_MS);
        await route.continue().catch(() => {});
      });
    }
    const phase = (p) => page.evaluate((x) => (window.__vs.phase = x), p);
    await page.goto(`${base}/h/${SLUG}/${TUT_SLUG}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector('[data-tx="step"]', { timeout: 90_000 });
    await page.evaluate(() => (window.__vs.on = true));
    // Hinweis: Frames vor dem Hydrieren (Server-HTML) werden mitgemessen, sobald `on` gesetzt ist.
    await phase("erstes-laden");
    await page.waitForTimeout(2000);

    const next = () => page.locator('[data-tx="btn"]').first().click();
    const back = () => page.getByRole("button", { name: "Zurück", exact: true }).first().click();

    for (let i = 1; i <= 3; i++) {
      await phase(`weiter→${i + 1}`);
      await next();
      await page.waitForTimeout(1500);
    }
    for (let i = 3; i >= 1; i--) {
      await phase(`zurück→${i}`);
      await back();
      await page.waitForTimeout(1500);
    }
    // Schnell hintereinander (während das nächste Bild noch lädt).
    await phase("schnell-weiter");
    for (let i = 0; i < 3; i++) {
      await next();
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1800);
    await phase("schnell-zurück");
    for (let i = 0; i < 3; i++) {
      await back();
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(1800);
    await phase("weiter-zurück-flattern");
    await next();
    await page.waitForTimeout(60);
    await back();
    await page.waitForTimeout(60);
    await next();
    await page.waitForTimeout(1800);

    // Lightbox auf dem aktuellen Schritt (2) öffnen und prüfen.
    await phase("lightbox");
    await page.locator("button.cursor-zoom-in").click();
    await page.waitForSelector('[role="dialog"] img[src*="tutorial-images-public"]', { timeout: 10_000 });
    await page.waitForTimeout(1800);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    const frames = await page.evaluate(() => window.__vs.frames);
    return evaluate(frames, label, { delayed });
  } finally {
    await ctx.close();
  }
}

// ---- Hauptablauf -------------------------------------------------------------
const results = [];
try {
  // Konto
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email: `tutax-blurflash-${stamp}@example.com`,
    password: "Test12345!",
    email_confirm: true,
  });
  if (uErr) throw uErr;
  userId = u.user.id;
  const { data: members } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accId = members[0].account_id;
  await admin.from("accounts").update({ slug: SLUG, name: "Blur-Flash Test GmbH", plan: "pro" }).eq("id", accId);

  // Tutorial + Schritte + Bilder
  tutId = uuid();
  const { error: tErr } = await admin.from("tutorials").insert({
    id: tutId,
    account_id: accId,
    title: "Durchklicken mit Verpixelung",
    slug: TUT_SLUG,
    status: "published",
    visibility: "public",
    is_template: false,
  });
  if (tErr) throw tErr;
  const ids = STEPS.map(() => uuid());
  const rows = [];
  for (let i = 0; i < STEPS.length; i++) {
    const p = `${accId}/${tutId}/step${i}-${stamp}.webp`;
    paths.push(p);
    const img = await makeImage(i);
    for (const bucket of [PRIV, PUB]) {
      const { error } = await admin.storage
        .from(bucket)
        .upload(p, img, { upsert: true, contentType: "image/webp", cacheControl: "60" });
      if (error) throw new Error(`Upload ${bucket}: ${error.message}`);
    }
    rows.push({
      id: ids[i],
      tutorial_id: tutId,
      title: `Schritt ${i + 1}`,
      body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `Text zu Schritt ${i + 1}.` }] }] },
      position: i + 1,
      image_path: p,
      image_width: W,
      image_height: H,
      highlights: highlightsOf(i),
    });
  }
  const { error: sErr } = await admin.from("steps").insert(rows);
  if (sErr) throw sErr;
  await admin.from("tutorials").update({ root_step_id: ids[0] }).eq("id", tutId);
  const { error: bErr } = await admin.from("step_branches").insert(
    ids.slice(0, -1).map((id, i) => ({ id: uuid(), step_id: id, label: null, target_step_id: ids[i + 1], position: 0, color: null })),
  );
  if (bErr) throw bErr;
  ok(true, `Setup: Wegwerf-Konto /h/${SLUG}/${TUT_SLUG} mit 4 Schritten + Bildern`);

  // Server
  const port = await freePort();
  const base = `http://localhost:${port}`;
  console.log("… next dev auf Port", port, "wird gestartet (kann dauern) …");
  server = spawn("npx", ["next", "dev", "-p", String(port)], {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
    shell: true,
  });
  const up = await waitForServer(base);
  ok(up, "Server erreichbar");
  if (!up) throw new Error("Server nicht erreichbar");
  // Seite einmal vorkompilieren, damit die Messung nicht in die Kompilierzeit läuft.
  await fetch(`${base}/h/${SLUG}/${TUT_SLUG}`).catch(() => {});

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  for (const vp of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    for (const delayed of [true, false]) results.push(await run(base, vp, delayed));
  }
  const total = results.reduce((a, r) => a + r.frames, 0);
  const bad = results.reduce((a, r) => a + r.violatingFrames, 0);
  console.log(`\nGesamt: ${total} Frames, ${bad} mit Verstoß.`);
} catch (e) {
  ok(false, "Fehler: " + e.message);
  console.error(e);
} finally {
  try {
    if (tutId) await admin.from("tutorials").delete().eq("id", tutId);
    if (paths.length) {
      await admin.storage.from(PRIV).remove(paths).catch(() => {});
      await admin.storage.from(PUB).remove(paths).catch(() => {});
    }
    if (accId) await admin.from("accounts").delete().eq("id", accId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log("Aufgeräumt: Tutorial, Bilder (privat + öffentlich), Konto, User.");
  } catch (e) {
    console.warn("Cleanup-Warnung:", e.message);
  }
  try {
    if (browser) await browser.close();
  } catch {}
  if (server && server.pid) {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore", shell: true });
      } else {
        process.kill(-server.pid, "SIGKILL");
      }
    } catch {
      server.kill("SIGKILL");
    }
  }
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Kein Aufblitzen ohne Verpixelung/Markierung.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);
