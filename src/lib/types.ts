// Handgepflegte DB-Typen (Kern). Später ggf. via `supabase gen types` ersetzen.

export type TutorialStatus = "draft" | "published";
export type TutorialVisibility = "public" | "internal";
export type Freshness = "ok" | "stale" | "checking";
export type ThemeStatus = "draft" | "analyzing" | "ready" | "failed";

export type AccountPlan = "free" | "pro";

export type Account = {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  onboarded: boolean;
  plan: AccountPlan;
  created_at: string;
};

export type Category = {
  id: string;
  account_id: string;
  name: string;
  icon: string | null;
  position: number;
  created_at: string;
};

export type Tutorial = {
  id: string;
  account_id: string | null;
  category_id: string | null;
  title: string;
  description: string | null;
  is_template: boolean;
  status: TutorialStatus;
  visibility: TutorialVisibility;
  /** Öffentliche Anleitung zusätzlich im Team-Lernbereich (mit Nachweis) zeigen (Welle 20). */
  in_lernen: boolean;
  freshness: Freshness;
  /** Basis-Domains (lowercase, ohne www.), für die dieses Tutorial gilt (Welle 31c) —
   *  auto-gesät aus der Sofort-Aufnahme, im Builder editierbar, Extension-Matching. */
  site_domains: string[];
  slug: string | null;
  public_token: string | null;
  root_step_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Highlight = {
  id: string;
  type: "rect" | "ellipse" | "arrow" | "blur";
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  strokeWidth?: number;
  rounded?: boolean;
  zoom?: boolean; // markierten Bereich als vergrößerte Lupe zeigen
  // Auto-Schwärzung (Welle 28): vom Server aus einem sensiblen Feld VORGESCHLAGENer Blur.
  // Bleibt gesetzt, bis der Autor die Markierungen des Schritts einmal geprüft/gespeichert
  // hat. Rein additiv — Viewer/Brenn-Logik ignorieren das Feld (Blur wird normal behandelt).
  suggested?: boolean;
  // Welle 51a: Herkunft eines Vorschlags. "previous" = Verpixelung vom vorigen Schritt (gleiche
  // Bildquelle) übernommen. Nur zusammen mit `suggested`; fällt beim Prüfen mit weg.
  suggestedFrom?: "previous";
};

// ── Bedingte Schritte (Welle 42) ──────────────────────────────────────────────
// Optionale, maschinenlesbare Ausführ-Bedingung an einem Schritt (Migration 0034). Der MENSCH
// (Tutorial/Führung) ignoriert sie; NUR der Automations-Lauf wertet sie aus und überspringt den
// Schritt sonst nahtlos. Formen: Element vorhanden (nutzt den Selektor des Schritts) oder URL
// passt (Teilstring/Glob). `negate` kehrt um („nur wenn NICHT …"). Spiegelt exec-plan.js.
export type StepCondition =
  | { kind: "element"; selector: { css?: string; text?: string; role?: string }; negate?: boolean }
  | { kind: "url"; pattern: string; negate?: boolean };

// ── Bedingter Sprung / Block-Überspringen (Welle 47) ──────────────────────────
// Optionaler Vorwärts-Sprung an einem Schritt (Migration 0035). Der MENSCH (Tutorial/Führung)
// ignoriert ihn; NUR der Automations-Lauf wertet ihn aus: trifft `when` zu (z. B. „Anmelden-Knopf
// NICHT da" = schon eingeloggt), springt der Lauf VORWÄRTS zu Schritt `to_position` und überspringt
// den ganzen Block dazwischen — GANZ VOR der Navigation, sodass die (Login-)Seiten der
// übersprungenen Schritte nie angefahren werden. NUR VORWÄRTS (to_position > Position des tragenden
// Schritts), damit keine Endlosschleife. Spiegelt exec-plan.js parseJump.
export type StepJump = {
  when: StepCondition;
  to_position: number;
};

// ── Erweiterte Interaktion (Welle 48, Migration 0036) ─────────────────────────
// Was ein Schritt über „Klick"/„Eingabe" hinaus tut. Vertrag + Reiseweg: extension/content.js
// (INTERACTION-Vertrag). Mensch (Text/Führung) UND Automation werten es aus.
export type InteractionSelector = { css?: string; text?: string; role?: string; shadow?: string[] };
export type StepInteraction = {
  enter?: boolean; // Eingabe per Enter abgeschickt (nur type/fill)
  /**
   * Rechts-/Doppelklick, Ziehen, Tastenkürzel (Welle 48) sowie Welle 55:
   *  • "nav"    Seitenwechsel OHNE Klick (Zurück-Knopf, Neuladen, Weiterleitung/SPA-Route)
   *  • "spot"   Klick auf eine Stelle OHNE brauchbares Element (Canvas, geschlossenes Shadow DOM)
   *  • "result" Abschluss-Bild am Ende der Aufnahme (zeigt nur das Ergebnis)
   * "nav"/"spot"/"result" tragen NIE einen Selektor → weder automatisierbar noch live führbar.
   */
  variant?: "right" | "double" | "drag" | "key" | "nav" | "spot" | "result";
  key?: string; // variant key: Anzeige-Form „Ctrl+S"
  /** Gedrückte Zusatztasten beim Klick (Welle 55, L3), Reihenfolge ctrl→meta→alt→shift. */
  modifiers?: ("ctrl" | "meta" | "alt" | "shift")[];
  /** Art des Seitenwechsels (nur variant "nav", Welle 55, L1). */
  nav?: "back" | "reload" | "goto";
  drop?: InteractionSelector; // variant drag: Ablage-Ziel
  dropLabel?: string;
  hover?: InteractionSelector; // vorher mit der Maus über dieses Element (Menü öffnen)
  hoverLabel?: string;
  /** Kontrollkästchen/Schalter: Zustand NACH dem Klick (Runde 4) — Automation setzt genau ihn. */
  checked?: boolean;
  frame?: { url: string; nth?: number }; // Schritt liegt in einem iframe (origin+pathname; nth = Position unter gleichartigen Geschwistern)
};

export type Step = {
  id: string;
  tutorial_id: string;
  chapter_id: string | null;
  title: string | null;
  body: unknown | null; // Tiptap-JSON
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  highlights: Highlight[];
  /** URL der Seite zum Aufnahme-Zeitpunkt (Sofort-Anleitung, Welle 31c) — sonst null. */
  page_url: string | null;
  /** Robuster Selektor des geklickten Elements (Sofort-Anleitung, Welle 24) — sonst null. */
  selector: { css?: string; text?: string; role?: string } | null;
  /** Ausführ-Bedingung für Automationen (Welle 42) — vom Menschen ignoriert; sonst null. */
  condition: StepCondition | null;
  /** Bedingter Vorwärts-Sprung für Automationen (Welle 47) — vom Menschen ignoriert; sonst null. */
  jump: StepJump | null;
  /** Erweiterte Interaktion (Welle 48, Migration 0036): Enter/Rechtsklick/Ziehen/… — sonst null. */
  interaction: StepInteraction | null;
  position: number;
  is_decision: boolean;
  video_time: number | null; // Sekunde im Quell-Video (Video-Pipeline) für den Frame-Picker
  audio_path: string | null; // Vorlesen (Welle 14): MP3 im public Bucket
  audio_hash: string | null; // Hash über den Sprech-Text -> Neu-Erzeugung nur bei Textänderung
  created_at: string;
};

export type StepBranch = {
  id: string;
  step_id: string;
  label: string | null;
  color: string | null;
  target_step_id: string | null;
  position: number;
  created_at: string;
};
