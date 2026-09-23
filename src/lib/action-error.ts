// Erwartete Fehler aus Server-Actions sichtbar machen.
//
// Next.js ersetzt im Produktions-Build den Text JEDES geworfenen Fehlers einer
// Server-Action durch eine englische Standardmeldung (nur ein „digest“ kommt an).
// Lokal mit `next dev` fällt das nie auf. Deshalb:
//   - Server: erwartete Ablehnungen als `UserError` werfen und die Action mit
//     `withUserErrors` exportieren → der Text kommt als Rückgabewert zurück.
//   - Client: `unwrap(await action(...))` wirft den deutschen Text wieder lokal;
//     `errorText(e, fallback)` für Toasts ersetzt die englische Standardmeldung.

/** Ablehnung, deren Text der Nutzer sehen soll (Validierung, Tarif, Rechte …). */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export type ActionFailure = { userError: string };

export function isActionFailure(v: unknown): v is ActionFailure {
  return typeof v === "object" && v !== null && typeof (v as ActionFailure).userError === "string";
}

/**
 * Hüllt eine Server-Action: `UserError` wird zum Rückgabewert `{ userError }`,
 * alles andere (echte Fehler, redirect(), notFound()) läuft unverändert weiter.
 */
export function withUserErrors<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R | ActionFailure> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof UserError) return { userError: e.message };
      throw e;
    }
  };
}

/** Client: Ergebnis einer `withUserErrors`-Action auspacken; Ablehnung → Error mit deutschem Text. */
export function unwrap<R>(result: R | ActionFailure): R {
  if (isActionFailure(result)) throw new Error(result.userError);
  return result;
}

export const GENERIC_ACTION_ERROR = "Das hat gerade nicht geklappt. Bitte versuchen Sie es erneut.";

/** Next.js' Ersatztext für Server-Fehler im Produktions-Build (Text wird nie an Nutzer gezeigt). */
function isRedactedServerError(message: string): boolean {
  return /Server Components render|omitted in production|An unexpected response was received from the server/i.test(message);
}

/**
 * Ist das eine Weiterleitung aus einer Server-Aktion (`redirect()` → NEXT_REDIRECT) bzw.
 * `notFound()`? Die übernimmt Next selbst — der Client darf sie NICHT als Fehler-Toast zeigen
 * (Audit 23.09.: „Duplizieren“ am Gratis-Limit zeigte einen roten Toast „NEXT_REDIRECT“).
 */
export function isNavigationError(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  const msg = e instanceof Error ? e.message : "";
  return (
    (typeof digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(digest)) ||
    /^NEXT_(REDIRECT|NOT_FOUND)/.test(msg)
  );
}

/** Toast-/Fehlertext aus einem gefangenen Fehler — nie die englische Next-Standardmeldung. */
export function errorText(e: unknown, fallback: string = GENERIC_ACTION_ERROR): string {
  if (!(e instanceof Error) || !e.message) return fallback;
  if (isRedactedServerError(e.message)) return fallback;
  return e.message;
}
