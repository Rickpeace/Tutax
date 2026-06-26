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
  if (ty.headingWeight != null) s["--brand-heading-weight"] = String(ty.headingWeight);
  if (sh.radius != null) s["--brand-radius"] = `${parseInt(String(sh.radius), 10) || 0}px`;

  // Card-/Titel-Stil aus dem Design ableiten (outline | elevated | filled).
  const accent = (c.primary as string) || "#3d4ee6";
  const bg = (c.background as string) || "#ffffff";
  const surface = (c.surface as string) || "#eef0fe";
  const ink = (c.text as string) || "#101524";
  const border = (c.border as string) || "";
  const cardStyle = String(sh.cardStyle ?? "filled");

  if (cardStyle === "outline") {
    s["--brand-card-bg"] = bg;
    s["--brand-card-border"] = accent;
    s["--brand-card-bw"] = "1.5px";
    s["--brand-title"] = accent;
    s["--brand-icon-bg"] = "transparent";
    s["--brand-card-shadow"] = "none";
  } else if (cardStyle === "elevated") {
    s["--brand-card-bg"] = "#ffffff";
    s["--brand-card-border"] = border || "rgba(16,21,36,0.06)";
    s["--brand-card-bw"] = "1px";
    s["--brand-title"] = ink;
    s["--brand-icon-bg"] = surface;
    s["--brand-card-shadow"] = "0 6px 20px rgba(16,21,36,0.08)";
  } else {
    s["--brand-card-bg"] = "#ffffff";
    s["--brand-card-border"] = border || "rgba(16,21,36,0.10)";
    s["--brand-card-bw"] = "1px";
    s["--brand-title"] = ink;
    s["--brand-icon-bg"] = surface;
    s["--brand-card-shadow"] = "none";
  }

  return s as CSSProperties;
}
