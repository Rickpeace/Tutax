import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase-Client für Client-Components (Browser).
 * Nutzt den Publishable Key – RLS schützt die Daten.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
