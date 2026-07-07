import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { readSchedule, type AutomationParam } from "@/lib/automations";
import type { Highlight, StepCondition, StepJump } from "@/lib/types";
import {
  AutomationDetail,
  type AutomationStepView,
  type AutomationRunView,
} from "@/components/app/automation-detail";

/**
 * Automation-Detail (Welle 36): Titel (editierbar), Parameter-Tabelle, Schritt-Vorschau,
 * Lauf-Historie, Löschen. RSC lädt konto-scoped (RLS) — fremde/unbekannte Automationen
 * werden gar nicht geliefert → 404.
 */
export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { account } = await requireAccount();
  const supabase = await createClient();

  const { data: automation } = await supabase
    .from("automations")
    .select("id, title, site_domains, params, schedule")
    .eq("id", id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!automation) notFound();

  const [{ data: stepsData }, { data: runsData }] = await Promise.all([
    supabase
      .from("automation_steps")
      .select("id, position, title, action, param_key, image_path, highlights, file_meta, condition, jump")
      .eq("automation_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("automation_runs")
      .select("id, status, mode, trigger, started_at, finished_at, detail")
      .eq("automation_id", id)
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  const paramList: AutomationParam[] = Array.isArray(automation.params)
    ? (automation.params as AutomationParam[])
    : [];

  const steps: AutomationStepView[] = (stepsData ?? []).map((s) => ({
    id: s.id as string,
    position: s.position as number,
    title: (s.title as string | null) ?? "",
    action: s.action as AutomationStepView["action"],
    paramKey: (s.param_key as string | null) ?? null,
    imagePath: (s.image_path as string | null) ?? null,
    // Markierungen fürs Referenzbild (Welle 37). Bestands-Automationen: highlights=null → [].
    highlights: Array.isArray(s.highlights) ? (s.highlights as Highlight[]) : [],
    // Datei-Brücke (Welle 39): {role:download,key} | {role:upload,source} | null.
    fileMeta:
      s.file_meta && typeof s.file_meta === "object" && !Array.isArray(s.file_meta)
        ? (s.file_meta as AutomationStepView["fileMeta"])
        : null,
    // Bedingte Schritte (Welle 42): Ausführ-Bedingung {kind:element|url, …} | null.
    condition:
      s.condition && typeof s.condition === "object" && !Array.isArray(s.condition)
        ? (s.condition as StepCondition)
        : null,
    // Bedingter Sprung (Welle 47): {when, to_position} | null. Für Chip-Anzeige + „entfernen".
    jump:
      s.jump && typeof s.jump === "object" && !Array.isArray(s.jump)
        ? (s.jump as StepJump)
        : null,
  }));

  const runs: AutomationRunView[] = (runsData ?? []).map((r) => ({
    id: r.id as string,
    status: r.status as string,
    mode: r.mode as string,
    // Auslöser (Welle 41): manuell (Panel) vs. geplant (Wecker). Bestandsläufe: default 'manual'.
    trigger: (r.trigger as string | null) === "scheduled" ? "scheduled" : "manual",
    startedAt: r.started_at as string,
    finishedAt: (r.finished_at as string | null) ?? null,
    detail: (r.detail as string | null) ?? null,
  }));

  return (
    <AutomationDetail
      id={automation.id as string}
      title={(automation.title as string) ?? ""}
      siteDomains={
        Array.isArray(automation.site_domains) ? (automation.site_domains as string[]) : []
      }
      params={paramList}
      steps={steps}
      runs={runs}
      schedule={readSchedule(automation.schedule)}
    />
  );
}
