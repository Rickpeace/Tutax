// Mindest-Ähnlichkeit der KI-Suche / Chat-Quellen prüfen (Audit 24.09.2026).
// Liest NUR (Embedding + match_kb) — schreibt nichts. Zeigt je Anfrage die besten
// Treffer mit Ähnlichkeit und prüft: Unsinn/Fremdthemen liegen UNTER der Schwelle,
// echte Stichworte (DE und EN) darüber. Schwellen: src/app/api/hub-search/kb-match.ts.
//
// Nutzung:  node --env-file=.env.local scripts/test-hub-similarity.mjs [konto-slug]
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const MIN = 0.35; // = MIN_SIMILARITY
const MIN_X = 0.3; // = MIN_SIMILARITY_CROSS_LANG

const slug = process.argv[2] || "demo";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const oa = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

const { data: acc } = await admin.from("accounts").select("id, name").eq("slug", slug).single();
if (!acc) throw new Error(`Konto ${slug} fehlt`);
const { data: titles } = await admin
  .from("kb_embeddings")
  .select("metadata")
  .eq("account_id", acc.id)
  .eq("source_type", "tutorial")
  .limit(400);
const uniq = [...new Set((titles ?? []).map((r) => r.metadata?.title).filter(Boolean))];
console.log(`Konto ${acc.name}: ${uniq.length} indizierte Anleitungen`);
if (!uniq.length) {
  console.log("Kein Index — nichts zu messen.");
  process.exit(0);
}

async function top(q) {
  const e = await oa.embeddings.create({ model: "text-embedding-3-small", input: q });
  const { data, error } = await admin.rpc("match_kb", {
    p_account: acc.id,
    p_embedding: JSON.stringify(e.data[0].embedding),
    p_count: 3,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Echte Stichworte aus den eigenen Titeln ableiten (erstes längeres Wort) — kontounabhängig.
const firstWord = (t) => (t.match(/[A-Za-zÄÖÜäöüß]{5,}/) ?? [t])[0];
const onTopic = uniq.slice(0, 3).map(firstWord);
// [Anfrage, erwartet über (true) / unter (false) der Schwelle, Schwelle]
const cases = [
  ["asdfgh", false, MIN_X],
  ["qwertzuiop lkjh", false, MIN_X],
  ["xyz 123 blub", false, MIN_X],
  ["Wie backe ich einen Apfelkuchen?", false, MIN],
  ["Wie wird das Wetter morgen?", false, MIN],
  ["weather tomorrow", false, MIN_X],
  ["how do I bake a cake", false, MIN_X],
  ...onTopic.map((q) => [q, true, MIN]),
  // Kanzlei-Demo: sprachübergreifende Stichworte (EN/PL/TR gegen deutschen Index).
  ...(slug === "demo"
    ? [
        ["upload receipts", true, MIN_X],
        ["payslip", true, MIN_X],
        ["hasło", true, MIN_X],
        ["şifre", true, MIN_X],
        ["Passwort vergessen", true, MIN],
      ]
    : []),
];

for (const [q, above, min] of cases) {
  const rows = await top(q);
  const best = rows[0]?.similarity ?? 0;
  console.log(`  „${q}“ → ${rows.map((r) => `${r.similarity.toFixed(3)} ${r.metadata?.title ?? "Info"}`).join(" | ")}`);
  ok(above ? best >= min : best < min, `„${q}“ ${above ? "über" : "unter"} ${min} (${best.toFixed(3)})`);
}

console.log(failed ? "\nFEHLER" : "\nAlle Prüfungen bestanden");
process.exit(failed ? 1 : 0);
