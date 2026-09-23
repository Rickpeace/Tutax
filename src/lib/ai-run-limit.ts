import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Kostenbremse für KI-Läufe: höchstens `limit` Läufe je angefangener Stunde und Person.
 * Stunden-Zähler im app_metadata des Nutzers (nur per Service-Rolle schreibbar — der Nutzer
 * kann ihn nicht selbst zurücksetzen; überlebt Serverless-Instanzen; keine Migration nötig).
 * `key` trennt die Zähler (Editor-Knopf vs. Feinschliff nach einer Aufnahme).
 * Kompromiss: pro Person statt pro Konto, Lesen+Schreiben nicht atomar (zwei gleichzeitige
 * Aufrufe können beide durchgehen). Fällt der Zähler aus, gilt der Lauf als erlaubt.
 * true = Lauf erlaubt (und gezählt), false = Limit erreicht.
 */
export async function takeHourlyAiRun(userId: string, key: string, limit: number): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return true;
    const meta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
    const hour = Math.floor(Date.now() / 3_600_000);
    const cur = meta[key] as { h?: number; n?: number } | undefined;
    const n = cur?.h === hour ? Number(cur.n) || 0 : 0;
    if (n >= limit) return false;
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...meta, [key]: { h: hour, n: n + 1 } },
    });
    return true;
  } catch (e) {
    console.error(`[ki-limit] ${key}:`, e instanceof Error ? e.message : e);
    return true;
  }
}
