import { type NextRequest, NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/url";

/**
 * Bestätigungs-Endpunkt für E-Mail-Links (Magic Link, Signup, Reset, E-Mail-Wechsel).
 *
 * BEWUSST ein ROUTE HANDLER, keine Seite: Session-COOKIES dürfen in Next nur in
 * Route-Handlern/Server-Actions geschrieben werden. Als Server-Component-Seite wurde
 * verifyOtp zwar ausgeführt (Einmal-Token verbraucht!), aber das frisch gesetzte
 * Session-Cookie beim Rendern verworfen (setAll-Catch in lib/supabase/server.ts) —
 * der Nutzer landete ausgeloggt auf /login und der Link war tot
 * (Richards Magic-Link-Bug, 06.07.).
 *
 * - `token_hash`+`type` (OTP-Direktlink aus unseren Mail-Templates): verifyOtp.
 * - `code` (PKCE): exchangeCodeForSession.
 * - sonst (impliziter #-Fragment-Flow alter Standard-Templates): Weiterleitung auf
 *   /auth/hash — das URL-Fragment überlebt den Redirect im Browser, die Client-Seite
 *   übernimmt die Session von dort.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tokenHash = sp.get("token_hash");
  const type = sp.get("type") as EmailOtpType | null;
  const code = sp.get("code");
  const next = sp.get("next") ?? "/app";

  // Runde 4: Link-Scanner (Outlook Safe Links, Defender …) rufen Mail-Links vorab per GET auf.
  // Das Einmal-Token wird darum NICHT beim Abruf eingelöst, sondern erst per Knopf auf der
  // Zwischenseite /link (POST unten). PKCE-`code` ist ohne Browser-Cookie ohnehin wertlos.
  if (tokenHash && type) {
    const q = new URLSearchParams({ token_hash: tokenHash, type, next });
    return NextResponse.redirect(new URL(`/link?${q.toString()}`, request.url));
  }
  return handle(request, { tokenHash: null, type: null, code, next });
}

/** Knopf auf /link: löst das Token ein (setzt die Session-Cookies) und leitet weiter. */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const str = (k: string) => {
    const v = form?.get(k);
    return typeof v === "string" && v ? v : null;
  };
  return handle(request, {
    tokenHash: str("token_hash"),
    type: str("type") as EmailOtpType | null,
    code: null,
    next: str("next") ?? "/app",
  });
}

async function handle(
  request: NextRequest,
  { tokenHash, type, code, next }: { tokenHash: string | null; type: EmailOtpType | null; code: string | null; next: string },
) {

  // Absolute (Same-Origin-)URL auf Pfad reduzieren, dann Open-Redirect-Schutz.
  let candidate = next;
  if (!next.startsWith("/")) {
    try {
      const u = new URL(next);
      candidate = u.pathname + u.search;
    } catch {
      candidate = "/app";
    }
  }
  const redirectTo = safeNext(candidate, "/app");
  // 303: nach dem POST der Weiterleitung per GET folgen.
  const dest = (p: string) => NextResponse.redirect(new URL(p, request.url), 303);

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    // E-Mail-Wechsel: Supabase schickt Links an alte UND neue Adresse; hier gilt die Änderung
    // schon nach dem ersten Klick — der zweite Link ist dann „verbraucht“. Statt „Link ungültig“
    // (klang nach Fehlschlag) ins Profil mit klarer Meldung und der aktuellen Adresse.
    if (type === "email_change") {
      return dest(`/app/settings/profil?email=${error ? "link-verwendet" : "bestaetigt"}`);
    }
    return dest(error ? "/login?error=link" : redirectTo);
  }
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return dest(error ? "/login?error=link" : redirectTo);
  }
  return dest("/auth/hash?next=" + encodeURIComponent(redirectTo));
}
