import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { asRole, canEdit } from "@/lib/roles";

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
  // /admin gehört dazu: ohne Anmeldung kam sonst HTTP 200 mit der Admin-Kopfleiste
  // (Daten blieben dank AdminGate zwar weg, es sah aber nach einem echten Bereich aus).
  const isProtected =
    path.startsWith("/app") || path.startsWith("/onboarding") || path.startsWith("/admin");
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

  // Öffentliche Seite der Steply-Erweiterung: eingeloggte Inhaber/Bearbeiter gehören zur
  // Einrichtung IN der App (sonst Marketing-Kopf mit „Anmelden“ → wirkt wie ausgeloggt).
  // Mitarbeiter (dürfen die Erweiterung nicht nutzen) und Ausgeloggte sehen die öffentliche
  // Seite. Hier statt in der Seite, damit /extension statisch (PPR) bleibt und nichts
  // aufblitzt. Die Zielseite prüft die Rolle selbst noch einmal (requireAccount).
  if (user && path === "/extension" && (await mayUseExtension(supabase, user))) {
    const url = request.nextUrl.clone();
    url.pathname = "/app/settings/erweiterung";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    // Frisch erneuerte Session-Cookies nicht verlieren.
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  return response;
}

/**
 * Darf der Nutzer im AKTIVEN Konto die Erweiterung nutzen (Inhaber/Bearbeiter)? Gleiche Wahl
 * des aktiven Kontos wie lib/account.ts (Metadaten `active_account_id`, sonst das erste).
 * Fehler → false (dann eben die öffentliche Seite; kein Risiko).
 */
async function mayUseExtension(
  supabase: SupabaseClient,
  user: { id: string; user_metadata?: { active_account_id?: string } | null },
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("account_members")
      .select("account_id, role")
      .eq("user_id", user.id);
    const rows = data ?? [];
    if (!rows.length) return false;
    const activeId = user.user_metadata?.active_account_id;
    const active = rows.find((r) => r.account_id === activeId) ?? rows[0];
    return canEdit(asRole(active.role));
  } catch {
    return false;
  }
}
