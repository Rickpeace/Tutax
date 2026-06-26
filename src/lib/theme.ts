import type { CSSProperties } from "react";

type ThemeRow = {
  mode?: string | null;
  tokens?: unknown;
  ai_tokens?: unknown;
  logo_path?: string | null;
  ai_logo_path?: string | null;
} | null;

/** Aktive Design-Quelle auflösen (Standard-CI vs. KI-Design je nach mode). */
export function resolveTheme(theme: ThemeRow): {
  mode: "manual" | "ai";
  tokens: unknown;
  logoPath: string | null;
} {
  const mode = theme?.mode === "ai" ? "ai" : "manual";
  const tokens = mode === "ai" ? (theme?.ai_tokens ?? theme?.tokens) : theme?.tokens;
  const logoPath = mode === "ai" ? (theme?.ai_logo_path ?? theme?.logo_path) : theme?.logo_path;
  return { mode, tokens: tokens ?? null, logoPath: logoPath ?? null };
}

const SYSTEM_FONTS = new Set([
  "inter", "arial", "helvetica", "helvetica neue", "georgia", "times", "times new roman",
  "system-ui", "sans-serif", "serif", "roboto", "-apple-system",
]);

/** Google-Fonts-Stylesheet-URL für die Schriften eines Themes (oder null). */
export function googleFontsHref(tokens: unknown): string | null {
  const ty = ((tokens ?? {}) as { typography?: Record<string, unknown> }).typography ?? {};
  const fams = [ty.headingFont, ty.bodyFont]
    .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    .map((f) => f.split(",")[0].replace(/["']/g, "").trim())
    .filter((f) => f && !SYSTEM_FONTS.has(f.toLowerCase()));
  const uniq = [...new Set(fams)];
  if (!uniq.length) return null;
  const params = uniq
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/** Schrift-Familien eines Themes (für fontFamily). */
export function brandFonts(tokens: unknown): { body?: string; heading?: string } {
  const ty = ((tokens ?? {}) as { typography?: Record<string, unknown> }).typography ?? {};
  return {
    body: typeof ty.bodyFont === "string" ? ty.bodyFont : undefined,
    heading: typeof ty.headingFont === "string" ? ty.headingFont : undefined,
  };
}

/**
 * Wandelt themes.tokens (§8) in CSS-Custom-Properties für den öffentlichen
 * Viewer/Hub. Nicht gesetzte Werte fallen auf die Indigo-Defaults (:root) zurück.
 */
export function brandStyle(tokens: unknown): CSSProperties {
  const t = (tokens ?? {}) as {
    colors?: Record<string, string>;
    typography?: Record<string, string | number>;
    shape?: Record<string, string | number>;
  };
  const c = t.colors ?? {};
  const ty = t.typography ?? {};
  const sh = t.shape ?? {};
  const s: Record<string, string> = {};

  if (c.primary) s["--brand-accent"] = c.primary;
  if (c.surface) s["--brand-soft"] = c.surface;
  if (c.background) s["--brand-bg"] = c.background;
  if (c.text) s["--brand-ink"] = c.text;
  if (ty.bodyFont) s["--brand-font"] = String(ty.bodyFont);
  if (ty.headingFont) s["--brand-font-heading"] = String(ty.headingFont);
  if (sh.radius != null) s["--brand-radius"] = `${sh.radius}px`;

  return s as CSSProperties;
}
