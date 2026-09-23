"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { indexTutorial, reindexTutorialIfLive } from "@/lib/kb";
import { burnBlur, hasBlur } from "@/lib/redact";
import { invalidateHubTag } from "@/lib/cache-tags";
import { removeTutorialAudio } from "@/lib/tts";
import { removeUnusedPublicCopies } from "@/lib/public-images";
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
  // Nur echte globale Standard-Vorlagen — sonst ließe sich mit einer fremden Tutorial-ID
  // deren Inhalt ins eigene Chatbot-Wissen indexieren (Admin-Client unten).
  const { data: tpl } = await createAdminClient()
    .from("tutorials")
    .select("id")
    .eq("id", templateId)
    .eq("is_template", true)
    .is("account_id", null)
    .maybeSingle();
  if (!tpl) throw new Error("Vorlage nicht gefunden.");
  const { error } = await supabase
    .from("account_templates")
    .upsert(
      { account_id: account.id, template_id: templateId, enabled },
      { onConflict: "account_id,template_id" },
    );
  if (error) throw new Error(error.message);

  // Chatbot-Wissen mitziehen: aktivierte Vorlagen indexieren, sonst entfernen — bei einer
  // angepassten Vorlage (Fork) deren eigene Kopie. Sonst antwortete der Chatbot weiter aus
  // einer abgeschalteten Kopie und verlinkte eine Seite, die es öffentlich nicht mehr gibt.
  const { data: row } = await supabase
    .from("account_templates")
    .select("forked_tutorial_id")
    .eq("account_id", account.id)
    .eq("template_id", templateId)
    .maybeSingle();
  const forkId = row?.forked_tutorial_id ?? null;
  if (!enabled) await dropEmbeddings(account.id, forkId ?? templateId);
  // Fork nur, wenn die eigene Kopie live ist (veröffentlicht + öffentlich) — Entwürfe nie.
  else if (forkId) await reindexTutorialIfLive(forkId);
  else await indexTutorial(createAdminClient(), account.id, templateId).catch(() => {});
  // Hub + alle Seiten des Kontos (die Tutorial-Seiten tragen den Hub-Tag mit): die
  // Vorlage bzw. ihre angepasste Kopie ist sofort sichtbar/verschwunden.
  invalidateHubTag(account.slug);
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
    .is("account_id", null)
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

  // Gleicher Slug -> Hilfe-URL bleibt stabil. Hat das Konto aber schon eine EIGENE
  // Anleitung mit diesem Slug (Altbestand), bekäme die Kopie dieselbe Adresse wie sie —
  // dann wäre eine der beiden nie erreichbar. Deterministisch: die eigene behält die
  // Adresse (sie hatte sie schon), die Kopie bekommt den nächsten freien Zusatz (-2, -3 …).
  let forkSlug: string | null = tpl.slug ?? null;
  if (forkSlug) {
    const [{ data: ownSlugs }, { data: tplSlugs }] = await Promise.all([
      supabase.from("tutorials").select("slug").eq("account_id", account.id).not("slug", "is", null),
      // andere veröffentlichte Vorlagen: ein Zusatz-Slug darf keine von ihnen verdecken
      supabase
        .from("tutorials")
        .select("slug")
        .eq("is_template", true)
        .is("account_id", null)
        .eq("status", "published")
        .neq("id", templateId)
        .not("slug", "is", null),
    ]);
    const taken = new Set([...(ownSlugs ?? []), ...(tplSlugs ?? [])].map((t) => t.slug as string));
    const base = forkSlug;
    let n = 1;
    while (taken.has(forkSlug)) forkSlug = `${base}-${++n}`;
  }

  const forkId = crypto.randomUUID();
  const admin = createAdminClient();
  // Fehler NICHT verschlucken: sonst sprang der Editor auf eine Kopie, die es nicht gibt
  // („Anleitung nicht gefunden“), oder eine leere Kopie ersetzte die Vorlage auf der Hilfe-Seite.
  // Mit Server-Rechten: Vorlagen-Kopien zählen nicht zur Gratis-Grenze, die DB-Regel
  // (Migration 0043) prüft aber jedes Anlegen per Nutzer-Login — Konto/Rolle sind oben geprüft.
  const { error: forkErr } = await admin.from("tutorials").insert({
    id: forkId,
    account_id: account.id,
    is_template: false,
    title: tpl.title,
    description: tpl.description,
    status: "published", // bleibt nahtlos sichtbar (UI ändert sich nicht, §14)
    slug: forkSlug,
  });
  if (forkErr) throw new Error("Kopie der Vorlage konnte nicht angelegt werden: " + forkErr.message);
  const abandonFork = async (why: string): Promise<never> => {
    await admin.from("tutorials").delete().eq("id", forkId).eq("account_id", account.id);
    throw new Error("Kopie der Vorlage konnte nicht angelegt werden: " + why);
  };

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
        // Welle 48: Art der Bedienung (Rechtsklick/Enter/…) gehört zum Schritt — mitkopieren.
        ...(s.interaction ? { interaction: s.interaction } : {}),
      });
    }
    const { error: stepsErr } = await supabase.from("steps").insert(stepRows);
    if (stepsErr) await abandonFork(stepsErr.message);
  }
  if (branches?.length) {
    const { error: brErr } = await supabase.from("step_branches").insert(
      branches.map((b) => ({
        step_id: idMap.get(b.step_id)!,
        label: b.label,
        color: b.color,
        target_step_id: b.target_step_id ? (idMap.get(b.target_step_id) ?? null) : null,
        position: b.position,
      })),
    );
    if (brErr) await abandonFork(brErr.message);
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
    const forkId = row.forked_tutorial_id as string;
    // Erst prüfen, DANN aufräumen: Audio/Index werden mit Server-Rechten entfernt (Audit 23.09.:
    // eine gefälschte Verknüpfung auf eine fremde Anleitung löschte deren Vorlese-Dateien).
    const { data: ownFork } = await supabase
      .from("tutorials")
      .select("id")
      .eq("id", forkId)
      .eq("account_id", account.id)
      .maybeSingle();
    if (!ownFork) throw new Error("Die angepasste Kopie gehört nicht zu dieser Organisation.");
    await dropEmbeddings(account.id, forkId);
    // Bildpfade VOR dem Löschen merken: die öffentlichen Kopien der verworfenen Kopie müssen
    // weg (wie bei deleteTutorial) — sonst blieben ihre Screenshots per URL abrufbar.
    const { data: goneSteps } = await supabase
      .from("steps")
      .select("image_path")
      .eq("tutorial_id", forkId)
      .not("image_path", "is", null);
    // Vorlese-MP3s der Kopie liegen im öffentlichen Bucket — VOR dem Delete entfernen
    // (danach fehlen die Pfade).
    await removeTutorialAudio(forkId);
    const { error: delErr } = await supabase
      .from("tutorials")
      .delete()
      .eq("id", forkId)
      .eq("account_id", account.id);
    // Ohne Löschen NICHT die Verknüpfung lösen — sonst stünde die Kopie als eigene Anleitung da.
    if (delErr) throw new Error("Die eigene Kopie konnte nicht verworfen werden: " + delErr.message);
    await removeUnusedPublicCopies(
      (goneSteps ?? []).map((s) => s.image_path as string | null),
      { accountId: account.id, exceptTutorialId: forkId },
    ).catch((e) => console.error("Öffentliche Bilder nicht entfernt:", e instanceof Error ? e.message : e));
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
