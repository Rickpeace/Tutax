import "server-only";

/**
 * Zentrale KI-Konfiguration. Entscheidung: ALLES über OpenAI (einfacher).
 * Sobald OPENAI_API_KEY in .env.local steht, sind alle KI-Features aktiv —
 * kein Code-Change nötig.
 */
export const AI = {
  openaiKey: process.env.OPENAI_API_KEY ?? "",
  models: {
    chat: "gpt-5.4-mini", // Chatbot (RAG), Klassifikation & Drift (gpt-4o* sind deprecated)
    vision: "gpt-5.4-mini", // CI-Analyse + KI-Schritt-Assistent (mini kann Vision, kosteneffizient)
    embedding: "text-embedding-3-small", // 1536 Dimensionen (Index-kompatibel)
    // Vorlesen: gpt-4o-mini-tts spricht deutlich natürlicheres Deutsch als tts-1 und
    // versteht Stil-Anweisungen. Erzeugung nur beim Veröffentlichen + Hash-Cache
    // (steps.audio_hash, Anbieter+Modell+Stimme+scriptVersion im Hash) -> im Viewer
    // NIE on-the-fly.
    tts: "gpt-4o-mini-tts",
  },
  // Feste Stimme in v1 (kein Settings-UI). „onyx" = tief, ruhig — Richards Wahl (02.07.).
  ttsVoice: "onyx",
  // Stil-Anweisung für gpt-4o-mini-tts (tts-1 kennt das Feld nicht).
  ttsInstructions:
    "Sprich klares, natürliches Deutsch. Freundlich, ruhig und professionell, wie eine gute Software-Anleitung.",
  embeddingDim: 1536,

  /**
   * TTS-Provider-Wahl (Welle 19). ElevenLabs klingt in Tests deutlich natürlicher als
   * OpenAI-TTS — WENN ein Key gesetzt ist, wird er genutzt; sonst OpenAI wie bisher.
   * Kein Settings-UI: die Wahl kommt allein aus Umgebungsvariablen.
   */
  elevenLabsKey: process.env.ELEVENLABS_API_KEY ?? "",
  // Stimme für ElevenLabs. ANPASSEN: Default ist „Rachel" (multilingual, gut für v2) —
  // eine deutsche/multilinguale Stimme kann per ELEVENLABS_VOICE_ID gesetzt werden.
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM",
  elevenLabsModel: "eleven_multilingual_v2",
} as const;

/** Aktiver TTS-Anbieter (nur env-basiert, kein Settings-UI in v1). */
export const ttsProvider = (): "elevenlabs" | "openai" =>
  AI.elevenLabsKey.length > 0 ? "elevenlabs" : "openai";

/** Sind die KI-Features einsatzbereit? */
export const aiConfigured = () => AI.openaiKey.length > 0;
export const embeddingsConfigured = aiConfigured;
