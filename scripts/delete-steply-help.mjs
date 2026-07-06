// Löscht ALLE Doku-Tutorials des STEPLY-Kontos sauber — für den kompletten Neuaufbau der
// Selbst-Doku (/h/steply), Welle 34. NUR das Steply-Konto (slug „steply“); nichts von
// anderen Konten. Vor dem Löschen werden IDs + Titel geloggt.
//
// FK-Kaskaden (0001/0021/0022) erledigen beim Tutorial-Löschen automatisch: steps,
// step_branches, *_translations, tutorial_completions, change_alerts. NICHT kaskadiert und
// daher hier von Hand: kb_embeddings, Storage-Objekte (Bilder privat+public, Audio public),
// video_jobs (deren tutorial_id würde nur auf null gesetzt).
//
// Nutzung:  node --env-file=.env.local scripts/delete-steply-help.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PRIV = "tutorial-images";
const PUB = "tutorial-images-public"; // Bilder-Kopien UND Audio-MP3s liegen hier

const { data: acc } = await sb.from("accounts").select("id, slug").eq("slug", "steply").maybeSingle();
if (!acc) { console.error("Steply-Konto (slug „steply“) nicht gefunden."); process.exit(1); }

const { data: tuts } = await sb.from("tutorials").select("id, title").eq("account_id", acc.id).order("created_at");
if (!tuts?.length) { console.log("Keine Steply-Tutorials vorhanden — nichts zu löschen."); process.exit(0); }

console.log(`Steply-Konto: ${acc.id}`);
console.log(`ZU LÖSCHENDE Tutorials (${tuts.length}) — NUR dieses Konto:`);
for (const t of tuts) console.log(`  • ${t.id}  ${t.title}`);
console.log("");

let ok = 0;
for (const t of tuts) {
  const tid = t.id;
  // Schritt-Pfade (Bilder + Audio) für die Storage-Bereinigung einsammeln.
  const { data: steps } = await sb.from("steps").select("id, image_path, audio_path").eq("tutorial_id", tid);
  const imgs = (steps || []).map((s) => s.image_path).filter(Boolean);
  const auds = (steps || []).map((s) => s.audio_path).filter(Boolean);

  // 1) Storage: private Bilder, öffentliche Bild-Kopien, öffentliche Audios.
  if (imgs.length) {
    await sb.storage.from(PRIV).remove(imgs);
    await sb.storage.from(PUB).remove(imgs);
  }
  if (auds.length) await sb.storage.from(PUB).remove(auds);

  // 2) KB-Embeddings (RAG/Suche) — keine FK, muss von Hand weg.
  await sb.from("kb_embeddings").delete().eq("account_id", acc.id).eq("source_type", "tutorial").eq("source_id", tid);

  // 3) video_jobs entkoppeln/löschen + Quell-Videos entfernen.
  const { data: jobs } = await sb.from("video_jobs").select("id, video_path").eq("tutorial_id", tid);
  for (const j of jobs || []) {
    if (j.video_path) await sb.storage.from("tutorial-videos").remove([j.video_path]);
    await sb.from("video_jobs").delete().eq("id", j.id);
  }

  // 4) Tutorial löschen — Kaskade räumt steps/branches/translations/completions/alerts.
  const { error } = await sb.from("tutorials").delete().eq("id", tid);
  if (error) { console.error(`✗ ${tid}: ${error.message}`); continue; }
  console.log(`✓ gelöscht: ${t.title} (${tid}) — Bilder:${imgs.length} Audio:${auds.length}`);
  ok++;
}
console.log(`\nFertig: ${ok}/${tuts.length} Tutorials des Steply-Kontos gelöscht.`);
