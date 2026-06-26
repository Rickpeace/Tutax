// Live-Test Publish-Flow: Slug, Bildkopie privat->public, öffentliche URL.
// Nutzung:  node --env-file=.env.local scripts/test-publish-live.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const PRIV = "tutorial-images";
const PUBB = "tutorial-images-public";

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const email = `tutax-pub-${Date.now()}@example.com`;
let accountId, userId, privPath, pubPath;

try {
  const { data: u } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  userId = u.user.id;
  accountId = (await admin.from("account_members").select("account_id").eq("user_id", userId)).data[0].account_id;
  const accountSlug = (await admin.from("accounts").select("slug").eq("id", accountId).single()).data.slug;

  const db = createClient(url, pub, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email, password: "Test12345!" });

  const tut = (await db.from("tutorials").insert({ account_id: accountId, title: "Mein Test Tutorial!" }).select("id").single()).data.id;
  const step = (await db.from("steps").insert({ tutorial_id: tut, title: "S1", position: 1 }).select("id").single()).data.id;

  // Bild in den privaten Bucket legen + am Step vermerken
  privPath = `${accountId}/${tut}/${step}.webp`;
  await admin.storage.from(PRIV).upload(privPath, Buffer.from("fake-webp-" + Date.now()), { contentType: "image/webp", upsert: true });
  await db.from("steps").update({ image_path: privPath }).eq("id", step);

  // --- Publish simulieren (wie publishTutorial) ---
  const base = "mein-test-tutorial";
  const { data: blob } = await admin.storage.from(PRIV).download(privPath);
  ok(!!blob, "Bild aus privatem Bucket geladen");
  pubPath = privPath;
  const up = await admin.storage.from(PUBB).upload(pubPath, blob, { upsert: true, contentType: "image/webp" });
  ok(!up.error, `Bild in public Bucket kopiert ${up.error ? "(" + up.error.message + ")" : ""}`);
  await db.from("tutorials").update({ status: "published", slug: base, published_at: new Date().toISOString() }).eq("id", tut);

  // --- Verifikationen ---
  const trow = (await admin.from("tutorials").select("status, slug").eq("id", tut).single()).data;
  ok(trow.status === "published" && trow.slug === base, `Tutorial published, slug="${trow.slug}"`);

  const publicUrl = `${url}/storage/v1/object/public/${PUBB}/${pubPath}`;
  const r = await fetch(publicUrl);
  ok(r.status === 200, `Öffentliche Bild-URL erreichbar (HTTP ${r.status})`);

  // Viewer-Datenpfad (admin, wie die Seite)
  const acc = (await admin.from("accounts").select("id").eq("slug", accountSlug).single()).data;
  const viewerTut = (await admin.from("tutorials").select("id, root_step_id").eq("account_id", acc.id).eq("slug", base).eq("status", "published").single()).data;
  ok(!!viewerTut, "Viewer findet Tutorial über account_slug + slug");
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  if (privPath) await admin.storage.from(PRIV).remove([privPath]);
  if (pubPath) await admin.storage.from(PUBB).remove([pubPath]);
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Publish-Flow live verifiziert.");
process.exitCode = failed ? 1 : 0;
