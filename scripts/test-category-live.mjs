// Live-Test Kategorien (anlegen + zuordnen, RLS).
// Nutzung:  node --env-file=.env.local scripts/test-category-live.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const email = `tutax-cat-${Date.now()}@example.com`;
let accountId, userId;

try {
  const { data: u } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  userId = u.user.id;
  accountId = (await admin.from("account_members").select("account_id").eq("user_id", userId)).data[0].account_id;
  const db = createClient(url, pub, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email, password: "Test12345!" });

  const tut = (await db.from("tutorials").insert({ account_id: accountId, title: "Cat-Test" }).select("id").single()).data.id;

  // Kategorie anlegen (Owner)
  const { data: cat, error: ce } = await db
    .from("categories")
    .insert({ account_id: accountId, name: "SmartLogin", position: 0 })
    .select("id, name")
    .single();
  ok(!ce && !!cat, `Kategorie anlegen ${ce ? "(" + ce.message + ")" : ""}`);

  // zuordnen
  await db.from("tutorials").update({ category_id: cat.id }).eq("id", tut);
  const trow = (await db.from("tutorials").select("category_id").eq("id", tut).single()).data;
  ok(trow.category_id === cat.id, "Tutorial der Kategorie zugeordnet");

  // lösen
  await db.from("tutorials").update({ category_id: null }).eq("id", tut);
  const trow2 = (await db.from("tutorials").select("category_id").eq("id", tut).single()).data;
  ok(trow2.category_id === null, "Zuordnung wieder gelöst");

  // öffentlich lesbar (Hub gruppiert danach)
  const anon = createClient(url, pub, { auth: { persistSession: false } });
  const { data: pubCats } = await anon.from("categories").select("id").eq("id", cat.id);
  ok((pubCats ?? []).length === 1, "Kategorie öffentlich lesbar (für Hub)");
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Kategorien live verifiziert.");
process.exitCode = failed ? 1 : 0;
