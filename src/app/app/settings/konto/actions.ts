"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";
import { uebersetzeAuthFehler } from "@/lib/auth-errors";

export async function changePassword(
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  if (password.length < 8) return { ok: false, error: "Mindestens 8 Zeichen." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: uebersetzeAuthFehler(error.message) };
  return { ok: true };
}

/** E-Mail-Adresse ändern. Supabase verschickt Bestätigungs-Links (alte + neue Adresse). */
export async function changeEmail(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))
    return { ok: false, error: "Bitte eine gültige E-Mail-Adresse eingeben." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: clean });
  if (error) return { ok: false, error: uebersetzeAuthFehler(error.message) };
  return { ok: true };
}

/** Onboarding erneut durchlaufen (Einrichtung nochmal zeigen). */
export async function reopenOnboarding(): Promise<void> {
  const { account } = await requireAccount();
  const supabase = await createClient();
  await supabase.from("accounts").update({ onboarded: false }).eq("id", account.id);
  redirect("/onboarding");
}
