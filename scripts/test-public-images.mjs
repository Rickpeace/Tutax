// Öffentliche Bildkopien (src/lib/public-images.ts) gegen die ECHTE DB + Storage — Sicherheits-
// prüfung Welle 51 (H1/H2/M1). Wegwerf-Konto, wird im finally samt Dateien gelöscht.
// Belegt:
//   1) rebuildPublicCopy brennt die Verpixelung ein (öffentliche Pixel ≠ Original im Blur-Bereich).
//   2) Geteilter Pfad: removeUnusedPublicCopies lässt die Kopie stehen, solange eine ANDERE
//      veröffentlichte, öffentliche Anleitung sie nutzt; ohne solche wird sie entfernt.
//   3) Neuaufbau scheitert (privates Original fehlt) -> öffentliche Kopie ENTFERNT + Fehler geworfen
//      (nie still das alte, evtl. unverpixelte Bild stehen lassen).
//   4) hasInvalidBlur erkennt kaputte Koordinaten; burnBlur stürzt an ihnen nicht ab.
// Nutzung: node --env-file=.env.local scripts/test-public-images.mjs
import { register } from "node:module";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const srcBase = JSON.stringify(new URL("../src/", import.meta.url).href);
const loader = `export async function resolve(s,c,n){if(s==='server-only'||s==='client-only'){return {url:'data:text/javascript,',shortCircuit:true};}if(s.startsWith('@/')){return n(new URL(s.slice(2)+'.ts',${srcBase}).href,c);}return n(s,c);}`;
register("data:text/javascript," + encodeURIComponent(loader), import.meta.url);
const { rebuildPublicCopy, removeUnusedPublicCopies, hasInvalidBlur } = await import("../src/lib/public-images.ts");
const { burnBlur } = await import("../src/lib/redact.ts");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const PRIV = "tutorial-images";
const PUB = "tutorial-images-public";
const stamp = String(process.hrtime.bigint()).slice(-8);

// Testbild: linke Hälfte schwarz/weiß gestreift (hoher Kontrast), rechte Hälfte grau.
async function makeImage() {
  const W = 200, H = 100;
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const v = x < 100 ? ((x >> 1) % 2 ? 255 : 0) : 128;
    raw[i] = raw[i + 1] = raw[i + 2] = v;
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).webp({ lossless: true }).toBuffer();
}
// Kontrast (Standardabweichung) im linken Bereich — nach Verpixelung deutlich kleiner.
async function leftContrast(buf) {
  const { data, info } = await sharp(buf).extract({ left: 10, top: 10, width: 80, height: 80 }).raw().toBuffer({ resolveWithObject: true });
  let sum = 0, sq = 0, n = 0;
  for (let i = 0; i < data.length; i += info.channels) { sum += data[i]; sq += data[i] * data[i]; n++; }
  const mean = sum / n;
  return Math.sqrt(sq / n - mean * mean);
}
async function publicExists(path) {
  const { data } = await admin.storage.from(PUB).download(path);
  return !!data;
}

let userId, accountId;
const paths = [];
try {
  const created = await admin.auth.admin.createUser({ email: `tutax-pubimg-${stamp}@example.com`, password: "Test12345!", email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  accountId = mem[0].account_id;

  const mk = async (title, status) => {
    const { data, error } = await admin.from("tutorials")
      .insert({ account_id: accountId, title, status, visibility: "public", slug: `t-${stamp}-${title.length}-${status}` })
      .select("id").single();
    if (error) throw error;
    return data.id;
  };
  const tA = await mk("Anleitung A", "published");
  const tB = await mk("Anleitung B (Kopie)", "published");
  const path = `${accountId}/${tA}/geteilt-${stamp}.webp`;
  paths.push(path);
  const img = await makeImage();
  const up = await admin.storage.from(PRIV).upload(path, img, { contentType: "image/webp", upsert: true });
  if (up.error) throw up.error;
  const blur = [{ id: "b1", type: "blur", x: 0, y: 0, w: 0.5, h: 1 }];
  const { error: sErr } = await admin.from("steps").insert([
    { tutorial_id: tA, position: 1, title: "A1", image_path: path, highlights: blur },
    { tutorial_id: tB, position: 1, title: "B1", image_path: path, highlights: [] },
  ]);
  if (sErr) throw sErr;

  // 1) Neuaufbau brennt Verpixelung ein
  await rebuildPublicCopy(path, accountId);
  const { data: pubBlob } = await admin.storage.from(PUB).download(path);
  ok(!!pubBlob, "1: öffentliche Kopie erzeugt");
  const cOrig = await leftContrast(img);
  const cPub = await leftContrast(Buffer.from(await pubBlob.arrayBuffer()));
  ok(cPub < cOrig * 0.3, `1: Verpixelung eingebrannt (Kontrast ${cOrig.toFixed(0)} → ${cPub.toFixed(0)})`);

  // 2) geteilter Pfad: B ist weiter veröffentlicht -> Aufräumen für A lässt die Kopie stehen
  await removeUnusedPublicCopies([path], { accountId, exceptTutorialId: tA });
  ok(await publicExists(path), "2: Kopie bleibt, solange Anleitung B (veröffentlicht) sie nutzt");
  await admin.from("tutorials").update({ status: "draft" }).eq("id", tB);
  await removeUnusedPublicCopies([path], { accountId, exceptTutorialId: tA });
  ok(!(await publicExists(path)), "2: Kopie entfernt, sobald keine andere veröffentlichte Anleitung sie nutzt");

  // 3) Neuaufbau scheitert -> Kopie weg + Fehler
  await rebuildPublicCopy(path, accountId); // wieder anlegen
  ok(await publicExists(path), "3: Vorbedingung — Kopie existiert wieder");
  await admin.storage.from(PRIV).remove([path]); // Original weg -> Download scheitert
  let threw = false;
  try {
    await rebuildPublicCopy(path, accountId);
  } catch {
    threw = true;
  }
  ok(threw, "3: Neuaufbau ohne Original wirft (Oberfläche zeigt „nicht gespeichert“)");
  ok(!(await publicExists(path)), "3: öffentliche Kopie wurde vorsorglich ENTFERNT (kein Klartext bleibt stehen)");

  // 5) Fremder Pfad (Sicherheitsprüfung 23.09.2026): Konto-Ordner stimmt nicht -> nie löschen/anlegen.
  await admin.storage.from(PRIV).upload(path, img, { contentType: "image/webp", upsert: true });
  await rebuildPublicCopy(path, accountId);
  ok(await publicExists(path), "5: Vorbedingung — Kopie existiert");
  const foreign = crypto.randomUUID();
  await removeUnusedPublicCopies([path], { accountId: foreign });
  ok(await publicExists(path), "5: Aufräumen mit FREMDEM Konto lässt die Kopie stehen");
  await removeUnusedPublicCopies([path], { accountId: null });
  ok(await publicExists(path), "5: Aufräumen ohne Konto (Vorlage) löscht nichts");
  await rebuildPublicCopy(`${foreign}/x/y.webp`, accountId);
  ok(!(await publicExists(`${foreign}/x/y.webp`)), "5: Neuaufbau eines fremden Pfads legt nichts an");

  // 4) kaputte Koordinaten
  ok(hasInvalidBlur([{ type: "blur", x: "abc", y: 0, w: 0.1, h: 0.1 }]), "4: hasInvalidBlur erkennt x=\"abc\"");
  ok(!hasInvalidBlur([{ type: "blur", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, { type: "rect", x: "egal" }]), "4: gültige Verpixelung/andere Formen unbeanstandet");
  let crashed = false;
  try {
    await burnBlur(img, [{ type: "blur", x: "abc", y: 0, w: 0.1, h: 0.1 }]);
  } catch {
    crashed = true;
  }
  ok(!crashed, "4: burnBlur stürzt an kaputten Koordinaten nicht ab");
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (paths.length) {
    await admin.storage.from(PRIV).remove(paths).catch(() => {});
    await admin.storage.from(PUB).remove(paths).catch(() => {});
  }
  if (accountId) await admin.from("accounts").delete().eq("id", accountId).then(() => {}, () => {});
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
}
console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Öffentliche Bildkopien sicher (Einbrennen, geteilte Pfade, Fehlerfall).");
process.exit(failed ? 1 : 0);
