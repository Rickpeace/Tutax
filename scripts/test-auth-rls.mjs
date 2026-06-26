// Verifiziert Signup-Trigger + RLS gegen das echte Supabase-Projekt.
// Nutzung:  node --env-file=.env.local scripts/test-auth-rls.mjs
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
const emailA = `tutax-test-a-${stamp}@example.com`;
const emailB = `tutax-test-b-${stamp}@example.com`;
const pw = "Test12345!";
let accountA, accountB, userAId, userBId, tutId;

try {
  // --- 1. User A anlegen (löst Trigger aus) ---
  const { data: ua, error: ea } = await admin.auth.admin.createUser({
    email: emailA,
    password: pw,
    email_confirm: true,
  });
  ok(!ea && !!ua?.user, `User A angelegt ${ea ? "(" + ea.message + ")" : ""}`);
  userAId = ua?.user?.id;

  // --- 2. Trigger-Wirkung prüfen ---
  const { data: mem } = await admin
    .from("account_members")
    .select("account_id, role")
    .eq("user_id", userAId);
  ok(
    mem?.length === 1 && mem[0].role === "owner",
    "Trigger: account_members (owner) angelegt",
  );
  accountA = mem?.[0]?.account_id;

  const { data: acc } = await admin
    .from("accounts")
    .select("id, slug")
    .eq("id", accountA);
  ok(acc?.length === 1, `Trigger: account angelegt (slug=${acc?.[0]?.slug})`);

  const { data: thm } = await admin
    .from("themes")
    .select("account_id, status")
    .eq("account_id", accountA);
  ok(thm?.length === 1 && thm[0].status === "draft", "Trigger: theme angelegt");

  // --- 3. User A Session + Owner-CRUD ---
  const userA = createClient(url, pub, { auth: { persistSession: false } });
  const { error: se } = await userA.auth.signInWithPassword({
    email: emailA,
    password: pw,
  });
  ok(!se, `User A Login ${se ? "(" + se.message + ")" : ""}`);

  const { data: tut, error: te } = await userA
    .from("tutorials")
    .insert({ account_id: accountA, title: "Test-Tutorial" })
    .select()
    .single();
  ok(!te && !!tut, `RLS: User A legt eigenes Tutorial an ${te ? "(" + te.message + ")" : ""}`);
  tutId = tut?.id;

  const { data: rd } = await userA.from("tutorials").select("id").eq("id", tutId);
  ok(rd?.length === 1, "RLS: User A liest eigenes Tutorial");

  // --- 4. Anonymer Zugriff (öffentlicher Viewer-Pfad) ---
  const anon = createClient(url, pub, { auth: { persistSession: false } });
  const { data: anonDraft, error: anonErr } = await anon
    .from("tutorials")
    .select("id")
    .eq("id", tutId);
  ok(!anonErr, `anon REST erreichbar ${anonErr ? "(" + anonErr.message + ")" : ""}`);
  ok(anonDraft?.length === 0, "RLS: anon sieht Entwurf NICHT");

  await userA.from("tutorials").update({ status: "published" }).eq("id", tutId);
  const { data: anonPub } = await anon.from("tutorials").select("id").eq("id", tutId);
  ok(anonPub?.length === 1, "RLS: anon sieht veröffentlichtes Tutorial");
  await userA.from("tutorials").update({ status: "draft" }).eq("id", tutId);

  // --- 5. Mandanten-Isolation (User B) ---
  const { data: ub } = await admin.auth.admin.createUser({
    email: emailB,
    password: pw,
    email_confirm: true,
  });
  userBId = ub?.user?.id;
  const { data: memB } = await admin
    .from("account_members")
    .select("account_id")
    .eq("user_id", userBId);
  accountB = memB?.[0]?.account_id;

  const userB = createClient(url, pub, { auth: { persistSession: false } });
  await userB.auth.signInWithPassword({ email: emailB, password: pw });

  const { data: bSees } = await userB.from("tutorials").select("id").eq("id", tutId);
  ok(bSees?.length === 0, "RLS: User B sieht fremden Entwurf NICHT");

  const { error: bIns } = await userB
    .from("tutorials")
    .insert({ account_id: accountA, title: "hack" });
  ok(!!bIns, "RLS: User B kann NICHT in fremden Account schreiben");
} catch (err) {
  ok(false, `Unerwarteter Fehler: ${err.message}`);
} finally {
  // --- Cleanup ---
  if (accountA) await admin.from("accounts").delete().eq("id", accountA);
  if (accountB) await admin.from("accounts").delete().eq("id", accountB);
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
}

console.log(
  failed
    ? "\n✗ Einige Checks sind fehlgeschlagen."
    : "\n✓ Alle Trigger/RLS-Checks bestanden.",
);
process.exitCode = failed ? 1 : 0;
