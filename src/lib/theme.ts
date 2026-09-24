import type { CSSProperties } from "react";

/**
 * Standard-Farben der Hilfe-Seite (warmes Steply-Design, Handoff 07/2026) — EINE Quelle
 * für Einstellungs-Formular, Vorschau und Viewer-Fallbacks. Muss zu den CSS-Defaults
 * `--brand-accent/-soft/-bg/-ink` in `app/globals.css` (:root) passen, denn die echte
 * Hilfe-Seite fällt ohne gespeicherte Farben auf genau diese Variablen zurück.
 */
export const DEFAULT_BRAND_COLORS = {
  primary: "#ef6a4e",
  background: "#fdf3ec",
  surface: "#ffe8e2",
  text: "#33291f",
} as const;

export type BrandColors = { primary: string; background: string; surface: string; text: string };

/** Gespeicherte Farben (themes.tokens.colors) mit den Standard-Farben auffüllen. */
export function brandColorsWithDefaults(tokens: unknown): BrandColors {
  const c = ((tokens ?? {}) as { colors?: Record<string, unknown> }).colors ?? {};
  const pick = (k: keyof BrandColors) =>
    typeof c[k] === "string" && (c[k] as string).trim() ? (c[k] as string) : DEFAULT_BRAND_COLORS[k];
  return {
    primary: pick("primary"),
    background: pick("background"),
    surface: pick("surface"),
    text: pick("text"),
  };
}

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

/** Generische CSS-Schriftfamilien — dürfen NICHT in Anführungszeichen stehen. */
const GENERIC_FONT_FAMILIES = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "math", "emoji",
  "fangsong", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "-apple-system",
  "blinkmacsystemfont", "inherit", "initial", "unset",
]);

/**
 * Schriftliste für font-family: jeden Familiennamen in Anführungszeichen setzen (außer
 * generischen Familien). Ohne Anführungszeichen ist „Source Sans 3“ ungültiges CSS
 * (ein Bezeichner darf nicht mit einer Ziffer beginnen) und der Browser verwirft die
 * GANZE Angabe — die Kundenschrift griff nie (Audit 24.09.).
 */
export function cssFontFamily(v: string): string {
  return v
    .split(",")
    .map((p) => p.trim().replace(/["']/g, "").trim())
    .filter(Boolean)
    .map((p) => (GENERIC_FONT_FAMILIES.has(p.toLowerCase()) ? p : `"${p}"`))
    .join(", ");
}

/**
 * Schrift-Familien eines Themes (für fontFamily). Gleiche Prüfung wie in brandStyle: der Wert
 * landet als Inline-Style im Server-HTML der öffentlichen Seite, und React übernimmt ihn dort
 * unverändert — „Inter;background-image:url(…)“ hängte sonst eine eigene Deklaration an
 * (Tracking der Endkunden über Dritt-Hosts). Ungültig = Standardschrift.
 */
export function brandFonts(tokens: unknown): { body?: string; heading?: string } {
  const ty = ((tokens ?? {}) as { typography?: Record<string, unknown> }).typography ?? {};
  const font = (v: unknown) =>
    typeof v === "string" && v.trim() && isSafeCssPlain(v.trim()) ? cssFontFamily(v.trim()) || undefined : undefined;
  return { body: font(ty.bodyFont), heading: font(ty.headingFont) };
}

/** Hex (#rgb / #rgba / #rrggbb / #rrggbbaa) → {r,g,b} in 0..255 (Alpha ignoriert), oder null. */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 4) h = h.slice(0, 3);
  if (h.length === 8) h = h.slice(0, 6);
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

/** Zwei Hex-Farben mischen: `t` = Anteil von `b` (0..1). null bei ungültigem Hex. */
function mixHex(a: string, b: string, t: number): string | null {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return null;
  const f = Math.max(0, Math.min(1, t));
  const to2 = (u: number, v: number) => Math.round(u * (1 - f) + v * f).toString(16).padStart(2, "0");
  return `#${to2(x.r, y.r)}${to2(x.g, y.g)}${to2(x.b, y.b)}`;
}

/** WCAG-Kontrastverhältnis (1..21) zweier Hex-Farben, null bei ungültigem Wert. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mindestkontrast für Fließtext (WCAG AA). */
export const MIN_TEXT_CONTRAST = 4.5;

/**
 * „Papier“ der Hilfe-Seite = die Fläche, auf der Kopf, Suchfeld, Karten, Wizard und Chat
 * liegen. Bisher fest weiß — mit einem dunklen Kunden-Design (helle Textfarbe) wurde die
 * Seite dadurch unlesbar (Audit 24.09.: hellgrauer Text auf Weiß). Regel: die erste Fläche,
 * auf der die Textfarbe gut lesbar ist — Weiß (helle Designs bleiben unverändert), dann die
 * Kunden-„Flächen“-Farbe, dann ein leicht aufgehellter Hintergrund, dann der Hintergrund
 * selbst; reicht keine, die mit dem besten Kontrast.
 * `null` = Farben nicht auswertbar (kein Hex) → bisheriges Verhalten (Weiß).
 */
export function brandPaper(colors: { background?: string; surface?: string; text?: string }): {
  paper: string;
  ink: string;
  dark: boolean;
} | null {
  const ink = colors.text || DEFAULT_BRAND_COLORS.text;
  const bg = colors.background || DEFAULT_BRAND_COLORS.background;
  const surface = colors.surface || DEFAULT_BRAND_COLORS.surface;
  if (relativeLuminance(ink) == null) return null;
  const candidates = ["#ffffff", surface, mixHex(bg, "#ffffff", 0.08), bg].filter(
    (x): x is string => typeof x === "string" && relativeLuminance(x) != null,
  );
  let best = "#ffffff";
  let bestC = -1;
  for (const cand of candidates) {
    const cr = contrastRatio(ink, cand) ?? 0;
    if (cr >= MIN_TEXT_CONTRAST) {
      best = cand;
      bestC = cr;
      break;
    }
    if (cr > bestC) {
      best = cand;
      bestC = cr;
    }
  }
  return { paper: best, ink, dark: (relativeLuminance(best) ?? 1) < 0.18 };
}

/**
 * Kontrast-Hinweis fürs Einstellungs-Formular: Text auf Hintergrund zu schwach?
 * Liefert das Verhältnis, wenn es unter dem Fließtext-Minimum liegt, sonst null.
 */
export function weakTextContrast(colors: { background?: string; text?: string }): number | null {
  const cr = contrastRatio(
    colors.text || DEFAULT_BRAND_COLORS.text,
    colors.background || DEFAULT_BRAND_COLORS.background,
  );
  return cr != null && cr < MIN_TEXT_CONTRAST ? cr : null;
}

/**
 * Hat das Konto eigene Farben (≠ Steply-Standard)? Nur OHNE eigene Farben zeigt die
 * Hilfe-Seite die bunten Kategorie-Farbfamilien — sonst bliebe die Kunden-CI nicht
 * monochrom (Audit 24.09.).
 */
export function hasCustomColors(tokens: unknown): boolean {
  const c = brandColorsWithDefaults(tokens);
  return (Object.keys(DEFAULT_BRAND_COLORS) as (keyof BrandColors)[]).some(
    (k) => c[k].trim().toLowerCase() !== DEFAULT_BRAND_COLORS[k].toLowerCase(),
  );
}

/**
 * Wandelt themes.tokens (§8) in CSS-Custom-Properties für den öffentlichen
 * Viewer/Hub. Nicht gesetzte Werte fallen auf die warmen Defaults (:root) zurück.
 */
/** Farbe: #hex, rgb()/hsl()/oklch()… mit schlichten Argumenten oder ein Farbname. */
function isSafeCssColor(v: string): boolean {
  return (
    /^#[0-9a-f]{3,8}$/i.test(v) ||
    /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\([0-9a-z.,%/\s+-]*\)$/i.test(v) ||
    /^[a-z]{3,30}$/i.test(v)
  );
}

/** Schriftnamen/Gewichte: Buchstaben, Ziffern, Leerzeichen, Anführungszeichen, Komma, Bindestrich. */
function isSafeCssPlain(v: string): boolean {
  return v.length <= 200 && /^[\p{L}\p{N}\s"',.-]*$/u.test(v);
}

function safeTokenMap(
  src: Record<string, string | number> | undefined,
  ok: (v: string) => boolean,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(src ?? {})) {
    const str = String(v ?? "").trim();
    if (str && ok(str)) out[k] = str;
  }
  return out;
}

/**
 * @param opts.onWhite  Fläche ist garantiert weiß (Druckansicht): Textfarbe/Papier für Weiß
 *   ableiten — eine helle Kunden-Textfarbe (dunkles Design) wird dort durch die dunkle
 *   Standard-Textfarbe ersetzt, sonst stünde hellgrauer Text auf dem Papier.
 */
export function brandStyle(tokens: unknown, opts: { onWhite?: boolean } = {}): CSSProperties {
  const t = (tokens ?? {}) as {
    colors?: Record<string, string>;
    typography?: Record<string, string | number>;
    shape?: Record<string, string | number>;
  };
  // Werte kommen aus der DB (Inhaber/Bearbeiter können themes selbst beschreiben) und
  // landen als CSS-Variablen auf der öffentlichen Seite → nur echte Farben/Schriftnamen,
  // nie url(…) o. Ä. (sonst Tracking der Endkunden über Dritt-Hosts).
  const c = safeTokenMap(t.colors, isSafeCssColor);
  const ty = safeTokenMap(t.typography, isSafeCssPlain);
  const sh = t.shape ?? {};
  const s: Record<string, string> = {};

  if (opts.onWhite) {
    // Druck: Hintergrund = Weiß; Textfarbe nur übernehmen, wenn sie auf Weiß lesbar ist.
    c.background = "#ffffff";
    if (c.text && (contrastRatio(c.text, "#ffffff") ?? 0) < MIN_TEXT_CONTRAST) c.text = DEFAULT_BRAND_COLORS.text;
  }

  if (c.primary) s["--brand-accent"] = c.primary;
  if (c.surface) s["--brand-soft"] = c.surface;
  if (c.background) s["--brand-bg"] = c.background;
  if (c.text) s["--brand-ink"] = c.text;
  if (ty.bodyFont) s["--brand-font"] = cssFontFamily(String(ty.bodyFont));
  if (ty.headingFont) s["--brand-font-heading"] = cssFontFamily(String(ty.headingFont));
  if (ty.headingWeight != null) s["--brand-heading-weight"] = String(ty.headingWeight);
  if (sh.radius != null) s["--brand-radius"] = `${parseInt(String(sh.radius), 10) || 0}px`;
  const radiusPx = sh.radius != null ? `${parseInt(String(sh.radius), 10) || 0}px` : "12px";
  s["--brand-btn-radius"] = sh.buttonStyle === "pill" ? "999px" : radiusPx;

  // Card-/Titel-Stil aus dem Design ableiten (outline | elevated | filled).
  // Fallbacks = warmes Steply-Standard-Theme (Handoff 07/2026).
  const accent = (c.primary as string) || DEFAULT_BRAND_COLORS.primary;
  const bg = (c.background as string) || "#ffffff";
  const surface = (c.surface as string) || DEFAULT_BRAND_COLORS.surface;
  const ink = (c.text as string) || DEFAULT_BRAND_COLORS.text;
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
    // Als Text auf Weiß: umso heller, desto stärker abdunkeln (bis ~45 %).
    const amount = Math.min(0.45, (lum - 0.35) * 0.75);
    s["--brand-accent-strong"] = darken(accent, amount) ?? accent;
  } else {
    // Dunkler/mittlerer Akzent oder ungültig → bisheriges Verhalten.
    s["--brand-accent-strong"] = accent;
  }
  // Text auf Akzent: Weiß, solange es auf dem Akzent reicht (≥ 3 : 1, fette Knopfschrift —
  // Steply-Koralle 3,07 bleibt weiß, das Rot des Demo-Kontos auch); sonst dunkle Ink-Farbe
  // (helles Gelb #ffe14d, aber auch Orange #ff7a00 mit nur 2,6 : 1 — Audit 24.09.).
  // Ungültiger Hex → Weiß (bisheriges Verhalten).
  s["--brand-accent-fg"] = (contrastRatio("#ffffff", accent) ?? 21) >= 3 ? "#ffffff" : "#101524";

  // Papier (Kopf/Suche/Karten/Wizard/Chat) + abgeleitete Textstufen (Audit 24.09.):
  // helle Designs bleiben pixelgleich (Papier = Weiß), dunkle bekommen eine dunkle Fläche.
  const pp = brandPaper({ background: c.background, surface: c.surface, text: c.text });
  const paper = pp?.paper ?? "#ffffff";
  const paperDark = pp?.dark ?? false;
  s["--brand-paper"] = paper;
  if (paperDark) {
    // Akzent ALS Text auf dunklem Papier: nicht abdunkeln, sondern bei Bedarf aufhellen.
    let strong = accent;
    for (let k = 1; k <= 7 && (contrastRatio(strong, paper) ?? 3) < 3; k++) {
      strong = mixHex(accent, "#ffffff", k * 0.1) ?? accent;
    }
    s["--brand-accent-strong"] = strong;
  } else {
    // Akzent ALS Text auf hellem Papier: bis WCAG AA (4,5 : 1) abdunkeln — Steply-Koralle hatte
    // als Schrift nur 3,07 : 1 (Antwortknöpfe, Schrittnummern im Druck; Runde 4). Akzente, die
    // schon reichen, bleiben unverändert.
    const start = String(s["--brand-accent-strong"] ?? accent);
    let strong = start;
    for (let k = 1; k <= 8 && (contrastRatio(strong, paper) ?? 4.5) < 4.5; k++) {
      strong = darken(start, k * 0.06) ?? strong;
    }
    s["--brand-accent-strong"] = strong;
  }
  // Fokus-Ring der Hilfe-Seite in der (kontraststarken) Kundenfarbe statt blasser Steply-Koralle
  // (Runde 5, Tastatur-Test); die volle Deckkraft setzt globals.css für [data-hub-brand].
  s["--ring"] = String(s["--brand-accent-strong"] ?? accent);
  // Gedämpfte Texte aus der Kunden-Textfarbe statt fest Steply-Beige (#8a7a63): halb-
  // transparente Textfarbe liest sich auf Hintergrund UND Papier. Überschreibt die
  // Tailwind-Tokens (text-muted-foreground/-ink/-ink-2) nur innerhalb der Hilfe-Seite.
  if (c.text && relativeLuminance(c.text) != null) {
    s["--ink"] = c.text;
    s["--ink-2"] = `color-mix(in srgb, ${c.text} 82%, transparent)`;
    s["--muted-foreground"] = `color-mix(in srgb, ${c.text} 68%, transparent)`;
  }
  const hairline = paperDark ? "rgba(255,255,255,0.12)" : "";

  if (cardStyle === "outline") {
    s["--brand-card-bg"] = bg;
    s["--brand-card-border"] = accent;
    s["--brand-card-bw"] = "1.5px";
    s["--brand-title"] = accent;
    s["--brand-icon-bg"] = "transparent";
    s["--brand-card-shadow"] = "none";
  } else if (cardStyle === "elevated") {
    s["--brand-card-bg"] = paper;
    s["--brand-card-border"] = border || hairline || "rgba(16,21,36,0.06)";
    s["--brand-card-bw"] = "1px";
    s["--brand-title"] = ink;
    s["--brand-icon-bg"] = surface;
    s["--brand-card-shadow"] = "0 6px 20px rgba(16,21,36,0.08)";
  } else {
    s["--brand-card-bg"] = paper;
    s["--brand-card-border"] = border || hairline || "rgba(16,21,36,0.10)";
    s["--brand-card-bw"] = "1px";
    s["--brand-title"] = ink;
    s["--brand-icon-bg"] = surface;
    s["--brand-card-shadow"] = "none";
  }

  return s as CSSProperties;
}
