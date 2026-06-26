// Live-Test des Builder-Datenpfads (RLS für steps/branches, root_step_id, Auto-Verdrahtung).
// Nutzung:  node --env-file=.env.local scripts/test-builder-live.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

const email = `tutax-builder-${Date.now()}@example.com`;
let accountId, userId;

async function addStepSim(db, tutorialId) {
  const { data: tutorial } = await db
    .from("tutorials")
    .select("id, root_step_id")
    .eq("id", tutorialId)
    .single();
  const { data: steps } = await db
    .from("steps")
    .select("id, position")
    .eq("tutorial_id", tutorialId);
  const maxPos = (steps ?? []).reduce((m, s) => Math.max(m, Number(s.position) || 0), 0);
  const { data: ns, error } = await db
    .from("steps")
    .insert({ tutorial_id: tutorialId, title: "Neuer Schritt", position: maxPos + 1, is_decision: false })
    .select("id")
    .single();
  if (error) throw new Error("step insert: " + error.message);
  if (!tutorial.root_step_id) {
    await db.from("tutorials").update({ root_step_id: ns.id }).eq("id", tutorialId);
  } else if (steps?.length) {
    const { data: branches } = await db
      .from("step_branches")
      .select("step_id")
      .in("step_id", steps.map((s) => s.id));
    const hasOut = new Set((branches ?? []).map((b) => b.step_id));
    const leaf = steps
      .filter((s) => !hasOut.has(s.id))
      .sort((a, b) => Number(b.position) - Number(a.position))[0];
    if (leaf) {
      const { error: be } = await db
        .from("step_branches")
        .insert({ step_id: leaf.id, label: null, target_step_id: ns.id, position: 0 });
      if (be) throw new Error("branch insert: " + be.message);
    }
  }
  return ns.id;
}

try {
  const { data: u } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  userId = u.user.id;
  const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = mem[0].account_id;

  const db = createClient(url, pub, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email, password: "Test12345!" });

  const { data: tut } = await db
    .from("tutorials")
    .insert({ account_id: accountId, title: "Builder-Test" })
    .select("id")
    .single();

  const s1 = await addStepSim(db, tut.id);
  const s2 = await addStepSim(db, tut.id);
  const s3 = await addStepSim(db, tut.id);
  ok(!!(s1 && s2 && s3), "RLS: Owner kann 3 Schritte anlegen (via Tutorial-Join)");

  const { data: tutAfter } = await db
    .from("tutorials")
    .select("root_step_id")
    .eq("id", tut.id)
    .single();
  ok(tutAfter.root_step_id === s1, "root_step_id = erster Schritt");

  const { data: branches } = await db
    .from("step_branches")
    .select("step_id, target_step_id")
    .in("step_id", [s1, s2, s3]);
  const wired = new Map((branches ?? []).map((b) => [b.step_id, b.target_step_id]));
  ok(wired.get(s1) === s2, "Auto-Verdrahtung: s1 → s2");
  ok(wired.get(s2) === s3, "Auto-Verdrahtung: s2 → s3");
  ok(!wired.has(s3), "s3 ist Blatt (kein ausgehender Branch)");
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Builder-Datenpfad live verifiziert.");
process.exitCode = failed ? 1 : 0;
