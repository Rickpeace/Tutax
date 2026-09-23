// Pro-Sperren (Produktentscheid 23.09.2026) — headless gegen einen laufenden Server.
//
// Zwei Wegwerf-Konten (Gratis + Pro), je eine veröffentlichte Anleitung, eigene Farbe + Logo.
//  Hilfe-Seite: Gratis = Steply-Standard, „Erstellt mit Steply“, kein Chat;
//               Pro    = eigene Farbe + Logo, ohne Steply-Hinweis, mit Chat.
//  Direktaufrufe (Gratis): /api/chat 403, Logo-Upload 403, Dokument-Import 403, Chat-Seite weg.
//  App (Gratis): Assistent-Bereich + „Aussehen“ zeigen den Pro-Hinweis.
// Alles wird am Ende gelöscht.
// Nutzung:  TEST_BASE=http://localhost:3097 node --env-file=.env.local scripts/test-pro-gates.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
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

const BASE = process.env.TEST_BASE || "http://localhost:3097";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
  if (!cond) failed++;
};

const stamp = Date.now().toString(36);
const PW = "Probe12345!";
const COLOR = "#123abc"; // eigene Akzentfarbe (taucht nur bei Pro im HTML auf)
// 1×1-PNG als „Logo“
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function makeAccount(kind) {
  const email = `pro-gate-${kind}-${stamp}@example.com`;
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", u.user.id).single();
  const accountId = mem.account_id;
  const slug = `pro-gate-${kind}-${stamp}`;
  await admin.from("accounts").update({ onboarded: true, slug, name: `Probe ${kind}`, plan: kind === "pro" ? "pro" : "free" }).eq("id", accountId);
  const logoPath = `${accountId}/branding/logo-${stamp}.png`;
  await admin.storage.from("tutorial-images-public").upload(logoPath, PNG, { contentType: "image/png", upsert: true });
  await admin.from("themes").update({ tokens: { colors: { primary: COLOR } }, logo_path: logoPath, mode: "manual" }).eq("account_id", accountId);
  const { data: tut } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title: "Probe-Anleitung", status: "published", visibility: "public", slug: "probe-anleitung" })
    .select("id")
    .single();
  const { data: step } = await admin.from("steps").insert({ tutorial_id: tut.id, title: "Schritt 1", position: 0 }).select("id").single();
  await admin.from("tutorials").update({ root_step_id: step.id }).eq("id", tut.id);
  return { email, userId: u.user.id, accountId, slug, logoPath };
}

const accs = [];
const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
try {
  const free = await makeAccount("free");
  accs.push(free);
  const pro = await makeAccount("pro");
  accs.push(pro);

  // ── Hilfe-Seite ──────────────────────────────────────────────────────────
  const page = await (await browser.newContext()).newPage();
  for (const [acc, isPro] of [[free, false], [pro, true]]) {
    const label = isPro ? "Pro" : "Gratis";
    await page.goto(`${BASE}/h/${acc.slug}`, { waitUntil: "networkidle", timeout: 90_000 });
    const html = await page.content();
    const txt = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    ok(txt.includes("Probe-Anleitung"), `${label}: Hilfe-Seite zeigt die Anleitung`);
    ok(html.toLowerCase().includes(COLOR) === isPro, `${label}: eigene Farbe ${isPro ? "aktiv" : "NICHT aktiv (Steply-Standard)"}`);
    ok(html.includes(`logo-${stamp}`) === isPro, `${label}: eigenes Logo ${isPro ? "sichtbar" : "NICHT sichtbar"}`);
    ok(txt.includes("Erstellt mit Steply") === !isPro, `${label}: Hinweis „Erstellt mit Steply“ ${isPro ? "weg" : "da"}`);
    const chatBtn = await page.getByRole("button", { name: /Hilfe-Assistent/ }).count();
    ok((chatBtn > 0) === isPro, `${label}: Chat-Knopf ${isPro ? "da" : "NICHT da"} (${chatBtn})`);

    await page.goto(`${BASE}/h/${acc.slug}/probe-anleitung`, { waitUntil: "networkidle", timeout: 90_000 });
    const tTxt = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    ok(tTxt.includes("Erstellt mit Steply") === !isPro, `${label}: Anleitungs-Fuß ${isPro ? "ohne" : "mit"} Steply-Hinweis`);

    // Die Chat-Seite hat einen festen Titel (auch für unbekannte Konten) — maßgeblich ist,
    // ob der Chat selbst gerendert wird.
    await page.goto(`${BASE}/h/${acc.slug}/chat?embedded=1`, { waitUntil: "networkidle", timeout: 90_000 });
    const embedBtn = await page.getByRole("button", { name: /Hilfe-Assistent/ }).count();
    ok((embedBtn > 0) === isPro, `${label}: eingebettete Chat-Seite ${isPro ? "zeigt den Chat" : "zeigt KEINEN Chat"} (${embedBtn})`);
  }

  // /api/chat direkt (Gratis) — darf nie die KI anstoßen
  const chatResp = await page.request.post(`${BASE}/api/chat`, {
    data: { accountSlug: free.slug, question: "Wie melde ich mich an?", lang: "de" },
  });
  ok(chatResp.status() === 403, `Gratis: /api/chat direkt → ${chatResp.status()} (erwartet 403)`);

  // ── App (angemeldet als Gratis-Inhaber) ─────────────────────────────────
  const ctx = await browser.newContext();
  const app = await ctx.newPage();
  await app.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await app.locator('input[name="email"]').first().fill(free.email);
  await app.locator('input[name="password"]').first().fill(PW);
  await app.locator('button[type="submit"]').first().click();
  await app.waitForURL(/\/app/, { timeout: 60_000 });

  await app.goto(`${BASE}/app/assistent/wissen`, { waitUntil: "domcontentloaded" });
  await app.getByText("Der KI-Assistent ist Teil von Pro").waitFor({ timeout: 30_000 }).catch(() => {});
  ok(await app.getByText("Der KI-Assistent ist Teil von Pro").isVisible().catch(() => false), "Gratis-App: Wissensdatenbank zeigt den Pro-Hinweis");
  await app.goto(`${BASE}/app/assistent/fragen`, { waitUntil: "domcontentloaded" });
  await app.getByText("Der KI-Assistent ist Teil von Pro").waitFor({ timeout: 30_000 }).catch(() => {});
  ok(await app.getByText("Der KI-Assistent ist Teil von Pro").isVisible().catch(() => false), "Gratis-App: Offene Fragen zeigen den Pro-Hinweis");
  await app.goto(`${BASE}/app/settings/aussehen`, { waitUntil: "domcontentloaded" });
  await app.getByText("Eigenes Logo und Farben gibt es ab Pro").waitFor({ timeout: 30_000 }).catch(() => {});
  ok(await app.getByText("Eigenes Logo und Farben gibt es ab Pro").isVisible().catch(() => false), "Gratis-App: „Aussehen“ zeigt den Pro-Hinweis statt Logo/Farben");
  await app.goto(`${BASE}/app/settings/chat`, { waitUntil: "domcontentloaded" });
  await app.getByText("Die Chat-Blase ist Teil von Pro").waitFor({ timeout: 30_000 }).catch(() => {});
  ok(await app.getByText("Die Chat-Blase ist Teil von Pro").isVisible().catch(() => false), "Gratis-App: „Chat auf Ihrer Website“ zeigt den Pro-Hinweis");

  const logoResp = await app.request.post(`${BASE}/api/branding/logo`, {
    multipart: { file: { name: "l.png", mimeType: "image/png", buffer: PNG }, target: "manual" },
  });
  ok(logoResp.status() === 403, `Gratis-App: Logo-Upload direkt → ${logoResp.status()} (erwartet 403)`);
  const kbResp = await app.request.post(`${BASE}/api/kb-import`, {
    multipart: { file: { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("Öffnungszeiten: Mo–Fr 8–17 Uhr.") } },
  });
  ok(kbResp.status() === 403, `Gratis-App: Dokument-Import direkt → ${kbResp.status()} (erwartet 403)`);

  // ── KI, die Geld kostet: im Gratis-Tarif nirgends ───────────────────────
  const { data: freeTut } = await admin.from("tutorials").select("id").eq("account_id", free.accountId).single();
  const driftResp = await app.request.post(`${BASE}/api/tutorials/${freeTut.id}/check`);
  ok(driftResp.status() === 403, `Gratis-App: „Aktualität prüfen“ direkt → ${driftResp.status()} (erwartet 403)`);
  const vidResp = await app.request.post(`${BASE}/api/video-import`, { data: { url: "https://example.com/video.mp4" } });
  ok(vidResp.status() === 403, `Gratis-App: Video-Import direkt → ${vidResp.status()} (erwartet 403)`);

  await app.goto(`${BASE}/app/tutorials/${freeTut.id}`, { waitUntil: "networkidle", timeout: 90_000 });
  await app.waitForTimeout(1500);
  ok((await app.getByTestId("improve-texts").count()) === 0, "Gratis-Editor: kein Knopf „Texte mit KI verbessern“ über dem Ablauf");
  await app.getByTestId("editor-more").click().catch(() => {});
  await app.getByTestId("menu-improve-texts").waitFor({ timeout: 10_000 }).catch(() => {});
  const menuItem = app.getByTestId("menu-improve-texts");
  if (await menuItem.count()) {
    const dis = (await menuItem.getAttribute("data-disabled")) !== null || (await menuItem.getAttribute("aria-disabled")) === "true";
    ok(dis, "Gratis-Editor: Menüpunkt „Texte mit KI verbessern“ gesperrt");
  } else ok(false, "Gratis-Editor: „…“-Menü nicht gefunden (Menüpunkt nicht prüfbar)");
  await app.keyboard.press("Escape");

  await app.goto(`${BASE}/app`, { waitUntil: "networkidle", timeout: 90_000 });
  await app.getByRole("button", { name: /Neue Anleitung/ }).first().click();
  await app.getByRole("dialog").waitFor({ timeout: 15_000 });
  const videoCard = app.getByRole("dialog").getByText("Aus Video").first();
  const videoHref = await videoCard.locator("xpath=ancestor::a[1]").getAttribute("href").catch(() => null);
  ok(videoHref === "/app/settings/tarif", `Gratis: „Aus Video“ ist als Pro markiert und führt zum Tarif (${videoHref ?? "kein Link"})`);
  await app.keyboard.press("Escape");

  // Veröffentlichen erzeugt im Gratis-Tarif keinen (kostenpflichtigen) Chatbot-/Such-Index.
  const pubBtn = app.getByTestId("publish-button");
  await admin.from("tutorials").update({ status: "draft" }).eq("id", freeTut.id);
  await admin.from("kb_embeddings").delete().eq("account_id", free.accountId);
  await app.goto(`${BASE}/app/tutorials/${freeTut.id}`, { waitUntil: "networkidle", timeout: 90_000 });
  await pubBtn.waitFor({ timeout: 30_000 });
  await pubBtn.click();
  await app.getByTestId("published-badge").waitFor({ timeout: 60_000 }).catch(() => {});
  await app.waitForTimeout(6000); // Index läuft im Hintergrund (after)
  const { count: emb } = await admin.from("kb_embeddings").select("id", { count: "exact", head: true }).eq("account_id", free.accountId);
  ok((emb ?? 0) === 0, `Gratis: Veröffentlichen legt keinen KI-Index an (${emb ?? 0} Einträge)`);
  await ctx.close();
} finally {
  await browser.close();
  for (const a of accs) {
    await admin.storage.from("tutorial-images-public").remove([a.logoPath]).catch(() => {});
    await admin.from("accounts").delete().eq("id", a.accountId);
    await admin.auth.admin.deleteUser(a.userId);
  }
}
console.log(failed ? `\n✗ ${failed} Prüfung(en) fehlgeschlagen` : "\n✓ Pro-Sperren verifiziert");
process.exit(failed ? 1 : 0);
