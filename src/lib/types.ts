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
};

// ── Bedingte Schritte (Welle 42) ──────────────────────────────────────────────
// Optionale, maschinenlesbare Ausführ-Bedingung an einem Schritt (Migration 0034). Der MENSCH
// (Tutorial/Führung) ignoriert sie; NUR der Automations-Lauf wertet sie aus und überspringt den
// Schritt sonst nahtlos. Formen: Element vorhanden (nutzt den Selektor des Schritts) oder URL
// passt (Teilstring/Glob). `negate` kehrt um („nur wenn NICHT …"). Spiegelt exec-plan.js.
export type StepCondition =
  | { kind: "element"; selector: { css?: string; text?: string; role?: string }; negate?: boolean }
  | { kind: "url"; pattern: string; negate?: boolean };

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
