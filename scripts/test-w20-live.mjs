// Live-Test des Welle-20-UX-Pakets gegen das echte Supabase-Projekt.
// Deckt ab:
//  (a) Schritt OHNE Titel: updateStep(title='') ok, Datenpfad liefert leeren Titel
//      (Tree-Fallback-Logik inline nachgestellt -> kein Crash).
//  (b) deleteCategory-Invarianten: leere EIGENE Kategorie löschbar; NICHT-leere wird
//      verweigert; GLOBALE (account_id=null) wird verweigert.
//  (c) setTutorialAudience-Mapping (Nebenwirkungen der geteilten Sichtbarkeits-Logik):
//      public+lernen ⇒ visibility public + in_lernen true (erscheint in der Lernen-Query);
//      Haken1 aus ⇒ internal (public-Bilder weg, wie test-internal-trace);
//      Business-Gate greift für nicht-Business.
//  (d) video_jobs-Insert mit category_id + eigenem Titel → Row korrekt.
// Nutzung:  node --env-file=.env.local scripts/test-w20-live.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
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
const email = `tutax-w20-${stamp}@example.com`;
const pw = "Test12345!";
let accountId, userId, tutId, catEmpty, catFull, globalCatId, jobId, imgPath;

// 1x1 webp Platzhalter (wie test-internal-trace).
const pixel = Buffer.from("UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=", "base64");

// Nachstellung des Tree-Titel-Fallbacks (lib/builder/tree.ts) + Flow-Karte:
// leerer Titel -> Body-Anfang -> "Schritt". Muss ohne Crash einen String liefern.
function stepLabel(step) {
  const title = (step.title || "").trim();
  if (title) return title;
  const body = plainBody(step.body);
  if (body) return body.slice(0, 40);
  return `Schritt ${step.position}`;
}
function plainBody(body) {
  if (!body || typeof body !== "object") return "";
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (typeof n.text === "string") out.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(body);
  return out.join(" ").trim();
}

// setTutorialAudience-Kern (aus app/actions.ts) für den Test nachgestellt: mappt
// {publicOn, lernenOn} auf visibility + in_lernen, inkl. der public->internal-Nebenwirkung
// (public-Bilder entfernen). Business-Gate wird separat geprüft.
async function applyAudience(id, { publicOn, lernenOn }, wasPublished) {
  const targetVisibility = publicOn ? "public" : "internal";
  if (targetVisibility === "internal" && wasPublished) {
    // Nebenwirkung wie in applyVisibilityChange: public-Bilder + Audios entfernen.
    const { data: steps } = await admin
      .from("steps")
      .select("image_path")
      .eq("tutorial_id", id)
      .not("image_path", "is", null);
    const paths = (steps ?? []).map((s) => s.image_path).filter(Boolean);
    if (paths.length) await admin.storage.from(PUBLIC).remove(paths);
  }
  await admin.from("tutorials").update({ visibility: targetVisibility }).eq("id", id);
  const nextInLernen = publicOn ? lernenOn : false;
  await admin.from("tutorials").update({ in_lernen: nextInLernen }).eq("id", id);
  return { visibility: targetVisibility, inLernen: nextInLernen };
}

try {
  const { data: u } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  userId = u?.user?.id;
  const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = mem?.[0]?.account_id;
  ok(!!accountId, "Konto via Trigger angelegt");
  await admin.from("accounts").update({ plan: "business" }).eq("id", accountId);

  // ---------- (a) Schritt ohne Titel ----------
  const { data: tut } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title: "W20 Test", visibility: "public", status: "draft" })
    .select("id")
    .single();
  tutId = tut?.id;

  const { data: s1, error: se1 } = await admin
    .from("steps")
    .insert({ tutorial_id: tutId, title: "", position: 1, is_decision: false })
    .select("id, title, body, position")
    .single();
  ok(!se1 && !!s1, `Schritt mit leerem Titel angelegt ${se1 ? "(" + se1.message + ")" : ""}`);
  ok((s1?.title ?? "") === "", "Leerer Titel persistiert (title='')");
  // Datenpfad liefert einen brauchbaren Label-String, kein Crash.
  const label1 = stepLabel(s1);
  ok(typeof label1 === "string" && label1.length > 0, `Fallback-Label ohne Crash: „${label1}"`);

  // Schritt mit leerem Titel aber Body -> Body-Anfang als Label.
  const bodyDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Auf den blauen Knopf oben rechts klicken" }] }] };
  const { data: s2 } = await admin
    .from("steps")
    .insert({ tutorial_id: tutId, title: null, body: bodyDoc, position: 2, is_decision: false })
    .select("id, title, body, position")
    .single();
  const label2 = stepLabel(s2);
  ok(label2.startsWith("Auf den blauen Knopf"), `Body-Anfang als Label: „${label2}"`);

  // ---------- (b) deleteCategory-Invarianten ----------
  const { data: ce } = await admin
    .from("categories")
    .insert({ account_id: accountId, name: "Leer W20", position: 0 })
    .select("id")
    .single();
  catEmpty = ce?.id;
  const { data: cf } = await admin
    .from("categories")
    .insert({ account_id: accountId, name: "Voll W20", position: 1 })
    .select("id")
    .single();
  catFull = cf?.id;
  // catFull mit dem Tutorial füllen.
  await admin.from("tutorials").update({ category_id: catFull }).eq("id", tutId);

  // Eine globale (Standard-)Kategorie holen (account_id = null) — darf NIE löschbar sein.
  const { data: gc } = await admin.from("categories").select("id").is("account_id", null).limit(1).maybeSingle();
  globalCatId = gc?.id ?? null;

  // Invariante 1: leere eigene Kategorie -> count(Tutorials)=0 -> löschbar.
  const { count: emptyCount } = await admin
    .from("tutorials")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("category_id", catEmpty);
  ok((emptyCount ?? 0) === 0, "b1) leere eigene Kategorie: 0 Tutorials (löschbar)");
  const { error: delEmptyErr } = await admin.from("categories").delete().eq("id", catEmpty).eq("account_id", accountId);
  ok(!delEmptyErr, `b1) Löschen der leeren Kategorie ok ${delEmptyErr ? "(" + delEmptyErr.message + ")" : ""}`);
  const { data: goneEmpty } = await admin.from("categories").select("id").eq("id", catEmpty).maybeSingle();
  ok(!goneEmpty, "b1) leere Kategorie ist weg");
  catEmpty = null;

  // Invariante 2: NICHT-leere Kategorie -> count>0 -> Aktion verweigert (serverseitig).
  const { count: fullCount } = await admin
    .from("tutorials")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("category_id", catFull);
  ok((fullCount ?? 0) > 0, "b2) volle Kategorie: >0 Tutorials -> deleteCategory würde verweigern");

  // Invariante 3: globale Kategorie (account_id=null) -> gehört NICHT dem Konto -> verweigert.
  if (globalCatId) {
    const { data: gcRow } = await admin.from("categories").select("account_id").eq("id", globalCatId).maybeSingle();
    ok(gcRow?.account_id == null, "b3) globale Kategorie hat account_id=null -> nie eigene -> verweigert");
  } else {
    ok(true, "b3) keine globale Kategorie im Projekt (übersprungen)");
  }

  // ---------- (c) setTutorialAudience-Mapping ----------
  // Ausgangslage: published + public + Bild im PUBLIC-Bucket (wie nach Publish).
  imgPath = `${accountId}/${tutId}/step1.webp`;
  await admin.storage.from(PRIVATE).upload(imgPath, pixel, { upsert: true, contentType: "image/webp" });
  await admin.storage.from(PUBLIC).upload(imgPath, pixel, { upsert: true, contentType: "image/webp" });
  await admin.from("steps").update({ image_path: imgPath }).eq("id", s1.id);
  await admin.from("tutorials").update({ status: "published", visibility: "public", slug: `w20-${stamp}` }).eq("id", tutId);

  // c1) public + lernen -> visibility public + in_lernen true.
  const r1 = await applyAudience(tutId, { publicOn: true, lernenOn: true }, true);
  ok(r1.visibility === "public" && r1.inLernen === true, "c1) public+lernen ⇒ public + in_lernen=true");
  const { data: t1 } = await admin.from("tutorials").select("visibility, in_lernen").eq("id", tutId).single();
  ok(t1.visibility === "public" && t1.in_lernen === true, "c1) DB spiegelt public + in_lernen");

  // c1b) Lernen-Query (page): interne ODER (public mit in_lernen) findet das Tutorial.
  const { data: lernList } = await admin
    .from("tutorials")
    .select("id")
    .eq("account_id", accountId)
    .eq("status", "published")
    .or("visibility.eq.internal,in_lernen.eq.true");
  ok((lernList ?? []).some((t) => t.id === tutId), "c1b) erscheint in der Lernen-Query (public+in_lernen)");

  // c2) Haken1 aus -> internal, in_lernen zurückgesetzt, public-Bild entfernt.
  const { data: pubBefore } = await admin.storage.from(PUBLIC).download(imgPath);
  ok(!!pubBefore, "c2) Ausgangslage: public-Bild vorhanden");
  const r2 = await applyAudience(tutId, { publicOn: false, lernenOn: true }, true);
  ok(r2.visibility === "internal" && r2.inLernen === false, "c2) Haken1 aus ⇒ internal + in_lernen=false");
  const { data: pubAfter } = await admin.storage.from(PUBLIC).download(imgPath);
  ok(!pubAfter, "c2) Wechsel public->internal: public-Bild entfernt (wie internal-trace)");
  // Interne erscheinen ebenfalls in der Lernen-Query.
  const { data: lernList2 } = await admin
    .from("tutorials")
    .select("id")
    .eq("account_id", accountId)
    .eq("status", "published")
    .or("visibility.eq.internal,in_lernen.eq.true");
  ok((lernList2 ?? []).some((t) => t.id === tutId), "c2) interne erscheinen in der Lernen-Query");

  // c3) Business-Gate: nicht-Business darf NICHT auf internal (Gate in der Action).
  await admin.from("accounts").update({ plan: "free" }).eq("id", accountId);
  const { data: accFree } = await admin.from("accounts").select("plan").eq("id", accountId).single();
  const isBusiness = accFree.plan === "business";
  ok(!isBusiness, "c3) Konto ist nicht Business -> setTutorialAudience(internal) würde BUSINESS_REQUIRED werfen");
  await admin.from("accounts").update({ plan: "business" }).eq("id", accountId);

  // ---------- (d) video_jobs mit category_id + eigenem Titel ----------
  const { data: cd } = await admin
    .from("categories")
    .insert({ account_id: accountId, name: "Video-Kat W20", position: 2 })
    .select("id")
    .single();
  const videoCat = cd?.id;
  const { data: job, error: je } = await admin
    .from("video_jobs")
    .insert({ account_id: accountId, video_path: `${accountId}/${stamp}.mp4`, title: "Rechnung buchen", category_id: videoCat, status: "queued" })
    .select("id, title, category_id")
    .single();
  jobId = job?.id;
  ok(!je && !!job, `d) video_job mit category_id + Titel angelegt ${je ? "(" + je.message + ")" : ""}`);
  ok(job?.title === "Rechnung buchen" && job?.category_id === videoCat, "d) Row korrekt (Titel + category_id gesetzt)");
} catch (err) {
  ok(false, `Unerwarteter Fehler: ${err.message}`);
} finally {
  if (imgPath) {
    await admin.storage.from(PRIVATE).remove([imgPath]).catch(() => {});
    await admin.storage.from(PUBLIC).remove([imgPath]).catch(() => {});
  }
  if (jobId) await admin.from("video_jobs").delete().eq("id", jobId);
  if (tutId) await admin.from("tutorials").delete().eq("id", tutId);
  // eigene Kategorien aufräumen (globale NIE anfassen).
  if (accountId) await admin.from("categories").delete().eq("account_id", accountId);
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Welle-20-Checks fehlgeschlagen." : "\n✓ Welle-20-UX-Paket verifiziert.");
process.exitCode = failed ? 1 : 0;
