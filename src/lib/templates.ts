import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CatalogEntry = {
  key: string;
  renderTutorialId: string; // welche Tutorial-Inhalte gerendert werden (Template, Fork oder eigenes)
  templateId: string | null;
  title: string;
  description: string | null;
  slug: string | null;
  status: string;
  freshness: string;
  categoryId: string | null;
  kind: "own" | "standard" | "fork";
  enabled: boolean;
  visible: boolean; // erscheint auf der Hub-Seite?
};

/**
 * Einheitlicher Katalog eines Accounts (§14.6):
 * - eigene Tutorials (ohne Forks)
 * - pro globalem Template: „Standard" (zentrale Version, Auto-Update) ODER
 *   „Angepasst" (eigene Kopie), je nach forked_tutorial_id.
 */
export async function getCatalog(
  client: SupabaseClient,
  accountId: string,
): Promise<CatalogEntry[]> {
  const [{ data: own }, { data: ats }, { data: tpls }] = await Promise.all([
    client
      .from("tutorials")
      .select("id, title, description, slug, status, freshness, category_id, visibility, updated_at")
      .eq("account_id", accountId),
    client
      .from("account_templates")
      .select("template_id, enabled, forked_tutorial_id, category_id")
      .eq("account_id", accountId),
    client
      .from("tutorials")
      .select("id, title, description, slug, status, freshness, category_id, created_at")
      .eq("is_template", true)
      .eq("status", "published"),
  ]);

  const ownList = own ?? [];
  const atsList = ats ?? [];
  const tplList = (tpls ?? []) as { id: string; title: string; description: string | null; slug: string | null; freshness: string; category_id: string | null }[];
  const ownById = new Map(ownList.map((o) => [o.id, o]));
  const atsByTpl = new Map(atsList.map((a) => [a.template_id, a]));
  const forkIds = new Set(atsList.map((a) => a.forked_tutorial_id).filter(Boolean) as string[]);

  const entries: CatalogEntry[] = [];

  for (const o of ownList) {
    if (forkIds.has(o.id)) continue; // Forks erscheinen als Template-Eintrag
    entries.push({
      key: `own-${o.id}`,
      renderTutorialId: o.id,
      templateId: null,
      title: o.title,
      description: o.description,
      slug: o.slug,
      status: o.status,
      freshness: o.freshness,
      categoryId: o.category_id,
      kind: "own",
      enabled: true,
      visible: o.status === "published" && o.visibility === "public",
    });
  }

  for (const t of tplList) {
    const row = atsByTpl.get(t.id);
    if (row?.forked_tutorial_id) {
      const fork = ownById.get(row.forked_tutorial_id);
      if (!fork) continue;
      entries.push({
        key: `fork-${t.id}`,
        renderTutorialId: fork.id,
        templateId: t.id,
        title: fork.title,
        description: fork.description,
        slug: fork.slug,
        status: fork.status,
        freshness: fork.freshness,
        categoryId: t.category_id ?? row.category_id ?? fork.category_id,
        kind: "fork",
        enabled: !!row.enabled,
        visible: !!row.enabled && fork.status === "published",
      });
    } else {
      entries.push({
        key: `tpl-${t.id}`,
        renderTutorialId: t.id,
        templateId: t.id,
        title: t.title,
        description: t.description,
        slug: t.slug,
        status: "published",
        freshness: t.freshness,
        categoryId: t.category_id ?? row?.category_id ?? null,
        kind: "standard",
        enabled: !!row?.enabled,
        visible: !!row?.enabled,
      });
    }
  }

  return entries;
}

/** Welche Tutorial-ID gehört zum öffentlichen Slug eines Accounts? (Hub-Viewer) */
export async function resolveCustomerTutorial(
  client: SupabaseClient,
  accountId: string,
  slug: string,
): Promise<string | null> {
  const { data: own } = await client
    .from("tutorials")
    .select("id")
    .eq("account_id", accountId)
    .eq("slug", slug)
    .eq("status", "published")
    .eq("visibility", "public")
    .maybeSingle();
  if (own) return own.id;

  const { data: tpl } = await client
    .from("tutorials")
    .select("id")
    .eq("is_template", true)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();
  if (!tpl) return null;

  const { data: at } = await client
    .from("account_templates")
    .select("enabled, forked_tutorial_id")
    .eq("account_id", accountId)
    .eq("template_id", tpl.id)
    .maybeSingle();
  if (!at?.enabled) return null;

  // Fork: NUR ausliefern, wenn die eigene Kopie selbst veröffentlicht ist. Sonst wäre ein
  // Entwurf-Fork über den (veröffentlichten) Template-Slug öffentlich abrufbar.
  if (at.forked_tutorial_id) {
    const { data: fork } = await client
      .from("tutorials")
      .select("id, status, visibility")
      .eq("id", at.forked_tutorial_id)
      .eq("account_id", accountId)
      .maybeSingle();
    return fork && fork.status === "published" && fork.visibility === "public" ? fork.id : null;
  }
  return tpl.id;
}
