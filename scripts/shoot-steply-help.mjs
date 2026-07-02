// Schießt ECHTE UI-Screenshots (im Demo-Konto „Muster GmbH" — keine Kundendaten!)
// und hängt sie als Schritt-Bilder an die Steply-Hilfe-Tutorials (/h/steply).
// Voraussetzung: Prod-Server läuft auf :3000. Playwright liegt im Scratchpad.
// Nutzung: node --env-file=.env.local scripts/shoot-steply-help.mjs <playwright-dir>
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { pathToFileURL } from "node:url";
import path from "node:path";

const PW_DIR = process.argv[2];
if (!PW_DIR) { console.error("Pfad zum Playwright-Ordner fehlt"); process.exit(1); }
const { chromium } = await import(pathToFileURL(path.join(PW_DIR, "node_modules/playwright/index.mjs")).href);

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = "http://localhost:3000";
const DEMO_EMAIL = "demo@steply.dev";
const DEMO_PW = "Shot!" + Math.random().toString(36).slice(2, 10) + "Xx1";

// Demo-User-Passwort temporär setzen (wurde beim Anlegen zufällig vergeben).
const { data: page1 } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const demoUser = page1.users.find((u) => u.email === DEMO_EMAIL);
if (!demoUser) { console.error("Demo-User fehlt"); process.exit(1); }
await admin.auth.admin.updateUserById(demoUser.id, { password: DEMO_PW });

// Steply-Konto + Tutorials laden (Ziel der Bilder).
const { data: steplyAcc } = await admin.from("accounts").select("id").eq("slug", "steply").single();
const { data: tuts } = await admin.from("tutorials").select("id,title").eq("account_id", steplyAcc.id);
const tutByTitle = new Map(tuts.map((t) => [t.title, t.id]));

// Demo-Builder-Ziel: erstes Demo-Tutorial mit Schritten.
const { data: demoAcc } = await admin.from("accounts").select("id").eq("slug", "demo").single();
const { data: demoTuts } = await admin.from("tutorials").select("id").eq("account_id", demoAcc.id).limit(1);
const demoTutId = demoTuts[0].id;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "de-DE" });
const pg = await ctx.newPage();
const shots = {}; // name -> png buffer

async function snap(name) { shots[name] = await pg.screenshot(); console.log("✓ shot:", name); }

// Login als Muster GmbH
await pg.goto(BASE + "/login");
await pg.fill("#email", DEMO_EMAIL);
await pg.fill("#password", DEMO_PW);
await pg.press("#password", "Enter");
await pg.waitForURL("**/app", { timeout: 20000 });
await pg.waitForLoadState("networkidle");
// PPR streamt: warten bis echter Inhalt (nicht Skeleton) steht.
await pg.waitForSelector("text=eigene Anleitungen", { timeout: 15000 }).catch(() => {});
await pg.waitForTimeout(2500);
await snap("dashboard");

// Video-Dialog öffnen
await pg.getByRole("button", { name: /Aus Video/ }).click();
await pg.waitForTimeout(600);
await snap("video-dialog");
await pg.keyboard.press("Escape");

// Builder mit geöffnetem Schritt-Panel
await pg.goto(BASE + `/app/tutorials/${demoTutId}`, { waitUntil: "networkidle" });
await pg.waitForTimeout(800);
await pg.locator("main button.rounded-xl").first().click();
await pg.waitForTimeout(1000);
await snap("builder");

// Einstellungen
for (const [name, url] of [["einbetten", "/app/settings/einbetten"], ["branding", "/app/settings/branding"], ["team", "/app/settings/team"]]) {
  await pg.goto(BASE + url, { waitUntil: "networkidle" });
  await pg.waitForTimeout(2000); // PPR-Streams fertig rendern lassen
  await snap(name);
}

// Öffentlicher Hub mit geöffnetem Chat (Muster GmbH)
await pg.goto(BASE + "/h/demo", { waitUntil: "networkidle" });
await pg.click('button[aria-label="Hilfe-Assistent"]');
await pg.waitForTimeout(700);
await snap("hub-chat");

await browser.close();
// Passwort wieder auf Zufall drehen (Demo-Login bleibt zu).
await admin.auth.admin.updateUserById(demoUser.id, { password: crypto.randomUUID() + "Zz2!" });

// ---------- Bilder -> webp -> beide Buckets -> Schritt-Zuordnung ----------
// Zuordnung: [Tutorial-Titel, Schritt-Position, Shot-Name]
const MAP = [
  ["Ihr erstes Tutorial erstellen", 1, "dashboard"],
  ["Ihr erstes Tutorial erstellen", 2, "builder"],
  ["Tutorial aus einem Video erstellen", 1, "video-dialog"],
  ["Veröffentlichen und auf Ihre Website bringen", 1, "dashboard"],
  ["Veröffentlichen und auf Ihre Website bringen", 2, "einbetten"],
  ["Weg 3: Die Chat-Bubble", -1, ""], // Platzhalter, wird unten ignoriert
  ["Ihr Design: Farben, Logo und KI-CI", 1, "branding"],
  ["Der KI-Hilfe-Assistent und die Wissensdatenbank", 1, "hub-chat"],
  ["Team einladen und Organisationen", 1, "team"],
];

for (const [title, position, shotName] of MAP) {
  if (position < 0 || !shots[shotName]) continue;
  const tutId = tutByTitle.get(title);
  if (!tutId) { console.log("? Tutorial fehlt:", title); continue; }
  const { data: step } = await admin.from("steps").select("id").eq("tutorial_id", tutId).eq("position", position).single();
  if (!step) { console.log("? Schritt fehlt:", title, position); continue; }
  const webp = await sharp(shots[shotName]).webp({ quality: 82 }).toBuffer();
  const meta = await sharp(webp).metadata();
  const p = `${steplyAcc.id}/${tutId}/${step.id}.webp`;
  // privat (Builder) + public (Hilfe-Seite; Tutorials sind veröffentlicht, kein Blur)
  for (const bucket of ["tutorial-images", "tutorial-images-public"]) {
    const { error } = await admin.storage.from(bucket).upload(p, webp, { upsert: true, contentType: "image/webp" });
    if (error) { console.error("Upload", bucket, error.message); process.exit(1); }
  }
  await admin.from("steps").update({ image_path: p, image_width: meta.width, image_height: meta.height }).eq("id", step.id);
  console.log(`✓ Bild gesetzt: ${title} · Schritt ${position} ← ${shotName} (${meta.width}x${meta.height})`);
}
console.log("\n✓ Screenshots an Steply-Hilfe-Tutorials angehängt.");
