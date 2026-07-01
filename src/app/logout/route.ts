import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/url";

/**
 * Meldet ab und geht zum Login. Wird u. a. von requireAccount() genutzt, wenn ein
 * eingeloggter Nutzer KEINE Mitgliedschaft hat – damit statt einer Redirect-Schleife
 * (/login ↔ /app) sauber die Session geleert wird. Cookies werden direkt auf die
 * Redirect-Antwort geschrieben (zuverlässig im Route-Handler).
 */
export async function GET(request: NextRequest) {
  // Optional zurück zu einem relativen Pfad (z. B. dem Invite-Link) nach dem Abmelden.
  const dest = safeNext(request.nextUrl.searchParams.get("next"), "/login");
  const response = NextResponse.redirect(new URL(dest, request.url));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  await supabase.auth.signOut();
  return response;
}
