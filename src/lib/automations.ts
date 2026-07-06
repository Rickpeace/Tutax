import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Automationen (Welle 36): Kern-Logik, die aus einer Sofort-Aufnahme (Tutorial mit
// Selektoren) einen ausführbaren Ablauf-SNAPSHOT macht. Tipp-Schritte werden zu
// PARAMETERN („E-Mail = ?"); die Extension führt den Ablauf später aus. Parameter-WERTE
// (insb. Secrets) liegen NIE auf dem Server — nur die Definitionen.
//
// MVP: LINEARE Abläufe. Verzweigungen (Entscheidungen / Antwort-Branches) werden mit
// einer sprechenden Meldung abgelehnt. Server-only, aber bewusst testbar (die Live-Tests
// importieren convertTutorialToAutomation direkt).

/** Was die Ausführ-Engine tut. fill/select ziehen ihren Wert aus einem Parameter. */
export type AutomationAction = "click" | "fill" | "select" | "toggle";

/** Parameter-DEFINITION (WERTE liegen NIE hier — nur die Metadaten). */
export type AutomationParam = {
  key: string;
  label: string;
  type: "text" | "secret";
  required: boolean;
  source: "manual" | "stored";
};

// Sprechende Fehlermeldungen (deutsche UI-Texte, typografische Anführungszeichen).
export const AUTOMATION_ERR_BRANCHING =
  "Automationen unterstützen (noch) keine Verzweigungen.";
export const AUTOMATION_ERR_TOO_FEW =
  "Zu wenige ausführbare Schritte.";
export const AUTOMATION_ERR_NOT_FOUND =
  "Tutorial nicht gefunden.";

// Label/Titel, die nach einem Geheimnis riechen → type='secret'.
const SECRET_RE = /passwor|pin\b|schl(ü|ue)ssel|secret|token|key/i;

type StepRow = {
  id: string;
  title: string | null;
  image_path: string | null;
  selector: { css?: string; text?: string; role?: string } | null;
  page_url: string | null;
  is_decision: boolean | null;
  position: number;
};

type BranchRow = {
  step_id: string;
  label: string | null;
  target_step_id: string | null;
  position: number;
};

/** Aktion aus der ARIA-Rolle des Selektors ableiten (Fallback: click). */
export function actionForRole(role: string | null | undefined): AutomationAction {
  const r = (role ?? "").trim().toLowerCase();
  if (r === "textbox" || r === "searchbox") return "fill";
  if (r === "combobox") return "select";
  if (r === "checkbox" || r === "radio" || r === "switch") return "toggle";
  return "click";
}

/**
 * Stabilen, DB-tauglichen Parameter-Key aus einem menschenlesbaren Label ableiten.
 * Deutsche Umlaute werden transliteriert; alles andere zu „_“. Leere/kollidierende
 * Keys weichen auf k1, k2 … bzw. base_2, base_3 … aus (dedupe über `used`).
 */
function slugKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * Linearen Pfad ab der Wurzel über null-Label-Branches ablaufen (Muster tree.ts).
 * Wirft AUTOMATION_ERR_BRANCHING, sobald der Pfad eine Entscheidung enthält ODER ein
 * Schritt eine Antwort-Kante (non-null Label) bzw. mehr als eine ausgehende Kante hat.
 */
function walkLinearPath(
  steps: StepRow[],
  branches: BranchRow[],
  rootStepId: string | null,
): StepRow[] {
  if (!steps.length) return [];

  const byId = new Map(steps.map((s) => [s.id, s]));
  const bySrc = new Map<string, BranchRow[]>();
  for (const b of branches) {
    const list = bySrc.get(b.step_id) ?? [];
    list.push(b);
    bySrc.set(b.step_id, list);
  }
  for (const list of bySrc.values()) list.sort((a, b) => a.position - b.position);

  // Wurzel: explizit gesetzt, sonst Schritt mit Eingangsgrad 0, sonst erster nach position.
  const targeted = new Set(
    branches.map((b) => b.target_step_id).filter((t): t is string => !!t),
  );
  const byPosition = [...steps].sort((a, b) => a.position - b.position);
  const root =
    (rootStepId && byId.has(rootStepId) && rootStepId) ||
    byPosition.find((s) => !targeted.has(s.id))?.id ||
    byPosition[0].id;

  const path: StepRow[] = [];
  const seen = new Set<string>();
  let cur: string | null = root;
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    const step = byId.get(cur)!;
    if (step.is_decision) throw new Error(AUTOMATION_ERR_BRANCHING);
    const outs: BranchRow[] = bySrc.get(cur) ?? [];
    if (outs.some((b) => (b.label ?? "").trim() !== "")) {
      throw new Error(AUTOMATION_ERR_BRANCHING);
    }
    if (outs.length > 1) throw new Error(AUTOMATION_ERR_BRANCHING);
    path.push(step);
    cur = outs[0]?.target_step_id ?? null;
  }
  return path;
}

export type ConvertResult = { automationId: string };

/**
 * Ein Tutorial (Sofort-Aufnahme) in eine Automation umwandeln. Konto-scoped.
 * Wirft eine sprechende Fehlermeldung bei Verzweigungen / zu wenigen ausführbaren
 * Schritten / fremdem Tutorial.
 */
export async function convertTutorialToAutomation(
  admin: SupabaseClient,
  accountId: string,
  tutorialId: string,
): Promise<ConvertResult> {
  // 1) Tutorial laden + Eigentum prüfen.
  const { data: tut } = await admin
    .from("tutorials")
    .select("id, account_id, title, site_domains, root_step_id")
    .eq("id", tutorialId)
    .maybeSingle<{
      id: string;
      account_id: string | null;
      title: string | null;
      site_domains: string[] | null;
      root_step_id: string | null;
    }>();
  if (!tut || tut.account_id !== accountId) {
    throw new Error(AUTOMATION_ERR_NOT_FOUND);
  }

  // 2) Schritte + Branches laden.
  const { data: stepsData } = await admin
    .from("steps")
    .select("id, title, image_path, selector, page_url, is_decision, position")
    .eq("tutorial_id", tutorialId)
    .order("position", { ascending: true })
    .returns<StepRow[]>();
  const steps = stepsData ?? [];
  const stepIds = steps.map((s) => s.id);

  const { data: branchesData } = stepIds.length
    ? await admin
        .from("step_branches")
        .select("step_id, label, target_step_id, position")
        .in("step_id", stepIds)
        .returns<BranchRow[]>()
    : { data: [] as BranchRow[] };
  const branches = branchesData ?? [];

  // 3) Linearen Pfad ablaufen (wirft bei Verzweigung).
  const path = walkLinearPath(steps, branches, tut.root_step_id);

  // 4) Nur Schritte MIT Selektor sind ausführbar; Hinweis-Schritte (ohne Selektor)
  //    werden übersprungen. Bleiben <2 übrig → Fehler.
  const executable = path.filter((s) => s.selector != null);
  if (executable.length < 2) throw new Error(AUTOMATION_ERR_TOO_FEW);

  // 5) Schritte in automation_steps + Parameter ableiten.
  const params: AutomationParam[] = [];
  const usedKeys = new Set<string>();
  let emptyCounter = 0;

  const stepRows = executable.map((s, i) => {
    const action = actionForRole(s.selector?.role);
    let paramKey: string | null = null;

    // fill/select brauchen einen Wert → Parameter. toggle wird nur „angehakt“ (kein Param).
    if (action === "fill" || action === "select") {
      const label = (s.selector?.text || s.title || "Eingabe").trim();
      let base = slugKey(label);
      if (!base) base = `k${++emptyCounter}`;
      let key = base;
      let n = 1;
      while (usedKeys.has(key)) key = `${base}_${++n}`;
      usedKeys.add(key);
      paramKey = key;

      const secretHay = `${label} ${s.title ?? ""}`;
      params.push({
        key,
        label,
        type: SECRET_RE.test(secretHay) ? "secret" : "text",
        required: true,
        source: "manual",
      });
    }

    return {
      position: i + 1,
      title: s.title,
      action,
      selector: s.selector,
      page_url: s.page_url,
      param_key: paramKey,
      image_path: s.image_path,
    };
  });

  // 6) Automation + Schritte anlegen.
  const { data: auto, error: ae } = await admin
    .from("automations")
    .insert({
      account_id: accountId,
      title: tut.title ?? "Automation",
      source_tutorial_id: tut.id,
      site_domains: Array.isArray(tut.site_domains) ? tut.site_domains : [],
      params,
    })
    .select("id")
    .single();
  if (ae || !auto) {
    throw new Error("Die Automation konnte nicht angelegt werden.");
  }
  const automationId = auto.id as string;

  const { error: se } = await admin
    .from("automation_steps")
    .insert(stepRows.map((r) => ({ automation_id: automationId, ...r })));
  if (se) {
    await admin.from("automations").delete().eq("id", automationId);
    throw new Error("Die Schritte der Automation konnten nicht gespeichert werden.");
  }

  return { automationId };
}

/**
 * Parameter-Definitionen streng, aber tolerant säubern (für updateAutomationParams).
 * Unbekannte Keys/falsche Typen werden verworfen; Einträge ohne key fallen raus.
 */
export function sanitizeParams(raw: unknown): AutomationParam[] {
  if (!Array.isArray(raw)) return [];
  const out: AutomationParam[] = [];
  const used = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key.trim().slice(0, 40) : "";
    if (!key || used.has(key)) continue;
    used.add(key);
    const label =
      typeof r.label === "string" && r.label.trim()
        ? r.label.trim().slice(0, 120)
        : key;
    const type = r.type === "secret" ? "secret" : "text";
    const required = r.required !== false; // default true
    const source = r.source === "stored" ? "stored" : "manual";
    out.push({ key, label, type, required, source });
  }
  return out;
}
