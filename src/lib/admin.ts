import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Ist der aktuelle User Plattform-Admin? (via SECURITY-DEFINER is_admin()) */
export async function checkAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.rpc("is_admin");
  return data === true;
}

/** Admin-Gate für /admin-Seiten. */
export async function requireAdmin(): Promise<void> {
  const ok = await checkAdmin();
  if (!ok) redirect("/app");
}
