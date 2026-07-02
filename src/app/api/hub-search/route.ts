import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiConfigured } from "@/lib/ai";
import { embed } from "@/lib/openai";

export const maxDuration = 30;

type Result = { title: string; slug: string };

// Best-effort Rate-Limit (pro Instanz, ohne externe Infra) gegen Kosten-DoS auf dem
// öffentlichen Such-Endpunkt. Muster wie in /api/chat. Input ist zusätzlich hart
// gekappt (Frage 200 Zeichen).
const RL = new Map<string, { count: number; reset: number }>();
function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const e = RL.get(key);
  if (!e || e.reset < now) {
    RL.set(key, { count: 1, reset: now + windowMs });
    if (RL.size > 5000) for (const [k, v] of RL) if (v.reset < now) RL.delete(k); // simple Bereinigung
    return false;
  }
  e.count += 1;
  return e.count > limit;
}

/**
 * Semantische Hub-Suche: bettet die Frage ein und schlägt über das vorhandene
 * pgvector-RAG (match_kb) passende Anleitungen vor. Liefert nur Titel + Slug
 * eindeutiger Anleitungen — kein Chat, keine KI-Textgenerierung.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const accountSlug = String(body.accountSlug ?? "").trim();
  const q = String(body.q ?? "").trim().slice(0, 200);
  if (!accountSlug || !q)
    return NextResponse.json({ error: "accountSlug/q fehlt" }, { status: 400 });

  // Rate-Limit pro IP (30/Minute) gegen Missbrauch.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(`ip:${ip}`, 30, 60_000)) {
    return NextResponse.json({ results: [] }, { status: 429 });
  }

  // Ohne KI-Konfiguration keine semantische Suche -> leeres Ergebnis (kein Fehler).
  if (!aiConfigured()) return NextResponse.json({ results: [] });

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id")
    .eq("slug", accountSlug)
    .single();
  if (!account) return NextResponse.json({ results: [] });

  try {
    const qVec = await embed(q);
    const { data: matches } = await admin.rpc("match_kb", {
      p_account: account.id,
      p_embedding: JSON.stringify(qVec),
      p_count: 8,
    });

    const rows = (matches ?? []) as {
      chunk: string;
      metadata: { title?: string; slug?: string };
      similarity: number;
    }[];

    // Nur Treffer mit slug + title, dedupliziert (erste Reihenfolge = beste Ähnlichkeit).
    const seen = new Set<string>();
    const results: Result[] = [];
    for (const r of rows) {
      const slug = r.metadata?.slug;
      const title = r.metadata?.title;
      if (slug && title && !seen.has(slug)) {
        seen.add(slug);
        results.push({ title, slug });
      }
    }

    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("hub-search error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ results: [] });
  }
}
