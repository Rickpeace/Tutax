import { redirect } from "next/navigation";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { SessionFromHash } from "@/components/auth/session-from-hash";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anmeldung", robots: { index: false } };

/**
 * Bestätigungs-Endpunkt für E-Mail-Links (Signup, Magic Link, Reset, Einladung).
 * - `token_hash`+`type` (OTP) oder `code` (PKCE): serverseitig verifizieren -> Session-Cookie.
 * - Sonst (impliziter #-Fragment-Flow der Standard-Templates): Client-Fallback.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const tokenHash = sp.token_hash;
  const type = sp.type as EmailOtpType | undefined;
  const code = sp.code;
  const next = sp.next ?? "/app";

  // Nur relativer Pfad zulassen (absolute URLs auf Pfad reduzieren) -> kein Open-Redirect.
  let redirectTo = "/app";
  if (next.startsWith("/")) redirectTo = next;
  else {
    try {
      const u = new URL(next);
      redirectTo = u.pathname + u.search;
    } catch {
      /* ungültig -> /app */
    }
  }

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    redirect(error ? "/login?error=link" : redirectTo);
  }
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    redirect(error ? "/login?error=link" : redirectTo);
  }

  // Impliziter Flow: Session steckt im URL-Fragment -> Client übernimmt.
  return <SessionFromHash next={redirectTo} fallback="/login?error=link" />;
}
