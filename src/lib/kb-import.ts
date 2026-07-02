import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI, aiConfigured } from "@/lib/ai";
import { openai } from "@/lib/openai";

/**
 * Geteilter Kern für den Wissens-Import (Website + Dokument): nimmt Rohtext, lässt die
 * KI daraus eigenständige FAQ-würdige Wissensartikel extrahieren und legt sie als
 * ENTWÜRFE (status draft) an. Nie auto-publish — published fließt in den Chatbot-RAG,
 * das prüft und veröffentlicht der Inhaber selbst.
 */

// Harte Obergrenze (Kostenbremse): der Text wird VOR dem KI-Call gekappt.
export const MAX_INPUT_CHARS = 60_000;

// Tiptap-Doc aus Absätzen/Listen bauen (gleiches Schema wie mkBody in bestehenden Actions).
type Block =
  | { type: "paragraph"; content?: { type: "text"; text: string }[] }
  | { type: "bulletList"; content: { type: "listItem"; content: Block[] }[] };

function paragraph(text: string): Block {
  const t = text.trim();
  return { type: "paragraph", content: t ? [{ type: "text", text: t }] : [] };
}

function bulletList(items: string[]): Block {
  return {
    type: "bulletList",
    content: items
      .map((i) => i.trim())
      .filter(Boolean)
      .map((i) => ({ type: "listItem" as const, content: [paragraph(i)] })),
  };
}

/** KI-Ausgabe (Absätze + optionale Aufzählungen) in ein Tiptap-Doc gießen. */
function mkBody(paragraphs: string[], bullets: string[]): { type: "doc"; content: Block[] } {
  const content: Block[] = [];
  for (const p of paragraphs.map((s) => s.trim()).filter(Boolean)) content.push(paragraph(p));
  const cleanBullets = bullets.map((s) => s.trim()).filter(Boolean);
  if (cleanBullets.length) content.push(bulletList(cleanBullets));
  if (!content.length) content.push(paragraph(""));
  return { type: "doc", content };
}

export type ImportResult = { count: number; titles: string[] };

const SYSTEM =
  "Du hilfst einer Organisation, aus ihren eigenen Texten (Website oder Dokument) ein " +
  "strukturiertes Organisations-Wissen für einen Kunden-Chatbot zu erstellen. " +
  "Extrahiere NUR belegbare Fakten: Öffnungszeiten, Kontakt (Telefon, E-Mail, Adresse), " +
  "angebotene Leistungen, Abläufe, Zuständigkeiten, Preise (nur wenn konkret genannt), " +
  "Anfahrt, Terminvereinbarung. KEIN Marketing-Blabla, keine Werbefloskeln, keine " +
  "erfundenen Angaben. Wenn ein Fakt nicht im Text steht, lässt du ihn weg. " +
  "Sprich Kundinnen und Kunden höflich in der Sie-Form an.";

function buildUser(sourceLabel: string, text: string): string {
  return (
    `Quelle: „${sourceLabel}“.\n\n` +
    "Hier ist der extrahierte Text der Organisation:\n" +
    "---\n" +
    text +
    "\n---\n\n" +
    "Erzeuge 3 bis 8 EIGENSTÄNDIGE Wissensartikel. Jeder Artikel behandelt genau EIN " +
    "Thema (z. B. „Öffnungszeiten“, „Kontakt & Anfahrt“, „Unsere Leistungen“). " +
    "Antworte AUSSCHLIESSLICH als JSON-Objekt nach diesem Schema:\n" +
    "{\n" +
    '  "articles": [\n' +
    "    {\n" +
    '      "title": "kurzer, klarer Titel (Deutsch, ohne Anführungszeichen)",\n' +
    '      "paragraphs": ["ein oder mehrere Fließtext-Absätze (Sie-Form)"],\n' +
    '      "bullets": ["optionale Stichpunkte, z. B. einzelne Leistungen — leer lassen wenn unpassend"]\n' +
    "    }\n" +
    "  ]\n" +
    "}\n\n" +
    "Regeln:\n" +
    "- 3 bis 8 Artikel, je nachdem wie viel echtes Wissen im Text steckt.\n" +
    "- Nur Fakten aus dem Text. Nichts erfinden. Keine leeren/inhaltslosen Artikel.\n" +
    '- "paragraphs" ist Pflicht (mind. 1 Eintrag). "bullets" ist optional (kann [] sein).\n' +
    "- Kein Markdown, kein Text vor oder nach dem JSON."
  );
}

type RawArticle = { title: string; paragraphs: string[]; bullets: string[] };

function coerceArticles(parsed: unknown): RawArticle[] {
  const list = (parsed as { articles?: unknown })?.articles;
  if (!Array.isArray(list)) return [];
  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return list
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({
      title: typeof a.title === "string" ? a.title.trim().slice(0, 200) : "",
      paragraphs: asStrings(a.paragraphs).map((p) => p.trim()).filter(Boolean),
      bullets: asStrings(a.bullets).map((b) => b.trim()).filter(Boolean),
    }))
    .filter((a) => a.title && (a.paragraphs.length > 0 || a.bullets.length > 0))
    .slice(0, 8);
}

/**
 * Aus Rohtext KI-Wissensartikel extrahieren und als Drafts in kb_articles anlegen.
 * @param admin  Admin-Client (RLS umgehen, aber Insert immer mit account_id begrenzt).
 * @param accountId  Ziel-Konto.
 * @param sourceLabel  Herkunft (URL oder Dateiname) — als Kontext an die KI.
 * @param text  Bereits extrahierter Klartext (wird zusätzlich hart auf MAX_INPUT_CHARS gekappt).
 * @throws Error mit deutscher, nutzbarer Meldung bei Konfigurations-/KI-/DB-Fehlern.
 */
export async function textToDraftArticles(
  admin: SupabaseClient,
  accountId: string,
  sourceLabel: string,
  text: string,
): Promise<ImportResult> {
  if (!aiConfigured()) throw new Error("Die KI ist nicht aktiviert (OPENAI_API_KEY fehlt).");

  // Unicode-Whitespace (NBSP, schmale/typografische Spaces, ZWSP, ideografisch) -> normal,
  // dann Mehrfach-Spaces/Tabs eindampfen und auf das harte Zeichenbudget kappen.
  const clean = text
    .replace(/[  -​  　]/g, " ")
    .replace(/[ \t]{3,}/g, "  ")
    .trim()
    .slice(0, MAX_INPUT_CHARS);
  if (clean.length < 50) {
    throw new Error("Es wurde zu wenig lesbarer Text gefunden, um Wissen abzuleiten.");
  }

  let articles: RawArticle[];
  try {
    const completion = await openai().chat.completions.create({
      model: AI.models.chat,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUser(sourceLabel.slice(0, 200), clean) },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2500,
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    articles = coerceArticles(parsed);
  } catch (e) {
    console.error("[kb-import] KI-Fehler:", e instanceof Error ? e.message : e);
    throw new Error("Die Wissens-Artikel konnten nicht erstellt werden. Bitte versuchen Sie es erneut.");
  }

  if (!articles.length) {
    throw new Error("Aus dieser Quelle ließ sich kein verwertbares Wissen ableiten.");
  }

  const rows = articles.map((a) => ({
    account_id: accountId,
    title: a.title,
    body: mkBody(a.paragraphs, a.bullets),
    status: "draft" as const,
  }));

  const { data, error } = await admin.from("kb_articles").insert(rows).select("title");
  if (error) {
    console.error("[kb-import] DB-Insert-Fehler:", error);
    throw new Error("Die Entwürfe konnten nicht gespeichert werden.");
  }

  const titles = (data ?? []).map((r) => r.title as string);
  return { count: titles.length, titles };
}
