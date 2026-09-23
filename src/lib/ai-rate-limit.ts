import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Kostenbremse pro Person: höchstens `perHour` KI-Läufe je angefangener Stunde, gezählt unter
 * `key` im app_metadata des Nutzers (nur per Service-Rolle schreibbar — der Nutzer kann den
 * Zähler nicht selbst zurücksetzen; überlebt Serverless-Instanzen; keine Migration nötig).
 * Kompromiss: pro Person statt pro Konto, Lesen+Schreiben nicht atomar (zwei gleichzeitige
 * Klicks können beide durchgehen). Fällt der Zähler aus, läuft die Aktion trotzdem.
 * true = Lauf erlaubt (und gezählt), false = Grenze erreicht.
 */
export async function takeHourlyAiRun(userId: string, key: string, perHour: number): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return true;
    const meta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
    const hour = Math.floor(Date.now() / 3_600_000);
    const cur = meta[key] as { h?: number; n?: number } | undefined;
    const n = cur?.h === hour ? Number(cur.n) || 0 : 0;
    if (n >= perHour) return false;
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...meta, [key]: { h: hour, n: n + 1 } },
    });
    return true;
  } catch (e) {
    console.error(`[ki-limit] Zähler ${key}:`, e instanceof Error ? e.message : e);
    return true;
  }
}
