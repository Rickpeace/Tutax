import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Hält die Supabase-Session frisch (Token-Refresh) und macht einen
 * optimistischen Auth-Check für geschützte Bereiche (/app).
 * Aufgerufen aus proxy.ts (Next.js 16: ehem. middleware.ts).
 */
export async function updateSession(request: NextRequest) {
  // Prefetch-Requests NICHT mit einem getUser (Netzwerk-Verifikation) belasten: Next holt
  // pro sichtbarem Link vorab die Route: ohne diesen Skip liefe getUser dutzendfach im
  // Hintergrund. Die ECHTE Navigation (kein Prefetch) macht Refresh + Schutz-Check; und
  // serverseitig schützt requireAccount ohnehin jede /app-Seite.
  if (
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch"
  ) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // WICHTIG: getUser() direkt nach Client-Erstellung -> aktualisiert das Token.
  // Robust: bei Netz-Aussetzer (Supabase kurz nicht erreichbar) NICHT 10s hängen
  // oder crashen, sondern "fail-open" (durchlassen) nach kurzem Timeout.
  let user = null;
  try {
    const timeout = new Promise<{ data: { user: null } }>((resolve) =>
      setTimeout(() => resolve({ data: { user: null } }), 3000),
    );
    const res = await Promise.race([supabase.auth.getUser(), timeout]);
    user = res.data.user;
  } catch {
    return response; // Supabase nicht erreichbar -> Request unverändert durchlassen
  }

  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/app") || path.startsWith("/onboarding");
  const isAuthPage = path === "/login" || path === "/signup";

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
