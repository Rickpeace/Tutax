"use server";

import { createClient } from "@/lib/supabase/server";
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
