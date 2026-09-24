import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { HubLang } from "@/lib/i18n-hub";

/**
 * Gemeinsame Helfer für die öffentliche KI-Suche (/api/hub-search) und die Chat-Quellen
 * (/api/chat) — beide lesen dieselben match_kb-Treffer (Audit 24.09.).
 */

/** Eine Zeile aus match_kb (Migration 0005). */
export type KbMatch = {
  source_type?: string;
  source_id?: string;
  chunk: string;
  metadata: { title?: string; slug?: string; category?: string | null };
  similarity: number;
};

/**
 * Mindest-Ähnlichkeit (Kosinus, text-embedding-3-small), ab der ein Treffer als „passend“
 * gilt. match_kb liefert IMMER die besten n — ohne Schwelle schlug „Meinten Sie“ bei
 * Unsinn („asdfgh“) beliebige Anleitungen vor. Gemessen am Demo-Konto (24.09.2026,
 * scripts/test-hub-similarity.mjs): Unsinn 0,15–0,20; deutsche Fremdthemen-FRAGEN bis 0,33
 * („Wie wird das Wetter morgen?“ 0,33, „Kochrezept“ 0,31); echte deutsche Stichworte und
 * Fragen ab 0,41 („Digitale“ 0,41, „Belege“ 0,55, „Passwort vergessen“ 0,59).
 * → 0,35 liegt sauber in der Lücke.
 */
export const MIN_SIMILARITY = 0.35;
/**
 * Fremdsprachige Seite (Anfrage EN/PL/TR gegen den deutschen Index): sprachübergreifend
 * liegen echte Treffer niedriger („upload receipts“ 0,38, „faktura“ 0,35, „hasło“ 0,40),
 * englische Fremdthemen aber auch („weather tomorrow“ 0,15, „bake a cake“ 0,18) → 0,3.
 */
export const MIN_SIMILARITY_CROSS_LANG = 0.3;
/**
 * Chat-Kontext: nur offensichtliches Rauschen wegfiltern (< 0,25). Der Chat braucht auch
 * lose passende Inhalte für Rückfragen; Quellen wählt ohnehin das Modell (nur „genutzte“).
 */
export const MIN_SIMILARITY_CHAT = 0.25;

/** Nur Treffer ab der Mindest-Ähnlichkeit (Reihenfolge bleibt: beste zuerst). */
export function relevantMatches(rows: KbMatch[], min: number): KbMatch[] {
  return rows.filter((r) => typeof r.similarity === "number" && r.similarity >= min);
}

/**
 * Übersetzte Anleitungs-Titel (tutorial_translations) für eine Sprache: tutorialId → Titel.
 * Deutsch oder Fehler → leeres Objekt (Aufrufer fallen auf den deutschen Titel zurück).
 */
export async function translatedTitles(
  admin: ReturnType<typeof createAdminClient>,
  lang: HubLang,
  tutorialIds: string[],
  /** Nur Titel von Anleitungen DIESES Kontos (veröffentlicht + öffentlich) bzw. globaler Vorlagen —
   *  die IDs stammen aus kb_embeddings; ohne Filter verriet eine fremde ID den Titel eines fremden
   *  Entwurfs (Sicherheits-Audit 24.09.). */
  accountId: string,
): Promise<Record<string, string>> {
  const ids = [...new Set(tutorialIds.filter(Boolean))];
  if (lang === "de" || !ids.length) return {};
  try {
    const { data } = await admin
      .from("tutorial_translations")
      .select("tutorial_id, title, tutorials!inner(account_id, is_template, status, visibility)")
      .eq("lang", lang)
      .in("tutorial_id", ids);
    const out: Record<string, string> = {};
    for (const r of data ?? []) {
      const t = (Array.isArray(r.tutorials) ? r.tutorials[0] : r.tutorials) as
        | { account_id: string | null; is_template: boolean; status: string; visibility: string }
        | undefined;
      const allowed =
        !!t &&
        t.status === "published" &&
        t.visibility === "public" &&
        (t.account_id === accountId || (t.is_template && t.account_id === null));
      if (!allowed) continue;
      const title = String(r.title ?? "").trim();
      if (title) out[r.tutorial_id as string] = title;
    }
    return out;
  } catch {
    return {};
  }
}
