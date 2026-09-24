// Regression: Schutzregeln gegen direkte REST-Schreibzugriffe (Migration 0043, Audit 23.09.2026).
// Meldet sich wie ein Browser mit dem öffentlichen Schlüssel an und versucht, was die Prüfer live
// geschafft hatten — muss jetzt alles abgewiesen werden. Legitime Wege müssen weiter klappen.
//
// Nutzung:  node --env-file=.env.local scripts/test-rest-guards.mjs
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL_, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
  if (!cond) failed++;
};
const stamp = Date.now().toString(36);
const PW = "Probe12345!";
const users = [];
const accounts = [];

async function mk(tag, plan) {
  const email = `rest-guard-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", data.user.id).single();
  accounts.push(m.account_id);
  await admin.from("accounts").update({ plan, onboarded: true }).eq("id", m.account_id);
  const c = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password: PW });
  if (e2) throw e2;
  return { c, acc: m.account_id };
}
const denied = (r) => !!r.error;

try {
  const A = await mk("a", "business");
  const B = await mk("b", "free");
  // Opfer-Inhalte von A (mit Server-Rechten angelegt)
  const { data: draftA } = await admin.from("tutorials").insert({ account_id: A.acc, title: "Entwurf A", status: "draft" }).select("id").single();
  const { data: pubA } = await admin.from("tutorials").insert({ account_id: A.acc, title: "Öffentlich A", status: "published", visibility: "public", slug: `pub-a-${stamp}` }).select("id").single();

  console.log("1. Video-Aufträge");
  let r = await B.c.from("video_jobs").insert({ account_id: B.acc, status: "queued", tutorial_id: draftA.id, video_path: `${B.acc}/x.webm` });
  ok(denied(r), "Auftrag mit fremder Anleitung abgewiesen");
  r = await B.c.from("video_jobs").insert({ account_id: B.acc, status: "queued", video_path: `${A.acc}/x.webm` });
  ok(denied(r), "Auftrag mit fremdem Video-Pfad abgewiesen");
  r = await B.c.from("video_jobs").insert({ account_id: B.acc, status: "done", video_path: `${B.acc}/x.webm` });
  ok(denied(r), "Auftrag mit Status „fertig“ abgewiesen");
  const { data: ownB } = await admin.from("tutorials").insert({ account_id: B.acc, title: "Eigen B", status: "published", visibility: "public" }).select("id").single();
  r = await B.c.from("video_jobs").insert({ account_id: B.acc, kind: "render", status: "queued", tutorial_id: ownB.id });
  ok(denied(r), "Video-Export im Gratis-Tarif abgewiesen");
  r = await B.c.from("video_jobs").insert({ account_id: B.acc, kind: "render", status: "queued", tutorial_id: pubA.id });
  ok(denied(r), "Video-Export fremder Anleitung abgewiesen");
  r = await A.c.from("video_jobs").insert({ account_id: A.acc, kind: "render", render_style: "classic", status: "queued", tutorial_id: pubA.id }).select("id").single();
  ok(!r.error, `Business: Export der eigenen Anleitung erlaubt${r.error ? " — " + r.error.message : ""}`);
  if (r.data) {
    const u = await A.c.from("video_jobs").update({ status: "done", output_path: `${A.acc}/renders/x.mp4` }).eq("id", r.data.id).select();
    ok(denied(u) || !(u.data ?? []).length, "Nutzer kann Auftrags-Status nicht ändern");
    await admin.from("video_jobs").delete().eq("id", r.data.id);
  }
  r = await A.c.from("video_jobs").insert({ account_id: A.acc, status: "queued", video_path: `${A.acc}/gibt-es-nicht-${stamp}.webm` }).select("id").single();
  ok(!r.error, `Normaler Upload-Auftrag (eigener Ordner) erlaubt${r.error ? " — " + r.error.message : ""}`);
  if (r.data) await admin.from("video_jobs").delete().eq("id", r.data.id);
  const { data: stillThere } = await admin.from("tutorials").select("id").eq("id", draftA.id).maybeSingle();
  ok(!!stillThere, "Entwurf von A existiert weiter");

  console.log("2. Standard-Vorlagen");
  r = await B.c.from("tutorials").update({ is_template: true }).eq("id", ownB.id).select();
  ok(denied(r) || !(r.data ?? []).length, "Eigene Anleitung kann nicht zur Vorlage werden");
  r = await B.c.from("tutorials").insert({ account_id: B.acc, title: "Fake", is_template: true });
  ok(denied(r), "Vorlage per Nutzer-Login anlegen abgewiesen");
  r = await B.c.from("account_templates").insert({ account_id: B.acc, template_id: pubA.id, forked_tutorial_id: ownB.id });
  ok(denied(r), "Normale Anleitung als „Vorlage“ verknüpfen abgewiesen");
  const { data: tpl } = await admin.from("tutorials").select("id").eq("is_template", true).is("account_id", null).eq("status", "published").limit(1).maybeSingle();
  if (tpl) {
    r = await B.c.from("account_templates").insert({ account_id: B.acc, template_id: tpl.id, forked_tutorial_id: draftA.id });
    ok(denied(r), "Fremde Anleitung als angepasste Kopie abgewiesen");
    r = await B.c.from("account_templates").upsert({ account_id: B.acc, template_id: tpl.id, enabled: false }, { onConflict: "account_id,template_id" });
    ok(!r.error, `Vorlage ein-/ausschalten erlaubt${r.error ? " — " + r.error.message : ""}`);
  }

  console.log("3. Gratis-Grenze (5 eigene Anleitungen)");
  // B hat schon 1 (ownB). Noch 4 per Nutzer-Login erlaubt, die 6. nicht.
  let created = 0;
  for (let i = 0; i < 4; i++) {
    const x = await B.c.from("tutorials").insert({ account_id: B.acc, title: `B ${i}`, status: "draft" });
    if (!x.error) created++;
  }
  ok(created === 4, `Bis zur Grenze anlegen erlaubt (${created}/4)`);
  r = await B.c.from("tutorials").insert({ account_id: B.acc, title: "B zu viel", status: "published" });
  ok(denied(r), `6. Anleitung abgewiesen${r.error ? ` („${r.error.message}“)` : ""}`);
  r = await A.c.from("tutorials").insert({ account_id: A.acc, title: "A ohne Grenze", status: "draft" });
  ok(!r.error, "Business: keine Grenze");

  console.log("4. Härtung 0046");
  if (tpl) {
    r = await B.c.from("account_templates").update({ forked_tutorial_id: ownB.id }).eq("account_id", B.acc).eq("template_id", tpl.id).select();
    ok(denied(r) || !(r.data ?? []).length, "Eigene Anleitung als „angepasste Kopie“ verknüpfen abgewiesen (Gratis-Grenze)");
  }
  r = await B.c.from("tutorials").update({ in_lernen: true }).eq("id", ownB.id).select();
  ok(denied(r) || !(r.data ?? []).length, "Schulung mit Nachweis im Gratis-Tarif abgewiesen");
  r = await A.c.from("tutorials").update({ in_lernen: true }).eq("id", pubA.id).select();
  ok(!r.error && (r.data ?? []).length === 1, `Business: Schulung mit Nachweis erlaubt${r.error ? " — " + r.error.message : ""}`);
  r = await A.c.from("kb_embeddings").insert({ account_id: A.acc, source_type: "tutorial", source_id: draftA.id, chunk: "x", embedding: JSON.stringify(Array(1536).fill(0)), metadata: {} });
  ok(denied(r), "KI-Index per Nutzer-Login schreiben abgewiesen");
  const listed = await B.c.storage.from("tutorial-images-public").list(A.acc);
  ok(!(listed.data ?? []).length, "Öffentlicher Bild-Ordner fremder Konten nicht auflistbar");
  const { data: catA } = await admin.from("categories").insert({ account_id: A.acc, name: `Kat A ${stamp}`, position: 0 }).select("id").single();
  r = await B.c.from("tutorials").update({ category_id: catA.id }).eq("id", ownB.id).select();
  ok(denied(r) || !(r.data ?? []).length, "Kategorie einer fremden Organisation abgewiesen");
  const { data: catB } = await admin.from("categories").insert({ account_id: B.acc, name: `Kat B ${stamp}`, position: 0 }).select("id").single();
  r = await B.c.from("tutorials").update({ category_id: catB.id }).eq("id", ownB.id).select();
  ok(!r.error && (r.data ?? []).length === 1, `Eigene Kategorie erlaubt${r.error ? " — " + r.error.message : ""}`);

  console.log("5. Speicherpfade (0047)");
  r = await A.c.from("steps").insert({ tutorial_id: pubA.id, title: "Trav", position: 90, image_path: `${A.acc}/%2e%2e/${B.acc}/${ownB.id}/x.webp` });
  ok(denied(r), "Prozent-kodiertes ../ im Bildpfad abgewiesen (fremde private Bilder)");
  r = await A.c.from("steps").insert({ tutorial_id: pubA.id, title: "Dot", position: 91, image_path: `${A.acc}/./x.webp` });
  ok(denied(r), "Punkt-Abschnitt im Bildpfad abgewiesen");
  r = await A.c.from("steps").insert({ tutorial_id: pubA.id, title: "Ok", position: 92, image_path: `${A.acc}/${pubA.id}/ok-1a2b.webp` }).select("id").single();
  ok(!r.error, `Normaler eigener Bildpfad erlaubt${r.error ? " — " + r.error.message : ""}`);

  console.log("6. Tarif fremder Konten (0048)");
  r = await B.c.rpc("account_is_business", { aid: A.acc });
  ok(r.data !== true, "Fremdes Business-Konto per RPC nicht erkennbar");
  r = await A.c.rpc("account_is_business", { aid: A.acc });
  ok(r.data === true, "Eigenes Business-Konto weiterhin erkannt");
  r = await A.c.from("tutorials").update({ visibility: "internal" }).eq("id", pubA.id).select();
  ok(!r.error && (r.data ?? []).length === 1, `Business: „Nur Team“ weiterhin erlaubt${r.error ? " — " + r.error.message : ""}`);
  r = await B.c.from("tutorials").update({ visibility: "internal" }).eq("id", ownB.id).select();
  ok(denied(r) || !(r.data ?? []).length, "Gratis: „Nur Team“ weiterhin gesperrt");
} finally {
  for (const acc of accounts) await admin.from("accounts").delete().eq("id", acc);
  for (const uid of users) await admin.auth.admin.deleteUser(uid).catch(() => {});
}
console.log(failed ? `\n✗ ${failed} Prüfung(en) fehlgeschlagen` : "\n✓ Direkte Schreibzugriffe am Server vorbei sind abgesichert");
process.exit(failed ? 1 : 0);
