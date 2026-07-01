import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Nutzungs-Event schreiben (fire-and-forget-sicher: wirft NIE — Tracking darf
 * niemals eine Endkunden-Seite oder den Chat kaputt machen).
 * Inserts laufen bewusst über den Service-Role-Client; die events-Tabelle hat
 * keine Insert-Policy für Clients.
 */
export async function recordEvent(e: {
  account_id: string;
  type: "view" | "feedback" | "chat";
  tutorial_slug?: string | null;
  helpful?: boolean | null;
  question?: string | null;
  status?: string | null;
}): Promise<void> {
  try {
    const { error } = await createAdminClient().from("events").insert({
      account_id: e.account_id,
      type: e.type,
      tutorial_slug: e.tutorial_slug?.slice(0, 120) ?? null,
      helpful: e.helpful ?? null,
      question: e.question?.slice(0, 200) ?? null,
      status: e.status ?? null,
    });
    if (error) console.error("event insert:", error.message);
  } catch (err) {
    console.error("event insert:", err instanceof Error ? err.message : err);
  }
}
