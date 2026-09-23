import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FREE_TUTORIAL_LIMIT, isPro } from "@/lib/plan";

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
