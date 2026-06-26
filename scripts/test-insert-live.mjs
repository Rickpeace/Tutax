// Live-Test der §7.4-Einfüge-Verdrahtung (dazwischen / Blatt / in-Ast).
// Nutzung:  node --env-file=.env.local scripts/test-insert-live.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const email = `tutax-insert-${Date.now()}@example.com`;
let accountId, userId;

const uuid = () => crypto.randomUUID();
const edge = async (db, stepId) =>
  (await db.from("step_branches").select("target_step_id, label").eq("step_id", stepId).order("position")).data;

try {
  const { data: u } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  userId = u.user.id;
  accountId = (await admin.from("account_members").select("account_id").eq("user_id", userId)).data[0].account_id;
  const db = createClient(url, pub, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email, password: "Test12345!" });
  const tut = (await db.from("tutorials").insert({ account_id: accountId, title: "Insert-Test" }).select("id").single()).data.id;

  // s1 = Wurzel
  const s1 = uuid();
  await db.from("steps").insert({ id: s1, tutorial_id: tut, title: "S1", position: 1, is_decision: false });
  await db.from("tutorials").update({ root_step_id: s1 }).eq("id", tut);

  // insertAfter(s1) -> Blatt anhängen: s2, b1: s1->s2
  const s2 = uuid(), b1 = uuid();
  await db.from("steps").insert({ id: s2, tutorial_id: tut, title: "S2", position: 2, is_decision: false });
  await db.from("step_branches").insert({ id: b1, step_id: s1, label: null, target_step_id: s2, position: 0 });
  ok((await edge(db, s1))[0].target_step_id === s2, "Blatt-Anhängen: s1 → s2");

  // insertAfter(s1) -> dazwischen: s3 zwischen s1 und s2 (b1.target=s3, neuer Weiter s3->s2)
  const s3 = uuid(), b2 = uuid();
  await db.from("steps").insert({ id: s3, tutorial_id: tut, title: "S3", position: 3, is_decision: false });
  await db.from("step_branches").update({ target_step_id: s3 }).eq("id", b1);
  await db.from("step_branches").insert({ id: b2, step_id: s3, label: null, target_step_id: s2, position: 0 });
  ok((await edge(db, s1))[0].target_step_id === s3, "Dazwischen: s1 → s3");
  ok((await edge(db, s3))[0].target_step_id === s2, "Dazwischen: s3 → s2 (altes Ziel übernommen)");

  // s1 zur Frage: b1 -> "Ja"(→s3); addBranch "Nein"(→Ende)
  await db.from("steps").update({ is_decision: true }).eq("id", s1);
  await db.from("step_branches").update({ label: "Ja", color: "#0f9d72" }).eq("id", b1);
  const b3 = uuid();
  await db.from("step_branches").insert({ id: b3, step_id: s1, label: "Nein", color: "#d6455d", target_step_id: null, position: 1 });

  // insertIntoBranch(Nein) -> s4: b3.target=s4, neuer Weiter s4->Ende(null)
  const s4 = uuid(), b4 = uuid();
  await db.from("steps").insert({ id: s4, tutorial_id: tut, title: "S4", position: 4, is_decision: false });
  await db.from("step_branches").update({ target_step_id: s4 }).eq("id", b3);
  await db.from("step_branches").insert({ id: b4, step_id: s4, label: null, target_step_id: null, position: 0 });

  const s1edges = await edge(db, s1);
  ok(s1edges.find((e) => e.label === "Ja")?.target_step_id === s3, "Frage: Ja → s3");
  ok(s1edges.find((e) => e.label === "Nein")?.target_step_id === s4, "in-Ast: Nein → s4");
  ok((await edge(db, s4))[0].target_step_id === null, "in-Ast: s4 → Ende");
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Einfüge-Verdrahtung live verifiziert.");
process.exitCode = failed ? 1 : 0;
