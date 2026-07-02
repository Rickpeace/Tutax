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
import {
  buildSegmentPlan,
  assembleTranslationRows,
  buildStepPlan,
  assembleStepRow,
  segmentsToPrompt,
  targetLanguageName,
  bodySegments,
} from "../src/lib/translate.ts";

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

const bodyDoc = (text) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

// --------------------------------------------------------------------------
const email = `tutax-tr-${Date.now()}@example.com`;
const pw = "Test12345!";
let accountId, userId, tutId, s1, s2, b1, internalTutId;

try {
  if (!openaiKey) throw new Error("OPENAI_API_KEY fehlt in .env.local");

  const { data: u } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  userId = u.user.id;
  accountId = (await admin.from("account_members").select("account_id").eq("user_id", userId)).data[0].account_id;

  // languages=['en']
  await admin.from("accounts").update({ languages: ["en"] }).eq("id", accountId);

  const db = createClient(url, pub, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email, password: pw });

  // Mini-Tutorial: 2 Steps, 1 Branch. Öffentlich + veröffentlicht.
  tutId = (
    await db
      .from("tutorials")
      .insert({ account_id: accountId, title: "Steuernummer beantragen", description: "So beantragen Sie Ihre Steuernummer.", status: "published", visibility: "public", slug: `tr-test-${Date.now()}` })
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
} catch (e) {
  ok(false, "Fehler: " + (e?.message ?? e));
} finally {
  if (accountId) await admin.from("accounts").delete().eq("id", accountId); // cascade: Tutorials/Steps/Branches/Translations
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Einige Übersetzungs-Checks sind fehlgeschlagen." : "\n✓ Alle Übersetzungs-Checks bestanden.");
process.exitCode = failed ? 1 : 0;
