import "server-only";
import OpenAI from "openai";
import { AI } from "@/lib/ai";

let client: OpenAI | null = null;

/**
 * Gemeinsamer OpenAI-Client (server-only).
 *
 * SDK-Default ist timeout: 600 s / maxRetries: 2 – viel zu lang für unsere
 * Serverless-Routen (maxDuration ≤ 30 s). Wir kappen bewusst: ein hängender
 * Aufruf (Embeddings ODER Chat/Vision) darf die Function nicht ohne Antwort
 * ins Timeout laufen lassen. 20 s deckt sowohl kurze Embeddings als auch
 * längere Vision-Calls (detail:high) ab; ein einziger Retry fängt transiente
 * Netzfehler, ohne das Zeitbudget zu sprengen.
 */
export function openai(): OpenAI {
  if (!client)
    client = new OpenAI({ apiKey: AI.openaiKey, timeout: 20_000, maxRetries: 1 });
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
