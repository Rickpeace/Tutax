// Live-Test Logo (public Bucket Upload + themes.logo_path + öffentliche URL).
// Nutzung:  node --env-file=.env.local scripts/test-logo-live.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const PUBB = "tutorial-images-public";

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const email = `tutax-logo-${Date.now()}@example.com`;
let accountId, userId, logoPath;

try {
  const { data: u } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  userId = u.user.id;
  accountId = (await admin.from("account_members").select("account_id").eq("user_id", userId)).data[0].account_id;
  const db = createClient(url, pub, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email, password: "Test12345!" });

  // wie die Route: admin upload in public Bucket + owner setzt themes.logo_path
  logoPath = `${accountId}/branding/logo-${Date.now()}.webp`;
  const up = await admin.storage.from(PUBB).upload(logoPath, Buffer.from("fake-logo"), { contentType: "image/webp", upsert: true });
  ok(!up.error, `Logo in public Bucket hochgeladen ${up.error ? "(" + up.error.message + ")" : ""}`);

  await db.from("themes").update({ logo_path: logoPath }).eq("account_id", accountId);
  const trow = (await db.from("themes").select("logo_path").eq("account_id", accountId).single()).data;
  ok(trow.logo_path === logoPath, "themes.logo_path gesetzt");

  const publicUrl = `${url}/storage/v1/object/public/${PUBB}/${logoPath}`;
  const r = await fetch(publicUrl);
  ok(r.status === 200, `Logo öffentlich erreichbar (HTTP ${r.status})`);

  // öffentlich lesbar (Viewer holt logo_path)
  const anon = createClient(url, pub, { auth: { persistSession: false } });
  const { data: pubTheme } = await anon.from("themes").select("logo_path").eq("account_id", accountId).single();
  ok(pubTheme?.logo_path === logoPath, "logo_path öffentlich lesbar (Viewer/Hub)");
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  if (logoPath) await admin.storage.from(PUBB).remove([logoPath]);
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Logo live verifiziert.");
process.exitCode = failed ? 1 : 0;
