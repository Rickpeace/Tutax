// Vorlesen-Backfill: erzeugt TTS-Audios für ALLE bereits veröffentlichten, öffentlichen
// Tutorials eines Kontos (normalerweise passiert das beim Publish; für Bestands-Tutorials
// einmal nachziehen). Nutzt exakt den produktiven Kern (src/lib/tts-core.ts) + Hash-Cache:
// erneutes Ausführen kostet nichts, solange sich Texte nicht ändern.
// Nutzung:  node --experimental-strip-types --env-file=.env.local scripts/backfill-tts.mjs <account_slug>
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { ensureStepAudioCore } from "../src/lib/tts-core.ts";

const slug = process.argv[2];
if (!slug) { console.error("Aufruf: … scripts/backfill-tts.mjs <account_slug>"); process.exit(1); }

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 });
const cfgBase = { model: "tts-1", voice: "alloy" }; // wie lib/ai.ts (AI.models.tts / ttsVoice)

const { data: acc } = await admin.from("accounts").select("id, plan").eq("slug", slug).single();
if (!acc) { console.error("Konto nicht gefunden:", slug); process.exit(1); }
if (acc.plan !== "business") {
  console.error(`Konto '${slug}' ist '${acc.plan}' — Vorlesen ist Business. Erst Tarif setzen.`);
  process.exit(1);
}

const { data: tuts } = await admin
  .from("tutorials")
  .select("id, title")
  .eq("account_id", acc.id)
  .eq("status", "published")
  .eq("visibility", "public");

let made = 0, skipped = 0, failed = 0;
for (const tut of tuts ?? []) {
  const { data: steps } = await admin
    .from("steps")
    .select("id, title, body, audio_path, audio_hash")
    .eq("tutorial_id", tut.id)
    .order("position");
  for (const step of steps ?? []) {
    try {
      const res = await ensureStepAudioCore(
        admin,
        openai,
        { ...cfgBase, accountId: acc.id, tutorialId: tut.id },
        step,
      );
      if (res === "created") made++;
      else skipped++;
    } catch (e) {
      failed++;
      console.error(`  ✗ ${tut.title} / ${step.title ?? step.id}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`✓ ${tut.title}`);
}
console.log(`\nFertig: ${made} erzeugt, ${skipped} übersprungen (Cache/leer), ${failed} Fehler.`);
