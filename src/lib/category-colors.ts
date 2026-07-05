/**
 * Kategorie-Farbsystem (Design-Handoff 07/2026): Jede Kategorie bekommt
 * deterministisch eine der fünf warmen Akzentfamilien (Koralle/Teal/Violett/
 * Amber/Blau) — stabil über Reloads (Hash über den Namen), ohne DB-Feld.
 *
 * Formen-Konvention des Handoffs (Chips/Icons): Koralle=rundes Quadrat,
 * Teal=Kreis, Violett=Raute (rotate 45°), Amber=Ring, Blau=rundes Quadrat.
 */
export type CategoryColor = {
  /** Vollton (Punkte, Marker, Avatare) */
  solid: string;
  /** Pastell-Fläche (aktive Zeile, Chips, Thumbnails) */
  soft: string;
  /** Text auf Pastell */
  text: string;
  /** tiefere Textstufe (Mono-Labels auf Streifen) */
  deep: string;
  /** dunklere Streifen-Stufe für Platzhalter-Thumbnails */
  stripe: string;
  /** Icon-Form der Familie */
  shape: "square" | "circle" | "diamond" | "ring";
};

export const CATEGORY_COLORS: CategoryColor[] = [
  { solid: "#ef6a4e", soft: "#ffe8e2", text: "#a8452e", deep: "#c07660", stripe: "#ffdcd3", shape: "square" },
  { solid: "#18a999", soft: "#dcf3ef", text: "#118576", deep: "#4d9a8e", stripe: "#cdece6", shape: "circle" },
  { solid: "#8b7cf6", soft: "#ece7fd", text: "#6d59d8", deep: "#8878d4", stripe: "#e2dbfa", shape: "diamond" },
  { solid: "#f2a93b", soft: "#fdeecd", text: "#c07d16", deep: "#c07d16", stripe: "#fae3b2", shape: "ring" },
  { solid: "#5aa9e6", soft: "#e3f0fb", text: "#3a80c0", deep: "#3a80c0", stripe: "#d5e8f8", shape: "square" },
];

/** Neutrale (Beige-)Familie für „ohne Kategorie". */
export const CATEGORY_NEUTRAL: CategoryColor = {
  solid: "#b3a48c",
  soft: "#f7f1e6",
  text: "#8a7a63",
  deep: "#8a7a63",
  stripe: "#f0e7d9",
  shape: "circle",
};

/** Deterministische Familie für einen Kategorienamen (null = neutral). */
export function categoryColor(name: string | null | undefined): CategoryColor {
  if (!name) return CATEGORY_NEUTRAL;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
}

/** Streifen-Hintergrund (Platzhalter-Thumbnails) als inline-style-Wert. */
export function categoryStripes(c: CategoryColor, band = 8): string {
  return `repeating-linear-gradient(-45deg, ${c.soft}, ${c.soft} ${band}px, ${c.stripe} ${band}px, ${c.stripe} ${band * 2}px)`;
}
