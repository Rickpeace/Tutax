import type { CSSProperties } from "react";

type ThemeRow = {
  mode?: string | null;
  tokens?: unknown;
  ai_tokens?: unknown;
  logo_path?: string | null;
  ai_logo_path?: string | null;
  extreme_tokens?: unknown;
  extreme_css?: string | null;
  extreme_layout?: unknown;
  extreme_logo_path?: string | null;
} | null;

export type ResolvedTheme = {
  mode: "manual" | "ai" | "extreme";
  tokens: unknown;
  logoPath: string | null;
  /** Nur im Extrem-Modus: gekapseltes Skin-CSS + Layout-Varianten. */
  skinCss: string | null;
  layout: { header?: string; cards?: string; hero?: string } | null;
};

/** Aktive Design-Quelle auflösen (Standard-CI vs. KI-Design vs. Extrem je nach mode). */
export function resolveTheme(theme: ThemeRow): ResolvedTheme {
  const raw = theme?.mode;
  const mode: ResolvedTheme["mode"] =
    raw === "extreme" ? "extreme" : raw === "ai" ? "ai" : "manual";

  if (mode === "extreme") {
    return {
      mode,
      tokens: theme?.extreme_tokens ?? theme?.ai_tokens ?? theme?.tokens ?? null,
      logoPath: theme?.extreme_logo_path ?? theme?.ai_logo_path ?? theme?.logo_path ?? null,
      skinCss: theme?.extreme_css ?? null,
      layout: (theme?.extreme_layout as ResolvedTheme["layout"]) ?? null,
    };
  }

  const tokens = mode === "ai" ? (theme?.ai_tokens ?? theme?.tokens) : theme?.tokens;
  const logoPath = mode === "ai" ? (theme?.ai_logo_path ?? theme?.logo_path) : theme?.logo_path;
  return { mode, tokens: tokens ?? null, logoPath: logoPath ?? null, skinCss: null, layout: null };
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

/** Hex (#rgb / #rrggbb) → {r,g,b} in 0..255, oder null bei ungültigem Wert. */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Relative Luminanz nach WCAG (0 = schwarz, 1 = weiß). null bei ungültigem Hex,
 * damit Aufrufer aufs bisherige Verhalten zurückfallen können.
 */
function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

/** Eine Farbe um `amount` (0..1) Richtung Schwarz abmischen. */
function darken(hex: string, amount: number): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const f = Math.max(0, Math.min(1, amount));
  const mix = (v: number) => Math.round(v * (1 - f));
  const to2 = (v: number) => mix(v).toString(16).padStart(2, "0");
  return `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`;
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
  const radiusPx = sh.radius != null ? `${parseInt(String(sh.radius), 10) || 0}px` : "12px";
  s["--brand-btn-radius"] = sh.buttonStyle === "pill" ? "999px" : radiusPx;

  // Card-/Titel-Stil aus dem Design ableiten (outline | elevated | filled).
  // Fallbacks = warmes Steply-Standard-Theme (Handoff 07/2026).
  const accent = (c.primary as string) || "#ef6a4e";
  const bg = (c.background as string) || "#ffffff";
  const surface = (c.surface as string) || "#ffe8e2";
  const ink = (c.text as string) || "#33291f";
  const border = (c.border as string) || "";
  const cardStyle = String(sh.cardStyle ?? "filled");

  // Kontrast-Ableitung für die Akzentfarbe (WCAG-Luminanz).
  //   --brand-accent-fg     = Textfarbe AUF Akzent-Hintergrund
  //   --brand-accent-strong = Akzent ALS Text auf Weiß (helle Töne abgedunkelt)
  // Wichtig: greift NUR bei hellen Akzenten. Bei dunklen (z. B. dem Rot des
  // Demo-Kontos) bleibt es pixelidentisch: fg = weiß, strong = Akzent selbst.
  // Ungültiger/fehlender Hex → gleiches Fallback-Verhalten (weiß / Akzent).
  const lum = relativeLuminance(accent);
  if (lum != null && lum > 0.55) {
    // Heller Akzent: weißer Text darauf wäre unlesbar → dunkle Ink-Farbe.
    s["--brand-accent-fg"] = "#101524";
    // Als Text auf Weiß: umso heller, desto stärker abdunkeln (bis ~45 %).
    const amount = Math.min(0.45, (lum - 0.35) * 0.75);
    s["--brand-accent-strong"] = darken(accent, amount) ?? accent;
  } else {
    // Dunkler/mittlerer Akzent oder ungültig → bisheriges Verhalten.
    s["--brand-accent-fg"] = "#ffffff";
    s["--brand-accent-strong"] = accent;
  }

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
