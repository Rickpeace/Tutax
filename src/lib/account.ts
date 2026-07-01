import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/lib/types";

/**
 * Lädt den aktuellen User + dessen Account (1 User = 1 Account im MVP).
 * Leitet auf /login um, wenn nicht angemeldet.
 */
export async function requireAccount(): Promise<{
  userId: string;
  email: string | null;
  account: Account;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("account_members")
    .select("account_id, accounts(*)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const account = membership?.accounts as Account | undefined;
  if (!account) {
    // Eingeloggt, aber keiner Organisation zugeordnet (z. B. abgebrochene Einladung).
    // NICHT nach /login (die Middleware schickt eingeloggte Nutzer zurück nach /app
    // -> Endlosschleife). Stattdessen sauber ausloggen -> /login.
    redirect("/logout");
  }

  return { userId: user.id, email: user.email ?? null, account };
}
