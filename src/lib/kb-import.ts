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

/**
 * Erwarteter Import-Fehler (Eingabe/Quelle/Budget) — KEIN Serverfehler.
 * Damit können Aufrufer sauber trennen: die API-Route antwortet mit 422 statt 500 und der
 * Website-Import gibt die Meldung als Ergebnis zurück, statt die Server-Action scheitern zu
 * lassen. So taucht ein Nutzerfehler nicht mehr in der Fehler-Überwachung auf.
 */
export class KbImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KbImportError";
  }
}

const SYSTEM =
  "Du hilfst einer Organisation, aus ihren eigenen Texten (Website oder Dokument) ein " +
  "strukturiertes Organisations-Wissen für einen Kunden-Chatbot zu erstellen. " +
  "Extrahiere NUR belegbare Fakten: Öffnungszeiten, Kontakt (Telefon, E-Mail, Adresse), " +
  "angebotene Leistungen, Abläufe, Zuständigkeiten, Preise (nur wenn konkret genannt), " +
  "Anfahrt, Terminvereinbarung. KEIN Marketing-Blabla, keine Werbefloskeln, keine " +
  "erfundenen Angaben. Wenn ein Fakt nicht im Text steht, lässt du ihn weg. " +
  "Sprich Kundinnen und Kunden höflich in der Sie-Form an.";

/**
 * Wie viele Artikel dürfen aus diesem Text entstehen? Kurze Quellen (ein paar Sätze) ergaben
 * bisher drei fast gleiche Entwürfe — deshalb hängt die Obergrenze an der Textmenge.
 * Rückgabe: [min, max].
 */
export function articleRange(chars: number): [number, number] {
  if (chars < 800) return [1, 1];
  if (chars < 2500) return [1, 3];
  return [3, 8];
}

function buildUser(sourceLabel: string, text: string): string {
  const [min, max] = articleRange(text.length);
  const amount =
    min === max
      ? `Erzeuge GENAU ${min} Wissensartikel — der Text gibt nicht mehr her.`
      : `Erzeuge ${min} bis ${max} EIGENSTÄNDIGE Wissensartikel; nimm die kleinere Zahl, wenn der Text wenig hergibt.`;
  return (
    `Quelle: „${sourceLabel}“.\n\n` +
    "Hier ist der extrahierte Text der Organisation:\n" +
    "---\n" +
    text +
    "\n---\n\n" +
    amount +
    " Jeder Artikel behandelt genau EIN " +
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
    `- ${min === max ? `Genau ${min} Artikel` : `${min} bis ${max} Artikel`}, je nachdem wie viel echtes Wissen im Text steckt.\n` +
    "- Die Artikel dürfen sich inhaltlich NICHT überschneiden: jede Aussage steht in genau " +
    "EINEM Artikel. Keine zwei Artikel mit fast gleichem Inhalt oder ähnlichem Titel.\n" +
    "- Reicht der Text nur für ein Thema, dann gib genau EINEN Artikel zurück — lieber ein " +
    "vollständiger Artikel als mehrere dünne.\n" +
    "- Nur Fakten aus dem Text. Nichts erfinden. Keine leeren/inhaltslosen Artikel.\n" +
    '- "paragraphs" ist Pflicht (mind. 1 Eintrag). "bullets" ist optional (kann [] sein).\n' +
    "- Kein Markdown, kein Text vor oder nach dem JSON."
  );
}

type RawArticle = { title: string; paragraphs: string[]; bullets: string[] };

function coerceArticles(parsed: unknown, max: number): RawArticle[] {
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
    // Harte Grenze passend zur Textmenge: hält die KI sich nicht daran, schneiden wir ab,
    // damit aus zwei Sätzen keine drei fast gleichen Entwürfe entstehen.
    .slice(0, Math.max(1, max));
}

/**
 * Kostenbremse (Sicherheitsprüfung Welle 51, M3): Jeder Import ist ein KI-Aufruf mit bis zu
 * ~40 000 Zeichen. Ohne Grenze könnte ein Konto beliebig viele auslösen. Ohne neue Spalte gezählt:
 * Entwürfe, die das Konto in der letzten Stunde angelegt hat (ein Import erzeugt mehrere).
 */
export const IMPORT_DRAFTS_PER_HOUR = 60;
export async function assertImportBudget(admin: SupabaseClient, accountId: string): Promise<void> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("kb_articles")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("status", "draft")
    .gte("created_at", since);
  if (!error && (count ?? 0) >= IMPORT_DRAFTS_PER_HOUR) {
    throw new KbImportError(
      "Sie haben in der letzten Stunde schon viele Wissens-Entwürfe importiert. Bitte prüfen Sie diese zuerst oder versuchen Sie es in einer Stunde erneut.",
    );
  }
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
  if (!aiConfigured()) throw new KbImportError("Die KI ist nicht aktiviert (OPENAI_API_KEY fehlt).");
  await assertImportBudget(admin, accountId);

  // Unicode-Whitespace (NBSP, schmale/typografische Spaces, ZWSP, ideografisch) -> normal,
  // dann Mehrfach-Spaces/Tabs eindampfen und auf das harte Zeichenbudget kappen.
  const clean = text
    .replace(/[  -​  　]/g, " ")
    .replace(/[ \t]{3,}/g, "  ")
    .trim()
    .slice(0, MAX_INPUT_CHARS);
  if (clean.length < 50) {
    throw new KbImportError("Es wurde zu wenig lesbarer Text gefunden, um Wissen abzuleiten.");
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
    articles = coerceArticles(parsed, articleRange(clean.length)[1]);
  } catch (e) {
    console.error("[kb-import] KI-Fehler:", e instanceof Error ? e.message : e);
    throw new KbImportError("Die Wissens-Artikel konnten nicht erstellt werden. Bitte versuchen Sie es erneut.");
  }

  if (!articles.length) {
    throw new KbImportError("Aus dieser Quelle ließ sich kein verwertbares Wissen ableiten.");
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
