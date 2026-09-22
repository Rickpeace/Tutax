import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedMany } from "@/lib/openai";
import { embeddingsConfigured } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";

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
    .select("title, slug, category_id, visibility")
    .eq("id", tutorialId)
    .single();
  if (!tut) return;
  // Zentraler Schutz für ALLE Aufrufer (Publish/Miner/Cron): interne Tutorials
  // dürfen NIE in den Chatbot-RAG-Index. Nur 'public' wird indiziert.
  if (tut.visibility !== "public") return;

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

  const vectors = await embedMany(chunks.map((c) => c.text));
  await replaceSource(
    admin,
    accountId,
    "tutorial",
    tutorialId,
    chunks.map((c, i) => ({ chunk: c.text, embedding: vectors[i], metadata: c.meta })),
  );
}

/**
 * Index-Zeilen einer Quelle atomar ersetzen (RPC replace_kb_source, Migration 0040):
 * Delete+Insert in EINER Transaktion, per Advisory-Lock serialisiert — parallele
 * Hintergrund-Reindexe (mehrere Saves kurz hintereinander) erzeugen so keine Duplikate.
 */
async function replaceSource(
  admin: SupabaseClient,
  accountId: string,
  sourceType: "tutorial" | "kb_article",
  sourceId: string,
  rows: { chunk: string; embedding: number[]; metadata: Record<string, unknown> }[],
): Promise<void> {
  const { error } = await admin.rpc("replace_kb_source", {
    p_account: accountId,
    p_source_type: sourceType,
    p_source_id: sourceId,
    p_rows: rows.map((r) => ({ ...r, embedding: JSON.stringify(r.embedding) })), // pgvector-Textform "[...]"
  });
  if (!error) return;
  // Übergang: Migration 0040 noch nicht eingespielt -> bisheriger Weg (Delete, dann Insert).
  if (error.code === "PGRST202") {
    const del = await admin
      .from("kb_embeddings")
      .delete()
      .eq("account_id", accountId)
      .eq("source_type", sourceType)
      .eq("source_id", sourceId);
    const ins = del.error
      ? del
      : await admin.from("kb_embeddings").insert(
          rows.map((r) => ({
            account_id: accountId,
            source_type: sourceType,
            source_id: sourceId,
            chunk: r.chunk,
            embedding: JSON.stringify(r.embedding),
            metadata: r.metadata,
          })),
        );
    if (!ins.error) return;
    console.error("[kb] replace embeddings (fallback) failed", { sourceType, sourceId, error: ins.error });
    throw new Error(`Index-Aktualisierung fehlgeschlagen: ${ins.error.message}`);
  }
  console.error("[kb] replace embeddings failed", { sourceType, sourceId, error });
  throw new Error(`Index-Aktualisierung fehlgeschlagen: ${error.message}`);
}

/**
 * Nach einer inhaltlichen Änderung (Schritt/Titel/Kategorie) den Chatbot-Index nachziehen —
 * aber NUR, wenn die Anleitung live ist (veröffentlicht + öffentlich). Entwürfe und interne
 * Anleitungen dürfen nie in den Index. Für after(): wirft nie, loggt Fehler.
 * Vorlagen (is_template) sind pro aktivierendem Konto indiziert und bleiben außen vor.
 */
export async function reindexTutorialIfLive(tutorialId: string): Promise<void> {
  try {
    if (!embeddingsConfigured()) return;
    const admin = createAdminClient();
    const { data: t } = await admin
      .from("tutorials")
      .select("account_id, status, visibility, is_template")
      .eq("id", tutorialId)
      .maybeSingle();
    if (!t || !t.account_id || t.is_template) return;
    if (t.status !== "published" || t.visibility !== "public") return;
    await indexTutorial(admin, t.account_id, tutorialId);
  } catch (e) {
    console.error("[kb] Reindex nach Änderung fehlgeschlagen:", tutorialId, e instanceof Error ? e.message : e);
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

  if (!a || a.status !== "published") {
    // Nicht (mehr) veröffentlicht: Index entfernen (Unpublish/Delete).
    await removeArticleEmbeddings(admin, articleId);
    return;
  }

  const meta = { title: a.title }; // kein slug -> wird als Kontext genutzt, nicht verlinkt
  const text = plainBody(a.body);
  const chunks = [`Wissensartikel: ${a.title}`];
  for (const part of chunkText(text)) chunks.push(`${a.title} – ${part}`);

  const vectors = await embedMany(chunks);
  await replaceSource(
    admin,
    accountId,
    "kb_article",
    articleId,
    chunks.map((c, i) => ({ chunk: c, embedding: vectors[i], metadata: meta })),
  );
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
