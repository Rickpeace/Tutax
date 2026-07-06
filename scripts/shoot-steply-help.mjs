// v3 (Welle 34): Schießt UI-Screenshots (Demo-Konto „Muster GmbH“) und hängt sie MIT
// AUTOMATISCHEN MARKIERUNGEN **und robusten Selektoren** an die Steply-Hilfe-Tutorials
// (/h/steply). Neu ggü. v2: pro Ziel-Element wird zusätzlich ein { css, text, role }
// erfasst (dieselbe Logik wie die Recorder-Extension, extension/content.js selectorFor →
// stabile Anker, KEINE flüchtigen Base-UI-/Radix-IDs) und in steps.selector geschrieben —
// so wird die Doku live führbar. page_url + site_domains setzt der Seed (aus der Prod-URL).
//
// Highlights sitzen pixelgenau: Playwright liefert die BoundingBox des Ziel-Elements.
// Inhalt/Shot-Zuordnung kommt aus scripts/steply-help-content.mjs (geteilte Quelle mit dem Seed).
//
// Voraussetzung: lokaler App-Server auf :3000 (next dev ODER next start). Nutzung:
//   node --env-file=.env.local scripts/shoot-steply-help.mjs <playwright-dir>
// <playwright-dir>: eigener Ordner AUSSERHALB des Repos mit `npm i playwright` +
//   `npx playwright install chromium` (Playwright NICHT ins Repo installieren).
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { TUTORIALS } from "./steply-help-content.mjs";

const PW_DIR = process.argv[2];
if (!PW_DIR) { console.error("Pfad zum Playwright-Ordner fehlt (siehe Kopf des Skripts)"); process.exit(1); }
const { chromium } = await import(pathToFileURL(path.join(PW_DIR, "node_modules/playwright/index.mjs")).href);

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = "http://localhost:3000";
const VP = { width: 1440, height: 900 };
const HIGHLIGHT_COLOR = "#ef6a4e"; // Primär-Koralle (Warm-Redesign 07/2026)
const uuid = () => crypto.randomUUID();

// ── Selektor-Bauer, läuft IM Browser (self-contained; spiegelt extension/content.js
//    selectorFor/cssPathFor/roleFor + guide-resolve.js isVolatileId). KEINE flüchtigen
//    IDs (#base-ui-…, :r5:, UUID-artig) als css-Anker; stattdessen data-testid/name/
//    aria-label/nth-of-type. Rückgabe { css?, text?, role? } | null. ──────────────────
function computeSelectorInPage(el) {
  if (!el || el.nodeType !== 1) return null;
  const cssEsc = (s) => String(s).replace(/["\\]/g, "\\$&");
  const isVolatileId = (id) => {
    if (!id || typeof id !== "string") return true;
    if (id.length > 64) return true;
    if (/^base-ui-/i.test(id)) return true;
    if (/^_[rR]_/.test(id)) return true;
    if (/^:r/i.test(id)) return true;
    if (/^(radix|headlessui|mui|react-aria|aria)-/i.test(id)) return true;
    if (id.indexOf(":") >= 0) return true;
    if (/^\d+$/.test(id)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(id)) return true; // UUID-artig
    if (/^[A-Za-z]+[-_][0-9a-f]{6,}$/i.test(id)) return true; // Präfix + Hash
    return false;
  };
  const isStableId = (id) => !!id && typeof id === "string" && id.length <= 64 && !isVolatileId(id);
  const isUnique = (sel) => { try { return document.querySelectorAll(sel).length === 1; } catch { return false; } };
  const tag = el.tagName.toLowerCase();
  const cap = (s) => (s && s.length <= 400 ? s : "");
  const attr = (n) => { const v = el.getAttribute && el.getAttribute(n); return v && v.length <= 100 ? v : ""; };

  // ---- css (id > data-testid > name > aria-label > nth-of-type-Pfad) ----
  let css = "";
  if (el.id && isStableId(el.id) && isUnique("#" + CSS.escape(el.id))) css = "#" + CSS.escape(el.id);
  if (!css) {
    const testid = attr("data-testid");
    if (testid) {
      let s = tag + '[data-testid="' + cssEsc(testid) + '"]';
      if (isUnique(s)) css = s;
      else { s = '[data-testid="' + cssEsc(testid) + '"]'; if (isUnique(s)) css = s; }
    }
  }
  if (!css) { const nm = attr("name"); if (nm) { const s = tag + '[name="' + cssEsc(nm) + '"]'; if (isUnique(s)) css = s; } }
  if (!css) { const aria = attr("aria-label"); if (aria) { const s = tag + '[aria-label="' + cssEsc(aria) + '"]'; if (isUnique(s)) css = s; } }
  if (!css) {
    const parts = []; let node = el; let depth = 0;
    while (node && node.nodeType === 1 && depth < 5) {
      const t = node.tagName.toLowerCase();
      if (node.id && isStableId(node.id)) { parts.unshift("#" + CSS.escape(node.id)); break; }
      let seg = t; const parent = node.parentElement;
      if (parent) {
        const same = Array.prototype.filter.call(parent.children, (c) => c.tagName === node.tagName);
        if (same.length > 1) seg += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
      }
      parts.unshift(seg);
      if (t === "html" || t === "body") break;
      node = node.parentElement; depth++;
    }
    css = parts.join(" > ");
  }
  css = cap(css);

  // ---- role (implizit/explizit, gespiegelt aus roleFor) ----
  let role = "";
  const explicit = el.getAttribute && el.getAttribute("role");
  if (explicit && explicit.trim()) role = explicit.trim().toLowerCase();
  else {
    const type = ((el.getAttribute && el.getAttribute("type")) || "").toLowerCase();
    if (tag === "a" && el.hasAttribute("href")) role = "link";
    else if (tag === "button") role = "button";
    else if (tag === "select") role = "combobox";
    else if (tag === "textarea") role = "textbox";
    else if (tag === "input") {
      if (/^(button|submit|reset|image)$/.test(type)) role = "button";
      else if (type === "checkbox") role = "checkbox";
      else if (type === "radio") role = "radio";
      else if (type === "range") role = "slider";
      else if (type === "search") role = "searchbox";
      else role = "textbox";
    } else if (/^h[1-6]$/.test(tag)) role = "heading";
    else if (tag === "img") role = "img";
    else if (tag === "nav") role = "navigation";
  }
  role = role.slice(0, 40);

  // ---- text (Eingabefelder: Beschriftung; sonst sichtbarer Text) ----
  const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  let isEditable = tag === "textarea" || tag === "select";
  if (tag === "input") {
    const ty = ((el.getAttribute("type") || "text")).toLowerCase();
    isEditable = !/^(button|submit|reset|image)$/.test(ty);
  }
  if (!isEditable) { const ce = el.getAttribute("contenteditable"); if (ce === "" || String(ce).toLowerCase() === "true") isEditable = true; }
  let text = "";
  if (isEditable) {
    text = attr("aria-label") || attr("placeholder");
    if (!text && el.id) { try { const lbl = document.querySelector('label[for="' + cssEsc(el.id) + '"]'); if (lbl) text = lbl.textContent || ""; } catch { /* ignore */ } }
    if (!text && el.closest) { const w = el.closest("label"); if (w) text = w.textContent || ""; }
    if (!text) text = attr("name");
  } else {
    text = attr("aria-label") || (el.innerText || el.textContent || "");
  }
  text = norm(text).slice(0, 80);

  const out = {};
  if (css) out.css = css;
  if (text) out.text = text;
  if (role) out.role = role;
  return out.css || out.text || out.role ? out : null;
}

// ---- Konten/IDs ----
const { data: page1 } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const demoUser = page1.users.find((u) => u.email === "demo@steply.dev");
if (!demoUser) { console.error("demo@steply.dev nicht gefunden — Demo-Konto fehlt."); process.exit(1); }
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

// Shot + Ziel-Boxen + (bei guide) Selektoren. targets: { key: Locator-Factory }.
const shots = {}; // name -> { png, boxes:{key:{x,y,w,h}}, selectors:{key:{css,text,role}} }
async function capture(name, targets = {}, { guide = false } = {}) {
  const boxes = {}, selectors = {};
  for (const [key, make] of Object.entries(targets)) {
    try {
      const loc = make().first();
      const bb = await loc.boundingBox({ timeout: 3000 });
      if (bb) {
        const pad = 6;
        boxes[key] = {
          x: Math.max(0, (bb.x - pad) / VP.width),
          y: Math.max(0, (bb.y - pad) / VP.height),
          w: Math.min(1, (bb.width + pad * 2) / VP.width),
          h: Math.min(1, (bb.height + pad * 2) / VP.height),
        };
      }
      if (guide) {
        const sel = await loc.evaluate(computeSelectorInPage).catch(() => null);
        if (sel) selectors[key] = sel;
      }
    } catch { /* Ziel nicht gefunden -> Bild ohne Markierung/Selektor */ }
  }
  shots[name] = { png: await pg.screenshot(), boxes, selectors };
  const seln = Object.keys(selectors);
  console.log("✓ shot:", name, "| Boxen:", Object.keys(boxes).join(",") || "-", guide ? `| Selektoren: ${seln.join(",") || "-"}` : "");
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
  // Welle 20: EIN Einstieg „Neue Anleitung“ öffnet die Weiche (Selbst bauen / Aus Video /
  // Sofort-Anleitung) — deshalb zeigen „neu“ und „ausvideo“ auf denselben Knopf.
  neu: () => pg.getByRole("button", { name: /Neue Anleitung/ }),
  toggle: () => pg.getByText("Auf Hilfe-Seite").first(),
  insights: () => pg.getByText("Nutzung (letzte 30 Tage)"),
  switcher: () => pg.locator('[aria-label="Konto-Menü"]'),
  ausvideo: () => pg.getByRole("button", { name: /Neue Anleitung/ }),
}, { guide: true });

// „Wird erstellt…“-Karte: temporären queued-Job einblenden (illustrativ, kein Selektor)
const fakeJob = uuid();
await admin.from("video_jobs").insert({ id: fakeJob, account_id: demoAcc.id, video_path: "demo/fake.webm", title: "Bildschirmaufnahme", status: "queued" });
await pg.reload();
await settle(2500);
await pg.getByText(/ird erstellt/).first().waitFor({ timeout: 12000 }).catch(() => {});
await capture("dashboard-job", { karte: () => pg.getByText(/ird erstellt/).first() });
await admin.from("video_jobs").delete().eq("id", fakeJob);

// Video-Dialog (Welle 20: über die „Neue Anleitung“-Weiche → Karte „Aus Video“)
await pg.reload(); await settle(2000);
try {
  await pg.getByRole("button", { name: /Neue Anleitung/ }).first().click({ timeout: 8000 });
  await pg.waitForTimeout(500);
  await pg.getByRole("button", { name: /Aus Video/ }).first().click({ timeout: 8000 });
  await pg.waitForTimeout(900);
  await capture("video-dialog", {
    aufnehmen: () => pg.getByRole("button", { name: /Jetzt aufnehmen/ }),
    infobox: () => pg.getByText(/So wird die Aufnahme am besten/),
    url: () => pg.getByText(/Von URL importieren/),
  }, { guide: true });
  await pg.keyboard.press("Escape").catch(() => {});
} catch (e) { console.log("! video-dialog übersprungen:", String(e).slice(0, 120)); }

// Builder mit Bild-Schritt (Draft „Bild-Demo“; Bild = Dashboard-Shot). guide: Builder-Elemente
// existieren in jedem Builder wieder -> Selektoren sinnvoll (page_url bleibt null: dynamische URL).
const dashWebp = await sharp(shots["dashboard"].png).webp({ quality: 80 }).toBuffer();
const bildDemoId = await ensureBildDemo(dashWebp);
await pg.goto(BASE + `/app/tutorials/${bildDemoId}`);
await settle(2200);
await pg.getByText("Beispiel-Schritt").first().click({ timeout: 8000 }).catch(() => {});
await pg.waitForSelector("#step-title", { timeout: 10000 }).catch(() => {});
await pg.waitForTimeout(1200);
await capture("builder", {
  titel: () => pg.locator("#step-title"),
  rechteck: () => pg.locator('[title="Rechteck"]'),
  frage: () => pg.getByText(/Frage \/ Verzweigung/).first(),
  video: () => pg.getByText(/Bild aus Video wählen/),
  hoch: () => pg.locator('[aria-label*="oben"]'),
}, { guide: true });

// Einstellungen → Einbetten (Link/iFrame/Bubble/QR + Recorder verbinden)
await pg.goto(BASE + "/app/settings/einbetten"); await settle(2000);
await capture("einbetten", {
  link: () => pg.getByText(/Empfohlen: einfach verlinken/),
  iframe: () => pg.getByText(/Optional: direkt einbetten/),
  bubble: () => pg.getByText(/Chat-Bubble/).first(),
  qr: () => pg.locator('img[src*="/api/qr"]'),
  token: () => pg.getByText(/Steply Recorder verbinden/),
}, { guide: true });

// Einstellungen → Branding (Design-Quelle, KI-CI, Sprachen)
await pg.goto(BASE + "/app/settings/branding"); await settle(2200);
await capture("branding", {
  modus: () => pg.getByText(/KI-Design/).first(),
  website: () => pg.getByRole("button", { name: /Analysieren/ }),
  sprachen: () => pg.getByRole("heading", { name: /^Sprachen$/ }),
}, { guide: true });

// Einstellungen → Team
await pg.goto(BASE + "/app/settings/team"); await settle(2000);
await capture("team", { einladen: () => pg.getByRole("button", { name: /inladen/ }) }, { guide: true });

// Assistent → Eskalation / Wissen / Offene Fragen
await pg.goto(BASE + "/app/assistent/eskalation"); await settle(2000);
await capture("eskalation", {}, { guide: true });
await pg.goto(BASE + "/app/assistent/wissen"); await settle(2000);
await capture("knowledge", {
  neu: () => pg.getByRole("button", { name: /Neuer Artikel/ }),
  import: () => pg.getByRole("button", { name: /Von Ihrer Website/ }),
}, { guide: true });
await pg.goto(BASE + "/app/assistent/fragen"); await settle(2000);
await capture("fragen", {}, { guide: true });

// Lernen (interne Anleitungen + Schulungsnachweis)
await pg.goto(BASE + "/app/lernen"); await settle(2000);
await capture("lernen", {}, { guide: true });

// Öffentlich: Hub (illustrativ, kein Selektor/page_url — Kunden-Domain, dynamisch)
await pg.goto(BASE + "/h/demo"); await settle(1800);
await capture("hub", {});
// Chat öffnen
await pg.click('button[aria-label="Hilfe-Assistent"]').catch(() => {});
await pg.waitForTimeout(800);
await capture("hub-chat", { frage: () => pg.getByPlaceholder(/Frage stellen/) });
await pg.keyboard.press("Escape").catch(() => {});

// Öffentlicher Wizard (Druckansicht + Vorlesen)
const { data: demoPub } = await admin.from("tutorials").select("slug").eq("account_id", demoAcc.id).eq("status", "published").not("slug", "is", null).limit(1).single();
await pg.goto(BASE + `/h/demo/${demoPub.slug}`); await settle(1800);
await capture("wizard-public", {
  drucken: () => pg.getByText(/Zum Ausdrucken/),
  vorlesen: () => pg.getByRole("button", { name: /vorlesen/i }),
});

await browser.close();
await admin.auth.admin.updateUserById(demoUser.id, { password: crypto.randomUUID() + "Zz2!" });

// ---- Schreiben: Bild (privat+public) + Markierung + Selektor je Schritt ----
let written = 0, withSel = 0, missShot = 0;
for (const t of TUTORIALS) {
  const tutId = tutByTitle.get(t.title);
  if (!tutId) { console.log("? Tutorial fehlt in DB (erst seeden?):", t.title); continue; }
  const { data: steps } = await admin.from("steps").select("id, position").eq("tutorial_id", tutId).order("position");
  const byPos = new Map((steps || []).map((s) => [s.position, s.id]));
  for (let i = 0; i < t.steps.length; i++) {
    const st = t.steps[i];
    const stepId = byPos.get(i + 1);
    if (!stepId) { console.log("? Schritt fehlt:", t.title, i + 1); continue; }
    const shot = shots[st.shot];
    if (!shot) { console.log("? Shot fehlt:", st.shot, "→", t.title, i + 1); missShot++; continue; }

    const webp = await sharp(shot.png).webp({ quality: 82 }).toBuffer();
    const meta = await sharp(webp).metadata();
    const p = `${steplyAcc.id}/${tutId}/${stepId}.webp`;
    for (const bucket of ["tutorial-images", "tutorial-images-public"]) {
      const { error } = await admin.storage.from(bucket).upload(p, webp, { upsert: true, contentType: "image/webp" });
      if (error) { console.error("Upload", bucket, error.message); process.exit(1); }
    }

    const box = st.target ? shot.boxes[st.target] : null;
    const highlights = box
      ? [{ id: uuid(), type: "rect", x: box.x, y: box.y, w: box.w, h: box.h, color: HIGHLIGHT_COLOR, rounded: true }]
      : [];
    const selector = st.target ? shot.selectors[st.target] ?? null : null;

    await admin.from("steps").update({
      image_path: p, image_width: meta.width, image_height: meta.height, highlights, selector,
    }).eq("id", stepId);

    written++;
    if (selector) withSel++;
    console.log(`✓ ${t.title} · Schritt ${i + 1} ← ${st.shot}${box ? " +Markierung" : ""}${selector ? " +Selektor(" + st.target + ")" : ""}`);
  }
}
console.log(`\n✓ v3 fertig: ${written} Schritte bebildert, ${withSel} mit Selektor${missShot ? `, ${missShot} ohne Shot` : ""}.`);
