// v2: Schießt UI-Screenshots (Demo-Konto „Muster GmbH") und hängt sie MIT
// AUTOMATISCHEN MARKIERUNGEN an die Steply-Hilfe-Tutorials (/h/steply).
// Highlights: Playwright liefert die BoundingBox des Ziel-Elements -> normierte
// Rechteck-Markierung sitzt pixelgenau (Klick-Modus-Prinzip für die Doku).
// Voraussetzung: Prod-Server auf :3000. Nutzung:
//   node --env-file=.env.local scripts/shoot-steply-help.mjs <playwright-dir>
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const PW_DIR = process.argv[2];
if (!PW_DIR) { console.error("Pfad zum Playwright-Ordner fehlt"); process.exit(1); }
const { chromium } = await import(pathToFileURL(path.join(PW_DIR, "node_modules/playwright/index.mjs")).href);

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = "http://localhost:3000";
const VP = { width: 1440, height: 900 };
const uuid = () => crypto.randomUUID();

// ---- Konten/IDs ----
const { data: page1 } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const demoUser = page1.users.find((u) => u.email === "demo@steply.dev");
const DEMO_PW = "Shot!" + Math.random().toString(36).slice(2, 10) + "Xx1";
await admin.auth.admin.updateUserById(demoUser.id, { password: DEMO_PW });
const { data: steplyAcc } = await admin.from("accounts").select("id").eq("slug", "steply").single();
const { data: demoAcc } = await admin.from("accounts").select("id").eq("slug", "demo").single();
const { data: steplyTuts } = await admin.from("tutorials").select("id,title").eq("account_id", steplyAcc.id);
const tutByTitle = new Map(steplyTuts.map((t) => [t.title, t.id]));

// Draft „Bild-Demo“ im Muster-Konto sicherstellen (für Builder-Shots mit Bild; NICHT veröffentlicht).
async function ensureBildDemo(imageWebp) {
  let { data: t } = await admin.from("tutorials").select("id,root_step_id").eq("account_id", demoAcc.id).eq("title", "Bild-Demo").maybeSingle();
  if (!t) {
    const id = uuid();
    await admin.from("tutorials").insert({ id, account_id: demoAcc.id, title: "Bild-Demo", status: "draft" });
    const sid = uuid();
    await admin.from("steps").insert({ id: sid, tutorial_id: id, title: "Beispiel-Schritt", position: 1, is_decision: false });
    await admin.from("tutorials").update({ root_step_id: sid }).eq("id", id);
    t = { id, root_step_id: sid };
  }
  const meta = await sharp(imageWebp).metadata();
  const p = `${demoAcc.id}/${t.id}/${t.root_step_id}.webp`;
  await admin.storage.from("tutorial-images").upload(p, imageWebp, { upsert: true, contentType: "image/webp" });
  await admin.from("steps").update({ image_path: p, image_width: meta.width, image_height: meta.height }).eq("id", t.root_step_id);
  return t.id;
}

// ---- Browser ----
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1, locale: "de-DE" });
const pg = await ctx.newPage();
const settle = async (ms = 2000) => { await pg.waitForLoadState("networkidle").catch(() => {}); await pg.waitForTimeout(ms); };

// Shot + Ziel-Boxen einsammeln. targets: { key: Locator-Factory }
const shots = {}; // name -> { png, boxes: {key:{x,y,w,h}} }
async function capture(name, targets = {}) {
  const boxes = {};
  for (const [key, make] of Object.entries(targets)) {
    try {
      const loc = make();
      const bb = await loc.first().boundingBox({ timeout: 3000 });
      if (bb) {
        const pad = 6;
        boxes[key] = {
          x: Math.max(0, (bb.x - pad) / VP.width),
          y: Math.max(0, (bb.y - pad) / VP.height),
          w: Math.min(1, (bb.width + pad * 2) / VP.width),
          h: Math.min(1, (bb.height + pad * 2) / VP.height),
        };
      }
    } catch { /* Ziel nicht gefunden -> Bild ohne Markierung */ }
  }
  shots[name] = { png: await pg.screenshot(), boxes };
  console.log("✓ shot:", name, "| Ziele:", Object.keys(boxes).join(",") || "-");
}

// ---- Tour ----
await pg.goto(BASE + "/login");
await pg.fill("#email", "demo@steply.dev");
await pg.fill("#password", DEMO_PW);
await pg.press("#password", "Enter");
await pg.waitForURL("**/app", { timeout: 20000 });
await pg.waitForSelector("text=eigene Anleitungen", { timeout: 15000 }).catch(() => {});
await settle(2500);
await capture("dashboard", {
  neu: () => pg.getByRole("button", { name: /Neues Tutorial/ }),
  toggle: () => pg.getByText("Auf Hilfe-Seite").first(),
  insights: () => pg.getByText("Nutzung (letzte 30 Tage)"),
  switcher: () => pg.getByText(/Muster GmbH/).first(),
  ausvideo: () => pg.getByRole("button", { name: /Aus Video/ }),
});

// „Wird erstellt…“-Karte: temporären queued-Job einblenden
const fakeJob = uuid();
await admin.from("video_jobs").insert({ id: fakeJob, account_id: demoAcc.id, video_path: "demo/fake.webm", title: "Bildschirmaufnahme", status: "queued" });
await pg.reload();
await settle(2500);
await pg.getByText(/ird erstellt/).first().waitFor({ timeout: 12000 }).catch(() => {});
await capture("dashboard-job", { karte: () => pg.getByText(/ird erstellt/).first() });
await admin.from("video_jobs").delete().eq("id", fakeJob);

// Video-Dialog
await pg.reload(); await settle(2000);
await pg.getByRole("button", { name: /Aus Video/ }).click();
await pg.waitForTimeout(700);
await capture("video-dialog", {
  aufnehmen: () => pg.getByRole("button", { name: /Jetzt aufnehmen/ }),
  infobox: () => pg.locator("div").filter({ hasText: /So wird die Aufnahme am besten/ }).locator("visible=true").last(),
  url: () => pg.getByText(/Von URL importieren/),
});
await pg.keyboard.press("Escape");

// Builder mit Bild-Schritt (Draft „Bild-Demo“; Bild = Dashboard-Shot)
const dashWebp = await sharp(shots["dashboard"].png).webp({ quality: 80 }).toBuffer();
const bildDemoId = await ensureBildDemo(dashWebp);
await pg.goto(BASE + `/app/tutorials/${bildDemoId}`);
await settle(2200);
await pg.getByText("Beispiel-Schritt").first().click();
await pg.waitForSelector("#step-title", { timeout: 10000 }).catch(() => {});
await pg.waitForTimeout(1200);
await capture("builder", {
  titel: () => pg.locator("#step-title"),
  rechteck: () => pg.locator('[title="Rechteck"]'),
  frage: () => pg.getByRole("button", { name: /Frage \/ Verzweigung/ }),
  ki: () => pg.getByText(/KI: Titel/),
  video: () => pg.getByText(/Bild aus Video wählen/),
  hoch: () => pg.locator('[title*="oben"], [aria-label*="oben"]'),
});

// BEWEIS: Vollbild-Editor über der Navbar (Portal-Fix) — tolerant, Pipeline läuft weiter
try {
  await pg.getByRole("button", { name: /Groß bearbeiten/ }).click({ timeout: 8000 });
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: path.join(PW_DIR, "img2", "verify-big-editor.png") });
  console.log("✓ verify-big-editor.png");
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(400);
} catch (e) { console.log("! Big-Editor-Verify übersprungen:", String(e).slice(0, 100)); }

// Einstellungen
await pg.goto(BASE + "/app/settings/einbetten"); await settle(2000);
await capture("einbetten", {
  link: () => pg.getByText(/Empfohlen: einfach verlinken/),
  iframe: () => pg.getByText(/Optional: direkt einbetten/),
  bubble: () => pg.getByText(/Chat-Bubble/).first(),
  qr: () => pg.locator('img[src*="/api/qr"]'),
});
await pg.goto(BASE + "/app/settings/branding"); await settle(2200);
await capture("branding", { modus: () => pg.getByText(/KI-Design/).first() });
await pg.goto(BASE + "/app/settings/team"); await settle(2000);
await capture("team", { einladen: () => pg.getByRole("button", { name: /inladen/ }) });
await pg.goto(BASE + "/app/settings/eskalation"); await settle(2000);
await capture("eskalation", {});
await pg.goto(BASE + "/app/knowledge"); await settle(2000);
await capture("knowledge", { neu: () => pg.getByRole("button", { name: /Neuer Artikel/ }) });

// Öffentlich: Hub + Chat, semantische Suche, Druck-Link im Wizard
await pg.goto(BASE + "/h/demo"); await settle(1500);
await pg.click('button[aria-label="Hilfe-Assistent"]');
await pg.waitForTimeout(800);
await capture("hub-chat", { frage: () => pg.getByPlaceholder(/Frage stellen/) });
await pg.keyboard.press("Escape").catch(() => {});
await pg.getByRole("searchbox").fill("arbeitsunfähig").catch(async () => { await pg.locator('input[type="search"]').fill("arbeitsunfähig"); });
await pg.waitForTimeout(2500);
await capture("hub-suche", { vorschlag: () => pg.getByText(/Meinten Sie/) });

const { data: demoPub } = await admin.from("tutorials").select("slug").eq("account_id", demoAcc.id).eq("status", "published").not("slug", "is", null).limit(1).single();
await pg.goto(BASE + `/h/demo/${demoPub.slug}`); await settle(1500);
await capture("wizard-public", {
  drucken: () => pg.getByText(/Zum Ausdrucken/),
  feedbackStep: () => pg.getByText(/komme hier nicht weiter/),
});

await browser.close();
await admin.auth.admin.updateUserById(demoUser.id, { password: crypto.randomUUID() + "Zz2!" });

// ---- Zuordnung Schritt -> (Shot, Ziel) ----
const MAP = [
  ["Ihr erstes Tutorial erstellen", 1, "dashboard", "neu"],
  ["Ihr erstes Tutorial erstellen", 2, "builder", "titel"],
  ["Ihr erstes Tutorial erstellen", 3, "builder", "video"],
  ["Ihr erstes Tutorial erstellen", 4, "builder", "rechteck"],
  ["Ihr erstes Tutorial erstellen", 5, "builder", "hoch"],
  ["Ihr erstes Tutorial erstellen", 6, "builder", "ki"],
  ["Tutorial aus einem Video erstellen", 1, "dashboard", "ausvideo"],
  ["Tutorial aus einem Video erstellen", 2, "video-dialog", "infobox"],
  ["Tutorial aus einem Video erstellen", 3, "video-dialog", "aufnehmen"],
  ["Tutorial aus einem Video erstellen", 4, "dashboard-job", "karte"],
  ["Tutorial aus einem Video erstellen", 5, "builder", "video"],
  ["Tutorial aus einem Video erstellen", 6, "video-dialog", "url"],
  ["Veröffentlichen und auf Ihre Website bringen", 1, "dashboard", "toggle"],
  ["Veröffentlichen und auf Ihre Website bringen", 2, "einbetten", "link"],
  ["Veröffentlichen und auf Ihre Website bringen", 3, "einbetten", "iframe"],
  ["Veröffentlichen und auf Ihre Website bringen", 4, "einbetten", "bubble"],
  ["Veröffentlichen und auf Ihre Website bringen", 5, "einbetten", "qr"],
  ["Veröffentlichen und auf Ihre Website bringen", 6, "wizard-public", "drucken"],
  ["Ihr Design: Farben, Logo und KI-CI", 1, "branding", null],
  ["Ihr Design: Farben, Logo und KI-CI", 2, "branding", "modus"],
  ["Ihr Design: Farben, Logo und KI-CI", 3, "branding", "modus"],
  ["Ihr Design: Farben, Logo und KI-CI", 4, "builder", "frage"],
  ["Der KI-Hilfe-Assistent und die Wissensdatenbank", 1, "hub-chat", "frage"],
  ["Der KI-Hilfe-Assistent und die Wissensdatenbank", 2, "knowledge", "neu"],
  ["Der KI-Hilfe-Assistent und die Wissensdatenbank", 3, "eskalation", null],
  ["Der KI-Hilfe-Assistent und die Wissensdatenbank", 4, "hub-suche", "vorschlag"],
  ["Insights: sehen, was Ihre Kunden brauchen", 1, "dashboard", "insights"],
  ["Insights: sehen, was Ihre Kunden brauchen", 2, "dashboard", "insights"],
  ["Team einladen und Organisationen", 1, "team", "einladen"],
  ["Team einladen und Organisationen", 3, "dashboard", "switcher"],
];

for (const [title, position, shotName, targetKey] of MAP) {
  const shot = shots[shotName];
  const tutId = tutByTitle.get(title);
  if (!shot || !tutId) { console.log("? übersprungen:", title, position, shotName); continue; }
  const { data: step } = await admin.from("steps").select("id").eq("tutorial_id", tutId).eq("position", position).single();
  if (!step) { console.log("? Schritt fehlt:", title, position); continue; }
  const webp = await sharp(shot.png).webp({ quality: 82 }).toBuffer();
  const meta = await sharp(webp).metadata();
  const p = `${steplyAcc.id}/${tutId}/${step.id}.webp`;
  for (const bucket of ["tutorial-images", "tutorial-images-public"]) {
    const { error } = await admin.storage.from(bucket).upload(p, webp, { upsert: true, contentType: "image/webp" });
    if (error) { console.error("Upload", bucket, error.message); process.exit(1); }
  }
  const box = targetKey ? shot.boxes[targetKey] : null;
  const highlights = box
    ? [{ id: uuid(), type: "rect", x: box.x, y: box.y, w: box.w, h: box.h, color: "#3d4ee6", rounded: true }]
    : [];
  await admin.from("steps").update({ image_path: p, image_width: meta.width, image_height: meta.height, highlights }).eq("id", step.id);
  console.log(`✓ ${title} · Schritt ${position} ← ${shotName}${box ? " + Markierung(" + targetKey + ")" : ""}`);
}
console.log("\n✓ v2 fertig: Screenshots + Markierungen an /h/steply.");
