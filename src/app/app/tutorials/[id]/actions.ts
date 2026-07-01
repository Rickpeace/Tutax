"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { burnBlur, hasBlur } from "@/lib/redact";
import { YES } from "@/lib/builder/constants";

// Hinweis: Diese Builder-Actions persistieren NUR (kein revalidatePath).
// Die UI führt der Client optimistisch & sofort; der Server speichert im
// Hintergrund. IDs für Inserts kommen vom Client (crypto.randomUUID), damit
// das Einfügen ohne Roundtrip sichtbar ist.

/** Neuen Schritt anlegen (Client liefert id + Verdrahtung). */
export async function addStep(
  tutorialId: string,
  step: { id: string; title: string; position: number },
  setRoot: boolean,
  wire: { branchId: string; fromStepId: string } | null,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("steps").insert({
    id: step.id,
    tutorial_id: tutorialId,
    title: step.title,
    position: step.position,
    is_decision: false,
  });
  if (error) throw new Error(error.message);

  if (setRoot) {
    await supabase
      .from("tutorials")
      .update({ root_step_id: step.id })
      .eq("id", tutorialId);
  }
  if (wire) {
    const { error: be } = await supabase.from("step_branches").insert({
      id: wire.branchId,
      step_id: wire.fromStepId,
      label: null,
      target_step_id: step.id,
      position: 0,
    });
    if (be) throw new Error(be.message);
  }
}

/** Titel/Text/Bild speichern (stiller Auto-Save). */
export async function updateStep(
  stepId: string,
  patch: {
    title?: string;
    body?: unknown;
    image_path?: string | null;
    image_width?: number | null;
    image_height?: number | null;
    highlights?: unknown;
  },
) {
  const supabase = await createClient();
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("steps").update(patch).eq("id", stepId);
  if (error) throw new Error(error.message);

  // Ist das Tutorial VERÖFFENTLICHT und Bild/Markierungen haben sich geändert,
  // muss die öffentliche Bild-Kopie nachgezogen werden — inkl. eingebranntem Blur.
  // Sonst bliebe z. B. eine nachträglich geschwärzte Stelle öffentlich lesbar.
  if ("image_path" in patch || "highlights" in patch) {
    await refreshPublicImage(stepId).catch((e) =>
      console.error("Public-Bild-Refresh fehlgeschlagen:", e instanceof Error ? e.message : e),
    );
  }
}

/** Öffentliche Kopie des Schritt-Bilds neu erzeugen (Blur eingebrannt). */
async function refreshPublicImage(stepId: string) {
  const supabase = await createClient();
  // RLS-sichtbarer Read: liefert nur Schritte aus eigenen Tutorials.
  const { data: step } = await supabase
    .from("steps")
    .select("image_path, highlights, tutorials!inner(status)")
    .eq("id", stepId)
    .maybeSingle();
  if (!step) return;
  const status = (Array.isArray(step.tutorials) ? step.tutorials[0] : step.tutorials)?.status;
  if (status !== "published") return;

  const admin = createAdminClient();
  if (!step.image_path) return; // Bild entfernt -> unpublish räumt public auf
  const { data: blob } = await admin.storage.from("tutorial-images").download(step.image_path);
  if (!blob) return;
  let buf: Buffer = Buffer.from(await blob.arrayBuffer());
  if (hasBlur(step.highlights)) buf = await burnBlur(buf, step.highlights);
  await admin.storage
    .from("tutorial-images-public")
    .upload(step.image_path, buf, { upsert: true, contentType: "image/webp" });
}

/** Frage an/aus. Server spiegelt exakt die optimistische Client-Logik. */
export async function setDecision(stepId: string, isDecision: boolean) {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("step_branches")
    .select("id")
    .eq("step_id", stepId)
    .order("position");

  await supabase
    .from("steps")
    .update({ is_decision: isDecision })
    .eq("id", stepId);

  if (existing?.length) {
    if (isDecision) {
      await supabase
        .from("step_branches")
        .update({ label: "Ja", color: YES })
        .eq("id", existing[0].id);
    } else {
      await supabase
        .from("step_branches")
        .update({ label: null, color: null })
        .eq("id", existing[0].id);
      const rest = existing.slice(1).map((b) => b.id);
      if (rest.length) await supabase.from("step_branches").delete().in("id", rest);
    }
  }
}

/** Antwort-Option anlegen (Client liefert id/color/position). */
export async function addBranch(branch: {
  id: string;
  step_id: string;
  label: string | null;
  color: string | null;
  target_step_id: string | null;
  position: number;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("step_branches").insert(branch);
  if (error) throw new Error(error.message);
}

export async function updateBranch(
  branchId: string,
  patch: { label?: string; target_step_id?: string | null; color?: string | null },
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("step_branches")
    .update(patch)
    .eq("id", branchId);
  if (error) throw new Error(error.message);
}

export async function deleteBranch(branchId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("step_branches")
    .delete()
    .eq("id", branchId);
  if (error) throw new Error(error.message);
}

/**
 * Schritt löschen + Auto-Umverdrahtung (§7.4). Client liefert das eindeutige
 * Folgeziel (linear) bzw. null (Entscheidung) und ob es die Wurzel war.
 */
export async function deleteStep(
  tutorialId: string,
  stepId: string,
  nextTarget: string | null,
  wasRoot: boolean,
) {
  const supabase = await createClient();

  await supabase
    .from("step_branches")
    .update({ target_step_id: nextTarget })
    .eq("target_step_id", stepId);

  if (wasRoot) {
    await supabase
      .from("tutorials")
      .update({ root_step_id: nextTarget })
      .eq("id", tutorialId);
  }

  const { error } = await supabase.from("steps").delete().eq("id", stepId);
  if (error) throw new Error(error.message);
}

/** Kategorie anlegen (§7.3, „on the fly" aus der Combobox). */
export async function createCategory(name: string): Promise<{ id: string; name: string }> {
  const clean = name.trim();
  if (!clean) throw new Error("Name fehlt");
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("categories")
    .select("position")
    .eq("account_id", account.id);
  const maxPos = (existing ?? []).reduce((m, c) => Math.max(m, Number(c.position) || 0), -1);
  const { data, error } = await supabase
    .from("categories")
    .insert({ account_id: account.id, name: clean, position: maxPos + 1 })
    .select("id, name")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Kategorie anlegen fehlgeschlagen");
  return data;
}

/** Tutorial-Titel ändern. */
export async function setTutorialTitle(tutorialId: string, title: string) {
  const clean = title.trim();
  if (!clean) throw new Error("Titel fehlt");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tutorials")
    .update({ title: clean })
    .eq("id", tutorialId);
  if (error) throw new Error(error.message);
}

/** Tutorial einer Kategorie zuordnen (oder lösen mit null). */
export async function setTutorialCategory(
  tutorialId: string,
  categoryId: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tutorials")
    .update({ category_id: categoryId })
    .eq("id", tutorialId);
  if (error) throw new Error(error.message);
}
