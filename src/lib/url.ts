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
 */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || typeof next !== "string") return fallback;
  const n = next.trim();
  if (!n.startsWith("/")) return fallback;
  if (n.startsWith("//") || n.startsWith("/\\") || n.toLowerCase().startsWith("/%2f") || n.toLowerCase().startsWith("/%5c")) return fallback;
  return n;
}
