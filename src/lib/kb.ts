import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedMany } from "@/lib/openai";
import { embeddingsConfigured } from "@/lib/ai";

/** Tiptap-JSON -> Klartext. */
function plainBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const node = n as { text?: string; content?: unknown[] };
    if (typeof node.text === "string") out.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(body);
  return out.join(" ").trim();
}

/**
 * Indiziert ein (veröffentlichtes) Tutorial für die semantische Suche.
 * No-op, wenn kein OPENAI_API_KEY gesetzt ist.
 */
export async function indexTutorial(
  admin: SupabaseClient,
  accountId: string,
  tutorialId: string,
): Promise<void> {
  if (!embeddingsConfigured()) return;

  const { data: tut } = await admin
    .from("tutorials")
    .select("title, slug, category_id")
    .eq("id", tutorialId)
    .single();
  if (!tut) return;

  let category: string | null = null;
  if (tut.category_id) {
    const { data: cat } = await admin.from("categories").select("name").eq("id", tut.category_id).single();
    category = cat?.name ?? null;
  }

  const { data: steps } = await admin
    .from("steps")
    .select("title, body, position")
    .eq("tutorial_id", tutorialId)
    .order("position", { ascending: true });

  const meta = { title: tut.title, slug: tut.slug, category };
  const chunks: { text: string; meta: typeof meta }[] = [
    { text: `Anleitung: ${tut.title}`, meta },
  ];
  for (const s of steps ?? []) {
    const txt = [s.title, plainBody(s.body)].filter(Boolean).join(": ");
    if (txt.trim()) chunks.push({ text: `${tut.title} – ${txt}`, meta });
  }

  const del = await admin
    .from("kb_embeddings")
    .delete()
    .eq("account_id", accountId)
    .eq("source_type", "tutorial")
    .eq("source_id", tutorialId);
  if (del.error) {
    console.error("[kb] delete tutorial embeddings failed", { tutorialId, error: del.error });
    throw new Error(`Index-Bereinigung fehlgeschlagen: ${del.error.message}`);
  }

  const vectors = await embedMany(chunks.map((c) => c.text));
  const rows = chunks.map((c, i) => ({
    account_id: accountId,
    source_type: "tutorial",
    source_id: tutorialId,
    chunk: c.text,
    embedding: JSON.stringify(vectors[i]), // pgvector akzeptiert "[...]"-Textform
    metadata: c.meta,
  }));
  const ins = await admin.from("kb_embeddings").insert(rows);
  if (ins.error) {
    console.error("[kb] insert tutorial embeddings failed", { tutorialId, error: ins.error });
    throw new Error(`Index-Aktualisierung fehlgeschlagen: ${ins.error.message}`);
  }
}

export async function removeTutorialEmbeddings(
  admin: SupabaseClient,
  tutorialId: string,
): Promise<void> {
  const { error } = await admin
    .from("kb_embeddings")
    .delete()
    .eq("source_type", "tutorial")
    .eq("source_id", tutorialId);
  if (error) {
    console.error("[kb] remove tutorial embeddings failed", { tutorialId, error });
    throw new Error(`Index-Bereinigung fehlgeschlagen: ${error.message}`);
  }
}

/** Klartext in handliche Chunks (~maxLen Zeichen, an Absätzen entlang). */
function chunkText(text: string, maxLen = 800): string[] {
  const parts = text.split(/\n{2,}|\.(?:\s+)/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).length > maxLen && cur) {
      chunks.push(cur.trim());
      cur = p;
    } else {
      cur = cur ? `${cur}. ${p}` : p;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

/**
 * Indiziert einen Wissensartikel für die semantische Suche (Chatbot-RAG).
 * Nur veröffentlichte Artikel; No-op ohne OPENAI_API_KEY.
 */
export async function indexArticle(
  admin: SupabaseClient,
  accountId: string,
  articleId: string,
): Promise<void> {
  if (!embeddingsConfigured()) return;

  const { data: a } = await admin
    .from("kb_articles")
    .select("title, body, status")
    .eq("id", articleId)
    .single();

  // Vorhandene Embeddings immer entfernen (Update/Unpublish/Delete).
  const del = await admin
    .from("kb_embeddings")
    .delete()
    .eq("source_type", "kb_article")
    .eq("source_id", articleId);
  if (del.error) {
    console.error("[kb] delete article embeddings failed", { articleId, error: del.error });
    throw new Error(`Index-Bereinigung fehlgeschlagen: ${del.error.message}`);
  }

  if (!a || a.status !== "published") return;

  const meta = { title: a.title }; // kein slug -> wird als Kontext genutzt, nicht verlinkt
  const text = plainBody(a.body);
  const chunks = [`Wissensartikel: ${a.title}`];
  for (const part of chunkText(text)) chunks.push(`${a.title} – ${part}`);

  const vectors = await embedMany(chunks);
  const rows = chunks.map((c, i) => ({
    account_id: accountId,
    source_type: "kb_article",
    source_id: articleId,
    chunk: c,
    embedding: JSON.stringify(vectors[i]),
    metadata: meta,
  }));
  const ins = await admin.from("kb_embeddings").insert(rows);
  if (ins.error) {
    console.error("[kb] insert article embeddings failed", { articleId, error: ins.error });
    throw new Error(`Index-Aktualisierung fehlgeschlagen: ${ins.error.message}`);
  }
}

export async function removeArticleEmbeddings(
  admin: SupabaseClient,
  articleId: string,
): Promise<void> {
  const { error } = await admin
    .from("kb_embeddings")
    .delete()
    .eq("source_type", "kb_article")
    .eq("source_id", articleId);
  if (error) {
    console.error("[kb] remove article embeddings failed", { articleId, error });
    throw new Error(`Index-Bereinigung fehlgeschlagen: ${error.message}`);
  }
}
