// Chatbot-Index bleibt synchron mit den echten Inhalten (Befund 22.09.2026).
// Echter Login gegen die echte DB (Wegwerf-Konto, wird am Ende gelöscht), Dev-Server lokal.
// Prüft:
//   - Veröffentlichen indiziert; Bearbeiten einer VERÖFFENTLICHTEN Anleitung zieht den Index
//     nach (neuer Text drin, alter raus, keine Duplikate) und der Chatbot antwortet damit
//   - ohne konfigurierte Eskalation verspricht der Bot keine Weiterleitung
//   - Zurückziehen leert den Index
//   - Migration 0040 (falls eingespielt): paralleles replace_kb_source ohne Duplikate,
//     Löschen an der App vorbei / Artikel auf Entwurf leert den Index (Trigger), anon gesperrt
//
// Nutzung:  node --env-file=.env.local scripts/test-kb-sync-e2e.mjs
import { createRequire } from "node:module";
import { existsSync, readdirSync, openSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const PORT = 3031;
const BASE = `http://localhost:${PORT}`;
const PW = "Test12345!";
const stamp = String(process.hrtime.bigint()).slice(-8);
const email = `tutax-kbsync-${stamp}@example.com`;

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

async function dbWait(tutorialId, col, expected, tries = 25) {
  let val;
  for (let i = 0; i < tries; i++) {
    const { data } = await admin.from("tutorials").select(col).eq("id", tutorialId).single();
    val = data?.[col];
    if (val === expected) return val;
    await sleep(600);
  }
  return val;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

const embeddings = async (sourceId) =>
  (await admin.from("kb_embeddings").select("id, chunk").eq("source_id", sourceId)).data ?? [];

/** Wartet, bis der Chatbot-Index die Bedingung erfüllt (Reindex läuft im Hintergrund via after()). */
async function embWait(sourceId, pred, tries = 40) {
  let rows = [];
  for (let i = 0; i < tries; i++) {
    rows = await embeddings(sourceId);
    if (pred(rows)) return rows;
    await sleep(750);
  }
  return rows;
}

/** Chat-API lokal fragen; liefert { answer, meta }. */
async function ask(slug, question) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountSlug: slug, question }),
  });
  let answer = "";
  let meta = null;
  for (const line of (await r.text()).split("\n").filter(Boolean)) {
    const o = JSON.parse(line);
    if (o.delta) answer += o.delta;
    if (o.answer) answer += o.answer;
    if (o.meta) meta = o.meta;
  }
  return { answer, meta };
}

let server, browser, userId, accountId;
try {
  const created = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const { data: members } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = members[0].account_id;
  const slug = `kbsync-${stamp}`;
  // Eskalation bewusst AUS: der Bot darf dann keine Weiterleitung versprechen.
  const { error: aErr } = await admin
    .from("accounts")
    .update({ name: "Chatbot-Sync Test GmbH", slug, onboarded: true, plan: "business", escalation: { enabled: false } })
    .eq("id", accountId);
  if (aErr) throw aErr;

  const { data: tut, error: tErr } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title: "Belege hochladen", status: "draft", visibility: "public" })
    .select("id")
    .single();
  if (tErr) throw tErr;
  const tutorialId = tut.id;
  const { data: stepRows, error: sErr } = await admin
    .from("steps")
    .insert(
      ["App öffnen", "Kamera antippen", "Beleg absenden"].map((title, i) => ({
        tutorial_id: tutorialId,
        position: i + 1,
        title,
        is_decision: false,
      })),
    )
    .select("id, position");
  if (sErr) throw sErr;
  const ids = stepRows.sort((a, b) => a.position - b.position).map((s) => s.id);
  await admin.from("tutorials").update({ root_step_id: ids[0] }).eq("id", tutorialId);
  await admin.from("step_branches").insert(
    ids.slice(0, -1).map((id, i) => ({ step_id: id, label: null, target_step_id: ids[i + 1], position: 0 })),
  );

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: path.join(__dirname, ".."),
    shell: true,
    // KBSYNC_LOG=<datei>: Server-Ausgabe mitschreiben (Fehlersuche).
    stdio: process.env.KBSYNC_LOG ? ["ignore", openSync(process.env.KBSYNC_LOG, "w"), openSync(process.env.KBSYNC_LOG, "a")] : "ignore",
  });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const { chromium } = resolvePlaywright();
  browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  await login(page);
  await page.goto(`${BASE}/app/tutorials/${tutorialId}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  const controls = page.getByTestId("editor-controls");
  await controls.waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1200); // Hydration

  // 1) Veröffentlichen -> indiziert.
  await controls.getByTestId("publish-button").click(); // Welle 54: Knopf statt Schalter
  ok((await dbWait(tutorialId, "status", "published")) === "published", "Veröffentlicht (DB)");
  let rows = await embWait(tutorialId, (r) => r.some((x) => x.chunk.includes("Kamera antippen")));
  ok(rows.some((x) => x.chunk.includes("Kamera antippen")), `Beim Veröffentlichen indiziert (${rows.length} Ausschnitte)`);

  // 2) Schritt einer VERÖFFENTLICHTEN Anleitung umbenennen -> Chatbot kennt den neuen Text.
  const NEW = "Quokka-Scanner starten";
  await page.locator("main").last().getByText("Kamera antippen").first().click();
  const saveState = page.getByTestId("step-save-state");
  await saveState.waitFor({ timeout: 20_000 });
  await page.locator("#step-title").fill(NEW);
  await saveState.getByRole("button", { name: /Speichern/ }).click();
  await saveState.getByText("Gespeichert").waitFor({ timeout: 20_000 });
  const { data: saved } = await admin.from("steps").select("title").eq("id", ids[1]).single();
  ok(saved?.title === NEW, `Schritt gespeichert (DB: „${saved?.title}“)`);
  rows = await embWait(
    tutorialId,
    (r) => r.some((x) => x.chunk.includes(NEW)) && !r.some((x) => x.chunk.includes("Kamera antippen")),
  );
  ok(rows.some((x) => x.chunk.includes(NEW)), "Nach Bearbeiten: neuer Schritttext im Chatbot-Index");
  ok(!rows.some((x) => x.chunk.includes("Kamera antippen")), "Nach Bearbeiten: alter Schritttext aus dem Index verschwunden");
  await sleep(3000); // evtl. nachlaufende Reindexe abwarten
  rows = await embeddings(tutorialId);
  ok(rows.length === 4, `Keine Duplikate (${rows.length} Ausschnitte, erwartet 4)`);

  const a1 = await ask(slug, "Was muss ich nach dem Öffnen der App tun, um einen Beleg hochzuladen?");
  ok(/quokka/i.test(a1.answer), `Chatbot antwortet mit dem neuen Text („${a1.answer.slice(0, 140)}“)`);
  ok(!!a1.meta?.sources?.[0]?.slug, "Chatbot verlinkt die Anleitung");

  // 3) Keine Weiterleitung versprechen, wenn keine konfiguriert ist (Live-Befund 22.09.:
  //    „kann ich Ihre Frage an eine zuständige Person weitergeben" ohne Kontaktbox).
  const Q_UNKNOWN = "Wie hoch ist mein Grundfreibetrag 2026 bei Ehegattensplitting?";
  const PROMISE = /weiterge|weiterleit|zuständige person|rückruf|informiere|melden sich|kontaktieren wir/i;
  for (let i = 0; i < 2; i++) {
    const a2 = await ask(slug, Q_UNKNOWN);
    console.log(`   ohne Kontakt (status=${a2.meta?.status}): „${a2.answer}“`);
    ok(a2.meta?.status === "no_answer", "Unbekannte Fachfrage als no_answer erkannt");
    ok(!PROMISE.test(a2.answer), "Ohne Kontakt: keine Weiterleitungs-Zusage");
    ok(a2.meta?.escalation == null, "Ohne Kontakt: keine Kontaktbox");
  }
  // Gegenprobe: mit hinterlegtem Kontakt erscheint die Kontaktbox.
  await admin
    .from("accounts")
    .update({ escalation: { enabled: true, email: "hilfe@example.com" } })
    .eq("id", accountId);
  const a3 = await ask(slug, Q_UNKNOWN);
  console.log(`   mit Kontakt (status=${a3.meta?.status}): „${a3.answer}“`);
  ok(a3.meta?.status === "no_answer" && a3.meta?.escalation?.methods?.[0]?.value === "mailto:hilfe@example.com", "Mit Kontakt: Kontaktbox mit E-Mail");
  ok(!/hilfe@example\.com/.test(a3.answer), "Mit Kontakt: KI nennt die Adresse nicht selbst (steht in der Box)");

  // 4) Zurückziehen über die UI -> Index leer.
  await controls.getByTestId("editor-more").click(); // Welle 54: „Zurück auf Entwurf“ im „…“-Menü
  await page.getByTestId("unpublish").click();
  ok((await dbWait(tutorialId, "status", "draft")) === "draft", "Zurückgezogen (DB)");
  rows = await embWait(tutorialId, (r) => r.length === 0);
  ok(rows.length === 0, "Zurückgezogen: Chatbot-Index leer");

  // 5) DB-Absicherung (Migration 0040).
  const probe = await admin.rpc("replace_kb_source", {
    p_account: accountId,
    p_source_type: "tutorial",
    p_source_id: tutorialId,
    p_rows: [],
  });
  if (probe.error?.code === "PGRST202") {
    console.log("· Migration 0040 noch nicht eingespielt – DB-Prüfungen übersprungen");
  } else {
    const vec = JSON.stringify(Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)));
    const put = (sourceType, sourceId, n) =>
      admin.rpc("replace_kb_source", {
        p_account: accountId,
        p_source_type: sourceType,
        p_source_id: sourceId,
        p_rows: Array.from({ length: n }, (_, i) => ({ chunk: `c${i}`, embedding: vec, metadata: {} })),
      });
    // Entwurf (Stand nach Schritt 4): replace_kb_source schreibt NICHTS (Race-Schutz).
    await put("tutorial", tutorialId, 3);
    ok((await embeddings(tutorialId)).length === 0, "Entwurf: replace_kb_source schreibt keinen Index");
    await admin.from("tutorials").update({ status: "published" }).eq("id", tutorialId);
    // Parallele Reindexe: am Ende genau EIN Satz Zeilen, nie eine Summe.
    const res = await Promise.all([1, 2, 3, 4].map(() => put("tutorial", tutorialId, 3)));
    ok(res.every((r) => !r.error), "replace_kb_source parallel ohne Fehler");
    const n = (await embeddings(tutorialId)).length;
    ok(n === 3, `Parallele Reindexe ohne Duplikate (${n}, erwartet 3)`);
    await admin.from("tutorials").delete().eq("id", tutorialId);
    ok((await embeddings(tutorialId)).length === 0, "Anleitung per Skript gelöscht: Index automatisch leer (Trigger)");

    const { data: art } = await admin
      .from("kb_articles")
      .insert({ account_id: accountId, title: "Öffnungszeiten", status: "published" })
      .select("id")
      .single();
    await put("kb_article", art.id, 1);
    await admin.from("kb_articles").update({ status: "draft" }).eq("id", art.id);
    ok((await embeddings(art.id)).length === 0, "Wissensartikel auf Entwurf: Index automatisch leer (Trigger)");

    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    const anonTry = await anon.rpc("replace_kb_source", {
      p_account: accountId,
      p_source_type: "kb_article",
      p_source_id: art.id,
      p_rows: [],
    });
    ok(!!anonTry.error, "Anonym darf replace_kb_source nicht aufrufen");
  }
} catch (e) {
  console.error("✗ Abbruch:", e instanceof Error ? e.message : e);
  failed = true;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { shell: true });
    else server.kill("SIGTERM");
  }
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Chatbot-Sync: Fehler" : "\n✓ Chatbot-Sync live verifiziert.");
process.exit(failed ? 1 : 0);
