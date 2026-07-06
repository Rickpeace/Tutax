// Live-Test Mehrsprachigkeit (Welle 13): echte Übersetzung eines Mini-Tutorials,
// stale-Logik, Delta-Sync und öffentliche RLS-Sichtbarkeit der Übersetzungen.
//
// Nutzung (WICHTIG: --experimental-strip-types, weil die geteilten Übersetzungs-
// Kernhelfer aus src/lib/translate.ts importiert werden -> exakt der Code, der
// produktiv die TipTap-Segmente extrahiert/zurückmappt):
//   node --env-file=.env.local --experimental-strip-types scripts/test-translate-live.mjs
//
// Der OpenAI-Call + Upsert hier spiegelt translate-core.translateTutorialLangCore /
// translateStepLangCore 1:1; die stale-SQL entspricht markStaleCore/clearStaleCore.
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { spawn } from "node:child_process";
import {
  buildSegmentPlan,
  assembleTranslationRows,
  buildStepPlan,
  assembleStepRow,
  segmentsToPrompt,
  targetLanguageName,
  bodySegments,
} from "../src/lib/translate.ts";

// Welle 29: Kategorien/Beschreibung/Druckansicht mehrsprachig -> HTML-Beweis vom Server.
const PORT = 3021;
const BASE = `http://localhost:${PORT}`;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const openaiKey = process.env.OPENAI_API_KEY;
const MODEL = "gpt-5.4-mini";

const admin = createClient(url, secret, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: openaiKey, timeout: 30_000, maxRetries: 1 });

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

// --- Übersetzungs-Kern (spiegelt translate-core) --------------------------
async function translateSegments(segments, lang) {
  if (!segments.length) return [];
  const target = targetLanguageName(lang);
  const system =
    `You are a professional translator. Translate each numbered segment from German into ${target}. ` +
    "Return ONLY a JSON object whose keys are the segment numbers (as strings) and whose values are " +
    'the translations, e.g. {"1":"…","2":"…"}. Translate every provided number.';
  const res = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: segmentsToPrompt(segments) },
    ],
  });
  const raw = res.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);
  return segments.map((_s, i) => {
    const v = parsed[String(i + 1)];
    return typeof v === "string" && v.trim() ? v : null;
  });
}

async function translateTutorialLang(db, tutorialId, source, lang) {
  const plan = buildSegmentPlan(source);
  const translated = plan.segments.length ? await translateSegments(plan.segments, lang) : [];
  const rows = assembleTranslationRows(source, plan, translated);
  await db.from("tutorial_translations").upsert(
    { tutorial_id: tutorialId, lang, title: rows.tutorial.title, description: rows.tutorial.description, stale: false, updated_at: new Date().toISOString() },
    { onConflict: "tutorial_id,lang" },
  );
  if (rows.steps.length)
    await db.from("step_translations").upsert(
      rows.steps.map((s) => ({ step_id: s.step_id, lang, title: s.title, body: s.body })),
      { onConflict: "step_id,lang" },
    );
  if (rows.branches.length)
    await db.from("branch_translations").upsert(
      rows.branches.map((b) => ({ branch_id: b.branch_id, lang, label: b.label })),
      { onConflict: "branch_id,lang" },
    );
}

async function translateStepLang(db, step, lang) {
  const plan = buildStepPlan(step);
  const translated = plan.segments.length ? await translateSegments(plan.segments, lang) : [];
  const row = assembleStepRow(step, plan, translated);
  await db.from("step_translations").upsert(
    { step_id: row.step_id, lang, title: row.title, body: row.body },
    { onConflict: "step_id,lang" },
  );
}

// markStaleCore / clearStaleCore (identische SQL)
const markStale = (db, id) =>
  db.from("tutorial_translations").update({ stale: true }).eq("tutorial_id", id).eq("stale", false);
const clearStale = (db, id) =>
  db.from("tutorial_translations").update({ stale: false, updated_at: new Date().toISOString() }).eq("tutorial_id", id);

// translateAccountCategoriesCore (spiegelt src/lib/translate-core.ts, Welle 29). Nur
// account-eigene Kategorien; _src merkt sich den deutschen Namen (Veraltungserkennung).
async function translateCategories(db, accountId, languages) {
  const { data: cats } = await db
    .from("categories")
    .select("id, name, name_i18n")
    .eq("account_id", accountId);
  const rows = (cats ?? []).filter((c) => typeof c.name === "string" && c.name.trim());
  const srcOf = (c) =>
    c.name_i18n && typeof c.name_i18n === "object" ? c.name_i18n._src : undefined;
  const needs = (c, l) => srcOf(c) !== c.name || !(typeof c.name_i18n?.[l] === "string" && c.name_i18n[l].trim());
  const work = rows.filter((c) => languages.some((l) => needs(c, l)));
  const fresh = new Map();
  for (const lang of languages) {
    const subset = work.filter((c) => needs(c, lang));
    if (!subset.length) continue;
    const tr = await translateSegments(subset.map((c) => c.name), lang);
    subset.forEach((c, i) => {
      if (tr[i]) {
        const m = fresh.get(c.id) ?? {};
        m[lang] = tr[i];
        fresh.set(c.id, m);
      }
    });
  }
  let updated = 0;
  for (const c of work) {
    const keep = srcOf(c) === c.name && c.name_i18n && typeof c.name_i18n === "object" ? c.name_i18n : {};
    const next = { _src: c.name };
    for (const lang of languages) next[lang] = fresh.get(c.id)?.[lang] || keep[lang] || c.name;
    await db.from("categories").update({ name_i18n: next }).eq("id", c.id);
    updated++;
  }
  return updated;
}

// Next-Dev-Server hochfahren + auf Bereitschaft warten (statische Route, ohne Hub-Cache).
async function waitForServer(timeoutMs = 120_000) {
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

// HTML einer Seite holen; auf den ersten Turbopack-Compile der Route warten (Retry).
// Der erste Treffer einer Route kann in der Dev-Kompilierung 30–60 s dauern -> großzügig.
async function getHtml(path, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}${path}`);
      const html = r.status === 200 ? await r.text() : "";
      // „Fertig“ = enthält das <main>-Gerüst (nicht nur eine Zwischen-/Fehlerantwort).
      if (r.status === 200 && html.includes("<main")) return html;
    } catch {
      /* Route kompiliert noch */
    }
    await new Promise((res) => setTimeout(res, 2500));
  }
  return "";
}

const bodyDoc = (text) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

// --------------------------------------------------------------------------
const email = `tutax-tr-${Date.now()}@example.com`;
const pw = "Test12345!";
let accountId, userId, tutId, s1, s2, b1, internalTutId, server, catId, accSlug, tutSlug;

try {
  if (!openaiKey) throw new Error("OPENAI_API_KEY fehlt in .env.local");

  const { data: u } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  userId = u.user.id;
  accountId = (await admin.from("account_members").select("account_id").eq("user_id", userId)).data[0].account_id;

  // languages=['en']
  await admin.from("accounts").update({ languages: ["en"] }).eq("id", accountId);
  accSlug = (await admin.from("accounts").select("slug").eq("id", accountId).single()).data.slug;

  const db = createClient(url, pub, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email, password: pw });

  // Mini-Tutorial: 2 Steps, 1 Branch. Öffentlich + veröffentlicht.
  tutSlug = `tr-test-${Date.now()}`;
  tutId = (
    await db
      .from("tutorials")
      .insert({ account_id: accountId, title: "Steuernummer beantragen", description: "So beantragen Sie Ihre Steuernummer.", status: "published", visibility: "public", slug: tutSlug })
      .select("id")
      .single()
  ).data.id;
  s1 = (await db.from("steps").insert({ tutorial_id: tutId, title: "Formular öffnen", body: bodyDoc("Öffnen Sie das Formular im Portal."), position: 1 }).select("id").single()).data.id;
  s2 = (await db.from("steps").insert({ tutorial_id: tutId, title: "Angaben prüfen", body: bodyDoc("Prüfen Sie Ihre Angaben sorgfältig."), position: 2 }).select("id").single()).data.id;
  await db.from("tutorials").update({ root_step_id: s1 }).eq("id", tutId);
  b1 = (await db.from("step_branches").insert({ step_id: s1, label: "Weiter", target_step_id: s2, position: 0 }).select("id").single()).data.id;

  // --- 1. Volle Übersetzung (echte Kernhelfer + OpenAI) ---
  const source = {
    title: "Steuernummer beantragen",
    description: "So beantragen Sie Ihre Steuernummer.",
    steps: [
      { id: s1, title: "Formular öffnen", body: bodyDoc("Öffnen Sie das Formular im Portal.") },
      { id: s2, title: "Angaben prüfen", body: bodyDoc("Prüfen Sie Ihre Angaben sorgfältig.") },
    ],
    branches: [{ id: b1, label: "Weiter", step_id: s1 }],
  };
  await translateTutorialLang(admin, tutId, source, "en");

  const tt = (await admin.from("tutorial_translations").select("*").eq("tutorial_id", tutId).eq("lang", "en")).data;
  ok(tt?.length === 1 && !!tt[0].title && tt[0].stale === false, `tutorial_translations: 1 Zeile, stale=false, Titel="${tt?.[0]?.title}"`);
  const st = (await admin.from("step_translations").select("*").eq("lang", "en").in("step_id", [s1, s2])).data;
  ok(st?.length === 2, `step_translations: 2 Zeilen (${st?.length})`);
  // TipTap-Struktur muss erhalten sein (doc>paragraph>text), nur Text übersetzt.
  const st1 = st?.find((r) => r.step_id === s1);
  const seg = st1 ? bodySegments(st1.body) : [];
  ok(st1?.body?.type === "doc" && seg.length === 1 && seg[0] !== "Öffnen Sie das Formular im Portal.", `step_translations body: Struktur erhalten, Text übersetzt ("${seg[0]}")`);
  const bt = (await admin.from("branch_translations").select("*").eq("lang", "en").eq("branch_id", b1)).data;
  ok(bt?.length === 1 && !!bt[0].label, `branch_translations: 1 Zeile, Label="${bt?.[0]?.label}"`);

  // --- 2. stale-Logik: echter Edit-Pfad (markStale) ---
  await db.from("steps").update({ title: "Formular aufrufen", body: bodyDoc("Rufen Sie das Formular im Steuerportal auf.") }).eq("id", s1);
  await markStale(admin, tutId);
  const afterEdit = (await admin.from("tutorial_translations").select("stale").eq("tutorial_id", tutId).eq("lang", "en")).data;
  ok(afterEdit?.[0]?.stale === true, "stale=true nach Edit am Original");

  // --- 3. Delta-Sync: nur den geänderten Schritt neu übersetzen -> stale=false ---
  const before = st1 ? bodySegments(st1.body)[0] : null;
  await translateStepLang(admin, { id: s1, title: "Formular aufrufen", body: bodyDoc("Rufen Sie das Formular im Steuerportal auf.") }, "en");
  await clearStale(admin, tutId);
  const afterDelta = (await admin.from("tutorial_translations").select("stale").eq("tutorial_id", tutId).eq("lang", "en")).data;
  ok(afterDelta?.[0]?.stale === false, "stale=false nach Delta-Übersetzung");
  const st1New = (await admin.from("step_translations").select("body, title").eq("step_id", s1).eq("lang", "en").single()).data;
  const afterSeg = bodySegments(st1New.body)[0];
  ok(!!afterSeg && afterSeg !== before, `Delta: übersetzter Steptext geändert ("${before}" -> "${afterSeg}")`);

  // --- 4. Anon liest Übersetzungen des published+public Tutorials ---
  const anon = createClient(url, pub, { auth: { persistSession: false } });
  const anonTut = (await anon.from("tutorial_translations").select("title").eq("tutorial_id", tutId).eq("lang", "en")).data;
  ok(anonTut?.length === 1, "RLS: anon liest Übersetzung (published+public)");
  const anonStep = (await anon.from("step_translations").select("title").in("step_id", [s1, s2]).eq("lang", "en")).data;
  ok(anonStep?.length === 2, "RLS: anon liest Schritt-Übersetzungen");
  const anonBranch = (await anon.from("branch_translations").select("label").eq("branch_id", b1).eq("lang", "en")).data;
  ok(anonBranch?.length === 1, "RLS: anon liest Branch-Übersetzung");

  // --- 5. Gegenprobe: internes Tutorial -> anon sieht Übersetzungen NICHT ---
  internalTutId = (
    await db
      .from("tutorials")
      .insert({ account_id: accountId, title: "Intern", description: null, status: "published", visibility: "internal", slug: `tr-int-${Date.now()}` })
      .select("id")
      .single()
  ).data.id;
  const is1 = (await db.from("steps").insert({ tutorial_id: internalTutId, title: "Interner Schritt", body: bodyDoc("Nur fürs Team."), position: 1 }).select("id").single()).data.id;
  await translateTutorialLang(admin, internalTutId, { title: "Intern", description: null, steps: [{ id: is1, title: "Interner Schritt", body: bodyDoc("Nur fürs Team.") }], branches: [] }, "en");
  const anonInt = (await anon.from("tutorial_translations").select("title").eq("tutorial_id", internalTutId).eq("lang", "en")).data;
  ok(anonInt?.length === 0, "RLS: anon sieht Übersetzung interner Tutorials NICHT");
  const anonIntStep = (await anon.from("step_translations").select("title").eq("step_id", is1).eq("lang", "en")).data;
  ok(anonIntStep?.length === 0, "RLS: anon sieht interne Schritt-Übersetzungen NICHT");

  // ===== 6. Kategorie-Übersetzung (Welle 29) =====
  catId = (
    await admin.from("categories").insert({ account_id: accountId, name: "Steuer-Grundlagen", position: 0 }).select("id").single()
  ).data.id;
  await admin.from("tutorials").update({ category_id: catId }).eq("id", tutId);
  // s1 zur Entscheidung machen -> Druckansicht zeigt „Wenn … → weiter mit Schritt N".
  await admin.from("steps").update({ is_decision: true }).eq("id", s1);

  const catUpdated = await translateCategories(admin, accountId, ["en"]);
  ok(catUpdated === 1, `Kategorie-Übersetzung: 1 Kategorie aktualisiert (${catUpdated})`);
  const catRow = (await admin.from("categories").select("name, name_i18n").eq("id", catId).single()).data;
  const catEn = catRow?.name_i18n?.en;
  ok(catRow?.name_i18n?._src === "Steuer-Grundlagen", `name_i18n._src = deutscher Name ("${catRow?.name_i18n?._src}")`);
  ok(
    typeof catEn === "string" && catEn.trim() && catEn !== "Steuer-Grundlagen",
    `name_i18n.en gefüllt + übersetzt ("${catEn}")`,
  );
  // Idempotenz: erneuter Lauf ohne Änderung -> 0 Updates (kein OpenAI-Call).
  const catAgain = await translateCategories(admin, accountId, ["en"]);
  ok(catAgain === 0, `Kategorie-Übersetzung idempotent: 0 Updates beim 2. Lauf (${catAgain})`);

  // ===== 7. Beschreibung-Delta (wie setTutorialDescription -> translateTitleDelta) =====
  const newDesc = "Alles rund um Ihre persönliche Steuernummer.";
  await admin.from("tutorials").update({ description: newDesc }).eq("id", tutId);
  await markStale(admin, tutId);
  const titleNow = (await admin.from("tutorials").select("title").eq("id", tutId).single()).data.title;
  const descSegs = await translateSegments([titleNow, newDesc], "en"); // Delta: Titel + Beschreibung
  await admin.from("tutorial_translations").upsert(
    { tutorial_id: tutId, lang: "en", title: descSegs[0] ?? titleNow, description: descSegs[1] ?? newDesc, stale: false, updated_at: new Date().toISOString() },
    { onConflict: "tutorial_id,lang" },
  );
  const descRow = (await admin.from("tutorial_translations").select("title, description, stale").eq("tutorial_id", tutId).eq("lang", "en").single()).data;
  ok(descRow?.stale === false, "Beschreibung-Delta: stale=false nach Delta");
  ok(
    descRow?.description && descRow.description !== newDesc,
    `Beschreibung übersetzt ("${descRow?.description}")`,
  );

  // ===== 8. HTML-Beweis: DE/EN-Hub + Druckansicht (Welle 29) =====
  console.log("… Next-Server auf Port", PORT, "wird gestartet (kann einen Moment dauern) …");
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
    shell: true,
  });
  const up = await waitForServer();
  ok(up, "Server erreichbar");
  if (up) {
    const enTitle = descRow?.title;
    const hubDe = await getHtml(`/h/${accSlug}`);
    const hubEn = await getHtml(`/h/${accSlug}?lang=en`);
    const prDe = await getHtml(`/h/${accSlug}/${tutSlug}/drucken`);
    const prEn = await getHtml(`/h/${accSlug}/${tutSlug}/drucken?lang=en`);
    ok(hubEn.length > 0 && prEn.length > 0, "Hub/Druck-HTML abrufbar (200)");

    // Kategorie: DE deutscher Name, EN übersetzter Name (deutscher NICHT auf EN).
    ok(hubDe.includes("Steuer-Grundlagen"), "Hub DE zeigt deutschen Kategorienamen");
    ok(
      !!catEn && hubEn.includes(catEn) && !hubEn.includes("Steuer-Grundlagen"),
      `Hub EN zeigt übersetzten Kategorienamen ("${catEn}")`,
    );
    // Beschreibung: DE deutsche, EN übersetzte (deutsche NICHT auf EN).
    ok(hubDe.includes(newDesc), "Hub DE zeigt deutsche Beschreibung");
    ok(
      hubEn.includes(descRow.description) && !hubEn.includes(newDesc),
      "Hub EN zeigt übersetzte Beschreibung (nicht die deutsche)",
    );
    ok(hubEn.includes(enTitle), `Hub EN zeigt übersetzten Titel ("${enTitle}")`);
    ok(!hubEn.includes("Sonstiges"), "Hub EN: kein deutsches „Sonstiges“ in der UI");

    // Druckansicht: EN übersetzter Titel + KEIN deutsches „Wenn“; DE zeigt „Wenn … →
    // weiter mit Schritt N“. (React trennt Textknoten mit <!-- -->, daher ohne festes
    // Trennzeichen prüfen.)
    ok(
      prDe.includes("Wenn") && prDe.includes("weiter mit Schritt"),
      "Druck DE enthält „Wenn … → weiter mit Schritt N“ (deutsche Verzweigung)",
    );
    ok(prEn.includes(enTitle), `Druck EN enthält übersetzten Titel ("${enTitle}")`);
    ok(!prEn.includes("Wenn"), "Druck EN enthält KEIN deutsches „Wenn“");
    ok(prEn.includes("continue with step"), "Druck EN nutzt englische Verzweigungs-Beschriftung");

    // Regression: DE-Hub/-Druck unverändert deutsch.
    ok(hubDe.includes("Steuernummer beantragen"), "Regression: Hub DE zeigt deutschen Titel");
    ok(!hubDe.includes(catEn), "Regression: Hub DE zeigt NICHT die EN-Kategorie");
  }
} catch (e) {
  ok(false, "Fehler: " + (e?.stack ?? e?.message ?? e));
} finally {
  if (accountId) await admin.from("accounts").delete().eq("id", accountId); // cascade: Tutorials/Steps/Branches/Translations/Kategorien
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (server && server.pid) {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore", shell: true });
      } else {
        process.kill(-server.pid, "SIGKILL");
      }
    } catch {
      try { server.kill("SIGKILL"); } catch {}
    }
  }
}

console.log(failed ? "\n✗ Einige Übersetzungs-Checks sind fehlgeschlagen." : "\n✓ Alle Übersetzungs-Checks bestanden.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);
