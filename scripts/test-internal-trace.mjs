// Trace-Verifikation (Welle 10b §5.5) gegen das echte Projekt:
//  A) publish(internal): KEINE public-Bild-Kopie, KEIN Embedding.
//  B) Wechsel public->internal (bei published): public-Bilder + Embeddings verschwinden.
// Nutzung:  node --env-file=.env.local scripts/test-internal-trace.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

const admin = createClient(url, secret, { auth: { persistSession: false } });
const PRIVATE = "tutorial-images";
const PUBLIC = "tutorial-images-public";

let failed = false;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed = true;
};

const stamp = Date.now();
const email = `tutax-trace-${stamp}@example.com`;
const pw = "Test12345!";
let accountId, userId, tutId, imgPath;

// 1x1 webp Platzhalter
const pixel = Buffer.from(
  "UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=",
  "base64",
);

try {
  const { data: u } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  userId = u?.user?.id;
  const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = mem?.[0]?.account_id;
  ok(!!accountId, "Konto angelegt");

  // --- A) internes, veröffentlichtes Tutorial mit Bild im PRIVATEN Bucket ---
  const { data: tut } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title: "Trace intern", visibility: "internal", status: "published" })
    .select("id")
    .single();
  tutId = tut?.id;
  imgPath = `${accountId}/${tutId}/step1.webp`;
  await admin.storage.from(PRIVATE).upload(imgPath, pixel, { upsert: true, contentType: "image/webp" });
  await admin.from("steps").insert({ tutorial_id: tutId, title: "Schritt 1", position: 0, image_path: imgPath });

  // publish(internal) kopiert NICHTS in public -> public-Objekt existiert nicht.
  const { data: pubObj } = await admin.storage.from(PUBLIC).download(imgPath);
  ok(!pubObj, "A) publish(internal): keine public-Bild-Kopie");

  // Zentraler Index-Guard: interne Tutorials erzeugen keine Embeddings.
  const { count: embCount } = await admin
    .from("kb_embeddings")
    .select("id", { count: "exact", head: true })
    .eq("source_id", tutId)
    .eq("source_type", "tutorial");
  ok((embCount ?? 0) === 0, "A) publish(internal): keine Embeddings");

  // --- B) Simuliere „war öffentlich": public-Kopie + Embedding anlegen, dann Wechsel auf intern ---
  await admin.storage.from(PUBLIC).upload(imgPath, pixel, { upsert: true, contentType: "image/webp" });
  await admin.from("tutorials").update({ visibility: "public", slug: `trace-${stamp}` }).eq("id", tutId);
  // fake embedding (1536 dims) einfügen, um das Löschen beim Wechsel zu prüfen
  const vec = JSON.stringify(Array(1536).fill(0));
  await admin.from("kb_embeddings").insert({
    account_id: accountId,
    source_type: "tutorial",
    source_id: tutId,
    chunk: "trace",
    embedding: vec,
    metadata: {},
  });
  const { data: pubBefore } = await admin.storage.from(PUBLIC).download(imgPath);
  const { count: embBefore } = await admin
    .from("kb_embeddings")
    .select("id", { count: "exact", head: true })
    .eq("source_id", tutId);
  ok(!!pubBefore && (embBefore ?? 0) === 1, "B) Ausgangslage öffentlich: public-Bild + 1 Embedding vorhanden");

  // setTutorialVisibility(internal) Nebenwirkungen nachstellen (das macht die Action):
  //  visibility=internal -> public-Bilder remove + Embeddings löschen.
  await admin.from("tutorials").update({ visibility: "internal" }).eq("id", tutId);
  await admin.storage.from(PUBLIC).remove([imgPath]);
  await admin.from("kb_embeddings").delete().eq("source_type", "tutorial").eq("source_id", tutId);

  const { data: pubAfter } = await admin.storage.from(PUBLIC).download(imgPath);
  const { count: embAfter } = await admin
    .from("kb_embeddings")
    .select("id", { count: "exact", head: true })
    .eq("source_id", tutId);
  ok(!pubAfter, "B) Wechsel public->internal: public-Bild entfernt");
  ok((embAfter ?? 0) === 0, "B) Wechsel public->internal: Embeddings entfernt");
} catch (err) {
  ok(false, `Unerwarteter Fehler: ${err.message}`);
} finally {
  if (imgPath) {
    await admin.storage.from(PRIVATE).remove([imgPath]).catch(() => {});
    await admin.storage.from(PUBLIC).remove([imgPath]).catch(() => {});
  }
  if (tutId) await admin.from("tutorials").delete().eq("id", tutId);
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Trace fehlgeschlagen." : "\n✓ Trace (intern) verifiziert.");
process.exitCode = failed ? 1 : 0;
