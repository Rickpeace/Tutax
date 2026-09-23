import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Alle Speicher-Bereiche, in denen Kundendateien unter `<account_id>/…` liegen. */
export const ACCOUNT_BUCKETS = ["tutorial-images", "tutorial-images-public", "tutorial-videos"] as const;

/** Alle Dateipfade unter `prefix` (rekursiv; Supabase listet je Ordner, höchstens 1000 je Abruf). */
async function listRecursive(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}: ${error.message}`);
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      // Ordner haben keine id — hineinsteigen.
      if (entry.id === null) out.push(...(await listRecursive(admin, bucket, path)));
      else out.push(path);
    }
    if (!data || data.length < 1000) return out;
  }
}

/**
 * Löscht ALLE Dateien eines Kontos in allen Speicher-Bereichen. Gibt die Anzahl gelöschter
 * Dateien je Bereich zurück. Nur für das Löschen eines ganzen Kunden (Admin).
 */
export async function purgeAccountFiles(admin: SupabaseClient, accountId: string): Promise<Record<string, number>> {
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) throw new Error("Ungültige Konto-ID");
  const result: Record<string, number> = {};
  for (const bucket of ACCOUNT_BUCKETS) {
    const paths = await listRecursive(admin, bucket, accountId);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) throw new Error(`${bucket}: ${error.message}`);
    }
    result[bucket] = paths.length;
  }
  return result;
}
