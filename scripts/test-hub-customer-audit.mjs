// Kundenseiten-Audit (öffentliche Hilfe-Seite /h/<konto>) — NUR PRÜFEN, nichts reparieren.
//
// Legt ein Wegwerf-Business-Konto mit mehreren veröffentlichten Anleitungen an
// (Kategorien, Verzweigung, Bilder mit Verpixelung + Lupe, Zusatzsprache EN,
// Vorlese-Ton), startet einen eigenen `next dev` und klickt mit echtem Chromium
// (headless, Desktop 1440 + Mobil 390) durch:
//   Hub (Suche/Kategorien/404) · Wizard (Verzweigung, Lightbox, Vorlesen, Sprache,
//   Fertig/Feedback) · Verpixelung (auch als rohe Bild-URL) · Druckansicht ·
//   Chat-Widget + /h/embed.js im Fremd-iframe · langsames Netz.
//
// Alles (Konto, User, Tutorials, Storage-Dateien) wird im finally gelöscht.
//
// Nutzung:  node --env-file=.env.local scripts/test-hub-customer-audit.mjs
import { register } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, ".shots-qa-hub");

// src/lib/*.ts direkt importieren (server-only stubben) — Muster aus test-public-images.mjs.
const srcBase = JSON.stringify(new URL("../src/", import.meta.url).href);
const loader = `export async function resolve(s,c,n){if(s==='server-only'||s==='client-only'){return {url:'data:text/javascript,',shortCircuit:true};}if(s.startsWith('@/')){return n(new URL(s.slice(2)+'.ts',${srcBase}).href,c);}return n(s,c);}`;
register("data:text/javascript," + encodeURIComponent(loader), import.meta.url);
const { rebuildPublicCopy } = await import("../src/lib/public-images.ts");
const { indexTutorial } = await import("../src/lib/kb.ts");

function resolvePlaywright() {
  try {
    return require("playwright");
  } catch {}
  const base = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
  const npxDir = path.join(base, "npm-cache", "_npx");
  if (existsSync(npxDir)) {
    for (const d of readdirSync(npxDir)) {
      const p = path.join(npxDir, d, "node_modules", "playwright");
      if (existsSync(p)) return require(p);
    }
  }
  throw new Error("playwright nicht gefunden");
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const PRIV = "tutorial-images";
const PUB = "tutorial-images-public";
const stamp = Date.now();
const SLUG = `kaudit-${stamp}`;
const uuid = () => crypto.randomUUID();

// ---- Befund-Sammlung ------------------------------------------------------
const findings = [];
const okList = [];
const note = (sev, area, text, detail) => {
  findings.push({ sev, area, text, detail });
  console.log(`  [${sev}] ${area}: ${text}${detail ? "\n        " + detail : ""}`);
};
const good = (text) => {
  okList.push(text);
  console.log(`  ok  ${text}`);
};
const step = (t) => console.log(`\n=== ${t} ===`);

async function freePort(start) {
  for (let p = start; p < start + 60; p++) {
    const free = await new Promise((res) => {
      const s = net.createServer();
      s.once("error", () => res(false));
      s.once("listening", () => s.close(() => res(true)));
      s.listen(p, "127.0.0.1");
    });
    if (free) return p;
  }
  throw new Error("kein freier Port");
}

// ---- Testdaten ------------------------------------------------------------
const mkBody = (text) => ({
  type: "doc",
  content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
});

const IMG_W = 900;
const IMG_H = 560;
// Geheim-Region (soll verpixelt werden): starkes Rauschen -> Varianz messbar.
const SECRET = { x: 0.05, y: 0.1, w: 0.4, h: 0.3 };
async function makeImage() {
  const raw = Buffer.alloc(IMG_W * IMG_H * 3);
  const sx = Math.round(SECRET.x * IMG_W), sy = Math.round(SECRET.y * IMG_H);
  const sw = Math.round(SECRET.w * IMG_W), sh = Math.round(SECRET.h * IMG_H);
  for (let y = 0; y < IMG_H; y++) {
    for (let x = 0; x < IMG_W; x++) {
      const i = (y * IMG_W + x) * 3;
      let v;
      if (x >= sx && x < sx + sw && y >= sy && y < sy + sh) v = ((x * 7 + y * 13) % 2) * 255; // Schachbrett = max. Varianz
      else if (y > IMG_H * 0.6 && y < IMG_H * 0.75) v = 40;
      else v = 220;
      raw[i] = raw[i + 1] = raw[i + 2] = v;
    }
  }
  return sharp(raw, { raw: { width: IMG_W, height: IMG_H, channels: 3 } }).webp({ lossless: true }).toBuffer();
}
// ACHTUNG: sharp.stats() rechnet auf dem EINGANGSBILD, nicht auf der Pipeline —
// darum die Region roh ausschneiden und die Streuung selbst rechnen.
async function secretStddev(buf) {
  const { data, info } = await sharp(buf)
    .extract({
      left: Math.round(SECRET.x * IMG_W) + 6,
      top: Math.round(SECRET.y * IMG_H) + 6,
      width: Math.round(SECRET.w * IMG_W) - 12,
      height: Math.round(SECRET.h * IMG_H) - 12,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0, sq = 0, n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    sum += data[i]; sq += data[i] * data[i]; n++;
  }
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sq / n - mean * mean));
}

function wav(seconds, freq) {
  const rate = 8000;
  const n = seconds * rate;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 8000), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

let userId, accId, server, browser;
const tutorialIds = [];
const privPaths = [];
const pubPaths = [];
let PORT, BASE;

async function seedTutorial({ title, slug, categoryId, description, steps, status = "published", visibility = "public" }) {
  const tutId = uuid();
  const { error } = await admin.from("tutorials").insert({
    id: tutId, account_id: accId, category_id: categoryId ?? null, title, slug,
    description: description ?? null, status, visibility, is_template: false,
  });
  if (error) throw error;
  tutorialIds.push(tutId);
  const ids = steps.map(() => uuid());
  const rows = steps.map((s, i) => ({
    id: ids[i], tutorial_id: tutId, title: s.title, body: mkBody(s.body), position: i + 1,
    is_decision: !!s.branches, image_path: s.image ?? null,
    image_width: s.image ? IMG_W : null, image_height: s.image ? IMG_H : null,
    highlights: s.highlights ?? [], audio_path: s.audio ?? null,
  }));
  const { error: se } = await admin.from("steps").insert(rows);
  if (se) throw se;
  await admin.from("tutorials").update({ root_step_id: ids[0] }).eq("id", tutId);
  const branchRows = [];
  steps.forEach((s, i) => {
    if (s.branches) {
      s.branches.forEach((b, j) =>
        branchRows.push({ id: uuid(), step_id: ids[i], label: b.label, target_step_id: ids[b.to], position: j, color: b.color ?? null }),
      );
    } else if (i < steps.length - 1 && s.next !== false) {
      branchRows.push({ id: uuid(), step_id: ids[i], label: null, target_step_id: ids[i + 1], position: 0, color: null });
    }
  });
  if (branchRows.length) {
    const { error: be } = await admin.from("step_branches").insert(branchRows);
    if (be) throw be;
  }
  return { tutId, stepIds: ids, branchRows };
}

function waitForServer(timeoutMs = 240_000) {
  const start = Date.now();
  return (async () => {
    while (Date.now() - start < timeoutMs) {
      try {
        const r = await fetch(`${BASE}/h/${SLUG}`, { redirect: "manual" });
        if (r.status < 500) return true;
      } catch {}
      await new Promise((res) => setTimeout(res, 1000));
    }
    return false;
  })();
}

// ---- Seiten-Beobachter (JS-Fehler, 4xx/5xx) ------------------------------
function watch(page, tag, bag) {
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      if (/favicon|Download the React DevTools|_next\/static\/chunks\/.*\.map/.test(t)) return;
      bag.console.push(`${tag}: ${t.slice(0, 300)}`);
    }
  });
  page.on("pageerror", (e) => bag.pageerror.push(`${tag}: ${String(e).slice(0, 300)}`));
  page.on("response", (r) => {
    const s = r.status();
    if (s >= 400) bag.http.push(`${tag}: ${s} ${r.url().replace(BASE, "").slice(0, 160)}`);
  });
  page.on("requestfinished", (r) => bag.requests.push(r.url()));
}
const newBag = () => ({ console: [], pageerror: [], http: [], requests: [] });

async function overflow(page) {
  return await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    bsw: document.body.scrollWidth,
    iw: window.innerWidth,
  }));
}
const shot = async (page, name) => {
  try { await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }); } catch {}
};

try {
  mkdirSync(OUT, { recursive: true });
  PORT = await freePort(3071);
  BASE = `http://localhost:${PORT}`;
  step("Setup");

  const created = await admin.auth.admin.createUser({
    email: `steply-kaudit-${stamp}@example.com`, password: "Test12345!", email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accId = mem[0].account_id;
  await admin.from("accounts").update({
    slug: SLUG, name: "Audit Kanzlei GmbH", plan: "business", languages: ["en"], onboarded: true,
  }).eq("id", accId);

  // Kategorien (mit EN-Namen)
  const catA = uuid(), catB = uuid();
  await admin.from("categories").insert([
    { id: catA, account_id: accId, name: "Steuererklärung", position: 1, name_i18n: { en: "Tax return" } },
    { id: catB, account_id: accId, name: "Online-Portal", position: 2, name_i18n: { en: "Online portal" } },
  ]);

  // Bild + Ton hochladen
  const img = await makeImage();
  const imgPath = `${accId}/audit/screen-${stamp}.webp`;
  privPaths.push(imgPath); pubPaths.push(imgPath);
  const up = await admin.storage.from(PRIV).upload(imgPath, img, { contentType: "image/webp", upsert: true });
  if (up.error) throw up.error;

  const audioA = `${accId}/audit/ton-a-${stamp}.wav`;
  const audioB = `${accId}/audit/ton-b-${stamp}.wav`;
  pubPaths.push(audioA, audioB);
  await admin.storage.from(PUB).upload(audioA, wav(12, 440), { contentType: "audio/wav", upsert: true });
  await admin.storage.from(PUB).upload(audioB, wav(12, 660), { contentType: "audio/wav", upsert: true });

  const blurHl = { id: "bl1", type: "blur", x: SECRET.x, y: SECRET.y, w: SECRET.w, h: SECRET.h, rounded: true };
  const rectHl = { id: "r1", type: "rect", x: 0.55, y: 0.55, w: 0.3, h: 0.15, strokeWidth: 4 };
  const lensHl = { id: "z1", type: "rect", x: 0.03, y: 0.06, w: 0.45, h: 0.38, zoom: true, strokeWidth: 4 };

  // 1) Lineare Anleitung mit Bild, Verpixelung, Lupe, Ton
  const lin = await seedTutorial({
    title: "Belege hochladen", slug: "belege-hochladen", categoryId: catA,
    description: "So laden Sie Belege in das Portal.",
    steps: [
      { title: "Portal öffnen", body: "Rufen Sie das Mandantenportal auf.", image: imgPath, highlights: [blurHl, rectHl], audio: audioA },
      { title: "Beleg auswählen", body: "Wählen Sie die Datei aus.", image: imgPath, highlights: [blurHl, lensHl], audio: audioB },
      { title: "Hochladen bestätigen", body: "Klicken Sie auf Hochladen.", image: imgPath, highlights: [blurHl] },
    ],
  });

  // 2) Verzweigung
  await seedTutorial({
    title: "Zugang zum Portal", slug: "zugang-portal", categoryId: catB,
    description: "Anmelden oder neu registrieren.",
    steps: [
      { title: "Haben Sie schon ein Konto?", body: "Bitte wählen Sie.",
        branches: [{ label: "Ja, ich habe ein Konto", to: 1, color: "#18a999" }, { label: "Nein, noch nicht", to: 2, color: "#d3543a" }] },
      { title: "Anmelden", body: "Geben Sie Ihre Zugangsdaten ein.", image: imgPath, highlights: [blurHl], next: false },
      { title: "Registrieren", body: "Legen Sie ein Konto an." },
    ],
  });
  // Ja-Ast (Schritt 2) auf den Abschluss verdrahten wäre optional; er endet direkt -> "Fertig".

  // 3) weitere Anleitungen für Suche/Kategorien
  await seedTutorial({ title: "Umsatzsteuer-Voranmeldung", slug: "ust-voranmeldung", categoryId: catA,
    description: "Fristen und Abgabe.", steps: [{ title: "Frist prüfen", body: "Zum 10. des Folgemonats." }] });
  await seedTutorial({ title: "Passwort zurücksetzen", slug: "passwort-zuruecksetzen", categoryId: catB,
    description: "Wenn Sie sich nicht anmelden können.", steps: [{ title: "Link anklicken", body: "Klicken Sie auf Passwort vergessen." }] });
  await seedTutorial({ title: "Ohne Kategorie", slug: "ohne-kategorie", categoryId: null,
    description: null, steps: [{ title: "Einziger Schritt", body: "Fertig." }] });
  // 4) Entwurf + intern (dürfen öffentlich NICHT erreichbar sein)
  await seedTutorial({ title: "Geheimer Entwurf", slug: "geheimer-entwurf", steps: [{ title: "Entwurf", body: "Nicht öffentlich." }], status: "draft" });
  await seedTutorial({ title: "Nur intern", slug: "nur-intern", steps: [{ title: "Intern", body: "Nur fürs Team." }], visibility: "internal" });

  // Öffentliche Bildkopie mit eingebrannter Verpixelung erzeugen (wie publishTutorial)
  await rebuildPublicCopy(imgPath);

  // EN-Übersetzungen für Anleitung 1 (Schritt 3 ABSICHTLICH ohne Übersetzung -> Fallback prüfen)
  await admin.from("tutorial_translations").insert({
    tutorial_id: lin.tutId, lang: "en", title: "Upload receipts", description: "How to upload receipts.",
  });
  await admin.from("step_translations").insert([
    { step_id: lin.stepIds[0], lang: "en", title: "Open the portal", body: mkBody("Open the client portal.") },
    { step_id: lin.stepIds[1], lang: "en", title: "Choose a receipt", body: mkBody("Select the file.") },
  ]);
  // Für den Chatbot indizieren (wie publishTutorial es tut) — sonst hat der Chat keine Quellen.
  for (const id of [...tutorialIds]) await indexTutorial(admin, accId, id).catch(() => {});
  // Eskalation konfigurieren, damit der Chat den Kontakt-Ausweg anbieten kann.
  await admin.from("accounts").update({
    escalation: { enabled: true, message: "Wir helfen Ihnen persönlich weiter.", contactName: "Service-Team", email: "hilfe@example.com", phone: "+49 30 1234567" },
  }).eq("id", accId).then((r) => { if (r.error) console.log("  (Eskalation nicht gesetzt:", r.error.message, ")"); });
  good(`Testkonto /h/${SLUG} mit 5 öffentlichen Anleitungen, Entwurf + interner Anleitung angelegt`);

  // ---- Server ----
  // AUDIT_PROD=1 -> echter Produktionsbau (kein Dev-Overlay, echte PPR-/Statuscodes).
  const PROD = process.env.AUDIT_PROD === "1";
  const srvEnv = { ...process.env, PORT: String(PORT), NEXT_PUBLIC_APP_URL: BASE };
  if (PROD) {
    step("Produktionsbau (next build)");
    const code = await new Promise((res) => {
      const b = spawn("npx", ["next", "build"], { cwd: path.join(__dirname, ".."), env: srvEnv, stdio: "inherit", shell: true });
      b.on("exit", res);
    });
    if (code !== 0) throw new Error("next build fehlgeschlagen (Code " + code + ")");
    good("Produktionsbau erfolgreich");
  }
  step("Next-Server starten");
  server = spawn("npx", ["next", PROD ? "start" : "dev", "-p", String(PORT)], {
    cwd: path.join(__dirname, ".."),
    env: srvEnv,
    stdio: "ignore", shell: true,
  });
  const up2 = await waitForServer();
  if (!up2) throw new Error("Server nicht erreichbar");
  good(`Server läuft auf ${BASE}`);

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults"] });

  // ========================================================================
  // A) VERPIXELUNG im öffentlichen Speicher (Datenschutz)
  // ========================================================================
  step("A) Verpixelung im öffentlichen Speicher");
  const pubUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PUB}/${imgPath}`;
  const pubRes = await fetch(pubUrl);
  const pubBuf = Buffer.from(await pubRes.arrayBuffer());
  const sdOrig = await secretStddev(img);
  const sdPub = await secretStddev(pubBuf);
  if (sdPub < sdOrig * 0.5) good(`Öffentliche Bild-URL ist verpixelt (Kontrast ${sdOrig.toFixed(0)} -> ${sdPub.toFixed(0)})`);
  else note("blockierend", "Datenschutz", "Öffentliche Bild-URL zeigt die verpixelte Stelle im Klartext",
    `Kontrast im Geheim-Bereich: Original ${sdOrig.toFixed(0)}, öffentlich ${sdPub.toFixed(0)} — ${pubUrl}`);

  // Negative Breite/Höhe (kommt von anderen Erzeugern als dem Editor) -> wird sie eingebrannt?
  const negPath = `${accId}/audit/neg-${stamp}.webp`;
  privPaths.push(negPath); pubPaths.push(negPath);
  await admin.storage.from(PRIV).upload(negPath, img, { contentType: "image/webp", upsert: true });
  const negTut = await seedTutorial({
    title: "Negativ-Koordinaten", slug: "negativ-koordinaten",
    steps: [{ title: "Bild", body: "Test", image: negPath,
      highlights: [{ id: "bn", type: "blur", x: SECRET.x + SECRET.w, y: SECRET.y + SECRET.h, w: -SECRET.w, h: -SECRET.h }] }],
  });
  await rebuildPublicCopy(negPath);
  const negRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PUB}/${negPath}`);
  const negBuf = Buffer.from(await negRes.arrayBuffer());
  const sdNeg = await secretStddev(negBuf);
  if (sdNeg < sdOrig * 0.5) good("Verpixelung mit negativer Breite/Höhe wird ebenfalls eingebrannt");
  else note("ärgerlich", "Datenschutz",
    "Verpixelung mit negativer Breite/Höhe wird NICHT eingebrannt (Bild-URL zeigt Klartext)",
    `Anzeige im Browser verpixelt korrekt (Math.abs), aber lib/redact.ts burnBlur überspringt sie (width<2). Kontrast öffentlich ${sdNeg.toFixed(0)} statt ~${sdPub.toFixed(0)}. Betrifft nur Markierungen, die nicht aus dem Editor stammen (KI/Video/Recorder/API).`);

  // Entwurf/intern: liegt deren Bild im öffentlichen Bucket? (hier nicht erzeugt -> nur Slug-Test unten)

  // ---- SEO: sitemap.xml / robots.txt ----
  step("A2) sitemap.xml & robots.txt");
  {
    const sm = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text()).catch(() => "");
    const hasHub = sm.includes(`/h/${SLUG}<`) || sm.includes(`/h/${SLUG}/belege-hochladen`);
    if (hasHub) good("sitemap.xml enthält Hub + veröffentlichte Anleitungen");
    else note("ärgerlich", "SEO", "sitemap.xml enthält die Hilfe-Seite nicht", sm.slice(0, 200));
    if (sm.includes(`/h/${SLUG}/nur-intern`))
      note("ärgerlich", "Datenschutz/SEO", "Interne Anleitungen stehen mit ihrer Adresse in der öffentlichen sitemap.xml",
        `Gefunden: /h/${SLUG}/nur-intern. src/app/sitemap.ts filtert nur status='published', NICHT visibility='public'. Der Inhalt bleibt zwar gesperrt, aber der aus dem Titel gebildete Slug (z. B. 'gehaltsabrechnung-geschaeftsfuehrung') wird Suchmaschinen aktiv gemeldet — und die Adresse antwortet dann mit HTTP 200 statt 404.`);
    else good("sitemap.xml enthält keine internen Anleitungen");
    if (sm.includes("geheimer-entwurf")) note("ärgerlich", "SEO", "Entwürfe stehen in der sitemap.xml");
    else good("sitemap.xml enthält keine Entwürfe");
    const rb = await fetch(`${BASE}/robots.txt`).then((r) => r.text()).catch(() => "");
    if (/Disallow: \/app/.test(rb) && /Sitemap:/.test(rb)) good("robots.txt sperrt die App-Bereiche und nennt die Sitemap");
    else note("kosmetisch", "SEO", "robots.txt unerwartet", rb.slice(0, 200));
  }

  // ========================================================================
  // B) Durchläufe je Viewport
  // ========================================================================
  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobil", width: 390, height: 844 },
  ];
  const bag = newBag();

  for (const vp of (process.env.AUDIT_ONLY === "embed" ? [] : viewports.filter((v) => !process.env.AUDIT_VP || v.name === process.env.AUDIT_VP))) {
    step(`B) Durchlauf ${vp.name} (${vp.width}×${vp.height})`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "de-DE" });
    await ctx.addInitScript(() => {
      window.__audios = [];
      const orig = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (!window.__audios.includes(this)) window.__audios.push(this);
        return orig.apply(this, arguments);
      };
    });
    const page = await ctx.newPage();
    watch(page, vp.name, bag);

    // --- Hub ---
    await page.goto(`${BASE}/h/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForSelector('[data-tx="browser"]', { timeout: 120_000 });
    await page.waitForTimeout(400);
    let o = await overflow(page);
    if (o.sw <= o.iw + 1) good(`Hub ${vp.name}: kein horizontales Scrollen`);
    else note("ärgerlich", "Hub", `Hub ${vp.name} scrollt horizontal (${o.sw} > ${o.iw})`);
    await shot(page, `hub-${vp.name}`);

    const catCount = await page.locator('[data-tx="cat"]').count();
    const cardCount = await page.locator('[data-tx="card"]').count();
    if (catCount >= 2 && cardCount >= 5) good(`Hub ${vp.name}: ${catCount} Kategorien, ${cardCount} Anleitungen sichtbar`);
    else note("ärgerlich", "Hub", `Hub ${vp.name}: nur ${catCount} Kategorien / ${cardCount} Karten`);

    // Entwurf/intern dürfen nicht auftauchen
    const hubText = await page.locator("body").innerText();
    if (/Geheimer Entwurf|Nur intern/.test(hubText))
      note("blockierend", "Datenschutz", "Entwurf oder interne Anleitung erscheint auf der öffentlichen Hilfe-Seite");
    else good("Hub zeigt weder Entwürfe noch interne Anleitungen");

    // Suche mit Treffer
    const search = page.locator('[data-tx="search"] input');
    await search.fill("passwort");
    await page.waitForTimeout(300);
    const hit = await page.locator('[data-tx="card"]').count();
    if (hit === 1) good("Suche mit Treffer filtert korrekt");
    else note("ärgerlich", "Hub-Suche", `Suche 'passwort' liefert ${hit} Karten statt 1`);

    // Suche nach Kategoriename
    await search.fill("Online-Portal");
    await page.waitForTimeout(300);
    const catHit = await page.locator('[data-tx="card"]').count();
    if (catHit === 0)
      note("kosmetisch", "Hub-Suche", "Suche findet nichts, wenn man den Kategorienamen eintippt",
        "hub-browser.tsx filtert nur über Titel + Beschreibung, nicht über die Kategorie. 'Online-Portal' ist eine sichtbare Überschrift, liefert aber 0 Treffer.");
    else good(`Suche berücksichtigt Kategorienamen (${catHit} Karten)`);

    // Hub-Metadaten: canonical + <html lang>
    await search.fill("");
    const hubMeta = await page.evaluate(() => ({
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
      htmlLang: document.documentElement.lang,
    }));
    if (hubMeta.canonical && !/[?&](lang|preview)=/.test(hubMeta.canonical))
      good(`Hilfe-Seite hat eine canonical-URL ohne ?lang=/?preview= (${hubMeta.canonical})`);
    else note("kosmetisch", "SEO", "Hilfe-Seite ohne saubere canonical-URL", String(hubMeta.canonical));
    if (hubMeta.htmlLang === "de") good("Hilfe-Seite auf Deutsch meldet <html lang=\"de\">");
    else note("ärgerlich", "SEO/Barrierefreiheit", `Deutsche Hilfe-Seite meldet <html lang="${hubMeta.htmlLang}">`);

    // Hub auf Englisch: <html lang> muss mitwandern
    await page.goto(`${BASE}/h/${SLUG}?lang=en`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-tx="browser"]', { timeout: 60_000 });
    const hubEn = await page.evaluate(() => ({
      htmlLang: document.documentElement.lang,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    }));
    if (hubEn.htmlLang === "en") good("Englische Hilfe-Seite meldet <html lang=\"en\">");
    else note("ärgerlich", "SEO/Barrierefreiheit", `Englische Hilfe-Seite meldet <html lang="${hubEn.htmlLang}">`);
    if (hubEn.canonical && !/lang=/.test(hubEn.canonical)) good("canonical der englischen Ansicht zeigt auf die Hauptadresse");
    else note("kosmetisch", "SEO", `canonical der englischen Ansicht: ${hubEn.canonical}`);
    await page.goto(`${BASE}/h/${SLUG}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-tx="browser"]', { timeout: 60_000 });

    // Suche ohne Treffer
    await search.fill("zzzqqqxyz");
    await page.waitForTimeout(1600);
    const emptyTxt = await page.locator('[data-tx="browser"]').innerText();
    if (/Nichts gefunden|keine|0/i.test(emptyTxt) || emptyTxt.includes("zzzqqqxyz")) good("Suche ohne Treffer zeigt eine Leermeldung");
    else note("ärgerlich", "Hub-Suche", "Suche ohne Treffer zeigt keine erkennbare Leermeldung", emptyTxt.slice(0, 200));
    await shot(page, `hub-leer-${vp.name}`);

    // 'Meinten Sie' — veraltete Vorschläge beim Weitertippen?
    await search.fill("");
    await page.waitForTimeout(200);

    // --- Anleitung öffnen + Browser-Zurück ---
    await search.fill("belege");
    await page.waitForTimeout(300);
    await page.locator('[data-tx="card"]').first().click();
    await page.waitForSelector('[data-tx="step"]', { timeout: 60_000 });
    good("Karte öffnet die Anleitung");
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-tx="browser"]', { timeout: 60_000 });
    const qAfterBack = await page.locator('[data-tx="search"] input').inputValue();
    if (qAfterBack !== "belege")
      note("kosmetisch", "Hub", "Browser-Zurück verliert die eingegebene Suche",
        `Nach Zurück steht im Suchfeld '${qAfterBack}" statt 'belege' — der Besucher muss erneut suchen.`);
    else good("Browser-Zurück behält die Suche");

    // --- Unbekannte Slugs ---
    for (const [url, label] of [
      [`${BASE}/h/${SLUG}/gibt-es-nicht`, "unbekannte Anleitung"],
      [`${BASE}/h/${SLUG}/geheimer-entwurf`, "Entwurf"],
      [`${BASE}/h/${SLUG}/nur-intern`, "interne Anleitung"],
      [`${BASE}/h/kein-konto-${stamp}`, "unbekanntes Konto"],
    ]) {
      const r = await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      const st = r?.status();
      const txt = (await page.locator("body").innerText()).slice(0, 200).replace(/\s+/g, " ");
      const leak = /Geheimer Entwurf|Nur intern|Entwurf|Nur fürs Team/.test(txt);
      const looksNotFound = /nicht gefunden|not found|404|Seite existiert nicht/i.test(txt);
      if (st === 404) good(`${label}: HTTP 404 ('${txt.slice(0, 60)}')`);
      else if (looksNotFound && !leak)
        note("ärgerlich", "SEO/Routing", `${label}: Seite zeigt zwar 'nicht gefunden', sendet aber HTTP ${st}`,
          `${url} — Text: '${txt.slice(0, 90)}'. Suchmaschinen/Monitoring sehen eine gültige Seite (Soft-404); kaputte Links werden indexiert. Ursache: notFound() greift erst im gestreamten Teil (PPR/cacheComponents), der Status steht da schon fest.`);
      else note("blockierend", "Routing", `${label} liefert Status ${st} und zeigt: '${txt.slice(0, 120)}'`, url);
      if (vp.name === "desktop") await shot(page, `404-${label.replace(/\s/g, "-")}`);
    }

    // Wizard frisch öffnen: sessionStorage leeren, damit nicht die letzte Position
    // wiederhergestellt wird (der Wizard merkt sich sie pro Tab).
    const fresh = async (slug, q = "") => {
      await page.goto(`${BASE}/h/${SLUG}/${slug}${q}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.evaluate(() => { try { sessionStorage.clear(); } catch {} });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-tx="step"]', { timeout: 60_000 });
    };

    // --- Wizard: lineare Anleitung ---
    step(`B2) Wizard ${vp.name}`);
    await fresh("belege-hochladen");
    await page.waitForTimeout(1200);
    o = await overflow(page);
    if (o.sw <= o.iw + 1) good(`Wizard ${vp.name}: kein horizontales Scrollen`);
    else note("ärgerlich", "Wizard", `Wizard ${vp.name} scrollt horizontal (${o.sw} > ${o.iw})`);

    // Alt-Texte
    const imgs = await page.$$eval("img", (els) => els.map((e) => ({ src: e.currentSrc || e.src, alt: e.getAttribute("alt"), w: e.naturalWidth })));
    const missingAlt = imgs.filter((i) => i.alt === null);
    if (missingAlt.length) note("ärgerlich", "Barrierefreiheit", `${missingAlt.length} Bild(er) ohne alt-Attribut`, missingAlt.map((i) => i.src).join(", ").slice(0, 200));
    else good("Alle Bilder haben ein alt-Attribut");
    const broken = imgs.filter((i) => i.w === 0);
    if (broken.length) note("blockierend", "Wizard", `${broken.length} Bild(er) laden nicht`, broken.map((i) => i.src).join(", ").slice(0, 300));

    // Schrittliste (nur Desktop erwartet)
    const sidebar = await page.locator('[data-tx="step"] aside button').count();
    if (vp.name === "desktop" && sidebar === 3) good("Desktop: Schrittliste mit 3 Einträgen");
    if (vp.name === "desktop" && sidebar !== 3) note("ärgerlich", "Wizard", `Desktop-Schrittliste hat ${sidebar} statt 3 Einträge`);

    // ---- Vorlesen: Ton beim Weiterblättern ----
    const ttsBtn = page.locator('[data-tx="tts"]');
    if (await ttsBtn.count()) {
      await ttsBtn.first().click();
      await page.waitForTimeout(900);
      const playing1 = await page.evaluate(() => (window.__audios || []).filter((a) => !a.paused).length);
      if (playing1 === 1) good("Vorlesen startet");
      else note("ärgerlich", "Vorlesen", `Nach Klick auf ▶ laufen ${playing1} Tonspuren (erwartet 1)`);

      // Weiter zu Schritt 2 (hat ebenfalls Ton)
      await page.locator('[data-tx="btn"]').first().click();
      await page.waitForTimeout(900);
      const s2 = await page.evaluate(() => (window.__audios || []).map((a) => ({ paused: a.paused, connected: a.isConnected, src: a.currentSrc.slice(-24) })));
      const oldStill = s2.filter((a) => !a.paused && /ton-a/.test(a.src));
      const newAuto = s2.filter((a) => !a.paused && /ton-b/.test(a.src));
      if (oldStill.length === 0) good("Schritt 1 → 2: der Ton des vorigen Schritts stoppt");
      else note("blockierend", "Vorlesen", `Schritt 1 → 2: der ALTE Ton läuft weiter`, JSON.stringify(s2));
      if (newAuto.length)
        note("kosmetisch", "Vorlesen", "Nach einmaligem Antippen von ▶ liest jeder Folgeschritt ungefragt automatisch vor",
          "So beabsichtigt (wizard.tsx Z. 334-348: 'gestureRef' schaltet Auto-Play frei), für Besucher aber überraschend — es gibt daneben einen eigenen 'Auto'-Schalter, der genau das verspricht. Stoppen geht nur über Pause/Ton-aus.");
      else good("Schritt 1 → 2: kein ungefragtes Auto-Vorlesen");

      // Ton auf Schritt 2 starten, dann weiter zu Schritt 3 (OHNE Ton)
      const tts2 = page.locator('[data-tx="tts"]');
      if (await tts2.count()) {
        await tts2.first().click();
        await page.waitForTimeout(900);
        await page.locator('[data-tx="btn"]').first().click();
        await page.waitForTimeout(1200);
        const s3 = await page.evaluate(() => (window.__audios || []).map((a) => ({ paused: a.paused, connected: a.isConnected, t: a.currentTime, src: a.currentSrc.slice(-24) })));
        const stillPlaying3 = s3.filter((a) => !a.paused);
        if (stillPlaying3.length === 0) good("Schritt 2 → 3 (ohne Ton): Ton stoppt");
        else note("blockierend", "Vorlesen",
          "Ton läuft weiter, wenn der nächste Schritt KEINEN Vorlese-Ton hat",
          `Die Audio-Spur des vorigen Schritts spielt unsichtbar weiter (Element aus dem DOM entfernt, aber nicht gestoppt): ${JSON.stringify(s3)} — viewer/wizard.tsx Z. 318-326 holt audioRef.current, das beim Ausblenden des <audio> schon null ist.`);
        // Zustand messen: Fertig-Screen
        await page.locator('[data-tx="btn"]').first().click();
        await page.waitForTimeout(800);
        const s4 = await page.evaluate(() => (window.__audios || []).filter((a) => !a.paused).length);
        if (s4 > 0) note("blockierend", "Vorlesen", `Auf dem Fertig-Screen laufen noch ${s4} Tonspur(en)`);
      }
    } else note("ärgerlich", "Vorlesen", "Kein Vorlese-Knopf sichtbar, obwohl Schritte Audio haben");

    // ---- Lightbox / Lupe / Verpixelung beim Vergrößern ----
    await fresh("belege-hochladen");
    await page.waitForTimeout(1200);
    const focusBefore = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName);
    const stepImgW = await page.evaluate(() => {
      const i = document.querySelector('[data-tx="step"] img');
      return i ? Math.round(i.getBoundingClientRect().width) : 0;
    });
    await page.locator(`button[aria-label="Bild vergrößern"], button[aria-label*="ergröß"]`).first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
    await page.waitForTimeout(700);
    const lb = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return null;
      return {
        blurSvg: d.querySelectorAll("svg image[data-blur-mark]").length,
        backdrop: d.querySelectorAll("div[style*='backdrop-filter']").length,
        marks: d.querySelectorAll("svg [data-mark]").length,
        imgAlt: d.querySelector("img")?.getAttribute("alt"),
        focusInside: d.contains(document.activeElement),
        imgW: Math.round(d.querySelector("img")?.getBoundingClientRect().width ?? 0),
      };
    });
    if (lb && stepImgW > 0) {
      const gain = lb.imgW / stepImgW;
      if (gain >= 1.5) good(`Großansicht vergrößert spürbar (${stepImgW} → ${lb.imgW} px, ${gain.toFixed(1)}×)`);
      else
        note("ärgerlich", "Wizard", `'Bild vergrößern' bringt auf ${vp.name} fast nichts (${stepImgW} → ${lb.imgW} px, nur ${Math.round((gain - 1) * 100)} % größer)`,
          "Die Großansicht skaliert das Bild nur auf die Fensterbreite. Auf dem Handy ist das Bild danach praktisch gleich groß — genau dort braucht man das Vergrößern aber am meisten (kein Zoomen/Verschieben in der Großansicht, wizard.tsx Z. 791-827).");
    }
    if (lb && (lb.blurSvg > 0 || lb.backdrop > 0)) good(`Lightbox zeigt die Verpixelung (${lb.blurSvg} SVG / ${lb.backdrop} Backdrop)`);
    else note("blockierend", "Datenschutz", "Lightbox zeigt keine Verpixelungs-Schicht", JSON.stringify(lb));
    if (lb && lb.marks > 0) good("Lightbox zeigt die Markierungen");
    else note("ärgerlich", "Wizard", "Lightbox zeigt keine Markierungen");
    if (lb && !lb.focusInside)
      note("ärgerlich", "Barrierefreiheit", "Lightbox fängt den Tastatur-Fokus nicht ein",
        `Nach dem Öffnen bleibt der Fokus außerhalb des Dialogs (vorher: ${focusBefore}); Tab wandert durch die Seite hinter dem Overlay, Screenreader lesen den verdeckten Inhalt.`);
    if (lb && lb.imgAlt === "")
      note("kosmetisch", "Barrierefreiheit", "Bild in der Großansicht hat einen leeren Alt-Text",
        "viewer/wizard.tsx: leerer alt-Text — im Schritt selbst trägt dasselbe Bild den Schritt-Titel als Alt-Text.");
    else if (lb && lb.imgAlt) good(`Großansicht übernimmt den Schritt-Titel als Alt-Text ('${lb.imgAlt}")`);
    else if (lb) note("ärgerlich", "Barrierefreiheit", "Bild in der Großansicht hat gar kein alt-Attribut");

    // Kein horizontales Scrollen der SEITE, obwohl die Großansicht das Fenster füllt
    const lbOverflow = await overflow(page);
    if (lbOverflow.sw <= lbOverflow.iw + 1) good(`Großansicht ${vp.name}: Seite scrollt nicht horizontal`);
    else note("ärgerlich", "Wizard", `Großansicht ${vp.name} erzeugt horizontales Scrollen (${lbOverflow.sw} > ${lbOverflow.iw})`);

    // Zoomen: Knöpfe vergrößern/verkleinern tatsächlich
    const zoomIn = page.locator('[role="dialog"] button[aria-label="Größer"]');
    if (await zoomIn.count()) {
      const w0 = await page.evaluate(() => Math.round(document.querySelector('[role="dialog"] img').getBoundingClientRect().width));
      await zoomIn.first().click();
      await page.waitForTimeout(350);
      const w1 = await page.evaluate(() => Math.round(document.querySelector('[role="dialog"] img').getBoundingClientRect().width));
      if (w1 > w0 * 1.2) good(`Großansicht lässt sich weiter vergrößern (${w0} → ${w1} px)`);
      else note("ärgerlich", "Wizard", `Vergrößern-Knopf ändert die Bildgröße kaum (${w0} → ${w1} px)`);
      const reset = page.locator('[role="dialog"] button[aria-label="Ganzes Bild"]');
      if (await reset.count()) {
        await reset.first().click();
        await page.waitForTimeout(350);
        const w2 = await page.evaluate(() => Math.round(document.querySelector('[role="dialog"] img').getBoundingClientRect().width));
        if (w2 < w1) good(`'Ganzes Bild" zeigt das komplette Bild wieder (${w1} → ${w2} px)`);
        else note("kosmetisch", "Wizard", `'Ganzes Bild" ändert nichts (${w1} → ${w2} px)`);
      } else note("ärgerlich", "Wizard", "Kein Knopf, um wieder das ganze Bild zu zeigen");
    } else note("ärgerlich", "Wizard", "Großansicht hat keine Zoom-Knöpfe");

    // Fokusfalle: Tab darf den Dialog nicht verlassen
    for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
    const trapped = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return !!d && d.contains(document.activeElement);
    });
    if (trapped) good("Großansicht hält den Tastatur-Fokus im Dialog");
    else note("ärgerlich", "Barrierefreiheit", "Tab verlässt die Großansicht (keine Fokusfalle)");

    await shot(page, `lightbox-${vp.name}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    if (await page.locator('[role="dialog"]').count()) note("ärgerlich", "Wizard", "Escape schließt die Großansicht nicht");
    else good("Escape schließt die Großansicht");
    const focusAfter = await page.evaluate(() => document.activeElement?.tagName + "/" + (document.activeElement?.getAttribute("aria-label") || ""));
    if (/ergröß/.test(focusAfter)) good(`Nach dem Schließen liegt der Fokus wieder auf dem Bild (${focusAfter})`);
    else if (/BODY/.test(focusAfter))
      note("kosmetisch", "Barrierefreiheit", "Nach dem Schließen der Großansicht landet der Fokus auf <body>",
        "Tastatur-Nutzer müssen sich von vorn durch die Seite tabben; der Fokus sollte zurück auf das Bild.");
    else note("kosmetisch", "Barrierefreiheit", `Fokus nach dem Schließen: ${focusAfter}`);

    // Lupe auf Schritt 2
    await page.locator('[data-tx="btn"]').first().click();
    await page.waitForTimeout(1200);
    const lens = await page.evaluate(() => {
      // NICHT die erste SVG nehmen (das sind die Icon-SVGs der Ton-Schalter),
      // sondern die Markierungs-Ebene über dem Bild.
      const svg = [...document.querySelectorAll('[data-tx="step"] svg')].find((s) => s.querySelector("image"));
      if (!svg) return null;
      return {
        lensImages: svg.querySelectorAll("g[clip-path] image").length,
        blurMarks: svg.querySelectorAll("image[data-blur-mark]").length,
        marks: svg.querySelectorAll("[data-mark]").length,
      };
    });
    if (lens && lens.lensImages > 0) good(`Lupe wird gezeichnet (${lens.lensImages} vergrößerte Bildebenen, ${lens.blurMarks} Verpixelungen)`);
    else note("ärgerlich", "Wizard", "Lupe wird nicht gezeichnet", JSON.stringify(lens));
    await shot(page, `lupe-${vp.name}`);

    // ---- Verzweigung: beide Wege ----
    for (const branchIdx of [0, 1]) {
      await fresh("zugang-portal");
      await page.waitForTimeout(500);
      const btns = page.locator('[data-tx="btn"]');
      const n = await btns.count();
      if (n !== 2) { note("blockierend", "Verzweigung", `Verzweigung zeigt ${n} Antworten statt 2`); break; }
      await btns.nth(branchIdx).click();
      await page.waitForTimeout(600);
      const title = await page.locator('[data-tx="step-title"]').innerText().catch(() => "");
      const expect = branchIdx === 0 ? "Anmelden" : "Registrieren";
      if (title.includes(expect)) good(`Verzweigung Weg ${branchIdx + 1} führt zu '${expect}"`);
      else note("blockierend", "Verzweigung", `Weg ${branchIdx + 1} führt zu '${title}" statt '${expect}"`);
      // Zurück
      const backBtn = page.locator('[data-tx="step"] button', { hasText: "Zurück" });
      if (await backBtn.count()) {
        await backBtn.first().click();
        await page.waitForTimeout(400);
        const t2 = await page.locator('[data-tx="step-title"]').innerText().catch(() => "");
        if (t2.includes("Haben Sie schon ein Konto")) good(`Zurück nach Weg ${branchIdx + 1} führt zur Frage`);
        else note("ärgerlich", "Verzweigung", `Zurück führt zu '${t2}"`);
      } else note("ärgerlich", "Verzweigung", "Kein Zurück-Knopf nach der Verzweigung");
    }

    // ---- Browser-Zurück im Wizard ----
    // Erwartung: Zurück geht EINEN Schritt zurück, Vorwärts wieder vor, Neuladen hält die
    // Position, und erst am ersten Schritt verlässt Zurück die Anleitung.
    const prog = () => page.locator('[data-tx="progress"]').innerText().catch(() => "");
    await fresh("belege-hochladen");
    await page.waitForTimeout(600);
    const p1 = await prog();
    await page.locator('[data-tx="btn"]').first().click();
    await page.waitForTimeout(400);
    const p2 = await prog();
    await page.locator('[data-tx="btn"]').first().click();
    await page.waitForTimeout(400);
    const before = await prog();
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    const url2 = page.url();
    if (!url2.includes("belege-hochladen")) {
      note("ärgerlich", "Wizard", "Browser-Zurück verlässt die Anleitung komplett",
        `Nach 2 Schritten ('${before}") landet der Besucher mit dem Zurück-Knopf des Browsers auf ${url2.replace(BASE, "")} statt einen Schritt zurück.`);
    } else {
      const after = await prog();
      if (after === p2) good(`Browser-Zurück geht EINEN Schritt zurück (${before} -> ${after})`);
      else note("ärgerlich", "Wizard", `Browser-Zurück landet bei '${after}" statt '${p2}"`);
      // Vorwärts
      await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(800);
      const fwd = await prog();
      if (fwd === before) good(`Browser-Vorwärts geht wieder einen Schritt vor (${fwd})`);
      else note("ärgerlich", "Wizard", `Browser-Vorwärts landet bei '${fwd}" statt '${before}"`);
      // Neuladen hält die Position
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-tx="step"]', { timeout: 60_000 });
      await page.waitForTimeout(700);
      const reloaded = await prog();
      if (reloaded === before) good(`Neuladen hält die Schritt-Position (${reloaded})`);
      else note("ärgerlich", "Wizard", `Neuladen verliert die Position ('${reloaded}" statt '${before}")`);
      // Zweimal zurück -> erster Schritt; ein drittes Mal verlässt die Anleitung
      await page.goBack({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      await page.goBack({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      const atFirst = await prog();
      if (atFirst === p1 && page.url().includes("belege-hochladen"))
        good(`Zweimal Zurück führt zum ersten Schritt (${atFirst})`);
      else note("ärgerlich", "Wizard", `Zweimal Zurück endet bei '${atFirst}" (${page.url().replace(BASE, "")})`);
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(900);
      if (!page.url().includes("belege-hochladen"))
        good("Zurück am ersten Schritt verlässt die Anleitung (kein Verlaufs-Gefängnis)");
      else note("ärgerlich", "Wizard", `Zurück am ersten Schritt bleibt auf ${page.url().replace(BASE, "")}`);
    }

    // ---- Verzweigung + Browser-Zurück (Abzweig muss erhalten bleiben) ----
    await fresh("zugang-portal");
    await page.waitForTimeout(500);
    const brBtns = page.locator('[data-tx="btn"]');
    if ((await brBtns.count()) === 2) {
      await brBtns.nth(1).click(); // „Nein, noch nicht" -> Registrieren
      await page.waitForTimeout(500);
      await page.goBack({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      const qTitle = await page.locator('[data-tx="step-title"]').innerText().catch(() => "");
      if (qTitle.includes("Haben Sie schon ein Konto")) good("Browser-Zurück führt aus einem Abzweig zurück zur Frage");
      else note("ärgerlich", "Verzweigung", `Browser-Zurück aus dem Abzweig zeigt '${qTitle}"`);
      await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(700);
      const fwdTitle = await page.locator('[data-tx="step-title"]').innerText().catch(() => "");
      if (fwdTitle.includes("Registrieren")) good("Browser-Vorwärts landet wieder im gewählten Abzweig");
      else note("ärgerlich", "Verzweigung", `Browser-Vorwärts zeigt '${fwdTitle}" statt 'Registrieren"`);
    }

    // ---- Tastaturbedienung ----
    await fresh("belege-hochladen");
    await page.waitForTimeout(900);
    const kb = await page.evaluate(() => {
      const btn = document.querySelector('[data-tx="btn"]');
      return { tabIndex: btn?.tabIndex, text: btn?.textContent?.trim() };
    });
    await page.locator('[data-tx="btn"]').first().focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    const kbTitle = await page.locator('[data-tx="step-title"]').innerText().catch(() => "");
    if (kbTitle.includes("Beleg auswählen")) good("Weiter-Knopf per Tastatur (Enter) bedienbar");
    else note("ärgerlich", "Barrierefreiheit", `Weiter per Enter funktioniert nicht (Titel: '${kbTitle}", ${JSON.stringify(kb)})`);

    // ---- Fertig + Feedback + 'komme nicht weiter' ----
    await fresh("ohne-kategorie");
    await page.waitForTimeout(500);
    const stuck = page.locator('[data-tx="stuck"] button');
    if (await stuck.count()) {
      await stuck.first().click();
      await page.waitForTimeout(600);
      const stuckTxt = await page.locator('[data-tx="stuck"]').innerText();
      if (/Danke|Dank/i.test(stuckTxt)) good("Ich komme hier nicht weiter: bestätigt");
      else note("ärgerlich", "Feedback", `Nach 'komme nicht weiter' steht dort: '${stuckTxt}"`);
    } else note("ärgerlich", "Feedback", "Kein Link Ich-komme-hier-nicht-weiter im Schritt");

    await page.locator('[data-tx="btn"]').first().click();
    await page.waitForTimeout(700);
    const doneTxt = await page.locator('[data-tx="step"]').innerText();
    if (/Geschafft|Fertig/i.test(doneTxt)) good("Fertig-Screen erscheint");
    else note("ärgerlich", "Wizard", "Fertig-Screen nicht erkannt", doneTxt.slice(0, 120));
    const thumbs = page.locator('[data-tx="step"] button[aria-label="Ja"]');
    if (await thumbs.count()) {
      await thumbs.first().click();
      await page.waitForTimeout(800);
      const after = await page.locator('[data-tx="step"]').innerText();
      if (/Danke/i.test(after)) good("Feedback 'Ja' wird bestätigt");
      else note("ärgerlich", "Feedback", "Feedback wird nicht bestätigt", after.slice(0, 120));
    } else note("ärgerlich", "Feedback", "Keine Daumen-Knöpfe auf dem Fertig-Screen");
    await shot(page, `fertig-${vp.name}`);

    // ---- Sprachumschalter ----
    step(`B3) Sprache ${vp.name}`);
    await fresh("belege-hochladen");
    await page.waitForSelector('[data-tx="lang"]', { timeout: 30_000 }).catch(() => {});
    if (await page.locator('[data-tx="lang"]').count()) {
      await page.locator('[data-tx="lang"] a', { hasText: "EN" }).first().click();
      await page.waitForTimeout(1500);
      const body = await page.locator("body").innerText();
      const urlEn = page.url();
      if (urlEn.includes("lang=en")) good("Sprachumschalter wechselt auf ?lang=en");
      else note("ärgerlich", "Sprache", `Sprachumschalter führt zu ${urlEn}`);
      if (/Upload receipts/.test(body)) good("EN: übersetzter Anleitungstitel");
      else note("ärgerlich", "Sprache", "EN: Anleitungstitel nicht übersetzt");
      if (/Open the portal/.test(body)) good("EN: übersetzter Schritt-Titel");
      else note("ärgerlich", "Sprache", "EN: Schritt-Titel nicht übersetzt");
      // Fertig-Screen + alle Schritte in EN durchklicken, deutsche Reste sammeln
      const germanLeft = [];
      for (let i = 0; i < 6; i++) {
        const t = await page.locator('[data-tx="step"]').innerText().catch(() => "");
        const de = t.match(/Hochladen bestätigen|Klicken Sie auf Hochladen|Schritt \d+ von|Ich komme hier nicht weiter|Von vorne|War diese Anleitung hilfreich/g);
        if (de) germanLeft.push(...de);
        const b = page.locator('[data-tx="btn"]');
        if (!(await b.count())) break;
        await b.first().click();
        await page.waitForTimeout(500);
      }
      const uiGerman = germanLeft.filter((g) => /Schritt \d+ von|Ich komme hier nicht weiter|Von vorne|War diese Anleitung hilfreich/.test(g));
      const contentGerman = germanLeft.filter((g) => /Hochladen/.test(g));
      if (uiGerman.length)
        note("ärgerlich", "Sprache", "Auf der englischen Ansicht bleiben Bedien-Texte deutsch", [...new Set(uiGerman)].join(" · "));
      else good("EN: Bedien-Texte (Schritt x von y, Zurück, Geschafft) sind übersetzt");
      if (contentGerman.length)
        note("kosmetisch", "Sprache", "Nicht übersetzte Schritte erscheinen auf Englisch mitten im Text auf Deutsch",
          `Erwartet (Feld-Fallback), aber für den Besucher ein Sprachbruch: ${[...new Set(contentGerman)].join(" · ")}`);
      await shot(page, `en-${vp.name}`);

      // hreflang / Metadaten
      const meta = await page.evaluate(() => ({
        title: document.title,
        desc: document.querySelector(`meta[name="description"]`)?.content,
        alts: [...document.querySelectorAll(`link[rel="alternate"]`)].map((l) => l.hreflang + "=" + l.getAttribute("href")),
        canonical: document.querySelector(`link[rel="canonical"]`)?.getAttribute("href"),
        htmlLang: document.documentElement.lang,
        og: document.querySelector(`meta[property="og:locale"]`)?.content,
      }));
      if (meta.htmlLang && meta.htmlLang !== "de")
        good(`<html lang> folgt der Sprache (${meta.htmlLang})`);
      else
        note("ärgerlich", "SEO/Barrierefreiheit", `Auf der englischen Seite steht weiterhin <html lang="${meta.htmlLang}">`,
          "Screenreader lesen den englischen Text mit deutscher Aussprache; Suchmaschinen sehen die Seite als deutsch. Die Sprache wird nur über ?lang= gesteuert, das <html lang> bleibt im Root-Layout hart auf de.");
      if (!meta.canonical)
        note("kosmetisch", "SEO", "Keine canonical-URL auf der Anleitungsseite",
          `Titel/Beschreibung/hreflang sind vorhanden (${meta.alts.join(", ") || "keine"}), eine canonical fehlt — ?lang=/?preview=-Varianten können doppelt indexiert werden.`);
      else good(`canonical vorhanden: ${meta.canonical}`);
    } else note("blockierend", "Sprache", "Kein Sprachumschalter sichtbar, obwohl EN aktiviert ist");

    // ---- Druckansicht ----
    step(`B4) Druckansicht ${vp.name}`);
    await page.goto(`${BASE}/h/${SLUG}/belege-hochladen/drucken`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    o = await overflow(page);
    if (o.sw <= o.iw + 1) good(`Druckansicht ${vp.name}: kein horizontales Scrollen`);
    else note("ärgerlich", "Druckansicht", `Druckansicht ${vp.name} scrollt horizontal (${o.sw} > ${o.iw})`);
    const printImgs = await page.$$eval("img", (els) => els.map((e) => ({ complete: e.complete, w: e.naturalWidth, loading: e.loading })));
    const notLoaded = printImgs.filter((i) => !i.complete || i.w === 0);
    if (notLoaded.length === 0) good(`Druckansicht: alle ${printImgs.length} Bilder geladen`);
    else note("ärgerlich", "Druckansicht", `${notLoaded.length} von ${printImgs.length} Bildern nicht geladen`, JSON.stringify(notLoaded));
    const printMarks = await page.evaluate(() => ({
      svgs: document.querySelectorAll("main svg").length,
      marks: document.querySelectorAll("main svg [data-mark]").length,
      blurs: document.querySelectorAll("main svg image[data-blur-mark]").length,
      backdrops: document.querySelectorAll("main div[style*='backdrop-filter']").length,
    }));
    if (printMarks.marks > 0 && (printMarks.blurs > 0 || printMarks.backdrops > 0)) good(`Druckansicht: Markierungen (${printMarks.marks}) und Verpixelung (${printMarks.blurs}/${printMarks.backdrops}) da`);
    else note("ärgerlich", "Druckansicht", "Markierungen oder Verpixelung fehlen in der Druckansicht", JSON.stringify(printMarks));
    // Druck-Emulation
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(800);
    const printState = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll("main img").forEach((e) => {
        const cs = getComputedStyle(e);
        out.push({ opacity: cs.opacity, display: cs.display, visible: e.getBoundingClientRect().height > 10, w: e.naturalWidth });
      });
      return { imgs: out, bodyW: document.body.scrollWidth, docW: document.documentElement.scrollWidth };
    });
    const hidden = printState.imgs.filter((i) => Number(i.opacity) < 1 || !i.visible || i.w === 0);
    if (hidden.length === 0) good(`Druck-Emulation: alle ${printState.imgs.length} Bilder sichtbar`);
    else note("blockierend", "Druckansicht", `Im Druck sind ${hidden.length} von ${printState.imgs.length} Bildern unsichtbar/leer`, JSON.stringify(hidden));
    await shot(page, `drucken-${vp.name}`);
    const pdf = path.join(OUT, `drucken-${vp.name}.pdf`);
    try { await page.pdf({ path: pdf, format: "A4", printBackground: true }); good(`PDF erzeugt: ${pdf}`); } catch (e) { note("kosmetisch", "Druckansicht", "PDF-Erzeugung fehlgeschlagen: " + e.message); }
    await page.emulateMedia({ media: "screen" });

    await ctx.close();
  }

  // ========================================================================
  // C) Chat-Widget + Einbetten
  // ========================================================================
  step("C) Chat-Widget & Einbetten");
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "chat", bag);

    // C1: Chat auf der Hilfe-Seite
    await page.goto(`${BASE}/h/${SLUG}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-tx="browser"]');
    const launcher = page.locator(`button[aria-label*="Hilfe"], button[aria-label*="Chat"]`).first();
    if (process.env.AUDIT_ONLY === "embed") {
      /* C1 überspringen */
    } else if (await launcher.count()) {
      await launcher.click();
      await page.waitForTimeout(500);
      const dlg = page.locator(`div[role="dialog"]`);
      if (await dlg.count()) {
        good("Chat-Panel öffnet sich");
        await page.locator(`div[role="dialog"] input`).fill("Wie lade ich Belege hoch?");
        await page.locator(`div[role="dialog"] input`).press("Enter");
        await page.waitForTimeout(18_000);
        const chatTxt = await dlg.innerText();
        await shot(page, "chat-antwort");
        if (chatTxt.length > 120) good("Chat antwortet");
        else note("ärgerlich", "Chat", "Chat liefert keine erkennbare Antwort", chatTxt.slice(0, 200));
        console.log("    Chat-Antwort (gekürzt):", chatTxt.replace(/\s+/g, " ").slice(0, 400));
        const srcLinks = await dlg.locator("a[href^='/h/']").count();
        if (srcLinks > 0) {
          good(`Chat verlinkt ${srcLinks} Quelle(n)`);
          const hrefs = await dlg.locator("a[href^='/h/']").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
          await dlg.locator("a[href^='/h/']").first().click();
          await page.waitForTimeout(2500);
          if (page.url().includes("/h/")) good(`Quellen-Link führt zur Anleitung (${hrefs[0]})`);
          else note("ärgerlich", "Chat", `Quellen-Link führt zu ${page.url()}`);
          // Sprache mitnehmen?
          await page.goto(`${BASE}/h/${SLUG}?lang=en`, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1500);
          const enDlgOpen = await page.locator(`div[role="dialog"]`).count();
          if (enDlgOpen) {
            const enHrefs = await page.locator(`div[role="dialog"] a[href^='/h/']`).evaluateAll((els) => els.map((e) => e.getAttribute("href")));
            if (enHrefs.length && !enHrefs.some((h) => h.includes("lang=en")))
              note("kosmetisch", "Chat", "Quellen-Links im Chat verlieren die gewählte Sprache",
                `Auf der englischen Ansicht zeigen die Links auf ${enHrefs[0]} (ohne ?lang=en) — der Besucher landet wieder auf Deutsch. viewer/chat-widget.tsx Z. 349.`);
            else if (enHrefs.length) good("Quellen-Links im Chat behalten die Sprache");
          }
        } else note("kosmetisch", "Chat", "Chat-Antwort enthält keine Quellen-Links");
      } else note("ärgerlich", "Chat", "Chat-Panel öffnet sich nicht");
    } else note("blockierend", "Chat", "Kein Chat-Knopf auf der Hilfe-Seite");

    // C2: Einbetten per <script> auf einer Fremd-Seite. Die Testseite wird unter
    // derselben Adresse ausgeliefert wie der Dev-Server — sonst blockt Chrome den
    // Script-Aufruf ins lokale Netz („Private Network Access"), was ein reines
    // Testlabor-Thema wäre und nichts über das Produkt aussagt.
    const EMBED_PAGE = `${BASE}/__kundenseite`;
    await page.route(EMBED_PAGE, (route) =>
      route.fulfill({
        status: 200, contentType: "text/html; charset=utf-8",
        body: `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Kanzlei-Website</title></head>
<body style="font-family:sans-serif;padding:40px"><h1>Website der Kanzlei</h1>
<p>Hier steht der normale Inhalt.</p>
<script src="${BASE}/h/embed.js?account=${SLUG}"></script></body></html>`,
      }),
    );
    await page.goto(EMBED_PAGE, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const frameInfo = await page.evaluate(() => {
      const f = document.querySelector("iframe");
      if (!f) return null;
      const r = f.getBoundingClientRect();
      return { src: f.src, w: Math.round(r.width), h: Math.round(r.height), title: f.title, radius: getComputedStyle(f).borderRadius };
    });
    if (!frameInfo) note("blockierend", "Einbetten", "Das Einbett-Skript erzeugt kein Chat-iframe");
    else {
      good(`Einbett-Skript erzeugt iframe (${frameInfo.w}×${frameInfo.h}, ${frameInfo.title})`);
      await shot(page, "embed-zu");
      const fr = page.frameLocator("iframe");
      const embLauncher = fr.locator("button").first();
      // force: das Next-Dev-Overlay im iframe fängt sonst den Klick ab (nur Entwicklungsmodus).
      await embLauncher.click({ force: true });
      await page.waitForTimeout(1200);
      const opened = await page.evaluate(() => {
        const f = document.querySelector("iframe");
        const r = f.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      if (opened.w > 200) good(`Einbett-iframe vergrößert sich beim Öffnen (${opened.w}×${opened.h})`);
      else note("blockierend", "Einbetten", `iframe bleibt klein beim Öffnen (${opened.w}×${opened.h}) — postMessage kommt nicht an`);
      await shot(page, "embed-offen");

      // Hat der Klick das Panel im iframe überhaupt geöffnet?
      const inner = await page.evaluate(() => {
        const d = document.querySelector("iframe")?.contentDocument;
        if (!d) return null;
        const wrap = d.querySelector("body > div");
        return {
          dialog: !!d.querySelector('[role="dialog"]'),
          wrapBg: wrap ? getComputedStyle(wrap).backgroundColor : null,
          wrapCls: wrap ? String(wrap.className).slice(0, 60) : null,
          bodyBg: getComputedStyle(d.body).backgroundColor,
        };
      }).catch(() => null);
      console.log("    iframe-Innenzustand:", JSON.stringify(inner));
      if (inner && inner.dialog) good("Klick im iframe öffnet das Chat-Panel");
      else note("blockierend", "Einbetten", "Klick auf die eingebettete Blase öffnet das Chat-Panel nicht", JSON.stringify(inner));

      // Hintergrund der geschlossenen Bubble: durchsichtig?
      const bubbleBg = inner ? { bg: inner.wrapBg, cls: inner.wrapCls } : null;
      if (bubbleBg && bubbleBg.bg && bubbleBg.bg !== "rgba(0, 0, 0, 0)" && bubbleBg.bg !== "transparent")
        note("kosmetisch", "Einbetten", "Die eingebettete Chat-Blase ist nicht durchsichtig",
          `Das /h-Layout legt eine deckende Fläche (${bubbleBg.bg}) über das ganze iframe — um den runden Knopf liegt ein farbiger Ring. h/[account_slug]/layout.tsx setzt background auf --brand-bg, die Chat-Seite setzt nur html/body transparent.`);
      else good("Eingebettete Chat-Blase ist durchsichtig");

      // Frage im eingebetteten Chat + Quellen-Link
      const embInput = fr.locator("input");
      if (await embInput.count()) {
        await embInput.fill("Wie lade ich Belege hoch?", { force: true });
        await embInput.press("Enter");
        await page.waitForTimeout(18_000);
        const links = await fr.locator("a[href^='/h/']").count();
        await shot(page, "embed-antwort");
        if (links > 0) {
          const tgt = await fr.locator("a[href^='/h/']").first().getAttribute("target");
          if (tgt === "_top" || tgt === "_blank")
            good(`Quellen-Link im eingebetteten Chat zielt aus dem iframe heraus (target="${tgt}")`);
          else
            note("ärgerlich", "Einbetten", `Quellen-Link im eingebetteten Chat hat target="${tgt}"`,
              'Ohne target="_top" wird die komplette Hilfe-Seite in das kleine Chat-Fenster geladen.');
          const before = page.url();
          await fr.locator("a[href^='/h/']").first().click({ force: true });
          await page.waitForTimeout(2500);
          const after = page.url();
          const frameUrl = await page.evaluate(() => document.querySelector("iframe")?.contentWindow?.location?.href ?? "n/a").catch(() => "n/a");
          const box = await page.evaluate(() => { const r = document.querySelector("iframe").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
          if (after === before)
            note("ärgerlich", "Einbetten", "Quellen-Link im eingebetteten Chat öffnet die Anleitung IM kleinen iframe",
              `Die Eltern-Seite bleibt auf ${after}; die Anleitung wird in das ${box.w}×${box.h} px große Chat-Fenster gequetscht (viewer/chat-widget.tsx Z. 349 nutzt <Link> ohne target="_top"). Die Bubble wird dadurch unbrauchbar (kein Zurück).`);
          else good("Quellen-Link im eingebetteten Chat öffnet die Anleitung im Hauptfenster");
          await shot(page, "embed-quelle-geklickt");
        } else note("kosmetisch", "Einbetten", "Chat-Antwort im iframe enthält keine Quellen-Links (evtl. keine passenden Treffer)");
      }
    }
    await ctx.close();
  }

  // ========================================================================
  // D) Langsames Netz / Ladezustände
  // ========================================================================
  step("D) Langsames Netz");
  if (process.env.AUDIT_ONLY !== "embed") {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, "langsam", bag);
    const reqCount = new Map();
    page.on("request", (r) => reqCount.set(r.url(), (reqCount.get(r.url()) ?? 0) + 1));
    await page.route(/storage\/v1\/object\/public/, async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      route.continue();
    });
    await page.goto(`${BASE}/h/${SLUG}/belege-hochladen`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-tx="step"]');
    await page.waitForTimeout(400);
    const posBefore = await page.evaluate(() => {
      const t = document.querySelector('[data-tx="step-title"]');
      return t ? Math.round(t.getBoundingClientRect().top) : null;
    });
    const skel = await page.evaluate(() => document.querySelectorAll('[data-tx="step"] .animate-pulse').length);
    await page.waitForTimeout(4500);
    const posAfter = await page.evaluate(() => {
      const t = document.querySelector('[data-tx="step-title"]');
      return t ? Math.round(t.getBoundingClientRect().top) : null;
    });
    if (posBefore != null && posAfter != null && Math.abs(posAfter - posBefore) <= 2)
      good(`Langsames Netz: kein Layout-Sprung (Titel bleibt bei ${posAfter} px, ${skel} Platzhalter)`);
    else note("ärgerlich", "Ladeverhalten", `Layout springt beim Nachladen des Bildes (Titel ${posBefore} -> ${posAfter} px)`);
    await shot(page, "langsam-laden");
    const dupes = [...reqCount.entries()].filter(([u, c]) => c > 1 && /storage\/v1\/object\/public.*(webp|wav)/.test(u));
    if (dupes.length === 0) good("Keine doppelt geladenen Bild-/Ton-Dateien");
    else note("kosmetisch", "Ladeverhalten", `${dupes.length} Datei(en) werden mehrfach geladen`,
      dupes.map(([u, c]) => `${c}× ${u.split("/").pop()}`).join(", "));

    // Schnelles Durchklicken: taucht je ein unverpixeltes Bild auf?
    await page.unroute(/storage\/v1\/object\/public/);
    await page.goto(`${BASE}/h/${SLUG}/belege-hochladen`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-tx="step"]');
    await page.waitForTimeout(1500);
    let unmasked = 0;
    for (let i = 0; i < 3; i++) {
      const b = page.locator('[data-tx="btn"]');
      if (!(await b.count())) break;
      await b.first().click();
      // sofort messen, ohne Wartezeit
      const s = await page.evaluate(() => {
        const wrap = document.querySelector('[data-tx="step"] img');
        if (!wrap) return { img: false };
        return {
          img: true,
          backdrops: document.querySelectorAll('[data-tx="step"] div[style*="backdrop-filter"]').length,
          svgBlurs: document.querySelectorAll('[data-tx="step"] image[data-blur-mark]').length,
          visible: getComputedStyle(wrap).opacity,
        };
      });
      if (s.img && s.visible === "1" && s.backdrops === 0 && s.svgBlurs === 0) unmasked++;
    }
    if (unmasked === 0) good("Schnelles Durchklicken: nie ein sichtbares Bild ohne Verpixelungs-Schicht");
    else note("blockierend", "Datenschutz", `Beim schnellen Durchklicken war ${unmasked}× ein sichtbares Bild ohne Verpixelungs-Schicht zu sehen`);
    await ctx.close();
  }

  // ========================================================================
  // E0) Chat OHNE KI-Schlüssel (zweiter Server, Schlüssel entfernt)
  // ========================================================================
  // (Ein Server ohne Schlüssel ist nicht herstellbar: `next dev` liest .env.local selbst
  //  nach — darum ein KAPUTTER Schlüssel, der denselben Ausfall erzeugt wie ein Fehler
  //  beim KI-Anbieter. Der Zweig „gar kein Schlüssel" sitzt in route.ts Z. 155.)
  step("E0) Chat bei KI-Ausfall (ungültiger Schlüssel)");
  if (process.env.AUDIT_ONLY !== "embed") {
    const PORT2 = await freePort(PORT + 1);
    const env2 = { ...process.env, PORT: String(PORT2), NEXT_PUBLIC_APP_URL: `http://localhost:${PORT2}`, OPENAI_API_KEY: "sk-invalid-key-for-audit" };
    const srv2 = spawn("npx", ["next", "dev", "-p", String(PORT2)], {
      cwd: path.join(__dirname, ".."), env: env2, stdio: "ignore", shell: true,
    });
    try {
      const start = Date.now();
      let live = false;
      while (Date.now() - start < 180_000) {
        try { const r = await fetch(`http://localhost:${PORT2}/h/${SLUG}`); if (r.status < 500) { live = true; break; } } catch {}
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!live) note("kosmetisch", "Chat", "Zweiter Server (KI-Ausfall) kam nicht hoch — Prüfung übersprungen");
      else {
        const r = await fetch(`http://localhost:${PORT2}/api/chat`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountSlug: SLUG, question: "Wie lade ich Belege hoch?", history: [], lang: "de" }),
        });
        const ct = r.headers.get("content-type") || "";
        const raw = await r.text();
        let j = {};
        try { j = JSON.parse(raw); } catch {}
        if (r.status === 200 && typeof j.answer === "string" && j.answer.length > 10)
          good(`KI-Ausfall: Chat antwortet mit einem verständlichen Hinweis statt einer Fehlerseite ('${j.answer.slice(0, 70)}…')`);
        else note("ärgerlich", "Chat", `Bei KI-Ausfall liefert /api/chat Status ${r.status} (${ct})`, raw.slice(0, 220));
        const rs = await fetch(`http://localhost:${PORT2}/api/hub-search`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountSlug: SLUG, q: "beleg" }),
        });
        const js = await rs.json().catch(() => ({}));
        if (rs.status === 200 && Array.isArray(js.results)) good("KI-Ausfall: semantische Suche liefert eine leere Liste statt eines Fehlers");
        else note("ärgerlich", "Hub-Suche", `Bei KI-Ausfall liefert /api/hub-search Status ${rs.status}`, JSON.stringify(js).slice(0, 200));
        // Unbekanntes Konto
        const ru = await fetch(`http://localhost:${PORT2}/api/chat`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountSlug: "gibt-es-nicht-" + stamp, question: "Test" }),
        });
        if (ru.status === 404) good("Chat-Schnittstelle antwortet bei unbekanntem Konto mit 404");
        else note("kosmetisch", "Chat", `Chat-Schnittstelle antwortet bei unbekanntem Konto mit ${ru.status}`);
      }
    } finally {
      if (srv2?.pid) {
        try {
          if (process.platform === "win32") spawn("taskkill", ["/pid", String(srv2.pid), "/f", "/t"], { stdio: "ignore", shell: true });
          else process.kill(-srv2.pid, "SIGKILL");
        } catch { srv2.kill("SIGKILL"); }
      }
    }
  }

  // ========================================================================
  // E) Gesammelte Fehler
  // ========================================================================
  step("E) Gesammelte Browser-Fehler");
  const uniq = (a) => [...new Set(a)];
  if (bag.pageerror.length) note("blockierend", "JavaScript", `${bag.pageerror.length} unbehandelte JS-Fehler`, uniq(bag.pageerror).slice(0, 6).join("\n        "));
  else good("Keine unbehandelten JavaScript-Fehler");
  const consErr = uniq(bag.console);
  if (consErr.length) note("ärgerlich", "Konsole", `${consErr.length} verschiedene Konsolen-Fehler`, consErr.slice(0, 8).join("\n        "));
  else good("Keine Konsolen-Fehler");
  const http = uniq(bag.http).filter((h) => !/ 404 .*(gibt-es-nicht|geheimer-entwurf|nur-intern|kein-konto)/.test(h));
  if (http.length) note("ärgerlich", "Netzwerk", `${http.length} unerwartete 4xx/5xx-Antworten`, http.slice(0, 10).join("\n        "));
  else good("Keine unerwarteten 4xx/5xx-Antworten (außer den gewollten 404ern)");
} catch (e) {
  note("blockierend", "Testlauf", "Abbruch: " + e.message, String(e.stack).slice(0, 600));
} finally {
  step("Aufräumen");
  try {
    for (const id of tutorialIds) await admin.from("tutorials").delete().eq("id", id);
    await admin.from("categories").delete().eq("account_id", accId);
    if (pubPaths.length) await admin.storage.from(PUB).remove(pubPaths);
    if (privPaths.length) await admin.storage.from(PRIV).remove(privPaths);
    if (accId) await admin.from("accounts").delete().eq("id", accId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log("  Testdaten gelöscht.");
  } catch (e) {
    console.warn("  Cleanup-Warnung:", e.message);
  }
  try { if (browser) await browser.close(); } catch {}
  if (server?.pid) {
    try {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore", shell: true });
      else process.kill(-server.pid, "SIGKILL");
    } catch { server.kill("SIGKILL"); }
  }
}

console.log("\n\n########## BEFUNDE ##########");
// Desktop/Mobil liefern denselben Befund doppelt -> zusammenfassen.
const dedupe = (list) => {
  const m = new Map();
  for (const f of list) {
    const key = `${f.sev}|${f.area}|${f.text.replace(/desktop|mobil/gi, "*")}`;
    if (m.has(key)) m.get(key).n++;
    else m.set(key, { ...f, n: 1 });
  }
  return [...m.values()];
};
for (const sev of ["blockierend", "ärgerlich", "kosmetisch"]) {
  const list = dedupe(findings.filter((f) => f.sev === sev));
  console.log(`\n--- ${sev.toUpperCase()} (${list.length}) ---`);
  list.forEach((f, i) => console.log(`${i + 1}. [${f.area}]${f.n > 1 ? ` (${f.n}×)` : ""} ${f.text}${f.detail ? "\n   " + f.detail : ""}`));
}
const okUniq = [...new Set(okList.map((o) => o.replace(/desktop|mobil/gi, "*")))];
console.log(`\n--- OK (${okUniq.length}) ---`);
okUniq.forEach((o) => console.log("  • " + o));
writeFileSync(path.join(OUT, "befunde.json"), JSON.stringify({ findings, okList }, null, 2));
console.log(`\nScreenshots + befunde.json: ${OUT}`);
setTimeout(() => process.exit(0), 1500);
