import "server-only";
import OpenAI from "openai";
import { AI } from "@/lib/ai";

let client: OpenAI | null = null;

/** Gemeinsamer OpenAI-Client (server-only). */
export function openai(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: AI.openaiKey });
  return client;
}

/** Text einbetten (text-embedding-3-small, 1536). */
export async function embed(text: string): Promise<number[]> {
  const res = await openai().embeddings.create({
    model: AI.models.embedding,
    input: text.slice(0, 8000),
  });
  return res.data[0].embedding;
}

/** Mehrere Texte einbetten (Batch). */
export async function embedMany(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const res = await openai().embeddings.create({
    model: AI.models.embedding,
    input: texts.map((t) => t.slice(0, 8000)),
  });
  return res.data.map((d) => d.embedding);
}
