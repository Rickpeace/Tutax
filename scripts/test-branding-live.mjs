// Live-Test Branding (Account-Name/Slug + Theme-Farben, Slug-Eindeutigkeit).
// Nutzung:  node --env-file=.env.local scripts/test-branding-live.mjs
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
  const A = await mkUser(`tutax-brand-a-${stamp}@example.com`);
  accA = A.accountId; userA = A.userId;
  const B = await mkUser(`tutax-brand-b-${stamp}@example.com`);
  accB = B.accountId; userB = B.userId;

  const slugA = `kanzlei-brand-${stamp}`;

  // A: Name + Slug + Farben speichern
  const { error: e1 } = await A.client.from("accounts").update({ name: "Kanzlei Brand", slug: slugA }).eq("id", accA);
  ok(!e1, `A: Name + Slug gespeichert ${e1 ? "(" + e1.message + ")" : ""}`);

  const tokens = { colors: { primary: "#b8642a", background: "#fbf6f1", surface: "#fbefe5", text: "#2a1c12" } };
  await A.client.from("themes").update({ tokens, status: "ready" }).eq("account_id", accA);
  const trow = (await A.client.from("themes").select("tokens, status").eq("account_id", accA).single()).data;
  ok(trow.tokens?.colors?.primary === "#b8642a" && trow.status === "ready", "A: Theme-Farben gespeichert");

  const arow = (await A.client.from("accounts").select("slug").eq("id", accA).single()).data;
  ok(arow.slug === slugA, `A: Slug = ${slugA}`);

  // B: gleicher Slug -> muss scheitern (unique)
  const { error: e2 } = await B.client.from("accounts").update({ slug: slugA }).eq("id", accB);
  ok(!!e2 && (e2.code === "23505" || /duplicate|unique/i.test(e2.message)), "B: doppelter Slug abgelehnt (unique)");

  // öffentlich: Theme lesbar (Viewer/Hub holt Farben)
  const anon = createClient(url, pub, { auth: { persistSession: false } });
  const { data: pubTheme } = await anon.from("themes").select("tokens").eq("account_id", accA).single();
  ok(pubTheme?.tokens?.colors?.primary === "#b8642a", "Theme öffentlich lesbar (für CI im Viewer)");
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  if (accA) await admin.from("accounts").delete().eq("id", accA);
  if (accB) await admin.from("accounts").delete().eq("id", accB);
  if (userA) await admin.auth.admin.deleteUser(userA);
  if (userB) await admin.auth.admin.deleteUser(userB);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Branding live verifiziert.");
process.exitCode = failed ? 1 : 0;
