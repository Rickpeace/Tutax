// Live-Test der Builder-Editing-Operationen (RLS + Datenintegrität).
// Nutzung:  node --env-file=.env.local scripts/test-editing-live.mjs
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
const email = `tutax-edit-${Date.now()}@example.com`;
let accountId, userId;

const mkStep = async (db, tutorialId, pos) =>
  (
    await db
      .from("steps")
      .insert({ tutorial_id: tutorialId, title: "S" + pos, position: pos, is_decision: false })
      .select("id")
      .single()
  ).data.id;

try {
  const { data: u } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  userId = u.user.id;
  accountId = (await admin.from("account_members").select("account_id").eq("user_id", userId)).data[0].account_id;

  const db = createClient(url, pub, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email, password: "Test12345!" });

  const tut = (await db.from("tutorials").insert({ account_id: accountId, title: "Edit-Test" }).select("id").single()).data.id;

  // Kette s1->s2->s3 aufbauen
  const s1 = await mkStep(db, tut, 1);
  const s2 = await mkStep(db, tut, 2);
  const s3 = await mkStep(db, tut, 3);
  await db.from("tutorials").update({ root_step_id: s1 }).eq("id", tut);
  await db.from("step_branches").insert([
    { step_id: s1, label: null, target_step_id: s2, position: 0 },
    { step_id: s2, label: null, target_step_id: s3, position: 0 },
  ]);

  // updateStep
  const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hallo" }] }] };
  await db.from("steps").update({ title: "Mitte", body }).eq("id", s2);
  const s2row = (await db.from("steps").select("title, body").eq("id", s2).single()).data;
  ok(s2row.title === "Mitte" && s2row.body?.content?.[0]?.content?.[0]?.text === "Hallo", "updateStep: Titel + Tiptap-Body gespeichert");

  // deleteStep (linear s2) -> s1 muss auf s3 umgehängt werden
  const nextTarget = (await db.from("step_branches").select("target_step_id").eq("step_id", s2).order("position").limit(1)).data[0].target_step_id;
  await db.from("step_branches").update({ target_step_id: nextTarget }).eq("target_step_id", s2);
  await db.from("steps").delete().eq("id", s2);
  const s1target = (await db.from("step_branches").select("target_step_id").eq("step_id", s1).single()).data.target_step_id;
  const s2gone = (await db.from("steps").select("id").eq("id", s2)).data.length === 0;
  ok(s2gone && s1target === s3, "deleteStep (linear): s1 → s3 umverdrahtet, s2 gelöscht");

  // setDecision(s1, true): Flag + ersten Branch zu "Ja"
  await db.from("steps").update({ is_decision: true }).eq("id", s1);
  const firstB = (await db.from("step_branches").select("id").eq("step_id", s1).order("position").limit(1)).data[0].id;
  await db.from("step_branches").update({ label: "Ja", color: "#0f9d72" }).eq("id", firstB);
  ok((await db.from("steps").select("is_decision").eq("id", s1).single()).data.is_decision === true, "setDecision: Flag gesetzt");

  // addBranch "Nein" -> s3
  await db.from("step_branches").insert({ step_id: s1, label: "Nein", color: "#d6455d", target_step_id: s3, position: 1 });
  let bs = (await db.from("step_branches").select("id, label").eq("step_id", s1)).data;
  ok(bs.length === 2, "addBranch: 2 Antwort-Optionen");

  // updateBranch: Nein-Ziel auf Ende (null)
  const nein = bs.find((b) => b.label === "Nein").id;
  await db.from("step_branches").update({ target_step_id: null }).eq("id", nein);
  ok((await db.from("step_branches").select("target_step_id").eq("id", nein).single()).data.target_step_id === null, "updateBranch: Ziel geändert (→ Ende)");

  // deleteBranch
  await db.from("step_branches").delete().eq("id", nein);
  bs = (await db.from("step_branches").select("id").eq("step_id", s1)).data;
  ok(bs.length === 1, "deleteBranch: wieder 1 Option");
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Editing-Operationen live verifiziert.");
process.exitCode = failed ? 1 : 0;
