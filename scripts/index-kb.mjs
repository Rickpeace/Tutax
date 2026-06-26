// Einmaliges (Re-)Indexieren aller Inhalte für den Chatbot-RAG.
// Nutzung:  node --env-file=.env.local scripts/index-kb.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error("✗ OPENAI_API_KEY fehlt.");
  process.exit(1);
}
const admin = createClient(url, secret, { auth: { persistSession: false } });
const EMBED_MODEL = "text-embedding-3-small";

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
function chunkText(text, maxLen = 800) {
  const parts = text.split(/\n{2,}|\.(?:\s+)/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).length > maxLen && cur) { chunks.push(cur.trim()); cur = p; }
    else cur = cur ? `${cur}. ${p}` : p;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}
async function embedMany(texts) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.data.map((d) => d.embedding);
}
async function insertChunks(accountId, sourceType, sourceId, chunks, meta) {
  await admin.from("kb_embeddings").delete()
    .eq("account_id", accountId).eq("source_type", sourceType).eq("source_id", sourceId);
  if (!chunks.length) return 0;
  const vectors = await embedMany(chunks);
  const rows = chunks.map((c, i) => ({
    account_id: accountId, source_type: sourceType, source_id: sourceId,
    chunk: c, embedding: JSON.stringify(vectors[i]), metadata: meta,
  }));
  await admin.from("kb_embeddings").insert(rows);
  return chunks.length;
}

async function indexTutorialFor(accountId, tutorialId) {
  const { data: tut } = await admin.from("tutorials").select("title, slug, category_id").eq("id", tutorialId).single();
  if (!tut) return 0;
  let category = null;
  if (tut.category_id) {
    const { data: cat } = await admin.from("categories").select("name").eq("id", tut.category_id).single();
    category = cat?.name ?? null;
  }
  const { data: steps } = await admin.from("steps").select("title, body, position")
    .eq("tutorial_id", tutorialId).order("position", { ascending: true });
  const meta = { title: tut.title, slug: tut.slug, category };
  const chunks = [`Anleitung: ${tut.title}`];
  for (const s of steps ?? []) {
    const txt = [s.title, plainBody(s.body)].filter(Boolean).join(": ");
    if (txt.trim()) chunks.push(`${tut.title} – ${txt}`);
  }
  return insertChunks(accountId, "tutorial", tutorialId, chunks, meta);
}
async function indexArticle(a) {
  const text = plainBody(a.body);
  const chunks = [`Wissensartikel: ${a.title}`, ...chunkText(text).map((p) => `${a.title} – ${p}`)];
  return insertChunks(a.account_id, "kb_article", a.id, chunks, { title: a.title });
}

let total = 0;

// 1) Eigene veröffentlichte Tutorials (inkl. Forks)
const { data: own } = await admin.from("tutorials")
  .select("id, account_id").eq("status", "published").eq("is_template", false).not("account_id", "is", null);
for (const t of own ?? []) { const n = await indexTutorialFor(t.account_id, t.id); total += n; console.log(`  tutorial ${t.id.slice(0,8)} (${n} chunks)`); }

// 2) Veröffentlichte Wissensartikel
const { data: arts } = await admin.from("kb_articles").select("id, account_id, title, body").eq("status", "published");
for (const a of arts ?? []) { const n = await indexArticle(a); total += n; console.log(`  artikel "${a.title}" (${n} chunks)`); }

// 3) Aktivierte Standard-Templates (nicht geforkt) -> pro Kanzlei indexieren
const { data: ats } = await admin.from("account_templates")
  .select("account_id, template_id, enabled, forked_tutorial_id").eq("enabled", true).is("forked_tutorial_id", null);
for (const r of ats ?? []) {
  const { data: tpl } = await admin.from("tutorials").select("status").eq("id", r.template_id).single();
  if (tpl?.status !== "published") continue;
  const n = await indexTutorialFor(r.account_id, r.template_id);
  total += n; console.log(`  template ${r.template_id.slice(0,8)} -> account ${r.account_id.slice(0,8)} (${n} chunks)`);
}

console.log(`\n✓ Indexierung fertig: ${total} Chunks.`);
