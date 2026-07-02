"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { recordEvent } from "@/lib/events";

/**
 * „War das hilfreich?" vom öffentlichen Wizard (nicht eingeloggt — Autorisierung
 * ist hier bewusst nur „Konto existiert"; die Tabelle enthält keine sensiblen Daten
 * und Clients können sie nicht lesen, nur dieses eine Signal senden).
 */
export async function recordFeedback(
  accountSlug: string,
  tutorialSlug: string,
  helpful: boolean,
): Promise<void> {
  const slug = String(accountSlug ?? "").slice(0, 100);
  if (!slug) return;
  const { data: account } = await createAdminClient()
    .from("accounts")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!account) return;
  await recordEvent({
    account_id: account.id,
    type: "feedback",
    tutorial_slug: String(tutorialSlug ?? ""),
    helpful: !!helpful,
  });
}

/**
 * „Ich komme hier nicht weiter" pro Schritt (REVIEW H). Landet als negatives
 * Feedback-Event mit der Frage `[Schritt] <Titel>`, damit es OHNE Schema-Änderung
 * in der Insights-Karte als Wissenslücke auftaucht. Wie recordFeedback bewusst
 * ohne Login — die events-Tabelle ist für Clients nicht lesbar.
 */
export async function recordStepFeedback(
  accountSlug: string,
  tutorialSlug: string,
  stepTitle: string,
): Promise<void> {
  const slug = String(accountSlug ?? "").slice(0, 100);
  if (!slug) return;
  const { data: account } = await createAdminClient()
    .from("accounts")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!account) return;
  const title = String(stepTitle ?? "").trim().slice(0, 120) || "Ohne Titel";
  await recordEvent({
    account_id: account.id,
    type: "feedback",
    tutorial_slug: String(tutorialSlug ?? ""),
    helpful: false,
    question: `[Schritt] ${title}`,
  });
}
