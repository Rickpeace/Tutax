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
  const dest = (p: string) => NextResponse.redirect(new URL(p, request.url));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    return dest(error ? "/login?error=link" : redirectTo);
  }
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return dest(error ? "/login?error=link" : redirectTo);
  }
  return dest("/auth/hash?next=" + encodeURIComponent(redirectTo));
}
