// Handgepflegte DB-Typen (Kern). Später ggf. via `supabase gen types` ersetzen.

export type TutorialStatus = "draft" | "published";
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
  freshness: Freshness;
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
  position: number;
  is_decision: boolean;
  video_time: number | null; // Sekunde im Quell-Video (Video-Pipeline) für den Frame-Picker
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
