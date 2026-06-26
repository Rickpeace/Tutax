import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase-Client für Server-Components, Server-Actions und Route-Handler.
 * `cookies()` ist in Next.js 16 async -> daher async Factory.
 * Nutzt den Publishable Key; RLS + Session-Cookie bestimmen die Sichtbarkeit.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Wird aus einer Server-Component heraus aufgerufen, in der Cookies
            // nicht gesetzt werden können. Unkritisch, solange proxy.ts die
            // Session aktualisiert.
          }
        },
      },
    },
  );
}
