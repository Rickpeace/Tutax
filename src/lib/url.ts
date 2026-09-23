/**
 * Basis-URL der App (für E-Mail-Links, Einladungen, Embed-Snippets).
 * Robust gegen versehentliche Wildcards/Slashes am Ende, z. B. wenn jemand
 * die Redirect-URL-Allowlist "https://app.example.com/**" in die Env kopiert.
 */
export function appBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return raw.trim().replace(/[/*\s]+$/, "");
}

/**
 * Sicherer interner Weiterleitungs-Pfad. Verhindert Open-Redirects: nur relative
 * Pfade, KEINE protokoll-relativen (`//host`) oder `/\host` (die der Browser als
 * externe URL interpretiert). Alles andere -> fallback.
 *
 * Sicherheitsprüfung 23.09.2026: Browser entfernen TAB/CR/LF aus URLs — `/\t/evil.com` wurde
 * so zu `//evil.com` (belegt: `/logout?next=/%09/evil.com` leitete auf evil.com). Deshalb
 * Steuerzeichen und Backslashes ganz ablehnen UND zusätzlich prüfen, dass das Ziel nach dem
 * URL-Parser auf demselben Ursprung bleibt.
 * Bewusst ohne Imports → aus scripts/test-safe-next.mjs direkt ladbar.
 */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || typeof next !== "string") return fallback;
  const n = next.trim();
  if (!n.startsWith("/")) return fallback;
  if (/[\x00-\x1f\x7f\\]/.test(n)) return fallback;
  if (n.startsWith("//") || n.toLowerCase().startsWith("/%2f") || n.toLowerCase().startsWith("/%5c")) return fallback;
  try {
    if (new URL(n, "http://x").origin !== "http://x") return fallback;
  } catch {
    return fallback;
  }
  return n;
}
