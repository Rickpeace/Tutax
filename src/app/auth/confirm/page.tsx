import { redirect } from "next/navigation";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { SessionFromHash } from "@/components/auth/session-from-hash";
import { safeNext } from "@/lib/url";

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

  // Absolute (Same-Origin-)URL auf Pfad reduzieren, dann Open-Redirect-Schutz (safeNext).
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
