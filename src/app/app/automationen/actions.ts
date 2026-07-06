"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { convertTutorialToAutomation, sanitizeParams } from "@/lib/automations";

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

/** Automation löschen (kaskadiert Schritte + Läufe). Konto-scoped via RLS. */
export async function deleteAutomation(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("automations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/automationen");
}
