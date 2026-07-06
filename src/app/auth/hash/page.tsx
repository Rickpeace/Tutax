import { SessionFromHash } from "@/components/auth/session-from-hash";
import { safeNext } from "@/lib/url";

export const metadata = { title: "Anmeldung", robots: { index: false } };

/**
 * Client-Fallback für den impliziten E-Mail-Link-Flow: Die Session steckt im
 * URL-Fragment (#access_token=…), das der Server nie sieht. /auth/confirm
 * (Route-Handler) leitet ohne token_hash/code hierher weiter — das Fragment
 * überlebt den Redirect im Browser, SessionFromHash übernimmt es clientseitig.
 */
export default async function HashPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <SessionFromHash next={safeNext(sp.next, "/app")} fallback="/login?error=link" />
  );
}
