import "server-only";

/**
 * Zentrale KI-Konfiguration. Entscheidung: ALLES über OpenAI (einfacher).
 * Sobald OPENAI_API_KEY in .env.local steht, sind alle KI-Features aktiv —
 * kein Code-Change nötig.
 */
export const AI = {
  openaiKey: process.env.OPENAI_API_KEY ?? "",
  models: {
    chat: "gpt-4o-mini", // Chatbot (RAG) & Drift-Bewertung
    vision: "gpt-4o", // CI-Analyse aus Website/og:image (§8)
    embedding: "text-embedding-3-small", // 1536 Dimensionen (§11)
  },
  embeddingDim: 1536,
} as const;

/** Sind die KI-Features einsatzbereit? */
export const aiConfigured = () => AI.openaiKey.length > 0;
export const embeddingsConfigured = aiConfigured;
