import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { teamLimit } from "@/lib/plan";

/**
 * Hat die Organisation Platz für diese Person? Wer schon Mitglied ist, zählt nicht (Annehmen
 * ist dann ein No-op). Genutzt beim Annehmen (zweite Grenzprüfung — schützt vor parallelen
 * Einladungen und einem Tarif-Downgrade zwischen Einladen und Annehmen) und schon beim
 * Öffnen des Einladungs-Links (sonst kam „Team voll“ erst nach dem Passwort-Eintippen).
 */
export async function teamHasRoom(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  userId: string,
): Promise<boolean> {
  const [{ data: acc }, { data: rows }] = await Promise.all([
    admin.from("accounts").select("plan").eq("id", accountId).maybeSingle(),
    admin.from("account_members").select("user_id").eq("account_id", accountId),
  ]);
  const list = rows ?? [];
  if (list.some((m) => m.user_id === userId)) return true;
  return list.length < teamLimit(acc ?? {});
}
