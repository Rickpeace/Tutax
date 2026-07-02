// Verifiziert die RLS-Absicherung interner Tutorials (Welle 10b) gegen das echte
// Supabase-Projekt: ein internes, veröffentlichtes Tutorial darf NIE über die anon-
// REST-API (publishable key, kein Login) sichtbar sein — Mitglieder sehen es.
// Nutzung:  node --env-file=.env.local scripts/test-internal-rls.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

const admin = createClient(url, secret, { auth: { persistSession: false } });

let failed = false;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed = true;
};

const stamp = Date.now();
const email = `tutax-internal-${stamp}@example.com`;
const pw = "Test12345!";
let accountId, userId, tutId, stepId;

try {
  // --- Mitglied + Konto (via Signup-Trigger) ---
  const { data: u } = await admin.auth.admin.createUser({
    email,
    password: pw,
    email_confirm: true,
  });
  userId = u?.user?.id;
  const { data: mem } = await admin
    .from("account_members")
    .select("account_id")
    .eq("user_id", userId);
  accountId = mem?.[0]?.account_id;
  ok(!!accountId, "Konto via Trigger angelegt");

  // --- Internes, veröffentlichtes Tutorial + Schritt (als Owner) ---
  const member = createClient(url, pub, { auth: { persistSession: false } });
  await member.auth.signInWithPassword({ email, password: pw });

  const { data: tut, error: te } = await member
    .from("tutorials")
    .insert({
      account_id: accountId,
      title: "Interne Anleitung (RLS-Test)",
      visibility: "internal",
      status: "published",
    })
    .select("id")
    .single();
  ok(!te && !!tut, `Internes Tutorial angelegt ${te ? "(" + te.message + ")" : ""}`);
  tutId = tut?.id;

  const { data: step, error: se } = await member
    .from("steps")
    .insert({ tutorial_id: tutId, title: "Schritt 1", position: 0 })
    .select("id")
    .single();
  ok(!se && !!step, `Schritt angelegt ${se ? "(" + se.message + ")" : ""}`);
  stepId = step?.id;

  // --- anon (kein Login) darf NICHTS sehen ---
  const anon = createClient(url, pub, { auth: { persistSession: false } });
  const { data: anonTut, error: anonTutErr } = await anon
    .from("tutorials")
    .select("id")
    .eq("id", tutId);
  ok(!anonTutErr, `anon REST erreichbar ${anonTutErr ? "(" + anonTutErr.message + ")" : ""}`);
  ok(anonTut?.length === 0, "RLS: anon sieht internes (published) Tutorial NICHT");

  const { data: anonStep } = await anon.from("steps").select("id").eq("id", stepId);
  ok(anonStep?.length === 0, "RLS: anon sieht Schritte des internen Tutorials NICHT");

  // --- Kontrolle: dasselbe Tutorial auf public → anon sieht es (Gegenprobe) ---
  await member.from("tutorials").update({ visibility: "public", slug: `rls-test-${stamp}` }).eq("id", tutId);
  const { data: anonPub } = await anon.from("tutorials").select("id").eq("id", tutId);
  ok(anonPub?.length === 1, "Gegenprobe: anon sieht öffentliches Tutorial");
  const { data: anonPubStep } = await anon.from("steps").select("id").eq("id", stepId);
  ok(anonPubStep?.length === 1, "Gegenprobe: anon sieht Schritte des öffentlichen Tutorials");
  await member.from("tutorials").update({ visibility: "internal" }).eq("id", tutId);

  // --- Mitglied sieht das interne Tutorial + Schritte ---
  const { data: memTut } = await member.from("tutorials").select("id").eq("id", tutId);
  ok(memTut?.length === 1, "Mitglied sieht internes Tutorial");
  const { data: memStep } = await member.from("steps").select("id").eq("id", stepId);
  ok(memStep?.length === 1, "Mitglied sieht Schritte des internen Tutorials");

  // --- Schulungsnachweis: Mitglied setzt Haken für SICH ---
  const { error: cErr } = await member.from("tutorial_completions").insert({
    tutorial_id: tutId,
    user_id: userId,
    account_id: accountId,
  });
  ok(!cErr, `Mitglied setzt eigenen Absolviert-Haken ${cErr ? "(" + cErr.message + ")" : ""}`);
  const { data: comp } = await member
    .from("tutorial_completions")
    .select("id")
    .eq("tutorial_id", tutId)
    .eq("user_id", userId);
  ok(comp?.length === 1, "Nachweis kontoweit lesbar (Mitglied)");
} catch (err) {
  ok(false, `Unerwarteter Fehler: ${err.message}`);
} finally {
  if (tutId) await admin.from("tutorials").delete().eq("id", tutId);
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(
  failed
    ? "\n✗ Einige Checks sind fehlgeschlagen."
    : "\n✓ RLS für interne Tutorials verifiziert.",
);
process.exitCode = failed ? 1 : 0;
