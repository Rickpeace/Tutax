"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import {
  convertTutorialToAutomation,
  sanitizeParams,
  sanitizeSchedule,
} from "@/lib/automations";
import { validateStepCondition } from "@/lib/guide";

// Server-Actions für den Automationen-Bereich (Welle 36). Alle Mutationen sind
// konto-scoped: Lese-/Schreibrechte laufen über den Session-Client (RLS-Policy
// „members manage own automations“). Das Umwandeln braucht den Admin-Client (liest
// Tutorial-Schritte + legt Snapshot an) — die Kern-Logik ist streng accountId-gescoped.

/**
 * Ein Tutorial (Sofort-Aufnahme) in eine Automation umwandeln. Gibt die neue
 * automationId zurück (der Client springt danach in die Detailseite). Wirft die
 * sprechende Fehlermeldung aus der Kern-Logik (Verzweigungen / zu wenige Schritte /
 * fremdes Tutorial) — der Aufrufer zeigt sie als Toast.
 */
export async function createAutomationFromTutorial(
  tutorialId: string,
): Promise<{ automationId: string }> {
  const { account } = await requireAccount();
  const admin = createAdminClient();
  const { automationId } = await convertTutorialToAutomation(
    admin,
    account.id,
    tutorialId,
  );
  revalidatePath("/app/automationen");
  return { automationId };
}

/** Automation umbenennen (konto-scoped via RLS). */
export async function renameAutomation(id: string, title: string) {
  const clean = title.trim().slice(0, 120);
  if (!clean) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("automations")
    .update({ title: clean, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/automationen");
  revalidatePath(`/app/automationen/${id}`);
}

/**
 * Parameter-Definitionen einer Automation aktualisieren (label/type/required editierbar,
 * key read-only). Streng validiert (sanitizeParams); source nur 'manual'|'stored'.
 * WERTE gibt es hier nie — nur Definitionen. Konto-scoped via RLS.
 */
export async function updateAutomationParams(id: string, params: unknown) {
  const clean = sanitizeParams(params);
  const supabase = await createClient();
  const { error } = await supabase
    .from("automations")
    .update({ params: clean, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/app/automationen/${id}`);
}

/**
 * Zeitplan einer Automation setzen/entfernen (Welle 41). `schedule = null` entfernt den
 * Zeitplan; sonst wird streng validiert (sanitizeSchedule wirft sprechend bei falschen
 * Werten). Konto-scoped via RLS. WICHTIG: Der Zeitplan wird NUR IM BROWSER des Nutzers via
 * chrome.alarms gelöst (kein Server-Cron) — die Extension synct ihn über
 * GET /api/recorder/automations. WERTE für geplante Läufe bleiben lokal in der Extension;
 * die App kann sie nicht sehen (sie warnt nur textlich, dass Pflicht-Werte gemerkt sein müssen).
 */
export async function setAutomationSchedule(id: string, schedule: unknown) {
  const clean = sanitizeSchedule(schedule); // wirft bei ungültigen Werten (sprechend)
  const supabase = await createClient();
  const { error } = await supabase
    .from("automations")
    .update({ schedule: clean, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/app/automationen/${id}`);
  revalidatePath("/app/automationen");
}

/**
 * Bedingte Schritte (Welle 42): Ausführ-Bedingung an EINEM Automations-Schritt setzen/entfernen.
 * Im Detail vor allem zum ENTFERNEN gedacht (Toggle „immer ausführen" → condition=null). `condition`
 * wird tolerant validiert (validateStepCondition): kaputt/leer/null → null. Konto-scoped via RLS
 * (automation_id-Filter zusätzlich als Gürtel-und-Hosenträger). WERTE gibt es hier nie.
 */
export async function setAutomationStepCondition(
  automationId: string,
  stepId: string,
  condition: unknown,
) {
  const clean = validateStepCondition(condition) ?? null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("automation_steps")
    .update({ condition: clean })
    .eq("id", stepId)
    .eq("automation_id", automationId);
  if (error) throw new Error(error.message);
  revalidatePath(`/app/automationen/${automationId}`);
}

/** Automation löschen (kaskadiert Schritte + Läufe). Konto-scoped via RLS. */
export async function deleteAutomation(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("automations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/automationen");
}
