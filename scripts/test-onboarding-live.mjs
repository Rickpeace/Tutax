// Live-Test 0004: Onboarding-Flag, source_url, kb_embeddings (RLS).
// Nutzung:  node --env-file=.env.local scripts/test-onboarding-live.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const stamp = Date.now();
let accA, userA, accB, userB;

async function mkUser(email) {
  const { data } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  const accId = (await admin.from("account_members").select("account_id").eq("user_id", data.user.id)).data[0].account_id;
  const c = createClient(url, pub, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: "Test12345!" });
  return { userId: data.user.id, accountId: accId, client: c };
}

try {
  const A = await mkUser(`tutax-onb-a-${stamp}@example.com`);
  accA = A.accountId; userA = A.userId;
  const B = await mkUser(`tutax-onb-b-${stamp}@example.com`);
  accB = B.accountId; userB = B.userId;

  // onboarded default false -> true
  const before = (await A.client.from("accounts").select("onboarded").eq("id", accA).single()).data;
  ok(before.onboarded === false, "Neuer Account: onboarded = false (Default)");
  await A.client.from("accounts").update({ onboarded: true }).eq("id", accA);
  const after = (await A.client.from("accounts").select("onboarded").eq("id", accA).single()).data;
  ok(after.onboarded === true, "Onboarding abgeschlossen (onboarded = true)");

  // source_url speichern
  await A.client.from("themes").update({ source_url: "https://kanzlei-test.de" }).eq("account_id", accA);
  const t = (await A.client.from("themes").select("source_url").eq("account_id", accA).single()).data;
  ok(t.source_url === "https://kanzlei-test.de", "Website-URL (source_url) gespeichert");

  // kb_embeddings: Owner darf, Fremder nicht
  const { error: e1 } = await A.client.from("kb_embeddings").insert({ account_id: accA, source_type: "tutorial", source_id: accA, chunk: "Testtext" });
  ok(!e1, `kb_embeddings: Owner kann anlegen ${e1 ? "(" + e1.message + ")" : ""}`);
  const { error: e2 } = await B.client.from("kb_embeddings").insert({ account_id: accA, source_type: "tutorial", source_id: accA, chunk: "hack" });
  ok(!!e2, "kb_embeddings RLS: Fremder kann NICHT in fremden Account schreiben");
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  if (accA) await admin.from("accounts").delete().eq("id", accA);
  if (accB) await admin.from("accounts").delete().eq("id", accB);
  if (userA) await admin.auth.admin.deleteUser(userA);
  if (userB) await admin.auth.admin.deleteUser(userB);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Onboarding + KB-Schema live verifiziert.");
process.exitCode = failed ? 1 : 0;
