import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FREE_TUTORIAL_LIMIT, FREE_VIDEO_LIMIT, isPro } from "@/lib/plan";

// Free-Limit für die Wege OHNE Session (Erweiterung per Token, Video-Import, Upload-Vorprüfung):
// spiegelt tutorialQuotaReached aus app/app/actions.ts — eigene Tutorials OHNE Template-Forks;
// Pro/Business = unbegrenzt. Der Video-Worker (video-worker/index.mjs) prüft dasselbe noch
// einmal direkt vor dem Anlegen (dort eigene Kopie, der Worker importiert nichts aus src/).

/** Maschinenlesbarer Fehler-Code der 403-Antworten (die Erweiterung erkennt daran die Tarif-Grenze). */
export const PLAN_LIMIT_CODE = "plan_limit";

/** Einheitliche deutsche Meldung, wenn das Free-Limit erreicht ist. */
export const TUTORIAL_QUOTA_MESSAGE =
  "Der kostenlose Tarif erlaubt keine weiteren Anleitungen. Einen größeren Tarif wählen Sie in Steply unter „Einstellungen → Tarif“.";

/**
 * true = das Konto darf KEIN weiteres Tutorial anlegen. `admin` ist ein Client ohne RLS
 * (Admin) — der Aufrufer muss das Konto vorher selbst geprüft haben (Token/Session).
 */
export async function tutorialQuotaReachedFor(
  admin: SupabaseClient,
  accountId: string,
): Promise<boolean> {
  const { data: acc } = await admin
    .from("accounts")
    .select("plan")
    .eq("id", accountId)
    .maybeSingle();
  if (isPro({ plan: (acc?.plan as string | null) ?? null })) return false;
  const [{ count: total }, { count: forks }] = await Promise.all([
    admin.from("tutorials").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    admin
      .from("account_templates")
      .select("template_id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .not("forked_tutorial_id", "is", null),
  ]);
  return (total ?? 0) - (forks ?? 0) >= FREE_TUTORIAL_LIMIT;
}

/** Einheitliche Meldung, wenn die Video-Grenze des kostenlosen Tarifs erreicht ist. */
export const VIDEO_QUOTA_MESSAGE =
  FREE_VIDEO_LIMIT > 0
    ? `Im kostenlosen Tarif sind ${FREE_VIDEO_LIMIT} Anleitungen aus Video zum Antesten enthalten – die sind aufgebraucht. Unbegrenzt geht es mit Pro („Einstellungen → Tarif“).`
    : "Anleitungen aus Video erstellt die KI – das ist ab Pro enthalten („Einstellungen → Tarif“). Im kostenlosen Tarif bauen Sie Anleitungen von Hand oder mit der Sofort-Anleitung.";

/**
 * Darf das Konto noch ein Video verarbeiten lassen? null = ja, sonst die deutsche Meldung.
 * Kostenlos: allgemeine Anleitungs-Grenze UND höchstens FREE_VIDEO_LIMIT Video-Aufträge
 * (fehlgeschlagene zählen nicht). Pro/Business: unbegrenzt. Gilt für ALLE Video-Wege
 * (Erweiterung, Upload, Import per Link) — nicht für die Sofort-Anleitung (kein Video).
 */
export async function videoQuotaErrorFor(admin: SupabaseClient, accountId: string): Promise<string | null> {
  const { data: acc } = await admin.from("accounts").select("plan").eq("id", accountId).maybeSingle();
  if (isPro({ plan: (acc?.plan as string | null) ?? null })) return null;
  if (await tutorialQuotaReachedFor(admin, accountId)) return TUTORIAL_QUOTA_MESSAGE;
  const { count } = await admin
    .from("video_jobs")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .neq("status", "failed");
  return (count ?? 0) >= FREE_VIDEO_LIMIT ? VIDEO_QUOTA_MESSAGE : null;
}
