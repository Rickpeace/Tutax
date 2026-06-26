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
    .select("title, slug")
    .eq("id", tutorialId)
    .single();
  if (!tut) return;

  const { data: steps } = await admin
    .from("steps")
    .select("title, body, position")
    .eq("tutorial_id", tutorialId)
    .order("position", { ascending: true });

  const meta = { title: tut.title, slug: tut.slug };
  const chunks: { text: string; meta: typeof meta }[] = [
    { text: `Anleitung: ${tut.title}`, meta },
  ];
  for (const s of steps ?? []) {
    const txt = [s.title, plainBody(s.body)].filter(Boolean).join(": ");
    if (txt.trim()) chunks.push({ text: `${tut.title} – ${txt}`, meta });
  }

  await admin
    .from("kb_embeddings")
    .delete()
    .eq("source_type", "tutorial")
    .eq("source_id", tutorialId);

  const vectors = await embedMany(chunks.map((c) => c.text));
  const rows = chunks.map((c, i) => ({
    account_id: accountId,
    source_type: "tutorial",
    source_id: tutorialId,
    chunk: c.text,
    embedding: JSON.stringify(vectors[i]), // pgvector akzeptiert "[...]"-Textform
    metadata: c.meta,
  }));
  await admin.from("kb_embeddings").insert(rows);
}

export async function removeTutorialEmbeddings(
  admin: SupabaseClient,
  tutorialId: string,
): Promise<void> {
  await admin
    .from("kb_embeddings")
    .delete()
    .eq("source_type", "tutorial")
    .eq("source_id", tutorialId);
}
