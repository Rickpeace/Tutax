// Business-Tarif Ende-zu-Ende (23.09.2026) — headless gegen einen LAUFENDEN Server (`next start`).
//
// Wegwerf-Konten (Business-Inhaber, Pro-Inhaber, Mitarbeiter im Business-Team), echte DB,
// echte KI (bewusst wenige Aufrufe). Prüft, was lib/pricing.ts für Business verspricht:
//  1. Mehrsprachigkeit: EN+PL einschalten → Veröffentlichen übersetzt Anleitung/Schritte/Antworten
//     + Kategorie; /h?lang=en englisch; Umschalter; Delta nur für den geänderten Schritt;
//     Sprache abschalten versteckt sie.
//  2. Vorlesen: MP3 je Schritt (öffentlich abrufbar, ▶ im Wizard); Edit erneuert nur diesen
//     Schritt; Zurück auf Entwurf räumt die MP3s ab; Löschen ebenso.
//  3. KI-Design: /api/theme/analyze + /extreme → „Von Ihrer Website“/„Nachgebaut“ ändern die
//     Hilfe-Seite (CSS bereinigt), zurück auf Steply-Standard; Pro → 403 + Business-Hinweis.
//  4. Interne Schulung („nur Team“): nicht auf /h, nicht in der Sitemap, nicht im Chat-Index;
//     Mitarbeiter sehen sie unter Schulungen + Nachweis; Pro kann nicht auf „nur Team“.
//  5. Aktualität: manueller Check; Cron verlangt das Secret und wählt nur Business-Konten.
//  6. Team: mehr als 5 Einladungen.   7. Video-Export: Business-Sperre + Auftrag.
//  8. Herabstufen Business → Pro → Gratis: Business-Funktionen aus, nichts stürzt ab.
// Alles (Konten, Nutzer, Dateien) wird am Ende gelöscht.
//
// Nutzung:  TEST_BASE=http://localhost:3292 node --env-file=.env.local scripts/test-business-e2e.mjs
//   (Einladungs-Mails gehen an delivered+…@resend.dev — Resends Test-Postfach, keine echten Empfänger.)
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
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

const BASE = process.env.TEST_BASE || "http://localhost:3292";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(SB_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PUBLIC_BUCKET = "tutorial-images-public";
const publicUrl = (p) => `${SB_URL}/storage/v1/object/public/${PUBLIC_BUCKET}/${p}`;
const BUSINESS_REQUIRED = "Dieses Feature ist im Business-Tarif enthalten. Upgrade unter Einstellungen → Tarif.";
const THEME_SITE = process.env.THEME_SITE || "https://example.com";

let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
  if (!cond) failed++;
};
const section = (t) => console.log(`\n── ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, { timeout = 60_000, every = 1500 } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await fn();
    if (last) return last;
    await sleep(every);
  }
  return last;
}
const norm = (s) => (s ?? "").replace(/\s+/g, " ");
const para = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

const stamp = Date.now().toString(36);
const PW = "Probe12345!";
const users = []; // { userId, accountId }
const extraPaths = new Set(); // Dateien im öffentlichen Bucket, die sicher weg sollen

async function makeUser(tag, { plan, slug, name, memberOf } = {}) {
  const email = `biz-e2e-${tag}-${stamp}@example.com`;
  const { data: u, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
    ...(memberOf ? { user_metadata: { active_account_id: memberOf } } : {}),
  });
  if (error) throw error;
  const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", u.user.id).single();
  const accountId = mem.account_id;
  users.push({ userId: u.user.id, accountId });
  await admin
    .from("accounts")
    .update({ onboarded: true, ...(slug ? { slug } : {}), ...(name ? { name } : {}), ...(plan ? { plan } : {}) })
    .eq("id", accountId);
  if (memberOf) {
    const { error: me } = await admin.from("account_members").insert({ account_id: memberOf, user_id: u.user.id, role: "member" });
    if (me) throw me;
  }
  return { email, userId: u.user.id, accountId, slug };
}

/** Anleitung direkt anlegen (Entwurf). steps: [{title, body, decision?}], branches: [{from, to, label}] (Indizes). */
async function seedTutorial(accountId, { title, description = null, categoryId = null, status = "draft", slug = null, steps, branches = [] }) {
  const { data: tut, error } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title, description, category_id: categoryId, status, visibility: "public", in_lernen: false, ...(slug ? { slug } : {}) })
    .select("id")
    .single();
  if (error) throw error;
  const { data: rows, error: se } = await admin
    .from("steps")
    .insert(steps.map((s, i) => ({ tutorial_id: tut.id, position: i + 1, title: s.title, body: para(s.body), is_decision: !!s.decision })))
    .select("id, position");
  if (se) throw se;
  const ids = rows.sort((a, b) => a.position - b.position).map((r) => r.id);
  await admin.from("tutorials").update({ root_step_id: ids[0] }).eq("id", tut.id);
  const brs = branches.length
    ? branches
    : ids.slice(0, -1).map((_, i) => ({ from: i, to: i + 1, label: null }));
  const { data: bRows, error: be } = await admin
    .from("step_branches")
    .insert(brs.map((b, i) => ({ step_id: ids[b.from], target_step_id: ids[b.to], label: b.label, position: i })))
    .select("id, label");
  if (be) throw be;
  return { id: tut.id, stepIds: ids, branchIds: bRows.map((b) => b.id) };
}

async function login(ctx, email) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator('input[name="email"]').first().fill(email);
  await page.locator('input[name="password"]').first().fill(PW);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/app/, { timeout: 90_000 });
  return page;
}

/** Seite laden + Grundgesundheit: kein 5xx, keine Fehlerseite, kein englischer Next-Fehler. */
const pageErrors = [];
async function visit(page, url, label) {
  const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  const status = resp?.status() ?? 0;
  const txt = norm(await page.locator("body").innerText().catch(() => ""));
  const broken = status >= 500 || /Application error|Something went wrong|Internal Server Error|Etwas ist schiefgelaufen/i.test(txt);
  if (label) ok(!broken, `${label}: lädt ohne Fehler (HTTP ${status})`);
  return { status, txt, html: await page.content() };
}

/**
 * Liegt die Datei (noch) im öffentlichen Bucket? Bewusst über die Storage-API statt über die
 * öffentliche URL: deren CDN hält eine einmal abgerufene Datei bis zu einer Stunde im Cache,
 * auch wenn sie längst gelöscht ist.
 */
async function storageExists(p) {
  const i = p.lastIndexOf("/");
  const { data } = await admin.storage.from(PUBLIC_BUCKET).list(p.slice(0, i), { search: p.slice(i + 1) });
  return (data ?? []).some((f) => f.name === p.slice(i + 1));
}

async function toastText(page, re, timeout = 30_000) {
  const t = page.locator("[data-sonner-toast]").filter({ hasText: re }).first();
  await t.waitFor({ timeout }).catch(() => {});
  return (await t.isVisible().catch(() => false)) ? norm(await t.innerText()) : null;
}

async function openStepInEditor(page, stepTitle) {
  await page.locator("main").getByText(stepTitle, { exact: true }).first().click();
  const input = page.getByPlaceholder("z. B. App öffnen");
  await input.waitFor({ timeout: 20_000 });
  return input;
}

async function renameStepViaUi(page, tutorialId, oldTitle, newTitle) {
  await page.goto(`${BASE}/app/tutorials/${tutorialId}`, { waitUntil: "networkidle", timeout: 120_000 });
  const input = await openStepInEditor(page, oldTitle);
  await input.fill(newTitle);
  await page.getByRole("button", { name: /^Speichern$/ }).first().click();
  return waitFor(async () => {
    const { data } = await admin.from("steps").select("title").eq("title", newTitle).eq("tutorial_id", tutorialId);
    return (data ?? []).length > 0;
  }, { timeout: 20_000, every: 500 });
}

/** Hub-Cache räumen wie ein echter Nutzer: Organisationsname speichern (saveBranding → invalidateHubTag). */
async function touchOrgName(page, name) {
  await page.goto(`${BASE}/app/settings/allgemein`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#org-name", name);
  await page.press("#org-name", "Enter");
  return !!(await toastText(page, /Name gespeichert/));
}

async function publishViaUi(page, tutorialId) {
  await page.goto(`${BASE}/app/tutorials/${tutorialId}`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByTestId("publish-button").click();
  await page.getByTestId("published-badge").waitFor({ timeout: 60_000 }).catch(() => {});
  return page.getByTestId("published-badge").isVisible().catch(() => false);
}

async function cardAction(page, title, item) {
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle", timeout: 120_000 });
  const card = page
    .locator("div, li, article")
    .filter({ hasText: title })
    .filter({ has: page.getByRole("button", { name: "Aktionen" }) })
    .last();
  await card.getByRole("button", { name: "Aktionen" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
let B, P, M;
let main, internalTut, draftTut, proTut;
try {
  // ── Konten ────────────────────────────────────────────────────────────────
  B = await makeUser("business", { plan: "business", slug: `biz-e2e-${stamp}`, name: "Biz Probe GmbH" });
  P = await makeUser("pro", { plan: "pro", slug: `biz-e2e-pro-${stamp}`, name: "Pro Probe GmbH" });
  M = await makeUser("member", { memberOf: B.accountId });
  const { data: cat } = await admin
    .from("categories")
    .insert({ account_id: B.accountId, name: "Buchhaltung", position: 0 })
    .select("id")
    .single();
  main = await seedTutorial(B.accountId, {
    title: "Beleg hochladen",
    description: "So laden Sie einen Beleg in das Portal hoch.",
    categoryId: cat.id,
    steps: [
      { title: "Menü öffnen", body: "Klicken Sie oben links auf das Menü Belege.", decision: true },
      { title: "Datei auswählen", body: "Wählen Sie die PDF-Datei auf Ihrem Computer aus." },
      { title: "Support anrufen", body: "Rufen Sie unseren Support über die Hotline an." },
    ],
    branches: [
      { from: 0, to: 1, label: "Ja, ich habe die Datei" },
      { from: 0, to: 2, label: "Nein, noch nicht" },
    ],
  });
  proTut = await seedTutorial(P.accountId, {
    title: "Pro Anleitung",
    status: "published",
    slug: "pro-anleitung",
    steps: [{ title: "Pro Schritt", body: "Ein Schritt im Pro-Konto." }],
  });

  const bCtx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const bp = await login(bCtx, B.email);
  bp.on("pageerror", (e) => pageErrors.push(`B: ${e.message}`));
  const pub = await (await browser.newContext()).newPage();
  pub.on("pageerror", (e) => pageErrors.push(`public: ${e.message}`));

  // ── 1. Sprachen ───────────────────────────────────────────────────────────
  section("1. Mehrsprachigkeit");
  await bp.goto(`${BASE}/app/settings/sprachen`, { waitUntil: "networkidle", timeout: 120_000 });
  for (const name of ["Englisch", "Polnisch"]) {
    await bp.getByRole("switch", { name }).click();
    ok(!!(await toastText(bp, new RegExp(`${name} ist an`))), `Einstellungen: „${name}“ eingeschaltet (Toast)`);
  }
  const { data: accL } = await admin.from("accounts").select("languages").eq("id", B.accountId).single();
  ok(JSON.stringify([...accL.languages].sort()) === '["en","pl"]', `DB: languages = ${JSON.stringify(accL.languages)}`);

  ok(await publishViaUi(bp, main.id), "Anleitung (3 Schritte + Frage mit 2 Antworten) veröffentlicht");
  const { data: mainRow } = await admin.from("tutorials").select("slug").eq("id", main.id).single();
  const tSlug = mainRow.slug;

  const translated = await waitFor(async () => {
    const [{ data: tt }, { data: st }, { data: bt }, { data: c }, { data: au }] = await Promise.all([
      admin.from("tutorial_translations").select("lang, title, description, stale").eq("tutorial_id", main.id),
      admin.from("step_translations").select("step_id, lang, title").in("step_id", main.stepIds),
      admin.from("branch_translations").select("branch_id, lang, label").in("branch_id", main.branchIds),
      admin.from("categories").select("name_i18n").eq("id", cat.id).single(),
      admin.from("steps").select("id, audio_path, audio_hash").in("id", main.stepIds),
    ]);
    const done = tt?.length === 2 && st?.length === 6 && bt?.length === 4 && c?.name_i18n?.en && c?.name_i18n?.pl && au?.every((s) => s.audio_path);
    return done ? { tt, st, bt, cat: c.name_i18n, audio: au } : null;
  }, { timeout: 240_000, every: 3000 });
  ok(!!translated, "Übersetzungen (Anleitung 2, Schritte 6, Antworten 4, Kategorie) + Audio je Schritt angelegt");
  if (!translated) throw new Error("Übersetzung/Vorlesen nicht fertig geworden — Abbruch");
  const tEn = translated.tt.find((t) => t.lang === "en");
  const tPl = translated.tt.find((t) => t.lang === "pl");
  const stEn = (id) => translated.st.find((s) => s.step_id === id && s.lang === "en");
  const brEn = (id) => translated.bt.find((b) => b.branch_id === id && b.lang === "en");
  console.log(`    EN: „${tEn.title}“ · Schritt 1 „${stEn(main.stepIds[0]).title}“ · Antworten „${brEn(main.branchIds[0]).label}“ / „${brEn(main.branchIds[1]).label}“ · Kategorie „${translated.cat.en}“`);
  ok(tEn.title !== "Beleg hochladen" && tPl.title !== "Beleg hochladen" && tEn.title !== tPl.title, "Titel wirklich übersetzt (EN ≠ PL ≠ DE)");

  let h = await visit(pub, `${BASE}/h/${B.slug}?lang=en`, "Hilfe-Seite ?lang=en");
  ok(h.txt.includes(tEn.title), `Hilfe-Seite EN zeigt englischen Titel „${tEn.title}“`);
  ok(h.txt.includes(translated.cat.en), `Hilfe-Seite EN zeigt übersetzte Kategorie „${translated.cat.en}“`);
  ok(h.html.includes("Search guides"), "Hilfe-Seite EN: Oberfläche englisch (Suchfeld „Search guides …“)");
  ok(/<html[^>]*lang="en"/.test(h.html), "Hilfe-Seite EN: <html lang=\"en\">");
  const nav = pub.locator('nav[data-tx="lang"]').first();
  ok(norm(await nav.innerText().catch(() => "")).replace(/\s/g, "") === "DE·EN·PL", `Sprach-Umschalter „${norm(await nav.innerText().catch(() => ""))}“`);
  await nav.getByRole("link", { name: "PL" }).click();
  await pub.waitForURL(/lang=pl/, { timeout: 30_000 });
  await pub.waitForLoadState("networkidle");
  ok(norm(await pub.locator("body").innerText()).includes(tPl.title), `Umschalter → PL zeigt polnischen Titel „${tPl.title}“`);

  h = await visit(pub, `${BASE}/h/${B.slug}/${tSlug}?lang=en`, "Anleitung ?lang=en");
  ok(h.txt.includes(stEn(main.stepIds[0]).title), `Anleitung EN: Schritt 1 englisch („${stEn(main.stepIds[0]).title}“)`);
  ok(h.txt.includes(brEn(main.branchIds[0]).label) && h.txt.includes(brEn(main.branchIds[1]).label), "Anleitung EN: Antwort-Knöpfe englisch");
  ok(!h.txt.includes("Ja, ich habe die Datei"), "Anleitung EN: keine deutschen Antwort-Texte");

  // ── 2. Vorlesen ───────────────────────────────────────────────────────────
  section("2. Vorlesen (TTS)");
  const a1 = translated.audio.find((s) => s.id === main.stepIds[0]);
  // Die Aufnahmen sind deutsch: auf der EN-Seite KEIN ▶ (sonst „Read aloud“ mit deutscher Stimme).
  ok((await pub.getByRole("button", { name: "Read step aloud" }).count()) === 0, "EN-Seite: kein ▶ (Aufnahmen sind deutsch)");
  await visit(pub, `${BASE}/h/${B.slug}/${tSlug}`, "Anleitung (deutsch)");
  const playBtn = pub.getByRole("button", { name: "Schritt vorlesen" });
  ok((await playBtn.count()) > 0, "DE-Seite: Wizard zeigt ▶-Knopf „Schritt vorlesen“");
  const audioSrc = await pub.locator("audio").first().getAttribute("src").catch(() => null);
  ok(audioSrc === publicUrl(a1.audio_path), `<audio src> zeigt auf die MP3 von Schritt 1`);
  const mp3 = await fetch(publicUrl(a1.audio_path));
  const mp3Buf = Buffer.from(await mp3.arrayBuffer());
  ok(mp3.status === 200 && /audio\/mpeg/.test(mp3.headers.get("content-type") ?? "") && mp3Buf.length > 2000,
    `MP3 öffentlich abrufbar (${mp3.status}, ${mp3.headers.get("content-type")}, ${mp3Buf.length} Bytes)`);
  if ((await playBtn.count()) > 0) {
    await playBtn.first().click();
    await sleep(1500);
    const playing = await pub.locator("audio").first().evaluate((a) => !a.paused || a.currentTime > 0).catch(() => false);
    ok(playing, "▶ spielt die MP3 ab (audio.paused = false)");
  }

  // Delta: nur Schritt 2 ändern → nur dessen Übersetzung + Audio neu.
  const before = {
    st: Object.fromEntries(translated.st.filter((s) => s.lang === "en").map((s) => [s.step_id, s.title])),
    hash: Object.fromEntries(translated.audio.map((s) => [s.id, s.audio_hash])),
  };
  ok(await renameStepViaUi(bp, main.id, "Datei auswählen", "PDF-Beleg auswählen"), "Editor: Titel von Schritt 2 geändert + gespeichert");
  const delta = await waitFor(async () => {
    const [{ data: st }, { data: au }] = await Promise.all([
      admin.from("step_translations").select("step_id, title").eq("lang", "en").in("step_id", main.stepIds),
      admin.from("steps").select("id, audio_hash").in("id", main.stepIds),
    ]);
    const s2 = st.find((s) => s.step_id === main.stepIds[1]);
    const h2 = au.find((s) => s.id === main.stepIds[1]);
    return s2.title !== before.st[main.stepIds[1]] && h2.audio_hash !== before.hash[main.stepIds[1]] ? { st, au } : null;
  }, { timeout: 150_000, every: 3000 });
  ok(!!delta, "Delta: Schritt 2 neu übersetzt + neues Audio");
  if (!delta) {
    const [{ data: st }, { data: au }] = await Promise.all([
      admin.from("step_translations").select("step_id, title").eq("lang", "en").in("step_id", main.stepIds),
      admin.from("steps").select("id, audio_hash").in("id", main.stepIds),
    ]);
    console.log("    vorher:", JSON.stringify(before), "\n    jetzt:", JSON.stringify({ st, au }));
  }
  if (delta) {
    console.log(`    Schritt 2 EN jetzt „${delta.st.find((s) => s.step_id === main.stepIds[1]).title}“`);
    for (const i of [0, 2]) {
      const id = main.stepIds[i];
      ok(delta.st.find((s) => s.step_id === id).title === before.st[id], `Delta: Schritt ${i + 1} Übersetzung unverändert`);
      ok(delta.au.find((s) => s.id === id).audio_hash === before.hash[id], `Delta: Schritt ${i + 1} Audio unverändert`);
    }
  }
  // Delta für einen Antwort-Text (Label der zweiten Antwort) → nur dessen Übersetzung neu.
  await bp.goto(`${BASE}/app/tutorials/${main.id}`, { waitUntil: "networkidle", timeout: 120_000 });
  await openStepInEditor(bp, "Menü öffnen");
  const lblInput = bp.getByLabel("Antwort-Text").nth(1);
  await lblInput.fill("Nein, erst später");
  await lblInput.press("Tab"); // speichert beim Verlassen des Felds
  const brBefore = Object.fromEntries(translated.bt.filter((b) => b.lang === "en").map((b) => [b.branch_id, b.label]));
  const brDelta = await waitFor(async () => {
    const { data } = await admin.from("branch_translations").select("branch_id, label").eq("lang", "en").in("branch_id", main.branchIds);
    const b2 = data.find((b) => b.branch_id === main.branchIds[1]);
    return b2.label !== brBefore[main.branchIds[1]] ? data : null;
  }, { timeout: 90_000, every: 2000 });
  ok(!!brDelta, `Delta: geänderte Antwort neu übersetzt („${brDelta?.find((b) => b.branch_id === main.branchIds[1]).label ?? "–"}“)`);
  if (brDelta) ok(brDelta.find((b) => b.branch_id === main.branchIds[0]).label === brBefore[main.branchIds[0]], "Delta: andere Antwort unverändert");
  const staleClear = await waitFor(async () => {
    const { data } = await admin.from("tutorial_translations").select("stale").eq("tutorial_id", main.id);
    return data.every((r) => r.stale === false);
  }, { timeout: 30_000, every: 1500 });
  ok(!!staleClear, "Nach den Deltas: keine Übersetzung mehr als veraltet markiert");

  // Sprache abschalten
  await bp.goto(`${BASE}/app/settings/sprachen`, { waitUntil: "networkidle", timeout: 120_000 });
  await bp.getByRole("switch", { name: "Polnisch" }).click();
  ok(!!(await toastText(bp, /Polnisch ist aus/)), "Einstellungen: Polnisch ausgeschaltet");
  h = await visit(pub, `${BASE}/h/${B.slug}?lang=pl`, "Hilfe-Seite ?lang=pl nach Abschalten");
  ok(!h.txt.includes(tPl.title) && h.txt.includes("Beleg hochladen"), "?lang=pl fällt auf Deutsch zurück");
  ok(!/>PL</.test(await pub.locator('nav[data-tx="lang"]').first().innerHTML().catch(() => "")), "Umschalter ohne PL");

  // Zurück auf Entwurf räumt die MP3s ab (eigene kleine Anleitung, 1 Audio).
  draftTut = await seedTutorial(B.accountId, {
    title: "Kurz zurückziehen",
    steps: [{ title: "Einziger Schritt", body: "Öffnen Sie die Einstellungen und wählen Sie Profil." }],
  });
  ok(await publishViaUi(bp, draftTut.id), "Zweite Anleitung veröffentlicht");
  const dAudio = await waitFor(async () => {
    const { data } = await admin.from("steps").select("audio_path").eq("id", draftTut.stepIds[0]).single();
    return data?.audio_path ?? null;
  }, { timeout: 120_000, every: 2000 });
  ok(!!dAudio && (await storageExists(dAudio)), "Zweite Anleitung: MP3 erzeugt + öffentlich");
  await bp.getByTestId("editor-more").click();
  await bp.getByRole("menuitem", { name: /Zurück auf Entwurf/ }).click();
  await bp.getByTestId("publish-button").waitFor({ timeout: 30_000 }).catch(() => {});
  const gone = await waitFor(async () => (dAudio ? !(await storageExists(dAudio)) : false), { timeout: 20_000, every: 1000 });
  ok(!!gone, "Zurück auf Entwurf: MP3 aus dem öffentlichen Bucket entfernt");
  const { data: dRow } = await admin.from("steps").select("audio_path").eq("id", draftTut.stepIds[0]).single();
  ok(dRow.audio_path === null, "Zurück auf Entwurf: audio_path geleert");

  // ── 3. KI-Design ──────────────────────────────────────────────────────────
  section("3. KI-Design");
  const an = await bp.request.post(`${BASE}/api/theme/analyze`, { data: { url: THEME_SITE }, timeout: 180_000 });
  const anJ = await an.json().catch(() => ({}));
  ok(an.status() === 200 && anJ.ok === true, `/api/theme/analyze (${THEME_SITE}) → ${an.status()} ok=${anJ.ok} ${anJ.error ?? ""}`);
  const ex = await bp.request.post(`${BASE}/api/theme/extreme`, { data: { url: THEME_SITE }, timeout: 240_000 });
  const exJ = await ex.json().catch(() => ({}));
  ok(ex.status() === 200 && exJ.ok === true, `/api/theme/extreme → ${ex.status()} ok=${exJ.ok} ${exJ.error ?? ""}`);
  const { data: th } = await admin.from("themes").select("ai_tokens, extreme_css, ai_logo_path, extreme_logo_path").eq("account_id", B.accountId).single();
  for (const p of [th.ai_logo_path, th.extreme_logo_path]) if (p) extraPaths.add(p);
  const aiPrimary = th.ai_tokens?.colors?.primary?.toLowerCase();
  ok(!!aiPrimary, `ai_tokens gespeichert (Primärfarbe ${aiPrimary})`);
  ok(!!th.extreme_css, `extreme_css gespeichert (${th.extreme_css?.length ?? 0} Zeichen)`);

  const activateMode = async (label) => {
    await bp.goto(`${BASE}/app/settings/aussehen`, { waitUntil: "networkidle", timeout: 120_000 });
    // Neuaufbau 24.09. („Entwurf A“): Grundlage links wählen, dann im Balken „Auf Hilfe-Seite verwenden“.
    await bp.locator(`[data-mode]`).filter({ hasText: label }).first().click();
    await bp.getByRole("button", { name: "Auf Hilfe-Seite verwenden" }).click();
    return !!(await toastText(bp, new RegExp(`„${label}“ ist jetzt auf Ihrer Hilfe-Seite aktiv`)));
  };
  const accentOf = (html) => (html.toLowerCase().match(/--brand-accent:\s*(#[0-9a-f]{3,8})/) ?? [])[1] ?? null;
  ok(await activateMode("Von Ihrer Website"), "Aussehen: „Von Ihrer Website“ aktiviert");
  h = await visit(pub, `${BASE}/h/${B.slug}`, "Hilfe-Seite (KI-Design)");
  ok(accentOf(h.html) === aiPrimary, `Hilfe-Seite nutzt die KI-Akzentfarbe (${accentOf(h.html)} = ${aiPrimary})`);
  ok(await activateMode("Nachgebaut"), "Aussehen: „Nachgebaut“ aktiviert");
  h = await visit(pub, `${BASE}/h/${B.slug}`, "Hilfe-Seite (Nachgebaut)");
  ok(/class="[^"]*tutax-skin/.test(h.html), "Hilfe-Seite trägt die Skin-Klasse (tutax-skin)");
  const styles = await pub.locator("style").allInnerTexts();
  const skin = styles.find((s) => s.includes(".tutax-skin")) ?? "";
  ok(skin.length > 0, `Skin-CSS eingebettet (${skin.length} Zeichen)`);
  ok(!/@import|url\(|expression|javascript:|<\/?script/i.test(skin), "Skin-CSS bereinigt (kein @import/url()/script)");
  ok(await activateMode("Steply-Standard"), "Aussehen: zurück auf „Steply-Standard“");
  h = await visit(pub, `${BASE}/h/${B.slug}`, "Hilfe-Seite (Standard)");
  ok(!/class="[^"]*tutax-skin/.test(h.html) && accentOf(h.html) !== aiPrimary, `Hilfe-Seite wieder Standard (Akzent ${accentOf(h.html)})`);

  const pCtx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const pp = await login(pCtx, P.email);
  pp.on("pageerror", (e) => pageErrors.push(`P: ${e.message}`));
  const pan = await pp.request.post(`${BASE}/api/theme/analyze`, { data: { url: THEME_SITE } });
  const panJ = await pan.json().catch(() => ({}));
  ok(pan.status() === 403 && panJ.error === BUSINESS_REQUIRED, `Pro: /api/theme/analyze → ${pan.status()} „${panJ.error}“`);
  const pex = await pp.request.post(`${BASE}/api/theme/extreme`, { data: { url: THEME_SITE } });
  ok(pex.status() === 403, `Pro: /api/theme/extreme → ${pex.status()}`);
  await visit(pp, `${BASE}/app/settings/aussehen`, "Pro: Aussehen");
  ok(await pp.getByText("Im Business-Tarif erstellt die KI").isVisible().catch(() => false), "Pro: Aussehen zeigt den Business-Hinweis");
  await visit(pp, `${BASE}/app/settings/sprachen`, "Pro: Sprachen");
  ok(await pp.getByText("Mehrsprachige Hilfe-Seite gibt es im Business-Tarif").isVisible().catch(() => false), "Pro: Sprachen zeigt den Business-Hinweis");
  ok(await pp.getByRole("switch", { name: "Englisch" }).isDisabled().catch(() => false), "Pro: Sprach-Schalter gesperrt");

  // ── 4. Interne Schulungen ────────────────────────────────────────────────
  section("4. Interne Schulungen");
  internalTut = await seedTutorial(B.accountId, {
    title: `Interne Urlaubsregel ${stamp}`,
    steps: [{ title: "Antrag stellen", body: "Stellen Sie den Urlaubsantrag im Personalportal." }],
  });
  await bp.goto(`${BASE}/app/tutorials/${internalTut.id}`, { waitUntil: "networkidle", timeout: 120_000 });
  const chips = bp.getByTestId("audience-chips");
  await chips.getByRole("button", { name: "Team" }).click();
  await waitFor(async () => (await chips.getByRole("button", { name: "Team" }).getAttribute("aria-pressed")) === "true", { timeout: 20_000, every: 300 });
  await chips.getByRole("button", { name: /Hilfe-Seite/ }).click();
  const isInternal = await waitFor(async () => {
    const { data } = await admin.from("tutorials").select("visibility").eq("id", internalTut.id).single();
    return data.visibility === "internal";
  }, { timeout: 20_000, every: 500 });
  ok(!!isInternal, "Business: Zielgruppe „nur Team“ gesetzt (visibility=internal)");
  await bp.getByTestId("publish-button").click();
  await bp.getByTestId("published-badge").waitFor({ timeout: 60_000 }).catch(() => {});
  const { data: intRow } = await admin.from("tutorials").select("status, slug").eq("id", internalTut.id).single();
  ok(intRow.status === "published", "Interne Anleitung fürs Team veröffentlicht");
  await sleep(4000); // eventuelle after()-Jobs
  h = await visit(pub, `${BASE}/h/${B.slug}`, "Hilfe-Seite");
  ok(!h.txt.includes("Interne Urlaubsregel"), "Interne Anleitung NICHT auf der Hilfe-Seite");
  const sm = await (await fetch(`${BASE}/sitemap.xml`)).text();
  ok(!sm.includes("interne-urlaubsregel") && sm.includes(`/h/${B.slug}/${tSlug}`), "Sitemap: öffentliche Anleitung drin, interne nicht");
  const { count: embInt } = await admin.from("kb_embeddings").select("id", { count: "exact", head: true }).eq("source_id", internalTut.id);
  const { count: embMain } = await admin.from("kb_embeddings").select("id", { count: "exact", head: true }).eq("source_id", main.id);
  ok((embInt ?? 0) === 0, `Chat-Index: interne Anleitung nicht indiziert (${embInt ?? 0})`);
  ok((embMain ?? 0) > 0, `Chat-Index: öffentliche Anleitung indiziert (${embMain ?? 0})`);
  const { count: trInt } = await admin.from("tutorial_translations").select("id", { count: "exact", head: true }).eq("tutorial_id", internalTut.id);
  const { data: auInt } = await admin.from("steps").select("audio_path").eq("tutorial_id", internalTut.id);
  ok((trInt ?? 0) === 0 && auInt.every((s) => !s.audio_path), "Interne Anleitung: keine Übersetzung, kein öffentliches Audio");
  const hs = await fetch(`${BASE}/api/hub-search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountSlug: B.slug, q: "Urlaubsantrag Personalportal" }) });
  const hsTxt = await hs.text();
  ok(!hsTxt.includes("Interne Urlaubsregel"), `Hub-Suche liefert die interne Anleitung nicht (HTTP ${hs.status})`);

  const mCtx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const mp = await login(mCtx, M.email);
  mp.on("pageerror", (e) => pageErrors.push(`M: ${e.message}`));
  let r = await visit(mp, `${BASE}/app/lernen`, "Mitarbeiter: Schulungen");
  ok(r.txt.includes("Interne Urlaubsregel"), "Mitarbeiter sieht die interne Anleitung unter Schulungen");
  await visit(mp, `${BASE}/app/lernen/${internalTut.id}`, "Mitarbeiter: Schulung öffnen");
  for (let i = 0; i < 4; i++) {
    if (await mp.getByRole("button", { name: /Als absolviert markieren/ }).isVisible().catch(() => false)) break;
    await mp.getByRole("button", { name: /^(Weiter|Fertig)/ }).last().click().catch(() => {});
    await sleep(600);
  }
  await mp.getByRole("button", { name: /Als absolviert markieren/ }).click();
  // Die Oberfläche zeigt „Absolviert“ sofort (optimistisch) — maßgeblich ist die DB.
  const comp = await waitFor(async () => {
    const { data } = await admin.from("tutorial_completions").select("user_id").eq("tutorial_id", internalTut.id);
    return data?.some((c) => c.user_id === M.userId);
  }, { timeout: 20_000, every: 500 });
  ok(!!comp, "Schulungsnachweis: Abschluss des Mitarbeiters gespeichert");
  r = await visit(bp, `${BASE}/app/lernen/${internalTut.id}`, "Inhaber: Schulung");
  const record = /Schulungsnachweis/i.test(r.txt) && /1 von 2 im Team/.test(r.txt);
  ok(record, "Inhaber sieht den Schulungsnachweis („1 von 2 im Team“)");
  if (!record) console.log("    Seite:", r.txt.slice(0, 600));

  await pp.goto(`${BASE}/app/tutorials/${proTut.id}`, { waitUntil: "networkidle", timeout: 120_000 });
  const pChips = pp.getByTestId("audience-chips");
  await pChips.getByRole("button", { name: "Team" }).click();
  await waitFor(async () => (await pChips.getByRole("button", { name: "Team" }).getAttribute("aria-pressed")) === "true", { timeout: 20_000, every: 300 });
  // Erst warten, bis das Umschalten fertig ist (während „busy“ zeigt der Chip bewusst nichts).
  await waitFor(async () => (await pChips.getAttribute("aria-busy")) === null, { timeout: 20_000, every: 300 });
  await pChips.getByRole("button", { name: /Hilfe-Seite/ }).click({ force: true }); // gesperrt = aria-disabled
  ok(!!(await toastText(pp, /nur für Ihr Team sind im Business-Tarif/, 10_000)), "Pro: „nur Team“ gesperrt mit Business-Hinweis");
  await sleep(1500);
  const { data: proVis } = await admin.from("tutorials").select("visibility, in_lernen").eq("id", proTut.id).single();
  ok(proVis.visibility === "public" && proVis.in_lernen === true, `Pro: bleibt öffentlich (+ Team erlaubt): ${JSON.stringify(proVis)}`);

  // ── 5. Aktualität prüfen ─────────────────────────────────────────────────
  section("5. Aktualität prüfen");
  const chk = await bp.request.post(`${BASE}/api/tutorials/${main.id}/check`, { timeout: 120_000 });
  const chkJ = await chk.json().catch(() => ({}));
  ok(chk.status() === 200 && !chkJ.error, `Manueller Check → ${chk.status()} ${chkJ.error ?? ""}`);
  console.log(`    Ergebnis: is_stale=${chkJ.is_stale} ${chkJ.summary ? "– " + String(chkJ.summary).slice(0, 120) : ""}`);
  const { data: dr } = await admin.from("tutorials").select("drift_checked_at, freshness").eq("id", main.id).single();
  ok(!!dr.drift_checked_at, "drift_checked_at gesetzt");
  const { count: alerts } = await admin.from("change_alerts").select("id", { count: "exact", head: true }).eq("tutorial_id", main.id);
  ok(chkJ.is_stale ? (alerts ?? 0) > 0 : true, `Hinweise: ${alerts ?? 0} (${chkJ.is_stale ? "veraltet → Hinweis nötig" : "aktuell → kein Hinweis nötig"})`);
  const cron1 = await fetch(`${BASE}/api/cron/drift`);
  const cron2 = await fetch(`${BASE}/api/cron/drift`, { headers: { authorization: "Bearer falsch" } });
  ok([401, 503].includes(cron1.status) && [401, 503].includes(cron2.status), `Cron ohne/mit falschem Secret → ${cron1.status}/${cron2.status}`);
  // Kandidatenauswahl des Crons (gleiche Abfrage wie /api/cron/drift, auf unsere Konten begrenzt).
  const { data: cand } = await admin
    .from("tutorials")
    .select("id, account_id, accounts!inner(plan)")
    .eq("status", "published")
    .eq("is_template", false)
    .eq("accounts.plan", "business")
    .in("account_id", [B.accountId, P.accountId]);
  ok(cand.some((c) => c.id === main.id) && !cand.some((c) => c.account_id === P.accountId), "Cron-Auswahl: Business-Anleitungen ja, Pro-Konto nein");

  // ── 6. Team ohne Grenze ──────────────────────────────────────────────────
  section("6. Team (Business = unbegrenzt)");
  await bp.goto(`${BASE}/app/settings/team`, { waitUntil: "networkidle", timeout: 120_000 });
  for (let i = 1; i <= 6; i++) {
    await bp.fill("#invite-email", `delivered+biz-e2e-${stamp}-${i}@resend.dev`);
    await bp.selectOption("#invite-role", "member");
    await bp.getByRole("button", { name: "Einladen" }).click();
    // Fertig erst, wenn das Formular zurückgesetzt ist (sonst leert der Reset die nächste Eingabe).
    await waitFor(async () => (await bp.inputValue("#invite-email")) === "" && (await bp.getByRole("button", { name: "Einladen" }).isEnabled()), { timeout: 30_000, every: 300 });
  }
  const { count: invCount } = await admin.from("invitations").select("id", { count: "exact", head: true }).eq("account_id", B.accountId).eq("status", "pending");
  ok(invCount === 6, `6 Einladungen offen (+ 2 Mitglieder = 8 > 5): ${invCount}`);
  ok(!(await bp.getByText(/Ihr Tarif erlaubt/).isVisible().catch(() => false)), "Keine Tarif-Grenze angezeigt");

  // ── 7. Video-Export ──────────────────────────────────────────────────────
  section("7. Video-Export");
  // Pro: Menüpunkt gibt es gar nicht (Export ist Business) — statt Fehler nach dem Klick.
  await pp.goto(`${BASE}/app`, { waitUntil: "networkidle", timeout: 120_000 });
  const proCard = pp
    .locator("div, li, article")
    .filter({ hasText: "Pro Anleitung" })
    .filter({ has: pp.getByRole("button", { name: "Aktionen" }) })
    .last();
  await proCard.getByRole("button", { name: "Aktionen" }).click();
  await pp.getByRole("menuitem").first().waitFor({ timeout: 10_000 }).catch(() => {});
  ok((await pp.getByRole("menuitem", { name: /Als Video exportieren/ }).count()) === 0, "Pro: kein Menüpunkt „Als Video exportieren“ (Business)");
  await pp.keyboard.press("Escape");
  await cardAction(bp, "Beleg hochladen", /Als Video exportieren/);
  await bp.getByRole("dialog").getByRole("button", { name: /^Klassisch/ }).click();
  const job = await waitFor(async () => {
    const { data } = await admin.from("video_jobs").select("id, status").eq("tutorial_id", main.id).eq("kind", "render");
    return data?.[0] ?? null;
  }, { timeout: 20_000, every: 250 });
  if (job) await admin.from("video_jobs").delete().eq("id", job.id); // sofort weg: der Live-Worker soll nichts rendern
  ok(!!job, `Business: Export-Auftrag angelegt (${job?.status ?? "keiner"}) — gleich wieder gelöscht`);
  ok(!!(await toastText(bp, /Export gestartet/, 10_000)), "Business: Toast „Export gestartet“");

  // ── 8. Herabstufen ───────────────────────────────────────────────────────
  section("8. Herabstufen Business → Pro → Gratis");
  await activateMode("Von Ihrer Website"); // KI-Design aktiv lassen, damit das Herabstufen es abschalten muss
  await admin.from("accounts").update({ plan: "pro" }).eq("id", B.accountId);
  ok(await touchOrgName(bp, "Biz Probe GmbH (Pro)"), "Tarif auf Pro gesetzt (Hub-Cache über Namensänderung geräumt)");
  h = await visit(pub, `${BASE}/h/${B.slug}`, "Pro-nach-Business: Hilfe-Seite");
  ok(h.txt.includes("Beleg hochladen"), "Hilfe-Seite zeigt die Anleitung weiter");
  ok((await pub.locator('nav[data-tx="lang"]').count()) === 0, "Kein Sprach-Umschalter mehr (Mehrsprachigkeit ist Business)");
  ok(accentOf(h.html) !== aiPrimary, `KI-Design nicht mehr aktiv (Akzent ${accentOf(h.html)})`);
  h = await visit(pub, `${BASE}/h/${B.slug}?lang=en`, "Pro-nach-Business: ?lang=en");
  ok(!h.txt.includes(tEn.title) && h.txt.includes("Beleg hochladen"), "?lang=en fällt auf Deutsch zurück");
  h = await visit(pub, `${BASE}/h/${B.slug}/${tSlug}?lang=en`, "Pro-nach-Business: Anleitung");
  ok(h.txt.includes("Menü öffnen"), "Anleitung deutsch");
  ok((await pub.locator("audio").count()) === 0 && !(await pub.getByRole("button", { name: /vorlesen|aloud/i }).count()), "Kein Vorlesen mehr");
  for (const [u, l] of [
    ["/app", "Bibliothek"],
    ["/app/settings/sprachen", "Sprachen"],
    ["/app/settings/aussehen", "Aussehen"],
    [`/app/tutorials/${main.id}`, "Editor"],
    ["/app/lernen", "Schulungen"],
    [`/app/lernen/${internalTut.id}`, "interne Schulung"],
    ["/app/settings/team", "Team"],
  ]) {
    r = await visit(bp, `${BASE}${u}`, `Pro-nach-Business: ${l}`);
    if (u === "/app/settings/aussehen") {
      const active = await bp.locator('[data-mode][data-active="true"]').getAttribute("data-mode").catch(() => null);
      ok(active === "manual", `Aussehen zeigt „Steply-Standard“ als aktiv (${active})`);
    }
    if (u === "/app/settings/sprachen") {
      ok(r.txt.includes("Bereits aktive Sprachen können Sie weiterhin abschalten"), "Sprachen: Business-Hinweis + Abschalten möglich");
    }
  }
  // Bereits aktive Sprachen bleiben einzeln abschaltbar (zwei aktiv → eine abschalten).
  await admin.from("accounts").update({ languages: ["en", "pl"] }).eq("id", B.accountId);
  await bp.goto(`${BASE}/app/settings/sprachen`, { waitUntil: "networkidle", timeout: 120_000 });
  ok(await bp.getByRole("switch", { name: "Englisch" }).isEnabled().catch(() => false), "Pro: aktive Sprache bleibt abschaltbar (Schalter frei)");
  ok(await bp.getByRole("switch", { name: "Türkisch" }).isDisabled().catch(() => false), "Pro: neue Sprache gesperrt");
  await bp.getByRole("switch", { name: "Polnisch" }).click();
  ok(!!(await toastText(bp, /Polnisch ist aus/)), "Pro: eine von zwei aktiven Sprachen abgeschaltet");
  const { data: accL2 } = await admin.from("accounts").select("languages").eq("id", B.accountId).single();
  ok(JSON.stringify(accL2.languages) === '["en"]', `DB: languages = ${JSON.stringify(accL2.languages)}`);
  // Editieren nach dem Herabstufen: keine kostenpflichtige Übersetzung / kein Audio mehr.
  const { data: s3Before } = await admin.from("step_translations").select("title").eq("step_id", main.stepIds[2]).eq("lang", "en").single();
  const { data: s3Hash } = await admin.from("steps").select("audio_hash").eq("id", main.stepIds[2]).single();
  ok(await renameStepViaUi(bp, main.id, "Support anrufen", "Support per Telefon anrufen"), "Pro: Schritt 3 bearbeitet");
  await sleep(20_000);
  const { data: s3After } = await admin.from("step_translations").select("title").eq("step_id", main.stepIds[2]).eq("lang", "en").single();
  const { data: s3Hash2 } = await admin.from("steps").select("audio_hash").eq("id", main.stepIds[2]).single();
  ok(s3After.title === s3Before.title, "Pro: keine Delta-Übersetzung mehr (KI-Kosten nur für Business)");
  ok(s3Hash2.audio_hash === s3Hash.audio_hash, "Pro: kein neues Vorlese-Audio");

  await admin.from("accounts").update({ plan: "free" }).eq("id", B.accountId);
  ok(await touchOrgName(bp, "Biz Probe GmbH (Gratis)"), "Tarif auf Gratis gesetzt");
  h = await visit(pub, `${BASE}/h/${B.slug}`, "Gratis: Hilfe-Seite");
  ok(h.txt.includes("Beleg hochladen") && h.txt.includes("Erstellt mit Steply"), "Gratis: Anleitung sichtbar + „Erstellt mit Steply“");
  await visit(pub, `${BASE}/h/${B.slug}/${tSlug}?lang=en`, "Gratis: Anleitung ?lang=en");
  for (const [u, l] of [
    ["/app", "Bibliothek"],
    ["/app/settings/sprachen", "Sprachen"],
    ["/app/settings/aussehen", "Aussehen"],
    [`/app/tutorials/${main.id}`, "Editor"],
    ["/app/lernen", "Schulungen"],
  ]) await visit(bp, `${BASE}${u}`, `Gratis: ${l}`);

  // Löschen räumt die öffentlichen MP3s ab.
  const { data: lastAudio } = await admin.from("steps").select("audio_path").eq("tutorial_id", main.id);
  const mp3s = lastAudio.map((s) => s.audio_path).filter(Boolean);
  mp3s.forEach((p) => extraPaths.add(p));
  ok(mp3s.length === 3 && (await storageExists(mp3s[0])), `Vor dem Löschen: ${mp3s.length} MP3s im öffentlichen Bucket`);
  await cardAction(bp, "Beleg hochladen", /Löschen/);
  await bp.getByRole("button", { name: "Endgültig löschen" }).click();
  const deleted = await waitFor(async () => {
    const { data } = await admin.from("tutorials").select("id").eq("id", main.id).maybeSingle();
    return !data;
  }, { timeout: 30_000, every: 500 });
  ok(!!deleted, "Anleitung gelöscht");
  let stillPublic = 0;
  for (const p of mp3s) if (await storageExists(p)) stillPublic++;
  ok(stillPublic === 0, `Nach dem Löschen: MP3s aus dem öffentlichen Bucket entfernt (${stillPublic} übrig)`);

  ok(pageErrors.length === 0, `Keine Browser-Laufzeitfehler${pageErrors.length ? ": " + pageErrors.slice(0, 3).join(" | ") : ""}`);
} catch (e) {
  failed++;
  console.error("✗ Abbruch:", e instanceof Error ? e.stack : e);
} finally {
  await browser.close().catch(() => {});
  // Aufräumen: öffentliche Dateien, Render-Aufträge, Konten (kaskadiert), Nutzer.
  for (const u of users) {
    const { data: tuts } = await admin.from("tutorials").select("id").eq("account_id", u.accountId);
    for (const t of tuts ?? []) {
      const { data: st } = await admin.from("steps").select("id, audio_path").eq("tutorial_id", t.id);
      for (const s of st ?? []) {
        if (s.audio_path) extraPaths.add(s.audio_path);
        extraPaths.add(`${u.accountId}/${t.id}/audio/${s.id}.mp3`);
      }
    }
    const { data: themeRow } = await admin.from("themes").select("ai_logo_path, extreme_logo_path, logo_path").eq("account_id", u.accountId).maybeSingle();
    for (const p of [themeRow?.ai_logo_path, themeRow?.extreme_logo_path, themeRow?.logo_path]) if (p) extraPaths.add(p);
    for (const dir of [`${u.accountId}/brand`, `${u.accountId}/branding`]) {
      const { data: files } = await admin.storage.from(PUBLIC_BUCKET).list(dir);
      for (const f of files ?? []) extraPaths.add(`${dir}/${f.name}`);
    }
    await admin.from("video_jobs").delete().eq("account_id", u.accountId);
  }
  const paths = [...extraPaths].filter((p) => users.some((u) => p.startsWith(`${u.accountId}/`)));
  if (paths.length) await admin.storage.from(PUBLIC_BUCKET).remove(paths).catch(() => {});
  for (const u of users) await admin.from("accounts").delete().eq("id", u.accountId);
  for (const u of users) await admin.auth.admin.deleteUser(u.userId).catch(() => {});
  const { count: leftover } = await admin.from("accounts").select("id", { count: "exact", head: true }).in("id", users.map((u) => u.accountId));
  console.log(`\n· Aufgeräumt: ${users.length} Nutzer/Konten (übrig: ${leftover ?? 0}), ${paths.length} Dateien`);
}
console.log(failed ? `\n✗ ${failed} Prüfung(en) fehlgeschlagen` : "\n✓ Business-Tarif Ende-zu-Ende verifiziert");
process.exit(failed ? 1 : 0);
