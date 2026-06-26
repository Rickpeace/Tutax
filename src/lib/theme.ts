import type { CSSProperties } from "react";

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
