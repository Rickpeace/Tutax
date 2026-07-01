import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/account";

/** Ist der aktuelle User Plattform-Admin? (via SECURITY-DEFINER is_admin())
 *  Pro Request gecacht + gemeinsamer getUser -> kein zusätzlicher Auth-Roundtrip. */
export const checkAdmin = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_admin");
  return data === true;
});

/** Admin-Gate für /admin-Seiten. */
export async function requireAdmin(): Promise<void> {
  const ok = await checkAdmin();
  if (!ok) redirect("/app");
}
