"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { indexTutorial } from "@/lib/kb";
import { burnBlur, hasBlur } from "@/lib/redact";
import { invalidateHubTag } from "@/lib/cache-tags";
import type { Step, StepBranch } from "@/lib/types";

const PRIVATE_BUCKET = "tutorial-images";
const PUBLIC_BUCKET = "tutorial-images-public";

/** Embeddings einer (account-spezifischen) Quelle entfernen. */
async function dropEmbeddings(accountId: string, sourceId: string) {
  await createAdminClient()
    .from("kb_embeddings")
    .delete()
    .eq("account_id", accountId)
    .eq("source_type", "tutorial")
    .eq("source_id", sourceId)
    .then(() => undefined, () => undefined);
}

/** Standard-Template auf der Hilfe-Seite zeigen/verbergen (Häkchen). */
export async function setTemplateEnabled(templateId: string, enabled: boolean) {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { error } = await supabase
    .from("account_templates")
    .upsert(
      { account_id: account.id, template_id: templateId, enabled },
      { onConflict: "account_id,template_id" },
    );
  if (error) throw new Error(error.message);

  // Chatbot-Wissen mitziehen: aktivierte Standard-Templates indexieren, sonst entfernen.
  const { data: row } = await supabase
    .from("account_templates")
    .select("forked_tutorial_id")
    .eq("account_id", account.id)
    .eq("template_id", templateId)
    .maybeSingle();
  if (!row?.forked_tutorial_id) {
    if (enabled) await indexTutorial(createAdminClient(), account.id, templateId).catch(() => {});
    else await dropEmbeddings(account.id, templateId);
  }
  invalidateHubTag(account.slug); // Hub zeigt Standard-Anleitungen sofort an/aus
  // Kein revalidatePath: das Dashboard aktualisiert den Schalter optimistisch (snappy).
}

/**
 * Fork beim Bearbeiten (§14): kopiert das Template in den Account (eigene Kopie),
 * verknüpft es und öffnet die Kopie im Editor. Ab jetzt „Angepasst".
 */
export async function forkTemplate(templateId: string) {
  const { account } = await requireAccount();
  const supabase = await createClient();

  const { data: tpl } = await supabase
    .from("tutorials")
    .select("*")
    .eq("id", templateId)
    .eq("is_template", true)
    .single();
  if (!tpl) throw new Error("Template nicht gefunden");

  const { data: steps } = await supabase
    .from("steps")
    .select("*")
    .eq("tutorial_id", templateId)
    .returns<Step[]>();
  const stepIds = (steps ?? []).map((s) => s.id);
  const { data: branches } = stepIds.length
    ? await supabase.from("step_branches").select("*").in("step_id", stepIds).returns<StepBranch[]>()
    : { data: [] as StepBranch[] };

  const forkId = crypto.randomUUID();
  await supabase.from("tutorials").insert({
    id: forkId,
    account_id: account.id,
    is_template: false,
    title: tpl.title,
    description: tpl.description,
    status: "published", // bleibt nahtlos sichtbar (UI ändert sich nicht, §14)
    slug: tpl.slug, // gleicher Slug -> Hilfe-URL bleibt stabil
  });

  const admin = createAdminClient();
  const idMap = new Map<string, string>();
  for (const s of steps ?? []) idMap.set(s.id, crypto.randomUUID());

  // Bilder in den EIGENEN Namensraum des Forks kopieren (privat UND public). Sonst teilt
  // der Fork die image_path des Templates — ein Unpublish des Forks würde dann die
  // öffentlichen Template-Bilder (und die anderer Forks) löschen (Cross-Org-Schaden).
  // Der Fork ist direkt "published", braucht die Bilder also auch im public Bucket.
  const cloneImage = async (oldPath: string, newStepId: string, highlights: unknown): Promise<string | null> => {
    const newPath = `${account.id}/${forkId}/${newStepId}.webp`;
    let blob = (await admin.storage.from(PRIVATE_BUCKET).download(oldPath)).data;
    if (!blob) blob = (await admin.storage.from(PUBLIC_BUCKET).download(oldPath)).data;
    if (!blob) return null;
    const original: Buffer = Buffer.from(await blob.arrayBuffer());
    // privat = Original (Autor kann Blur weiter bearbeiten); public = Blur eingebrannt.
    let pub: Buffer = original;
    if (hasBlur(highlights)) {
      try {
        pub = await burnBlur(original, highlights);
      } catch {
        return null; // lieber ohne Bild als unredigiert öffentlich
      }
    }
    await admin.storage.from(PRIVATE_BUCKET).upload(newPath, original, { upsert: true, contentType: "image/webp" });
    await admin.storage.from(PUBLIC_BUCKET).upload(newPath, pub, { upsert: true, contentType: "image/webp" });
    return newPath;
  };

  if (steps?.length) {
    const stepRows = [];
    for (const s of steps) {
      const newId = idMap.get(s.id)!;
      const image_path = s.image_path ? await cloneImage(s.image_path, newId, s.highlights) : null;
      stepRows.push({
        id: newId,
        tutorial_id: forkId,
        title: s.title,
        body: s.body,
        image_path,
        image_width: s.image_width,
        image_height: s.image_height,
        highlights: s.highlights,
        position: s.position,
        is_decision: s.is_decision,
      });
    }
    await supabase.from("steps").insert(stepRows);
  }
  if (branches?.length) {
    await supabase.from("step_branches").insert(
      branches.map((b) => ({
        step_id: idMap.get(b.step_id)!,
        label: b.label,
        color: b.color,
        target_step_id: b.target_step_id ? (idMap.get(b.target_step_id) ?? null) : null,
        position: b.position,
      })),
    );
  }
  if (tpl.root_step_id && idMap.get(tpl.root_step_id)) {
    await supabase.from("tutorials").update({ root_step_id: idMap.get(tpl.root_step_id) }).eq("id", forkId);
  }

  await supabase
    .from("account_templates")
    .upsert(
      { account_id: account.id, template_id: templateId, enabled: true, forked_tutorial_id: forkId },
      { onConflict: "account_id,template_id" },
    );

  // Chatbot-Wissen: Standard-Embeddings durch die der Kopie ersetzen.
  await dropEmbeddings(account.id, templateId);
  await indexTutorial(createAdminClient(), account.id, forkId).catch(() => {});

  invalidateHubTag(account.slug);
  revalidatePath("/app");
  redirect(`/app/tutorials/${forkId}`);
}

/** „Auf Standard zurücksetzen": eigene Kopie verwerfen, wieder zentrale Version. */
export async function resetTemplate(templateId: string) {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("account_templates")
    .select("forked_tutorial_id, enabled")
    .eq("account_id", account.id)
    .eq("template_id", templateId)
    .single();
  if (row?.forked_tutorial_id) {
    await dropEmbeddings(account.id, row.forked_tutorial_id);
    await supabase.from("tutorials").delete().eq("id", row.forked_tutorial_id);
  }
  await supabase
    .from("account_templates")
    .update({ forked_tutorial_id: null })
    .eq("account_id", account.id)
    .eq("template_id", templateId);

  // Wieder zentrale Version: als Standard neu indexieren (wenn aktiv).
  if (row?.enabled) await indexTutorial(createAdminClient(), account.id, templateId).catch(() => {});

  invalidateHubTag(account.slug);
  revalidatePath("/app");
}
