"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { recordEvent } from "@/lib/events";
import { resolveCustomerTutorial } from "@/lib/templates";

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
  const tSlug = String(tutorialSlug ?? "").slice(0, 200);
  if (!slug || !tSlug) return;
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!account) return;
  // Nur für Anleitungen, die dieses Konto öffentlich zeigt — sonst ließen sich Insights mit
  // erfundenen Slugs fluten (Sicherheitsprüfung Runde 4).
  if (!(await resolveCustomerTutorial(admin, account.id, tSlug))) return;
  await recordEvent({
    account_id: account.id,
    type: "feedback",
    tutorial_slug: tSlug,
    helpful: !!helpful,
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * „Ich komme hier nicht weiter" pro Schritt (REVIEW H). Landet als negatives
 * Feedback-Event mit der Frage `[Schritt] <deutscher Titel>`, damit es OHNE Schema-
 * Änderung in der Insights-Karte als Wissenslücke auftaucht. Wie recordFeedback bewusst
 * ohne Login — die events-Tabelle ist für Clients nicht lesbar.
 *
 * Audit 24.09.: Der Browser schickt die Schritt-ID (nicht mehr den angezeigten, auf
 * EN/PL/TR übersetzten Titel); der deutsche Titel wird hier nachgeschlagen. Der Schritt
 * muss zu genau der Anleitung gehören, die dieses Konto unter diesem Slug öffentlich
 * zeigt (veröffentlicht + öffentlich, inkl. Standard-Anleitungen) — sonst ignorieren.
 */
export async function recordStepFeedback(
  accountSlug: string,
  tutorialSlug: string,
  stepId: string,
): Promise<void> {
  const slug = String(accountSlug ?? "").slice(0, 100);
  const tSlug = String(tutorialSlug ?? "").slice(0, 200);
  const sid = String(stepId ?? "").trim();
  if (!slug || !tSlug || !UUID_RE.test(sid)) return;
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!account) return;
  const tutorialId = await resolveCustomerTutorial(admin, account.id, tSlug);
  if (!tutorialId) return;
  const { data: step } = await admin
    .from("steps")
    .select("title")
    .eq("id", sid)
    .eq("tutorial_id", tutorialId)
    .maybeSingle();
  if (!step) return;
  const title = String(step.title ?? "").trim().slice(0, 120) || "Ohne Titel";
  await recordEvent({
    account_id: account.id,
    type: "feedback",
    tutorial_slug: tSlug,
    helpful: false,
    question: `[Schritt] ${title}`,
  });
}
