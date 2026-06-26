import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Bestätigungs-Endpunkt für E-Mail-Links (Signup, Magic Link, Passwort-Reset, Einladung).
 * Unterstützt sowohl token_hash+type (OTP) als auch PKCE-code.
 * Setzt serverseitig die Session per Cookie (im Gegensatz zum impliziten #-Flow,
 * den ein Server-Handler nicht lesen kann).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";

  // next darf ein relativer Pfad ODER eine absolute Same-Origin-URL sein
  // (Einladungs-Mail liefert {{ .RedirectTo }} als volle URL).
  let redirectTo = "/app";
  if (next.startsWith("/")) {
    redirectTo = next;
  } else {
    try {
      const u = new URL(next);
      if (u.origin === origin) redirectTo = u.pathname + u.search;
    } catch {
      /* ungültig -> /app */
    }
  }

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${redirectTo}`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${redirectTo}`);
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
