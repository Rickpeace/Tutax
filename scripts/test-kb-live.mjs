// Live-Test RAG-Backbone: kb_embeddings-Insert (pgvector) + match_kb-Suche.
// Nutzung:  node --env-file=.env.local scripts/test-kb-live.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const email = `tutax-kb-${Date.now()}@example.com`;
let accountId, userId;

const vec = (hot) => {
  const a = new Array(1536).fill(0);
  a[hot] = 1;
  return a;
};

try {
  const { data: u } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  userId = u.user.id;
  accountId = (await admin.from("account_members").select("account_id").eq("user_id", userId)).data[0].account_id;
  const db = createClient(url, pub, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email, password: "Test12345!" });

  // Zwei Embeddings einfügen (pgvector Textform "[...]")
  const { error: e1 } = await db.from("kb_embeddings").insert([
    { account_id: accountId, source_type: "tutorial", source_id: accountId, chunk: "SmartLogin einrichten", embedding: JSON.stringify(vec(0)), metadata: { title: "SmartLogin", slug: "smartlogin" } },
    { account_id: accountId, source_type: "tutorial", source_id: accountId, chunk: "Face ID aktivieren", embedding: JSON.stringify(vec(5)), metadata: { title: "Face ID", slug: "face-id" } },
  ]);
  ok(!e1, `kb_embeddings Insert (pgvector) ${e1 ? "(" + e1.message + ")" : ""}`);

  // Suche mit Query nahe dem ersten Vektor -> sollte "SmartLogin" zuerst liefern
  const { data: matches, error: e2 } = await admin.rpc("match_kb", {
    p_account: accountId,
    p_embedding: JSON.stringify(vec(0)),
    p_count: 2,
  });
  ok(!e2 && Array.isArray(matches) && matches.length === 2, `match_kb liefert Treffer ${e2 ? "(" + e2.message + ")" : ""}`);
  ok(matches?.[0]?.metadata?.slug === "smartlogin", "match_kb: relevantester Treffer zuerst (SmartLogin)");
  ok(matches?.[0]?.similarity > 0.9, `match_kb: hohe Ähnlichkeit (${matches?.[0]?.similarity?.toFixed?.(2)})`);
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ RAG-Backbone (pgvector + match_kb) live verifiziert.");
process.exitCode = failed ? 1 : 0;
