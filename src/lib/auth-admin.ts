import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Findet einen Auth-User per E-Mail über ALLE Seiten. Die Supabase-Admin-API hat keinen
 * Email-Filter; `listUsers` paginiert nur. Ohne Durchblättern liefern E-Mail-Lookups ab
 * >perPage Usern falsch-negative Treffer (z. B. "kein Konto" -> versehentlich ein zweites
 * passwortloses Konto anlegen). Terminiert an der ersten nicht-vollen Seite.
 */
export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  const perPage = 1000;
  for (let page = 1; page <= 100; page++) {
    // Sicherheits-Obergrenze: 100 Seiten
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < perPage) return null; // letzte Seite erreicht
  }
  return null;
}
