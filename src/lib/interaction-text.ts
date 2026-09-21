// Erweiterte Interaktion (Welle 48) — REINE Text-Helfer, ohne server-only, damit sie
// Server (guide.ts Vorlagen-Texte, guide-ai.ts KI-Hinweis) UND Client (Automations-Detail-
// Chip) teilen. Vertrag der Daten: extension/content.js „INTERACTION-Vertrag".
import type { InteractionSelector, StepInteraction } from "@/lib/types";

// Anzeige der Modifier/Tasten auf deutschen Tastaturen. Aufgenommen wird die neutrale
// Form („Ctrl+S"); im Text steht, was auf der Taste steht („Strg+S").
const KEY_DE: Record<string, string> = {
  ctrl: "Strg",
  control: "Strg",
  strg: "Strg",
  shift: "Umschalt",
  umschalt: "Umschalt",
  alt: "Alt",
  altgraph: "AltGr",
  meta: "Cmd",
  cmd: "Cmd",
  command: "Cmd",
  os: "Win",
  win: "Win",
  escape: "Esc",
  esc: "Esc",
  delete: "Entf",
  del: "Entf",
  backspace: "Rücktaste",
  space: "Leertaste",
  " ": "Leertaste",
  spacebar: "Leertaste",
  arrowup: "Pfeil hoch",
  arrowdown: "Pfeil runter",
  arrowleft: "Pfeil links",
  arrowright: "Pfeil rechts",
  pageup: "Bild hoch",
  pagedown: "Bild runter",
  home: "Pos1",
  end: "Ende",
  insert: "Einfg",
  enter: "Enter",
  tab: "Tab",
};

/** „Ctrl+Shift+s" → „Strg+Umschalt+S" (deutsche Tastenbeschriftung). Leer → "". */
export function displayKeyDe(key: string | undefined | null): string {
  if (!key || typeof key !== "string") return "";
  // „+" selbst als Taste („Ctrl++") bleibt erhalten: leere Teile am Ende → „+".
  const raw = key.trim();
  if (!raw) return "";
  const parts = raw.split("+");
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (!p) {
      if (i === parts.length - 1 && out.length) out.push("+");
      continue;
    }
    const mapped = KEY_DE[p.toLowerCase()];
    out.push(mapped ?? (p.length === 1 ? p.toUpperCase() : p));
  }
  return out.join("+");
}

/** Sichtbarer Kurzname eines Interaktions-Selektors (Label bevorzugt). */
export function selectorLabel(label: string | undefined, sel: InteractionSelector | undefined): string {
  return (label || sel?.text || "").replace(/\s+/g, " ").trim();
}

/** Beschriftung des Ablage-Ziels (drag) bzw. des Hover-Auslösers — "" wenn unbekannt. */
export function dropLabelOf(i: StepInteraction | null | undefined): string {
  return i ? selectorLabel(i.dropLabel, i.drop) : "";
}
export function hoverLabelOf(i: StepInteraction | null | undefined): string {
  return i ? selectorLabel(i.hoverLabel, i.hover) : "";
}

/**
 * Kurze Chips für das Automations-Detail („↵ Enter", „Rechtsklick", „Strg+S", „Menü: Datei",
 * „im Rahmen"). Reihenfolge = Ablauf (erst Menü, dann Aktion). Leer, wenn nichts Besonderes.
 */
export function interactionChips(i: StepInteraction | null | undefined): string[] {
  if (!i || typeof i !== "object") return [];
  const out: string[] = [];
  if (i.hover) {
    const h = hoverLabelOf(i);
    out.push(h ? `Menü: ${h.length > 24 ? h.slice(0, 23) + "…" : h}` : "Menü");
  }
  if (i.variant === "right") out.push("Rechtsklick");
  else if (i.variant === "double") out.push("Doppelklick");
  else if (i.variant === "drag") out.push("Ziehen");
  else if (i.variant === "key") out.push(displayKeyDe(i.key) || "Tastenkürzel");
  if (i.enter) out.push("↵ Enter");
  if (i.frame) out.push("im Rahmen");
  return out;
}

/**
 * Eine knappe Beschreibung für den KI-Feinschliff (guide-ai.ts), damit die KI die Art der
 * Interaktion NICHT wegformuliert (aus „Rechtsklick" darf kein „Klicken" werden). null = normal.
 */
export function describeInteractionForAi(i: StepInteraction | null | undefined): string | null {
  if (!i || typeof i !== "object") return null;
  const parts: string[] = [];
  const h = hoverLabelOf(i);
  if (i.hover) parts.push(h ? `vorher mit der Maus über „${h}“ fahren (Menü öffnet sich)` : "vorher mit der Maus über das Menü fahren");
  if (i.variant === "right") parts.push("RECHTSKLICK (rechte Maustaste)");
  else if (i.variant === "double") parts.push("DOPPELKLICK");
  else if (i.variant === "drag") {
    const d = dropLabelOf(i);
    parts.push(d ? `ZIEHEN (Drag & Drop) auf „${d}“` : "ZIEHEN (Drag & Drop) an die markierte Stelle");
  } else if (i.variant === "key") parts.push(`TASTENKÜRZEL ${displayKeyDe(i.key)} drücken`);
  if (i.enter) parts.push("Eingabe mit ENTER bestätigen");
  if (i.frame) parts.push("liegt in einem eingebetteten Bereich der Seite");
  return parts.length ? parts.join("; ") : null;
}
