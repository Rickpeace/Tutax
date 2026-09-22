// Welle 51a — Kundenwünsche (Kundin Susann) im Editor + auf der Hilfe-Seite. Echter Login gegen
// die echte DB (Wegwerf-Konto im Business-Tarif, Seed mit Schritten + echtem Bild im Storage),
// Dev-Server lokal, Playwright. Aufräumen im finally inkl. Storage-Objekte + video_jobs-Zeile.
// Prüft:
//   1. Video-Dialog: „Im Editor öffnen & anpassen“ navigiert UND schließt den Dialog (Mock-Job)
//   2. Verpixeln im Editor = echte Unschärfe (feGaussianBlur; Pixel-Stichprobe) — klein + Großansicht
//   3. Editor-Panel bei 1100/1280/1440 px ohne Überlauf, Bild skaliert mit; Vorschau ohne Überlauf
//   4. „Link kopieren“ im Editor-Kopf + im ⋮-Menü: URL korrekt; Slug nach Umbenennen gleich (DB)
//   5. Hilfe-Seite/Lightbox/Vorschau: Standard-Markierung in --brand-accent, eigene Farbe bleibt
//   6. „Bild in neuen Schritt übernehmen“: gleicher image_path, Verpixelung als Vorschlag, Löschen
//      eines der Schritte lässt das Storage-Objekt stehen; geteilter Pfad -> Upload bekommt neuen Pfad
//   7. Upload in Folgeschritt (gleiche Maße) übernimmt Verpixelung als Vorschlag; „Entfernen“ wirkt
//   8. Einrasten an der Bildmitte (Hilfslinie) + „Waagerecht zentrieren“ setzt x = (1 − w) / 2
// Screenshots → SHOT_DIR (Standard: scripts/.shots-editor-wishes, gitignored über .shots-*).
//
// Nutzung:  node --env-file=.env.local scripts/test-editor-wishes.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync, writeFileSync, openSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = process.env.SHOT_DIR || path.join(__dirname, ".shots-editor-wishes");
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

const PORT = Number(process.env.TEST_PORT) || 3031;
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const email = `tutax-wish51-${stamp}@example.com`;
const BRAND = "#1a73e8"; // Kunden-Akzent für die Hilfe-Seite
const BRAND_RGB = "rgb(26, 115, 232)";
const CUSTOM = "#0f9d72"; // bewusst gewählte eigene Farbe
const CUSTOM_RGB = "rgb(15, 157, 114)";
const IMG_W = 1200;
const IMG_H = 750;

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
      const r = await fetch(`${BASE}/robots.txt`);
      if (r.status === 200) return true;
    } catch {
      /* noch nicht bereit */
    }
    await sleep(1000);
  }
  return false;
}

async function waitFor(fn, tries = 30, ms = 600) {
  let v;
  for (let i = 0; i < tries; i++) {
    v = await fn();
    if (v) return v;
    await sleep(ms);
  }
  return v;
}

const stepRow = async (id) =>
  (await admin.from("steps").select("*").eq("id", id).maybeSingle()).data;

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

/** Scharfes Streifenbild (hoher Kontrast): Unschärfe ist daran messbar. */
async function stripeImage() {
  const stripes = [];
  for (let x = 0; x < IMG_W; x += 8) stripes.push(`<rect x="${x}" y="0" width="4" height="${IMG_H}" fill="#000"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W}" height="${IMG_H}"><rect width="100%" height="100%" fill="#fff"/>${stripes.join("")}</svg>`;
  return sharp(Buffer.from(svg)).webp({ lossless: true }).toBuffer();
}

/** Standardabweichung der Helligkeit in einem Bereich (relative Koordinaten) eines Element-Screenshots. */
async function regionStdev(pngBuf, rel) {
  const meta = await sharp(pngBuf).metadata();
  const left = Math.round(rel.x * meta.width) + 4;
  const top = Math.round(rel.y * meta.height) + 4;
  const width = Math.max(4, Math.round(rel.w * meta.width) - 8);
  const height = Math.max(4, Math.round(rel.h * meta.height) - 8);
  // stats() wertet die Pipeline nicht aus -> erst als Rohpixel ausschneiden, dann rechnen.
  const raw = await sharp(pngBuf).extract({ left, top, width, height }).greyscale().raw().toBuffer();
  let sum = 0;
  for (const v of raw) sum += v;
  const mean = sum / raw.length;
  let sq = 0;
  for (const v of raw) sq += (v - mean) ** 2;
  return Math.sqrt(sq / raw.length);
}

let server, browser, userId, accountId, tutorialId, jobId;
try {
  const created = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const { data: members } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = members[0].account_id;
  await admin
    .from("accounts")
    .update({ name: "Wunsch-Test GmbH", onboarded: true, plan: "business" })
    .eq("id", accountId);
  const { data: acc } = await admin.from("accounts").select("slug").eq("id", accountId).single();
  const accSlug = acc.slug;

  // Kunden-Akzent setzen (manuelles Design).
  const tokens = { colors: { primary: BRAND } };
  const { data: themeRow } = await admin.from("themes").select("account_id").eq("account_id", accountId).maybeSingle();
  if (themeRow) await admin.from("themes").update({ tokens, mode: "manual", status: "ready" }).eq("account_id", accountId);
  else await admin.from("themes").insert({ account_id: accountId, tokens, mode: "manual", status: "ready" });

  const { data: tut, error: tErr } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title: "Rechnung freigeben", status: "draft", visibility: "public" })
    .select("id")
    .single();
  if (tErr) throw tErr;
  tutorialId = tut.id;

  const { data: stepRows, error: sErr } = await admin
    .from("steps")
    .insert(
      ["Anmelden", "Menü öffnen", "Freigeben"].map((title, i) => ({
        tutorial_id: tutorialId,
        position: i + 1,
        title,
        is_decision: false,
      })),
    )
    .select("id, position");
  if (sErr) throw sErr;
  const ids = stepRows.sort((a, b) => a.position - b.position).map((s) => s.id);
  const [s1, s2, s3] = ids;
  await admin.from("tutorials").update({ root_step_id: s1 }).eq("id", tutorialId);
  await admin.from("step_branches").insert(
    ids.slice(0, -1).map((id, i) => ({ step_id: id, label: null, target_step_id: ids[i + 1], position: 0 })),
  );

  // Echtes Bild für Schritt 1 in den privaten Bucket.
  const imgBuf = await stripeImage();
  const s1Path = `${accountId}/${tutorialId}/${s1}.webp`;
  const up = await admin.storage.from("tutorial-images").upload(s1Path, imgBuf, { contentType: "image/webp", upsert: true });
  if (up.error) throw up.error;
  const R1 = { id: crypto.randomUUID(), type: "rect", x: 0.1, y: 0.75, w: 0.2, h: 0.15, color: "#ef6a4e", rounded: true, strokeWidth: 3 };
  const R2 = { id: crypto.randomUUID(), type: "rect", x: 0.6, y: 0.1, w: 0.2, h: 0.15, color: CUSTOM, rounded: true, strokeWidth: 3 };
  const B1 = { id: crypto.randomUUID(), type: "blur", x: 0.1, y: 0.45, w: 0.3, h: 0.2, rounded: true };
  await admin
    .from("steps")
    .update({ image_path: s1Path, image_width: IMG_W, image_height: IMG_H, highlights: [R1, R2, B1] })
    .eq("id", s1);
  const uploadFile = path.join(os.tmpdir(), `wish51-${stamp}.png`);
  writeFileSync(uploadFile, await sharp(imgBuf).png().toBuffer());

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: path.join(__dirname, ".."),
    shell: true,
    // DEV_LOG=<datei>: Server-Ausgabe mitschreiben (Fehlersuche), sonst verwerfen.
    stdio: process.env.DEV_LOG ? ["ignore", openSync(process.env.DEV_LOG, "w"), openSync(process.env.DEV_LOG, "a")] : "ignore",
  });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await login(page);

  const openEditor = async (stepTitle) => {
    await page.goto(`${BASE}/app/tutorials/${tutorialId}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.getByTestId("editor-controls").waitFor({ timeout: 90_000 });
    await page.waitForTimeout(1200);
    if (stepTitle) {
      await page.locator("main").last().getByText(stepTitle, { exact: true }).first().click();
      await page.getByTestId("step-editor-panel").waitFor({ timeout: 20_000 });
    }
  };
  const panel = () => page.getByTestId("step-editor-panel");
  const canvasIn = (root) => root.getByTestId("highlight-canvas").first();
  const waitImg = async (canvas) => {
    await canvas.locator("img").waitFor({ timeout: 30_000 });
    await waitFor(() => canvas.locator("img").evaluate((i) => i.complete && i.naturalWidth > 0), 40, 500);
    await page.waitForTimeout(500);
  };

  // ── 2. Verpixeln = echte Unschärfe (kleiner Editor) ───────────────────────────────
  await openEditor("Anmelden");
  let canvas = canvasIn(panel());
  await waitImg(canvas);
  ok((await canvas.locator("image[data-blur-mark]").count()) === 1, "Editor: Verpixelung als weichgezeichnete Bildkopie (image[data-blur-mark])");
  ok((await canvas.locator("filter feGaussianBlur").count()) === 1, "Editor: feGaussianBlur-Filter vorhanden");
  ok((await canvas.locator('rect[fill="rgba(15,23,42,0.45)"]').count()) === 0, "Editor: keine halbdurchsichtige Ersatzfläche mehr");
  let shot = await canvas.screenshot();
  writeFileSync(path.join(SHOT_DIR, "01-editor-verpixelt.png"), shot);
  const blurStd = await regionStdev(shot, B1);
  const sharpStd = await regionStdev(shot, { x: 0.45, y: 0.45, w: 0.1, h: 0.2 });
  ok(blurStd < 30 && sharpStd > 80, `Editor: Bereich unter der Verpixelung unscharf (σ ${blurStd.toFixed(1)} vs. Original σ ${sharpStd.toFixed(1)})`);

  // Großansicht
  await panel().getByRole("button", { name: /Groß bearbeiten/ }).click();
  const bigCanvas = page.locator("div.fixed.inset-0").getByTestId("highlight-canvas");
  await bigCanvas.waitFor({ timeout: 10_000 });
  await waitImg(bigCanvas);
  ok((await bigCanvas.locator("image[data-blur-mark]").count()) === 1, "Großansicht: echte Unschärfe (image[data-blur-mark])");
  shot = await bigCanvas.screenshot();
  writeFileSync(path.join(SHOT_DIR, "02-grossansicht-verpixelt.png"), shot);
  const bigBlur = await regionStdev(shot, B1);
  ok(bigBlur < 30, `Großansicht: Bereich unter der Verpixelung unscharf (σ ${bigBlur.toFixed(1)})`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ── 8. Einrasten + Zentrieren ─────────────────────────────────────────────────────
  canvas = canvasIn(panel());
  await waitImg(canvas);
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  let box = await canvas.boundingBox();
  const at = (rx, ry) => [box.x + rx * box.width, box.y + ry * box.height];
  // R2 (Mitte bei x=0,7) so ziehen, dass seine Mitte knapp neben der Bildmitte landet (0,508).
  const [sx, sy] = at(0.7, 0.175);
  const r2y = () =>
    canvas.locator("rect").evaluateAll((els) =>
      els.filter((e) => (e.getAttribute("style") || "").includes("15, 157, 114") || e.style.stroke === "rgb(15, 157, 114)").map((e) => e.getAttribute("y")),
    );
  if (process.env.DEBUG_SNAP) console.log("  box", JSON.stringify(box), "r2y", await r2y());
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  if (process.env.DEBUG_SNAP) console.log("  nach down r2y", await r2y(), JSON.stringify(await canvas.boundingBox()));
  const [tx, ty] = at(0.508, 0.18);
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 5 });
  if (process.env.DEBUG_SNAP) console.log("  mitte r2y", await r2y());
  await page.mouse.move(tx, ty, { steps: 5 });
  if (process.env.DEBUG_SNAP) console.log("  ende r2y", await r2y());
  const guidesWhileDrag = await canvas.getByTestId("snap-guide").count();
  await canvas.screenshot({ path: path.join(SHOT_DIR, "03-einrasten-hilfslinie.png") });
  await page.mouse.up();
  ok(guidesWhileDrag > 0, `Einrasten: Hilfslinie während des Ziehens sichtbar (${guidesWhileDrag})`);
  const r2Snapped = await waitFor(async () => {
    const hs = (await stepRow(s1))?.highlights ?? [];
    const r = hs.find((h) => h.id === R2.id);
    return r && Math.abs(r.x - 0.4) < 0.002 ? r : null;
  });
  ok(!!r2Snapped, `Einrasten: Mitte rastet an der Bildmitte ein (x=${r2Snapped?.x?.toFixed(4) ?? "?"}, erwartet 0,4)`);

  ok(!!r2Snapped && Math.abs(r2Snapped.y - R2.y) < 0.02, `Verschieben bleibt in der Höhe erhalten (y=${r2Snapped?.y?.toFixed(3)})`);

  // R1 anklicken und „Waagerecht zentrieren“.
  box = await canvas.boundingBox();
  const [r1x, r1y] = at(0.2, 0.825);
  await page.mouse.click(r1x, r1y);
  await page.waitForTimeout(300);
  await panel().getByRole("button", { name: "Waagerecht zentrieren" }).click();
  const r1Centered = await waitFor(async () => {
    const hs = (await stepRow(s1))?.highlights ?? [];
    const r = hs.find((h) => h.id === R1.id);
    return r && Math.abs(r.x - (1 - r.w) / 2) < 0.0005 ? r : null;
  });
  if (!r1Centered) {
    await canvas.screenshot({ path: path.join(SHOT_DIR, "debug-zentrieren.png") });
    console.log("  DB:", JSON.stringify((await stepRow(s1))?.highlights));
  }
  ok(!!r1Centered, `„Waagerecht zentrieren“ setzt x = (1 − w) / 2 (x=${r1Centered?.x ?? "?"})`);

  // Lupe + Verpixelung: die Lupe vergrößert die Verpixelungen mit (nie Klartext durch die Lupe).
  await panel().getByRole("button", { name: "Lupe", exact: true }).click();
  const zoomed = await waitFor(async () => ((await stepRow(s1))?.highlights ?? []).find((h) => h.id === R1.id && h.zoom));
  ok(!!zoomed, "Lupe an R1 gesetzt (DB zoom=true)");
  ok((await canvas.locator("g[transform] image[filter]").count()) >= 1, "Editor-Lupe enthält die Verpixelung (vergrößerte Kopie mit Unschärfe)");

  // ── 6. Bild in neuen Schritt übernehmen ───────────────────────────────────────────
  await panel().getByRole("button", { name: /Bild in neuen Schritt übernehmen/ }).click();
  const newStep = await waitFor(async () => {
    const { data } = await admin.from("steps").select("*").eq("tutorial_id", tutorialId);
    return (data ?? []).find((s) => ![s1, s2, s3].includes(s.id)) ?? null;
  });
  ok(!!newStep, "Neuer Schritt angelegt");
  ok(newStep?.image_path === s1Path, "Neuer Schritt nutzt DENSELBEN image_path");
  ok(newStep?.image_width === IMG_W && newStep?.image_height === IMG_H, "Bildmaße übernommen");
  const nh = newStep?.highlights ?? [];
  ok(nh.length === 1 && nh[0].type === "blur", `Nur die Verpixelung übernommen, keine Rahmen (${nh.map((h) => h.type).join(",")})`);
  ok(nh[0]?.suggested === true && nh[0]?.suggestedFrom === "previous", "Übernommene Verpixelung ist als Vorschlag markiert");
  const wired = await waitFor(async () => {
    const { data: brs } = await admin.from("step_branches").select("step_id, target_step_id").in("step_id", [s1, newStep?.id]);
    return (
      brs?.some((b) => b.step_id === s1 && b.target_step_id === newStep?.id) &&
      brs?.some((b) => b.step_id === newStep?.id && b.target_step_id === s2)
    );
  });
  ok(wired, "Direkt nach dem Schritt eingefügt (Schritt 1 → neu → Schritt 2)");
  await page.getByTestId("inherited-blur-hint").waitFor({ timeout: 10_000 });
  ok(
    (await page.getByTestId("inherited-blur-hint").innerText()).includes("Verpixelung vom vorigen Schritt übernommen – bitte prüfen"),
    "Hinweis „Verpixelung vom vorigen Schritt übernommen – bitte prüfen“ sichtbar",
  );
  await page.waitForTimeout(600);
  await panel().screenshot({ path: path.join(SHOT_DIR, "04-bild-uebernommen.png") });

  // Geteilter Pfad: ein neuer Upload für Schritt 1 darf das geteilte Bild NICHT überschreiben.
  const u1 = await (await page.request.post(`${BASE}/api/upload-url`, { data: { tutorialId, stepId: s1 } })).json();
  ok(u1.path && u1.path !== s1Path, `Geteiltes Bild: Upload für Schritt 1 bekommt eigenen Pfad (${u1.path?.split("/").pop()})`);
  const u3 = await (await page.request.post(`${BASE}/api/upload-url`, { data: { tutorialId, stepId: s3 } })).json();
  ok(u3.path === `${accountId}/${tutorialId}/${s3}.webp`, "Ungeteilt: Standard-Pfad bleibt");

  // Einen der beiden Schritte löschen -> Storage-Objekt bleibt.
  // Steply-Bestätigungsdialog (kein Browser-confirm mehr): Folge wird genannt, dann bestätigen.
  await panel().getByRole("button", { name: /Schritt löschen/ }).click();
  const delDlg = page.getByTestId("confirm-dialog");
  await delDlg.waitFor({ timeout: 10_000 });
  ok((await delDlg.innerText()).includes("werden gelöscht"), "Löschen fragt im Steply-Dialog und nennt die Folge");
  await delDlg.getByRole("button", { name: "Schritt löschen" }).click();
  await page.locator("[data-sonner-toast]", { hasText: "Schritt gelöscht" }).waitFor({ timeout: 10_000 });
  ok(true, "Toast „Schritt gelöscht“");
  const gone = await waitFor(async () => !(await stepRow(newStep.id)));
  ok(gone, "Neuer Schritt gelöscht (DB)");
  const dl = await admin.storage.from("tutorial-images").download(s1Path);
  ok(!!dl.data && !dl.error, "Storage-Objekt des geteilten Bildes besteht nach dem Löschen weiter");
  ok((await stepRow(s1))?.image_path === s1Path, "Schritt 1 behält sein Bild");

  // ── 7. Upload im Folgeschritt übernimmt Verpixelung als Vorschlag ──────────────────
  await page.locator("main").last().getByText("Menü öffnen", { exact: true }).first().click();
  await page.waitForTimeout(800);
  await panel().locator('input[type="file"][accept="image/*"]').setInputFiles(uploadFile);
  await page.getByRole("button", { name: "Übernehmen" }).click({ timeout: 20_000 });
  const s2Row = await waitFor(async () => {
    const r = await stepRow(s2);
    return r?.image_path && (r.highlights ?? []).some((h) => h.suggestedFrom === "previous") ? r : null;
  }, 40);
  ok(!!s2Row, "Upload im Folgeschritt (gleiche Maße): Verpixelung vom vorigen Schritt übernommen");
  ok(s2Row?.image_width === IMG_W && s2Row?.image_height === IMG_H, `Folgeschritt-Bild hat gleiche Maße (${s2Row?.image_width}×${s2Row?.image_height})`);
  await page.getByTestId("inherited-blur-hint").waitFor({ timeout: 15_000 });
  await panel().screenshot({ path: path.join(SHOT_DIR, "05-upload-verpixelung-uebernommen.png") });
  await page.getByTestId("inherited-blur-hint").getByRole("button", { name: /Entfernen/ }).click();
  const s2Clean = await waitFor(async () => {
    const r = await stepRow(s2);
    return r && !(r.highlights ?? []).some((h) => h.type === "blur") ? r : null;
  });
  ok(!!s2Clean, "Ein Klick auf „Entfernen“ nimmt die übernommene Verpixelung wieder heraus");

  // ── 4. Veröffentlichen + „Link kopieren“ ─────────────────────────────────────────
  await openEditor(null);
  const controls = page.getByTestId("editor-controls");
  // Welle 53: „Link zur Hilfe-Seite kopieren“ + „Auf der Hilfe-Seite öffnen“ im „…“-Menü des Kopfs.
  const more = controls.getByTestId("editor-more");
  await more.click();
  await page.getByRole("menu").waitFor({ timeout: 5_000 });
  ok((await page.getByTestId("copy-link").count()) === 0, "Entwurf: kein „Link kopieren“");
  await page.keyboard.press("Escape");
  await page.getByRole("menu").waitFor({ state: "hidden", timeout: 5_000 }).catch(async () => {
    await page.screenshot({ path: path.join(SHOT_DIR, "debug-menu.png") });
  });
  await controls.getByTestId("publish-button").click(); // Welle 54: Knopf statt Schalter
  const pub = await waitFor(async () => {
    const { data } = await admin.from("tutorials").select("status, slug").eq("id", tutorialId).single();
    return data?.status === "published" && data.slug ? data : null;
  }, 40);
  ok(!!pub, `Veröffentlicht (Slug „${pub?.slug}“)`);
  const expectedUrl = `${BASE}/h/${accSlug}/${pub.slug}`;
  await page.waitForTimeout(800);
  await more.click();
  await page.getByTestId("copy-link").waitFor({ timeout: 20_000 });
  ok(await page.getByText("Der Link bleibt gleich, auch wenn Sie die Anleitung umbenennen.").first().isVisible(), "Hinweis „Der Link bleibt gleich …“ am Menüeintrag");
  const openLink = page.locator(`a[href="/h/${accSlug}/${pub.slug}"]`);
  ok((await openLink.count()) === 1, "„Auf der Hilfe-Seite öffnen“ verlinkt die Hilfe-Seite");
  await page.getByTestId("copy-link").click();
  await page.getByText("Link kopiert").first().waitFor({ timeout: 10_000 });
  const clip1 = await page.evaluate(() => navigator.clipboard.readText());
  ok(clip1 === expectedUrl, `Editor-Kopf „Link kopieren“: ${clip1}`);
  await page.screenshot({ path: path.join(SHOT_DIR, "06-link-kopieren-kopf.png"), clip: { x: 0, y: 0, width: 1400, height: 380 } });

  // Umbenennen -> Slug bleibt.
  await page.getByRole("button", { name: "Titel bearbeiten" }).click();
  const titleInput = page.getByRole("textbox", { name: "Titel der Anleitung" });
  await titleInput.fill("Eingangsrechnung freigeben");
  await titleInput.press("Enter");
  const renamed = await waitFor(async () => {
    const { data } = await admin.from("tutorials").select("title, slug").eq("id", tutorialId).single();
    return data?.title === "Eingangsrechnung freigeben" ? data : null;
  });
  ok(renamed?.slug === pub.slug, `Nach Umbenennen: Slug unverändert (${renamed?.slug})`);

  // Öffentliche Kopie ist verpixelt eingebrannt …
  const publicStd = async () => {
    const d = await admin.storage.from("tutorial-images-public").download(s1Path);
    if (!d.data) return null;
    return regionStdev(await sharp(Buffer.from(await d.data.arrayBuffer())).png().toBuffer(), B1);
  };
  const std0 = await publicStd();
  // Pixelierung (grobe Kacheln) statt Weichzeichnen: deutlich unter dem Original (σ ≈ 105).
  ok(std0 !== null && std0 < 50, `Öffentliche Bildkopie: Verpixelung eingebrannt (σ ${std0?.toFixed(1)}, Original ≈ 105)`);
  // … und bleibt es, wenn ein Schritt MIT DEMSELBEN Bild, aber OHNE Verpixelung gespeichert wird.
  await page.locator("main").last().getByText("Anmelden", { exact: true }).first().click();
  await page.getByTestId("step-editor-panel").waitFor({ timeout: 20_000 });
  await panel().getByRole("button", { name: /Bild in neuen Schritt übernehmen/ }).click();
  const dup2 = await waitFor(async () => {
    const { data } = await admin.from("steps").select("id, highlights").eq("tutorial_id", tutorialId);
    return (data ?? []).find((s) => ![s1, s2, s3].includes(s.id)) ?? null;
  });
  await page.getByTestId("inherited-blur-hint").getByRole("button", { name: /Entfernen/ }).click();
  const dup2Clean = await waitFor(async () => {
    const r = await stepRow(dup2.id);
    return r && !(r.highlights ?? []).some((h) => h.type === "blur") ? r : null;
  });
  ok(!!dup2Clean && dup2Clean.image_path === s1Path, "Geteiltes Bild in veröffentlichter Anleitung: zweiter Schritt ohne Verpixelung gespeichert");
  await sleep(2500); // öffentliche Kopie wird im selben Speichern-Aufruf nachgezogen
  const std1 = await publicStd();
  ok(std1 !== null && std1 < 50, `Öffentliche Kopie bleibt verpixelt (Vereinigung aller Verpixelungen, σ ${std1?.toFixed(1)})`);

  // ⋮-Menü der Karte/Zeile
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.getByText("Eingangsrechnung freigeben").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  const cardLike = page.locator("div.group", { hasText: "Eingangsrechnung freigeben" }).first();
  await cardLike.getByRole("button", { name: "Aktionen" }).click();
  await page.getByRole("menuitem", { name: /Link kopieren/ }).click();
  await page.getByText("Link kopiert").first().waitFor({ timeout: 10_000 });
  const clip2 = await page.evaluate(() => navigator.clipboard.readText());
  ok(clip2 === expectedUrl, `⋮-Menü „Link kopieren“: ${clip2}`);

  // ── 5. Hilfe-Seite: Standard-Markierung in der Firmenfarbe ────────────────────────
  const strokesOf = async (root) =>
    root.locator("svg [data-mark]").evaluateAll((els) => els.map((e) => getComputedStyle(e).stroke));
  await page.goto(`${BASE}/h/${accSlug}/${pub.slug}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("svg [data-mark]").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(600);
  let strokes = await strokesOf(page.locator("body"));
  ok(strokes.includes(BRAND_RGB), `Hilfe-Seite: Standard-Rahmen in --brand-accent (${strokes.join(" | ")})`);
  ok(strokes.includes(CUSTOM_RGB), "Hilfe-Seite: bewusst gewählte eigene Farbe bleibt");
  ok((await page.locator("image[data-blur-mark]").count()) >= 1, "Hilfe-Seite: Verpixelung weiter als echte Unschärfe");
  ok((await page.locator("svg g[transform] image[filter]").count()) >= 1, "Hilfe-Seite: Lupe vergrößert die Verpixelung mit");
  await page.locator('[data-tx="step"]').screenshot({ path: path.join(SHOT_DIR, "07-hilfe-seite-firmenfarbe.png") });
  // Lightbox
  await page.locator('[data-tx="step"] button.cursor-zoom-in').click();
  const lb = page.locator('[role="dialog"][aria-modal="true"]');
  await lb.locator("svg [data-mark]").first().waitFor({ timeout: 15_000 });
  strokes = await strokesOf(lb);
  ok(strokes.includes(BRAND_RGB) && strokes.includes(CUSTOM_RGB), `Lightbox: Firmenfarbe + eigene Farbe (${strokes.join(" | ")})`);
  await page.keyboard.press("Escape");
  // Druckansicht
  await page.goto(`${BASE}/h/${accSlug}/${pub.slug}/drucken`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("svg [data-mark]").first().waitFor({ timeout: 60_000 });
  strokes = await strokesOf(page.locator("body"));
  ok(strokes.includes(BRAND_RGB) && strokes.includes(CUSTOM_RGB), "Druckansicht: Firmenfarbe + eigene Farbe");
  // App-Vorschau
  await page.goto(`${BASE}/app/preview/${tutorialId}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("svg [data-mark]").first().waitFor({ timeout: 60_000 });
  strokes = await strokesOf(page.locator("body"));
  ok(strokes.includes(BRAND_RGB) && strokes.includes(CUSTOM_RGB), "App-Vorschau: Firmenfarbe + eigene Farbe");

  // ── 3. Editor-Panel fluide bei 1100 / 1280 / 1440 ─────────────────────────────────
  const panelWidths = [];
  for (const w of [1100, 1280, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await openEditor("Anmelden");
    const c = canvasIn(panel());
    await waitImg(c);
    const m = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="step-editor-panel"]').getBoundingClientRect();
      const flow = document.querySelector('[data-testid="step-editor-panel"]').previousElementSibling.getBoundingClientRect();
      const img = document.querySelector('[data-testid="step-editor-panel"] [data-testid="highlight-canvas"] img').getBoundingClientRect();
      const inner = document.querySelector('[data-testid="step-editor-panel"] > div');
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        panelW: Math.round(p.width),
        panelRight: Math.round(p.right),
        vw: window.innerWidth,
        flowW: Math.round(flow.width),
        imgW: Math.round(img.width),
        imgRatio: img.width / img.height,
        innerOverflowX: inner.scrollWidth - inner.clientWidth,
      };
    });
    ok(
      m.overflow <= 1 && m.panelRight <= m.vw && m.innerOverflowX <= 1,
      `${w}px: kein Überlauf (Seite ${m.overflow}px, Panel innen ${m.innerOverflowX}px)`,
    );
    ok(m.flowW >= 380 && m.panelW >= 360, `${w}px: Ablauf ${m.flowW}px, Panel ${m.panelW}px (nichts gequetscht)`);
    ok(m.imgW <= m.panelW && Math.abs(m.imgRatio - IMG_W / IMG_H) < 0.02, `${w}px: Bild ${m.imgW}px passt ins Panel, Seitenverhältnis erhalten`);
    panelWidths.push(m.panelW);
    await page.screenshot({ path: path.join(SHOT_DIR, `08-editor-${w}.png`) });
  }
  ok(
    panelWidths[0] < panelWidths[1] && panelWidths[1] < panelWidths[2],
    `Panel wächst mit der Fensterbreite (${panelWidths.join(" → ")} px)`,
  );
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`${BASE}/app/preview/${tutorialId}`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-tx="step"]').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(600);
  const pvOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(pvOverflow <= 1, `Vorschau 1100px: kein Überlauf (${pvOverflow}px)`);
  await page.screenshot({ path: path.join(SHOT_DIR, "09-vorschau-1100.png") });
  await page.setViewportSize({ width: 1400, height: 950 });

  // ── 1. Video-Dialog schließt nach „Im Editor öffnen & anpassen“ ──────────────────
  const { data: job, error: jErr } = await admin
    .from("video_jobs")
    .insert({ account_id: accountId, video_path: `${accountId}/wish51-mock.mp4`, title: "Mock", status: "done", tutorial_id: tutorialId })
    .select("id")
    .single();
  if (jErr) throw jErr;
  jobId = job.id;
  await page.route("**/api/video-import", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobId }) }),
  );
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
  await page.getByText("Eingangsrechnung freigeben").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.dispatchEvent(new Event("steply:new-tutorial")));
  await page.getByRole("dialog").getByText("Aus Video", { exact: true }).click();
  const vDlg = page.getByRole("dialog", { name: "Anleitung aus Video erstellen" });
  await vDlg.waitFor({ timeout: 10_000 });
  await vDlg.getByRole("button", { name: /Von URL importieren/ }).click();
  await vDlg.locator('input[type="url"]').fill("https://example.com/video.mp4");
  await vDlg.getByRole("button", { name: "Importieren" }).click();
  await vDlg.getByText("Entwurf ist fertig!", { exact: false }).waitFor({ timeout: 20_000 });
  const editLink = vDlg.getByRole("button", { name: /Im Editor öffnen/ });
  ok((await editLink.count()) === 1, "Fertig-Zustand zeigt „Im Editor öffnen & anpassen“ (Begriff „Editor“)");
  await page.screenshot({ path: path.join(SHOT_DIR, "10-video-dialog-fertig.png") });
  await editLink.click();
  await page.waitForURL(new RegExp(`/app/tutorials/${tutorialId}`), { timeout: 30_000 });
  await page.waitForTimeout(1200);
  ok((await page.getByRole("dialog", { name: "Anleitung aus Video erstellen" }).count()) === 0, "Video-Dialog ist nach dem Klick geschlossen");
  await page.screenshot({ path: path.join(SHOT_DIR, "11-editor-nach-video.png") });
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) {
    try {
      spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore", shell: true });
    } catch {
      /* egal */
    }
  }
  if (jobId) await admin.from("video_jobs").delete().eq("id", jobId).then(() => {}, () => {});
  if (accountId && tutorialId) {
    for (const [bucket, folder] of [
      ["tutorial-images", `${accountId}/${tutorialId}`],
      ["tutorial-images-public", `${accountId}/${tutorialId}`],
      ["tutorial-images-public", `${accountId}/${tutorialId}/audio`], // Vorlesen (Business)
    ]) {
      const { data: files } = await admin.storage.from(bucket).list(folder, { limit: 100 });
      const paths = (files ?? []).map((f) => `${folder}/${f.name}`);
      if (paths.length) await admin.storage.from(bucket).remove(paths).catch(() => {});
    }
  }
  if (accountId) await admin.from("accounts").delete().eq("id", accountId).then(() => {}, () => {});
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Kundenwünsche Welle 51a verifiziert.");
process.exit(failed ? 1 : 0);
