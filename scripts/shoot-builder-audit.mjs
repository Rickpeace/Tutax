// UX-/Design-Audit des Anleitungs-Editors (Builder, /app/tutorials/[id]) — reine Screenshot-Tour.
// Ändert keinen Produktcode. Echter Login gegen die echte DB mit einem WEGWERF-Konto im
// Business-Tarif (wird am Ende IMMER gelöscht, inkl. Storage-Dateien), eigener `next dev`.
//
// Inhalte: eine realistische Anleitung mit 6 Schritten (Bilder, Markierungen, Lupe, Verpixelung,
// vorgeschlagene Auto-Verpixelung, Verzweigung Ja/Nein, Leerschritt ohne Bild), Kategorie,
// Website-Domains, Zusatzsprache EN, Quell-Video (per Playwright aufgenommenes WebM) für den
// Frame-Picker — plus eine leere neue Anleitung.
//
// Screenshots → SHOT_DIR (Standard: scripts/.shots-builder-audit, gitignored über .shots-*).
// Protokoll (Konsole/Seitenfehler/Überbreite/Fokus) → SHOT_DIR/audit-log.json.
//
// Nutzung:  node --env-file=.env.local scripts/shoot-builder-audit.mjs
//   STEPLY_PW_DIR=<npx-Cache mit playwright>  (optional, sonst Suche im npx-Cache)
//   AUDIT_IMG_DIR=<Ordner mit 1440x900-PNGs>  (optional; sonst .shots-steply-help, sonst generiert)
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync, writeFileSync, readFileSync, createWriteStream, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, ".shots-builder-audit");
mkdirSync(SHOT_DIR, { recursive: true });

function resolvePlaywright() {
  if (process.env.STEPLY_PW_DIR) {
    const p = path.join(process.env.STEPLY_PW_DIR, "node_modules", "playwright");
    if (existsSync(p)) return require(p);
  }
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

const PORT = Number(process.env.AUDIT_PORT || 3071);
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const email = `tutax-baudit-${stamp}@example.com`;
const YES = "#18a999";
const NO = "#d3543a";

// ---------------------------------------------------------------- Protokoll
const log = { console: [], pageErrors: [], overflow: [], focus: [], shots: [], failures: [], notes: [] };
const note = (m) => {
  console.log("· " + m);
  log.notes.push(m);
};
function attachLogging(page, label) {
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      const text = msg.text();
      // Rauschen, das nichts mit der App zu tun hat
      if (/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(text)) return;
      log.console.push({ page: label, type: t, text: text.slice(0, 600), url: page.url() });
    }
  });
  page.on("pageerror", (err) => log.pageErrors.push({ page: label, text: String(err?.stack || err).slice(0, 800), url: page.url() }));
}

async function shot(page, name, opts = {}) {
  const file = path.join(SHOT_DIR, `${name}.png`);
  try {
    if (opts.locator) await opts.locator.screenshot({ path: file });
    else await page.screenshot({ path: file, fullPage: !!opts.fullPage });
    log.shots.push(file);
    console.log("📸 " + name);
  } catch (e) {
    log.failures.push({ step: "shot " + name, error: String(e).slice(0, 300) });
    console.log("✗ Screenshot " + name + ": " + String(e).slice(0, 200));
  }
}

async function checkOverflow(page, label) {
  try {
    const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    log.overflow.push({ label, px: o });
    if (o > 1) note(`Überbreite ${o}px bei „${label}“`);
  } catch {
    /* egal */
  }
}

async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    log.failures.push({ step: name, error: String(e?.stack || e).slice(0, 600) });
    console.log(`✗ ${name}: ${String(e).slice(0, 250)}`);
  }
}

async function waitForServer(timeoutMs = 240_000) {
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

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 90_000 });
}

// ---------------------------------------------------------------- Inhalte
function pickImageDir() {
  const cands = [
    process.env.AUDIT_IMG_DIR,
    path.join(__dirname, ".shots-steply-help"),
    path.join(ROOT, "..", "..", "..", "scripts", ".shots-steply-help"), // Worktree → Haupt-Checkout
  ].filter(Boolean);
  return cands.find((d) => existsSync(path.join(d, "dashboard.png"))) || null;
}

async function genImage(label, hue) {
  // Fallback: 1440x900-Pseudo-Screenshot mit Kopfzeile, Seitenleiste und Formular.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900">
    <rect width="1440" height="900" fill="#fdf9f3"/>
    <rect width="1440" height="64" fill="hsl(${hue},55%,45%)"/>
    <text x="32" y="42" font-family="Arial" font-size="26" fill="#fff" font-weight="700">Muster-Portal · ${label}</text>
    <rect x="0" y="64" width="240" height="836" fill="#f0e7d9"/>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="24" y="${100 + i * 52}" width="190" height="32" rx="8" fill="${i === 1 ? "#fff" : "#f7f1e6"}"/>`).join("")}
    <rect x="300" y="110" width="700" height="46" rx="10" fill="#fff" stroke="#e3d7c2" stroke-width="2"/>
    <text x="320" y="141" font-family="Arial" font-size="20" fill="#6b5e4b">max.mustermann@muster-gmbh.de</text>
    <rect x="300" y="190" width="700" height="46" rx="10" fill="#fff" stroke="#e3d7c2" stroke-width="2"/>
    <text x="320" y="221" font-family="Arial" font-size="20" fill="#6b5e4b">IBAN DE12 3456 7890 1234 5678 90</text>
    <rect x="300" y="280" width="200" height="50" rx="25" fill="#ef6a4e"/>
    <text x="345" y="312" font-family="Arial" font-size="20" fill="#fff" font-weight="700">Speichern</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const doc = (...paras) => ({
  type: "doc",
  content: paras.map((p) =>
    Array.isArray(p)
      ? { type: "bulletList", content: p.map((t) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] })) }
      : { type: "paragraph", content: [{ type: "text", text: p }] },
  ),
});

// ---------------------------------------------------------------- Ablauf
let server, serverLog, browser, userId, accountId;
const uploaded = { "tutorial-images": [], "tutorial-videos": [] };
const tmpVideoDir = path.join(os.tmpdir(), `builder-audit-video-${stamp}`);

try {
  // ---- Wegwerf-Konto ----
  const created = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const { data: members } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = members[0].account_id;
  await admin
    .from("accounts")
    .update({ name: "Muster Steuerberatung GmbH", onboarded: true, plan: "business", languages: ["en"] })
    .eq("id", accountId);
  note(`Wegwerf-Konto ${email} / account ${accountId}`);

  const catNames = ["Team & Zugänge", "Mandanten-Portal", "DATEV Unternehmen online", "Rechnungen"];
  const { data: cats, error: catErr } = await admin
    .from("categories")
    .insert(catNames.map((name, i) => ({ account_id: accountId, name, position: i })))
    .select("id, name");
  if (catErr) throw catErr;
  const catId = cats.find((c) => c.name === "Team & Zugänge").id;

  // Anleitung A (voll) + Anleitung B (leer)
  const { data: tut, error: tErr } = await admin
    .from("tutorials")
    .insert({
      account_id: accountId,
      title: "Neue Kollegin ins Team einladen",
      description: "So geben Sie neuen Mitarbeitenden in wenigen Klicks Zugriff auf Ihr Konto.",
      status: "draft",
      visibility: "public",
      in_lernen: false,
      category_id: catId,
      site_domains: ["app.steply.de", "steply.de"],
    })
    .select("id")
    .single();
  if (tErr) throw tErr;
  const tutorialId = tut.id;
  const { data: tutB, error: tbErr } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title: "Neue Anleitung", status: "draft", visibility: "public", in_lernen: false })
    .select("id")
    .single();
  if (tbErr) throw tbErr;
  const emptyTutorialId = tutB.id;

  // Bilder
  const imgDir = pickImageDir();
  note(imgDir ? `Bilder aus ${imgDir}` : "Bilder generiert (sharp)");
  const imgFor = async (file, label, hue) => {
    const png = imgDir && existsSync(path.join(imgDir, file)) ? readFileSync(path.join(imgDir, file)) : await genImage(label, hue);
    return sharp(png).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  };

  const id = () => crypto.randomUUID();
  const S = { s1: id(), s2: id(), s3: id(), s4a: id(), s4b: id(), s5: id() };
  const hl = (o) => ({ id: id(), strokeWidth: 3, rounded: true, ...o });
  const stepDefs = [
    {
      id: S.s1, title: "Einstellungen öffnen", img: ["dashboard.png", "Start", 20],
      body: doc("Klicken Sie links in der Seitenleiste auf „Einstellungen“.", "Sie sehen dort alle Bereiche Ihres Kontos."),
      highlights: [hl({ type: "rect", x: 0.012, y: 0.62, w: 0.15, h: 0.06 }), hl({ type: "arrow", x: 0.3, y: 0.55, w: -0.12, h: 0.08 })],
    },
    {
      id: S.s2, title: "Bereich „Team“ wählen", img: ["team.png", "Team", 200],
      body: doc("Wechseln Sie in den Reiter „Team“. Hier stehen alle Personen mit Zugriff."),
      highlights: [
        hl({ type: "ellipse", x: 0.2, y: 0.12, w: 0.12, h: 0.07, zoom: true }),
        hl({ type: "blur", x: 0.35, y: 0.3, w: 0.25, h: 0.05 }),
      ],
    },
    {
      id: S.s3, title: "Soll die Person Admin werden?", img: ["team.png", "Rolle", 120], is_decision: true,
      body: doc("Admins dürfen Abrechnung, Team und Einstellungen ändern. Alle anderen nur Anleitungen bearbeiten."),
      highlights: [],
    },
    {
      id: S.s4a, title: "Rolle „Admin“ auswählen", img: ["aussehen.png", "Admin", 280],
      body: doc("Wählen Sie im Feld „Rolle“ den Eintrag „Admin“.", ["Nur für Kanzleiinhaber/-innen", "Kann später geändert werden"]),
      highlights: [hl({ type: "rect", x: 0.45, y: 0.35, w: 0.2, h: 0.06, color: "#d6455d" })],
    },
    {
      id: S.s4b, title: "Rolle „Mitglied“ belassen", img: null,
      body: doc("Nichts ändern – „Mitglied“ ist voreingestellt."),
      highlights: [],
    },
    {
      id: S.s5, title: "Einladung abschicken", img: ["teilen.png", "Einladen", 330],
      body: doc("Geben Sie die E-Mail-Adresse ein und klicken Sie auf „Einladen“. Die Person bekommt sofort eine E-Mail."),
      // ungeprüfte automatische Verpixelung → Veröffentlichen-Gate
      highlights: [hl({ type: "blur", x: 0.3, y: 0.2, w: 0.3, h: 0.06, suggested: true }), hl({ type: "rect", x: 0.62, y: 0.18, w: 0.12, h: 0.07 })],
    },
  ];
  const rows = [];
  let pos = 0;
  for (const d of stepDefs) {
    pos += 1;
    let image_path = null, image_width = null, image_height = null;
    if (d.img) {
      const { data: buf, info } = await imgFor(...d.img);
      image_path = `${accountId}/${tutorialId}/${d.id}.webp`;
      const up = await admin.storage.from("tutorial-images").upload(image_path, buf, { contentType: "image/webp", upsert: true });
      if (up.error) throw up.error;
      uploaded["tutorial-images"].push(image_path);
      image_width = info.width;
      image_height = info.height;
    }
    rows.push({
      id: d.id, tutorial_id: tutorialId, position: pos, title: d.title, body: d.body,
      image_path, image_width, image_height, highlights: d.highlights, is_decision: !!d.is_decision,
    });
  }
  const { error: sErr } = await admin.from("steps").insert(rows);
  if (sErr) throw sErr;
  await admin.from("tutorials").update({ root_step_id: S.s1 }).eq("id", tutorialId);
  const { error: bErr } = await admin.from("step_branches").insert([
    { step_id: S.s1, label: null, target_step_id: S.s2, position: 0 },
    { step_id: S.s2, label: null, target_step_id: S.s3, position: 0 },
    { step_id: S.s3, label: "Ja", color: YES, target_step_id: S.s4a, position: 0 },
    { step_id: S.s3, label: "Nein", color: NO, target_step_id: S.s4b, position: 1 },
    { step_id: S.s4a, label: null, target_step_id: S.s5, position: 0 },
    { step_id: S.s4b, label: null, target_step_id: S.s5, position: 0 },
  ]);
  if (bErr) throw bErr;

  // ---- Server ----
  serverLog = createWriteStream(path.join(SHOT_DIR, "next-dev.log"));
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], { cwd: ROOT, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });

  // ---- Quell-Video (für den Frame-Picker): kurze WebM-Aufnahme einer lokalen Seite ----
  await step("Quell-Video erzeugen", async () => {
    mkdirSync(tmpVideoDir, { recursive: true });
    const vctx = await browser.newContext({ viewport: { width: 960, height: 540 }, recordVideo: { dir: tmpVideoDir, size: { width: 960, height: 540 } } });
    const vp = await vctx.newPage();
    await vp.setContent(`<body style="margin:0;font:28px Arial;background:#fdf9f3"><div id=a style="padding:40px">Muster-Portal – Team</div></body>`);
    for (let i = 0; i < 6; i++) {
      await vp.evaluate((n) => { document.getElementById("a").textContent = "Muster-Portal – Schritt " + n; document.body.style.background = n % 2 ? "#ffe8e2" : "#dcf3ef"; }, i + 1);
      await vp.waitForTimeout(500);
    }
    const vpath = await vp.video().path();
    await vctx.close();
    const buf = readFileSync(vpath);
    const video_path = `${accountId}/audit-${stamp}.webm`;
    const up = await admin.storage.from("tutorial-videos").upload(video_path, buf, { contentType: "video/webm", upsert: true });
    if (up.error) throw up.error;
    uploaded["tutorial-videos"].push(video_path);
    const { error } = await admin.from("video_jobs").insert({ account_id: accountId, video_path, title: "Audit-Video", status: "done", tutorial_id: tutorialId, created_by: userId });
    if (error) throw error;
  });

  // ======================================================= DESKTOP 1440x900
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15_000);
  attachLogging(page, "desktop");
  await login(page);
  const editorUrl = `${BASE}/app/tutorials/${tutorialId}`;
  const openEditor = async (p = page, url = editorUrl) => {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await p.getByTestId("editor-controls").waitFor({ timeout: 120_000 });
    await p.waitForTimeout(1500);
  };
  const panel = page.getByTestId("step-editor-panel");
  const card = (title) => page.locator("main").last().getByRole("button", { name: title }).first();

  // 1) leere neue Anleitung
  await step("leer", async () => {
    await openEditor(page, `${BASE}/app/tutorials/${emptyTutorialId}`);
    await shot(page, "d01-leere-anleitung");
  });

  // 2) Übersicht mit Schritten
  await step("übersicht", async () => {
    await openEditor();
    await shot(page, "d02-anleitung-uebersicht");
    await shot(page, "d02b-anleitung-uebersicht-ganz", { fullPage: true });
  });

  // 3) Schritt ausgewählt
  await step("schritt ausgewählt", async () => {
    await card("Einstellungen öffnen").click();
    await panel.waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    await shot(page, "d03-schritt-ausgewaehlt");
    await panel.evaluate((el) => el.firstElementChild.scrollTo(0, 99999));
    await page.waitForTimeout(300);
    await shot(page, "d03b-schritt-panel-unten");
    await panel.evaluate((el) => el.firstElementChild.scrollTo(0, 0));
  });

  // 4) ungespeicherte Änderungen + Rich-Text
  await step("ungespeichert + rich text", async () => {
    await page.locator("#step-title").fill("Einstellungen öffnen (neu)");
    const pm = panel.locator(".ProseMirror");
    await pm.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Wichtig: ");
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.up("Shift");
    await page.waitForTimeout(200);
    await pm.scrollIntoViewIfNeeded();
    await shot(page, "d04-ungespeichert-richtext");
    // Link einfügen: Steply-Dialog mit URL-Feld (vorher Browser-prompt)
    await panel.getByRole("button", { name: "Link einfügen" }).click();
    const linkDlg = page.getByTestId("link-dialog");
    await linkDlg.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(300);
    await shot(page, "d04b-link-dialog");
    note("Link-Dialog Feld: " + (await linkDlg.locator("input").first().evaluate((el) => el.outerHTML.slice(0, 300))));
    note("Link-Dialog getByLabel-Treffer: " + (await linkDlg.getByLabel("Link-Adresse").count()));
    await linkDlg.locator("#rt-link-url").fill("keine adresse");
    await linkDlg.getByRole("button", { name: "Link setzen" }).click();
    await page.waitForTimeout(300);
    await shot(page, "d04c-link-dialog-fehler");
    await linkDlg.locator("#rt-link-url").fill("beispiel.de/hilfe");
    await linkDlg.getByRole("button", { name: "Link setzen" }).click();
    await page.waitForTimeout(400);
    const href = await panel.locator(".ProseMirror a").first().getAttribute("href").catch(() => null);
    note(`Link gesetzt: ${href}`);
    // Toolbar der Rich-Text-Knöpfe: Namen protokollieren
    const rtNames = await panel.locator(".ProseMirror").locator("xpath=../..").locator("button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label") || b.getAttribute("title") || b.textContent.trim() || "(ohne Namen)"));
    note("Rich-Text-Knöpfe (Name): " + rtNames.join(" | "));
  });

  // 5) Navigation mit ungespeicherten Änderungen → Dialog
  await step("dirty nav dialog", async () => {
    await panel.getByTitle("Nächster Schritt").click();
    await page.getByRole("dialog").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(400);
    await shot(page, "d05-ungespeichert-weiter-dialog");
    await page.getByRole("button", { name: /Verwerfen & weiter/ }).click();
    await page.waitForTimeout(800);
    await shot(page, "d05b-schritt-2-lupe-verpixelt");
  });

  // 6) Bild-Werkzeuge (auf Schritt 2)
  await step("werkzeuge", async () => {
    const canvas = panel.getByTestId("highlight-canvas");
    await canvas.scrollIntoViewIfNeeded();
    const toolbar = canvas.locator("xpath=.."); // HighlightEditor-Wurzel (Leiste + Hinweise + Bild)
    const tools = ["Auswählen", "Rechteck", "Kreis", "Pfeil", "Verpixeln"];
    const box = async () => canvas.boundingBox();
    const drag = async (fx1, fy1, fx2, fy2) => {
      const b = await box();
      await page.mouse.move(b.x + b.width * fx1, b.y + b.height * fy1);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width * ((fx1 + fx2) / 2), b.y + b.height * ((fy1 + fy2) / 2), { steps: 5 });
      await page.mouse.move(b.x + b.width * fx2, b.y + b.height * fy2, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    };
    const imgArea = canvas.locator("xpath=..");
    for (const [i, t] of tools.entries()) {
      await toolbar.getByRole("button", { name: t, exact: true }).click();
      await page.waitForTimeout(150);
      if (t === "Rechteck") await drag(0.55, 0.55, 0.75, 0.68);
      if (t === "Kreis") await drag(0.1, 0.75, 0.25, 0.88);
      if (t === "Pfeil") await drag(0.45, 0.85, 0.6, 0.72);
      if (t === "Verpixeln") await drag(0.7, 0.8, 0.95, 0.9);
      await shot(page, `d06${String.fromCharCode(97 + i)}-werkzeug-${t.toLowerCase()}`, { locator: imgArea });
    }
    // Rechteck auswählen → Lupe
    await toolbar.getByRole("button", { name: "Auswählen", exact: true }).click();
    const b = await box();
    await page.mouse.click(b.x + b.width * 0.55, b.y + b.height * 0.6);
    await page.waitForTimeout(300);
    await toolbar.getByRole("button", { name: /Lupe/ }).click();
    await page.waitForTimeout(600);
    await shot(page, "d06f-werkzeug-lupe-aktiv", { locator: imgArea });
    // Einrast-Hilfslinie beim Ziehen (Momentaufnahme mit gedrückter Maus)
    await page.mouse.move(b.x + b.width * 0.56, b.y + b.height * 0.56);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.52, { steps: 8 });
    await page.waitForTimeout(200);
    await shot(page, "d06g-einrasten-hilfslinie", { locator: imgArea });
    await page.mouse.up();
    await page.waitForTimeout(400);
    await shot(page, "d06h-panel-nach-markieren");
  });

  // 7) Groß bearbeiten
  await step("groß bearbeiten", async () => {
    await panel.getByRole("button", { name: /Groß bearbeiten/ }).click();
    await page.waitForTimeout(1200);
    await shot(page, "d07-gross-bearbeiten");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  });

  // 8) Zuschneiden-Dialog (Bild ersetzen)
  await step("zuschneiden", async () => {
    const png = imgDir ? path.join(imgDir, "builder.png") : null;
    const file = png && existsSync(png) ? png : path.join(SHOT_DIR, "_gen.png");
    if (!existsSync(file)) writeFileSync(file, await genImage("Ersatz", 90));
    await panel.locator('input[type="file"]').setInputFiles(file);
    await page.getByText("Bereich zuschneiden").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(700);
    await shot(page, "d08-zuschneiden");
    // Liegt der Kopf der App ÜBER dem Zuschneiden-Overlay? (Seitenverhältnis-Knöpfe verdeckt)
    const hit = await page.getByRole("button", { name: "16:9" }).evaluate((b) => {
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { y: Math.round(r.top), covered: !b.contains(top), by: top ? top.tagName + "." + String(top.className).slice(0, 60) : null };
    });
    note(`Zuschneiden: „16:9“-Knopf bei y=${hit.y}, verdeckt=${hit.covered} (${hit.by})`);
    await page.getByRole("button", { name: "16:9" }).click({ timeout: 4000 }).catch(() => note("„16:9“ nicht klickbar (verdeckt)"));
    await page.waitForTimeout(300);
    await shot(page, "d08b-zuschneiden-16-9");
    await page.keyboard.press("Escape"); // schließt es?
    await page.waitForTimeout(300);
    const stillOpen = await page.getByText("Bereich zuschneiden").isVisible().catch(() => false);
    note(`Zuschneiden-Dialog nach Escape noch offen: ${stillOpen}`);
    // Übernehmen → Upload → „Markierungen behalten?“
    if (!stillOpen) {
      // Esc schließt den Dialog (gewollt) → erneut öffnen, um den Upload-Weg zu zeigen.
      await panel.locator('input[type="file"]').setInputFiles(file);
      await page.getByText("Bereich zuschneiden").waitFor({ timeout: 10_000 });
    }
    await page.getByRole("button", { name: /Übernehmen/ }).click();
    await page.getByText("Markierungen behalten?").waitFor({ timeout: 30_000 });
    await page.waitForTimeout(400);
    await shot(page, "d08c-markierungen-behalten-dialog");
    await page.getByRole("button", { name: "Behalten" }).click();
    await page.waitForTimeout(800);
  });

  // 9) Verzweigungs-Schritt + Leerschritt ohne Bild
  await step("verzweigung", async () => {
    // Sicherheitsnetz: offenes Zuschneiden-Overlay / Dialog schließen
    if (await page.getByText("Bereich zuschneiden").isVisible().catch(() => false))
      await page.getByRole("button", { name: /Abbrechen/ }).click({ timeout: 4000 }).catch(() => {});
    if (await page.getByRole("button", { name: "Behalten" }).isVisible().catch(() => false))
      await page.getByRole("button", { name: "Behalten" }).click().catch(() => {});
    await card("Soll die Person Admin werden?").click();
    await page.waitForTimeout(1200);
    await panel.evaluate((el) => el.firstElementChild.scrollTo(0, 99999));
    await page.waitForTimeout(300);
    await shot(page, "d09-verzweigung-antworten");
  });
  await step("leerschritt", async () => {
    await card("Rolle „Mitglied“ belassen").click();
    await page.waitForTimeout(1200);
    await shot(page, "d10-leerschritt-ohne-bild");
  });

  // 10) Kopf: Kategorie, Website, Übersetzen, Aktualität
  const controls = page.getByTestId("editor-controls");
  await step("kategorie", async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await controls.getByRole("button", { name: "Kategorie wählen" }).click();
    await page.waitForTimeout(400);
    await shot(page, "d11-kategorie-picker");
    await page.keyboard.type("Lohn");
    await page.waitForTimeout(300);
    await shot(page, "d11b-kategorie-neu-anlegen");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const stillOpen = await page.getByPlaceholder("Suchen oder neu anlegen …").isVisible().catch(() => false);
    note(`Kategorie-Picker nach Escape noch offen: ${stillOpen}`);
    if (stillOpen) await page.mouse.click(1300, 700);
    await page.waitForTimeout(300);
  });
  await step("website", async () => {
    await controls.getByText("app.steply.de").click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder("z. B. datev.de").fill("keine domain");
    await page.getByPlaceholder("z. B. datev.de").press("Enter");
    await page.waitForTimeout(300);
    await shot(page, "d12-website-picker-fehler");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });
  await step("übersetzen", async () => {
    await controls.getByTestId("editor-more").click();
    await page.waitForTimeout(600);
    await shot(page, "d13-uebersetzen-tooltip", { locator: page.locator("main").last().locator("div.mb-6").first() });
    await shot(page, "d13a-uebersetzen-tooltip-seite");
    await page.getByRole("menuitem", { name: /Übersetzen/ }).click();
    await page.waitForTimeout(700);
    await shot(page, "d13b-uebersetzen-laeuft");
    await page.locator("[data-sonner-toast]").first().waitFor({ timeout: 120_000 });
    await page.waitForTimeout(500);
    await shot(page, "d13c-uebersetzen-ergebnis");
  });
  await step("aktualität", async () => {
    await page.mouse.move(10, 10);
    await page.waitForTimeout(4500); // Toasts abklingen lassen
    await controls.getByTestId("editor-more").click();
    await page.waitForTimeout(400);
    await page.getByRole("menuitem", { name: /Aktualität prüfen/ }).click();
    await page.waitForTimeout(500);
    await shot(page, "d14-aktualitaet-laeuft");
    await page.locator("[data-sonner-toast]").first().waitFor({ timeout: 120_000 });
    await page.waitForTimeout(600);
    await shot(page, "d14b-aktualitaet-ergebnis");
    const toastText = await page.locator("[data-sonner-toast]").first().innerText().catch(() => "");
    note(`Aktualität-Toast: ${toastText.replace(/\s+/g, " ")}`);
    const details = page.getByRole("button", { name: "Details ansehen" });
    if (await details.isVisible().catch(() => false)) {
      await details.click();
      await page.getByTestId("drift-details").waitFor({ timeout: 10_000 });
      await page.waitForTimeout(500);
      await shot(page, "d14c-aktualitaet-details");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }
  });

  // 11) Erweitert (für Automationen)
  await step("erweitert", async () => {
    await card("Einstellungen öffnen").click();
    await page.waitForTimeout(1000);
    const adv = page.getByTestId("step-advanced");
    await adv.getByRole("button", { name: /Erweitert/ }).click();
    await adv.getByRole("switch").first().click();
    await page.waitForTimeout(600);
    await adv.scrollIntoViewIfNeeded();
    await shot(page, "d15-erweitert-bedingung");
  });

  // 12) Einfügen (+) zwischen Schritten → Menü → Aufnahme-Dialog → Schritt einfügen
  await step("einfügen", async () => {
    await page.getByTestId("step-editor-panel").getByRole("button", { name: "Editor schließen" }).click();
    await page.waitForTimeout(500);
    const plus = page.getByRole("button", { name: "Schritt hier einfügen" }).first();
    const rec = page.getByRole("button", { name: "Ab hier mit der Steply-Erweiterung aufnehmen" }).first();
    await rec.hover();
    await page.waitForTimeout(900);
    await shot(page, "d16-einfuegen-menue");
    await rec.click();
    await page.waitForTimeout(1800);
    await shot(page, "d16b-ab-hier-aufnehmen-dialog");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await plus.click();
    await page.waitForTimeout(1500);
    await shot(page, "d17-neuer-schritt-eingefuegt");
  });

  // 13) Schritt löschen (Steply-Bestätigungsdialog, danach Toast)
  await step("löschen", async () => {
    let native = null;
    page.once("dialog", async (d) => {
      native = `${d.type()}: ${d.message()}`;
      await d.accept();
    });
    await panel.getByRole("button", { name: /Schritt löschen/ }).click();
    const dlg = page.getByTestId("confirm-dialog");
    await dlg.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(400);
    await shot(page, "d18a-loeschen-dialog");
    note(`Löschen-Dialog: ${(await dlg.innerText()).replace(/\s+/g, " ")}`);
    await dlg.getByRole("button", { name: "Schritt löschen" }).click();
    await page.waitForTimeout(900);
    note(`Browser-Dialog beim Löschen: ${native}`);
    await shot(page, "d18-nach-schritt-loeschen");
  });
  // 13b) Löschen einer FRAGE: Dialog nennt Antworten + unverbundene Ast-Schritte (abbrechen)
  await step("löschen frage", async () => {
    await card("Soll die Person Admin werden?").click();
    await page.waitForTimeout(1000);
    await panel.evaluate((el) => el.firstElementChild.scrollTo(0, 99999));
    await panel.getByRole("button", { name: /Schritt löschen/ }).click();
    const dlg = page.getByTestId("confirm-dialog");
    await dlg.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(400);
    await shot(page, "d18b-loeschen-frage-dialog");
    note(`Löschen-Dialog (Frage): ${(await dlg.innerText()).replace(/\s+/g, " ")}`);
    await dlg.getByRole("button", { name: "Abbrechen" }).click();
    await page.waitForTimeout(400);
  });

  // 14) Bild in neuen Schritt übernehmen + Bild entfernen (ohne Rückfrage?)
  await step("bild duplizieren/entfernen", async () => {
    await card("Bereich „Team“ wählen").click();
    await page.waitForTimeout(1200);
    await panel.getByRole("button", { name: /Bild in neuen Schritt übernehmen/ }).click();
    await page.waitForTimeout(1800);
    await shot(page, "d19-bild-in-neuen-schritt");
    let asked = false;
    page.once("dialog", async (d) => {
      asked = true;
      await d.dismiss();
    });
    await panel.getByRole("button", { name: "Entfernen", exact: true }).last().click();
    await page.waitForTimeout(1200);
    note(`„Entfernen“ (Bild) fragt nach: ${asked}`);
    await shot(page, "d19b-bild-entfernt");
  });

  // 15) Video-Frame-Picker
  await step("video-frame", async () => {
    await panel.getByRole("button", { name: /Bild aus Video wählen/ }).first().click();
    await page.getByRole("dialog").waitFor({ timeout: 20_000 });
    await page.waitForTimeout(4000);
    await shot(page, "d20-video-frame-picker");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  });

  // 16) Nur Team
  await step("nur team", async () => {
    await page.getByTestId("step-editor-panel").getByRole("button", { name: "Editor schließen" }).click().catch(() => {});
    await page.evaluate(() => window.scrollTo(0, 0));
    await controls.getByRole("radio", { name: "Nur Team" }).click();
    await page.waitForTimeout(1500);
    await shot(page, "d21-nur-team");
    await controls.getByRole("radio", { name: "Hilfe-Seite" }).click();
    await page.waitForTimeout(1500);
  });

  // 17) Veröffentlichen → Blur-Gate → veröffentlicht
  await step("veröffentlichen", async () => {
    await page.waitForTimeout(3000);
    await controls.getByTestId("publish-button").click(); // Welle 54: Knopf statt Schalter
    await page.getByRole("dialog").waitFor({ timeout: 20_000 });
    await page.waitForTimeout(400);
    await shot(page, "d22-veroeffentlichen-verpixelung-pruefen");
    await page.getByRole("button", { name: "Trotzdem veröffentlichen" }).click();
    await controls.getByTestId("published-badge").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800);
    await shot(page, "d23-veroeffentlicht");
  });

  // 18) Speichern-Fehler (Server-Action abgewiesen)
  await step("speicherfehler", async () => {
    await page.waitForTimeout(3500);
    await card("Einstellungen öffnen").click();
    await page.waitForTimeout(1000);
    await page.route("**/app/tutorials/**", (r) => (r.request().method() === "POST" ? r.abort() : r.continue()));
    await page.locator("#step-title").fill("Einstellungen öffnen – Fehlertest");
    await panel.getByRole("button", { name: /Speichern/ }).click();
    await page.waitForTimeout(1500);
    await shot(page, "d24-speichern-fehlgeschlagen");
    await page.unroute("**/app/tutorials/**");
    await page.waitForTimeout(3000);
  });

  // 19) Tastaturfokus: Tab durch die Kopfzeile
  await step("tastatur", async () => {
    await openEditor();
    await page.locator("body").click({ position: { x: 5, y: 890 } }).catch(() => {});
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    for (let i = 1; i <= 26; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(80);
      const d = await page.evaluate(() => {
        const e = document.activeElement;
        if (!e) return null;
        const name = e.getAttribute("aria-label") || e.getAttribute("title") || (e.textContent || "").trim().slice(0, 50) || e.getAttribute("placeholder") || "";
        const cs = getComputedStyle(e);
        const ring = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? `outline ${cs.outlineWidth} ${cs.outlineColor}` : cs.boxShadow !== "none" ? "box-shadow" : "KEIN sichtbarer Fokus";
        return { tag: e.tagName.toLowerCase(), role: e.getAttribute("role"), name, ring, inHeader: !!e.closest('[data-testid="editor-controls"]') };
      });
      log.focus.push({ tab: i, ...d });
      if ([3, 6, 8, 10, 12].includes(i)) await shot(page, `d25-fokus-tab-${String(i).padStart(2, "0")}`, { locator: page.locator("main").last().locator("div.mb-6").first() });
    }
  });

  // 20) Vorschau
  await step("vorschau", async () => {
    await page.goto(`${BASE}/app/preview/${tutorialId}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(3500);
    await shot(page, "d26-vorschau");
  });

  // 21) 404
  await step("404", async () => {
    await page.goto(`${BASE}/app/tutorials/${crypto.randomUUID()}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(2000);
    await shot(page, "d27-anleitung-nicht-gefunden");
  });

  // 22) Ladezustand (loading.tsx): RSC-Antwort künstlich verzögern, per Klick aus der Bibliothek
  await step("loading", async () => {
    await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByText("Neue Kollegin ins Team einladen").first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    // Netz stark drosseln: der gestreamte Ladezustand (loading.tsx) kommt zuerst an und bleibt
    // sichtbar, bis der Rest nachläuft (ein komplett verzögertes RSC-Paket zeigte ihn nie).
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 6 * 1024, uploadThroughput: 64 * 1024 });
    await page.getByText("Neue Kollegin ins Team einladen").first().click();
    await page.waitForTimeout(2500);
    await shot(page, "d28-ladezustand");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.getByTestId("editor-controls").waitFor({ timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, "d28b-nach-dem-laden");
  });

  // 23) Tablet 900 px (Sheet rechts)
  await step("tablet", async () => {
    await page.setViewportSize({ width: 900, height: 1000 });
    await openEditor();
    await card("Einstellungen öffnen").click();
    await page.waitForTimeout(1500);
    await shot(page, "t01-tablet-900-schritt-sheet");
    await checkOverflow(page, "tablet 900 sheet");
  });

  // ======================================================= MOBIL 390
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mp = await mob.newPage();
  mp.setDefaultTimeout(15_000);
  attachLogging(mp, "mobil");
  await step("mobil login", async () => login(mp));
  const mcard = (title) => mp.locator("main").last().getByRole("button", { name: title }).first();
  await step("mobil leer", async () => {
    await openEditor(mp, `${BASE}/app/tutorials/${emptyTutorialId}`);
    await checkOverflow(mp, "mobil leer");
    await shot(mp, "m01-leere-anleitung");
  });
  await step("mobil übersicht", async () => {
    await openEditor(mp);
    await checkOverflow(mp, "mobil übersicht");
    await shot(mp, "m02-kopf-und-ablauf");
    await shot(mp, "m02b-ganz", { fullPage: true });
  });
  await step("mobil schritt", async () => {
    await mcard("Bereich „Team“ wählen").click();
    await mp.getByRole("dialog").waitFor({ timeout: 20_000 });
    await mp.waitForTimeout(1500);
    await checkOverflow(mp, "mobil schritt-sheet");
    await shot(mp, "m03-schritt-sheet");
    const sheetOverflow = await mp.getByRole("dialog").evaluate((el) => el.scrollWidth - el.clientWidth);
    log.overflow.push({ label: "mobil sheet innen", px: sheetOverflow });
    await mp.getByRole("dialog").evaluate((el) => el.scrollTo(0, 420));
    await mp.waitForTimeout(400);
    await shot(mp, "m03b-schritt-sheet-werkzeuge");
    await mp.getByRole("dialog").evaluate((el) => el.scrollTo(0, 99999));
    await mp.waitForTimeout(400);
    await shot(mp, "m03c-schritt-sheet-unten");
  });
  await step("mobil groß", async () => {
    await mp.getByRole("dialog").getByRole("button", { name: /Groß bearbeiten/ }).click();
    await mp.waitForTimeout(1200);
    await shot(mp, "m04-gross-bearbeiten");
    await mp.getByRole("button", { name: "Schließen" }).last().click();
    await mp.waitForTimeout(400);
  });
  await step("mobil zuschneiden", async () => {
    const png = imgDir ? path.join(imgDir, "builder.png") : path.join(SHOT_DIR, "_gen.png");
    await mp.getByRole("dialog").locator('input[type="file"]').setInputFiles(png);
    await mp.getByText("Bereich zuschneiden").waitFor({ timeout: 10_000 });
    await mp.waitForTimeout(700);
    await shot(mp, "m05-zuschneiden");
    await mp.getByRole("button", { name: /Abbrechen/ }).click();
    await mp.waitForTimeout(400);
  });
  await step("mobil toast", async () => {
    const dlg = mp.getByRole("dialog");
    await dlg.evaluate((el) => el.scrollTo(0, 0));
    await mp.locator("#step-title").fill("Bereich „Team“ wählen (mobil)");
    await dlg.getByRole("button", { name: /Speichern/ }).click();
    await mp.locator("[data-sonner-toast]").first().waitFor({ timeout: 20_000 });
    await mp.waitForTimeout(500);
    await shot(mp, "m09-toast-mobil-im-sheet");
    await mp.keyboard.press("Escape");
    await mp.waitForTimeout(800);
    // Toast über der Tab-Leiste (Sheet geschlossen): neu auslösen über „Link kopieren“ o. Ä. geht
    // ohne Rechte nicht zuverlässig — darum Position messen, solange der Toast noch steht.
    const pos = await mp.evaluate(() => {
      const t = document.querySelector("[data-sonner-toaster]");
      const nav = document.querySelector("[data-mobile-tabbar]");
      const r = t?.getBoundingClientRect();
      const n = nav?.getBoundingClientRect();
      return { toasterBottom: r ? Math.round(r.bottom) : null, navTop: n ? Math.round(n.top) : null };
    });
    note(`Mobil: Toaster unten bei ${pos.toasterBottom}px, Tab-Leiste oben bei ${pos.navTop}px`);
    await shot(mp, "m09b-toast-mobil-tableiste");
  });
  await step("mobil verzweigung", async () => {
    await mp.keyboard.press("Escape");
    await mp.waitForTimeout(800);
    await mcard("Soll die Person Admin werden?").click();
    await mp.getByRole("dialog").waitFor({ timeout: 20_000 });
    await mp.waitForTimeout(1200);
    await mp.getByRole("dialog").evaluate((el) => el.scrollTo(0, 99999));
    await mp.waitForTimeout(400);
    await shot(mp, "m06-verzweigung-antworten");
    await mp.keyboard.press("Escape");
    await mp.waitForTimeout(600);
  });
  await step("mobil picker", async () => {
    await mp.evaluate(() => window.scrollTo(0, 0));
    await mp.getByTestId("editor-controls").getByRole("button", { name: "Kategorie wählen" }).click();
    await mp.waitForTimeout(400);
    await checkOverflow(mp, "mobil kategorie offen");
    await shot(mp, "m07-kategorie-picker");
    await mp.mouse.click(380, 830);
    await mp.waitForTimeout(300);
    await mp.getByTestId("editor-controls").getByText("app.steply.de").click();
    await mp.waitForTimeout(500);
    await checkOverflow(mp, "mobil website offen");
    await shot(mp, "m08-website-picker");
    await mp.keyboard.press("Escape");
  });
} catch (e) {
  log.failures.push({ step: "global", error: String(e?.stack || e).slice(0, 800) });
  console.log("✗ Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) {
    try {
      spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore", shell: true });
    } catch {
      /* egal */
    }
  }
  // Storage: alles unter dem Konto-Ordner (auch vom Editor hochgeladene/öffentliche Bilder)
  if (accountId) {
    for (const bucket of ["tutorial-images", "tutorial-images-public", "tutorial-videos", "tutorial-audio"]) {
      try {
        const paths = new Set(uploaded[bucket] ?? []);
        const walk = async (prefix) => {
          const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
          for (const o of data ?? []) {
            const p = prefix ? `${prefix}/${o.name}` : o.name;
            if (o.id) paths.add(p);
            else await walk(p);
          }
        };
        await walk(accountId);
        if (paths.size) {
          const { error } = await admin.storage.from(bucket).remove([...paths]);
          note(`Storage ${bucket}: ${paths.size} Datei(en) gelöscht${error ? " – FEHLER " + error.message : ""}`);
        }
      } catch (e) {
        note(`Storage ${bucket}: ${String(e).slice(0, 120)}`);
      }
    }
    await admin.from("accounts").delete().eq("id", accountId).then(() => {}, () => {});
    const { data: still } = await admin.from("accounts").select("id").eq("id", accountId);
    note(`Konto gelöscht: ${!still?.length}`);
  }
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    note(`Nutzer gelöscht: ${!error}`);
  }
  try {
    rmSync(tmpVideoDir, { recursive: true, force: true });
  } catch {
    /* egal */
  }
  writeFileSync(path.join(SHOT_DIR, "audit-log.json"), JSON.stringify(log, null, 2));
  serverLog?.end();
}

console.log(`\nScreenshots: ${log.shots.length}, Konsole: ${log.console.length}, Seitenfehler: ${log.pageErrors.length}, Fehlschläge: ${log.failures.length}`);
process.exit(0);
