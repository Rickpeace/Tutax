import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/lib/types";

export type Membership = { id: string; name: string; role: string };

/**
 * Lädt den aktuellen User + sein AKTIVES Konto. Ein Nutzer kann mehreren
 * Organisationen angehören (eigene + per Einladung beigetretene). Das aktive Konto
 * kommt aus dem Cookie `active_account` (falls Mitglied), sonst das erste.
 * Leitet auf /login um, wenn nicht angemeldet; auf /logout, wenn ganz ohne Org.
 */
export async function requireAccount(): Promise<{
  userId: string;
  email: string | null;
  account: Account;
  memberships: Membership[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("account_members")
    .select("account_id, role, accounts(*)")
    .eq("user_id", user.id);

  const valid = (rows ?? [])
    .map((r) => {
      const acc = (Array.isArray(r.accounts) ? r.accounts[0] : r.accounts) as Account | undefined;
      return acc ? { role: r.role as string, accounts: acc } : null;
    })
    .filter((x): x is { role: string; accounts: Account } => x !== null);
  if (!valid.length) {
    // Eingeloggt, aber keiner Organisation zugeordnet -> sauber ausloggen (kein Loop).
    redirect("/logout");
  }

  const cookieStore = await cookies();
  const activeId = cookieStore.get("active_account")?.value;
  const active = valid.find((r) => r.accounts.id === activeId) ?? valid[0];
  const memberships: Membership[] = valid.map((r) => ({ id: r.accounts.id, name: r.accounts.name, role: r.role }));

  return { userId: user.id, email: user.email ?? null, account: active.accounts, memberships };
}
