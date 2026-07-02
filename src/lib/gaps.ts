import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Gap = {
  /** Der (case-insensitiv deduplizierte) Fragetext im Original-Wortlaut. */
  question: string;
  /** Wie oft die (normalisierte) Frage im Zeitraum offen blieb. */
  count: number;
  /** ISO-Zeitpunkt des jüngsten Vorkommens (für die Datumsanzeige). */
  lastAt: string;
};

/**
 * Offene Chat-Fragen (Wissenslücken) eines Kontos: unbeantwortete Chat-Events
 * (type "chat", status "no_answer") der letzten 30 Tage, die noch NICHT in einen
 * Entwurf überführt wurden (handled_at is null). Case-insensitiv nach Wortlaut
 * dedupliziert, mit Trefferzahl und jüngstem Datum — absteigend nach Häufigkeit.
 *
 * Geteilte Quelle für die Dashboard-Insights-Karte (Top-3) und die Seite
 * „Offene Fragen“ (bis zu 25). Liest über den RLS-Client — Mitglieder sehen nur
 * eigene Events.
 */
export async function loadOpenGaps(accountId: string, limit: number): Promise<Gap[]> {
  const supabase = await createClient();
  // Läuft einmal serverseitig (kein Component-Render) — Date.now ist hier legitim.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await supabase
    .from("events")
    .select("question, created_at")
    .eq("account_id", accountId)
    .eq("type", "chat")
    .eq("status", "no_answer")
    .is("handled_at", null)
    .not("question", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(300);

  const dedup = new Map<string, Gap>();
  for (const r of rows ?? []) {
    const raw = (r.question ?? "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const e = dedup.get(key);
    if (e) {
      e.count += 1;
    } else {
      dedup.set(key, { question: raw, count: 1, lastAt: r.created_at as string });
    }
  }

  return [...dedup.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}
