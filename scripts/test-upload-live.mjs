// Live-Test des Storage-Flows (§5): Signed Upload URL, Upload, Anzeige-URL, RLS.
// Nutzung:  node --env-file=.env.local scripts/test-upload-live.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const BUCKET = "tutorial-images";

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const stamp = Date.now();
let accA, userA, accB, userB, objectPath;

async function mkUser(email) {
  const { data } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  const accId = (await admin.from("account_members").select("account_id").eq("user_id", data.user.id)).data[0].account_id;
  const c = createClient(url, pub, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: "Test12345!" });
  return { userId: data.user.id, accountId: accId, client: c };
}

try {
  const A = await mkUser(`tutax-up-a-${stamp}@example.com`);
  accA = A.accountId; userA = A.userId;
  const B = await mkUser(`tutax-up-b-${stamp}@example.com`);
  accB = B.accountId; userB = B.userId;

  const tut = (await A.client.from("tutorials").insert({ account_id: accA, title: "Up" }).select("id").single()).data.id;
  const step = (await A.client.from("steps").insert({ tutorial_id: tut, title: "S", position: 1 }).select("id").single()).data.id;
  objectPath = `${accA}/${tut}/${step}.webp`;

  // 1) Signed Upload URL (Server-Seite simuliert via admin)
  const { data: signed, error: se } = await admin.storage.from(BUCKET).createSignedUploadUrl(objectPath, { upsert: true });
  ok(!se && !!signed?.token, "Signed Upload URL erstellt");

  // 2) Upload via Token (kein Auth nötig)
  const anon = createClient(url, pub, { auth: { persistSession: false } });
  const bytes = Buffer.from("fake-webp-bytes-" + stamp);
  const { error: ue } = await anon.storage.from(BUCKET).uploadToSignedUrl(objectPath, signed.token, bytes, { contentType: "image/webp" });
  ok(!ue, `Upload via Signed URL ${ue ? "(" + ue.message + ")" : ""}`);

  // 3) Owner kann signierte Anzeige-URL erzeugen + abrufen
  const { data: disp } = await A.client.storage.from(BUCKET).createSignedUrl(objectPath, 60);
  ok(!!disp?.signedUrl, "Owner: signierte Anzeige-URL");
  if (disp?.signedUrl) {
    const r = await fetch(disp.signedUrl);
    ok(r.status === 200, `Anzeige-URL liefert Bild (HTTP ${r.status})`);
  }

  // 4) RLS: fremder User darf NICHT lesen
  const { data: dispB, error: be } = await B.client.storage.from(BUCKET).createSignedUrl(objectPath, 60);
  ok(!dispB?.signedUrl || !!be, "RLS: fremder User bekommt KEINE Anzeige-URL");

  // 5) RLS: fremder User darf NICHT in fremden Pfad hochladen (direkter Upload)
  const { error: upB } = await B.client.storage.from(BUCKET).upload(`${accA}/${tut}/hack.webp`, Buffer.from("x"), { contentType: "image/webp" });
  ok(!!upB, "RLS: fremder User kann NICHT in fremden Pfad schreiben");
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  if (objectPath) await admin.storage.from(BUCKET).remove([objectPath]);
  if (accA) await admin.from("accounts").delete().eq("id", accA);
  if (accB) await admin.from("accounts").delete().eq("id", accB);
  if (userA) await admin.auth.admin.deleteUser(userA);
  if (userB) await admin.auth.admin.deleteUser(userB);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Storage-Upload-Flow live verifiziert.");
process.exitCode = failed ? 1 : 0;
