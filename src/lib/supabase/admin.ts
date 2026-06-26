import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Admin-Client mit Secret Key – umgeht RLS. NUR serverseitig verwenden
 * (Publish-Flow: Bildkopie in den public Bucket, view_logs schreiben, Drift-Jobs).
 * Niemals an den Client ausliefern.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
