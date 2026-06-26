/**
 * Basis-URL der App (für E-Mail-Links, Einladungen, Embed-Snippets).
 * Robust gegen versehentliche Wildcards/Slashes am Ende, z. B. wenn jemand
 * die Redirect-URL-Allowlist "https://app.example.com/**" in die Env kopiert.
 */
export function appBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return raw.trim().replace(/[/*\s]+$/, "");
}
