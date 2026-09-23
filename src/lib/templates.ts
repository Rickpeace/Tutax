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
      .eq("account_id", accountId)
      // Deterministische Reihenfolge (sonst gibt Postgres eine undefinierte Zeilenfolge
      // zurück): Anlage-Reihenfolge innerhalb jeder Kategorie — so bleibt die Hub-/Library-
      // Sortierung stabil und steuerbar (z. B. Steply-Doku: Sofort-Anleitung an Position 2).
      .order("created_at", { ascending: true }),
    client
      .from("account_templates")
      .select("template_id, enabled, forked_tutorial_id, category_id")
      .eq("account_id", accountId),
    client
      .from("tutorials")
      .select("id, title, description, slug, status, freshness, category_id, created_at")
      .eq("is_template", true)
      .is("account_id", null)
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
        visible: !!row.enabled && fork.status === "published" && fork.visibility === "public",
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

  // Gleicher Slug mehrfach sichtbar (Altbestand: eigene Anleitung heißt wie eine später
  // veröffentlichte Vorlage) -> nur EIN Eintrag, in derselben Rangfolge wie
  // resolveCustomerTutorial: eigene vor angepasster Vorlage vor Standard-Vorlage. Sonst
  // zeigte der Hub zwei Karten mit derselben Adresse, von denen eine nie erreichbar ist.
  const rank = { own: 0, fork: 1, standard: 2 } as const;
  const winner = new Map<string, CatalogEntry>();
  for (const e of entries) {
    if (!e.visible || !e.slug) continue;
    const cur = winner.get(e.slug);
    if (!cur || rank[e.kind] < rank[cur.kind]) winner.set(e.slug, e);
  }
  return entries.map((e) =>
    e.visible && e.slug && winner.get(e.slug) !== e ? { ...e, visible: false } : e,
  );
}

/**
 * Welche Tutorial-ID gehört zum öffentlichen Slug eines Accounts? (Hub-Viewer, Druck)
 *
 * Reihenfolge (gleich wie im Hub-Katalog):
 *  1. eigene, veröffentlichte + öffentliche Anleitung, die KEINE angepasste Vorlage ist
 *  2. angepasste Vorlage (Fork) — nur solange die Vorlage beim Kunden aktiviert UND
 *     zentral noch veröffentlicht ist. Sonst bliebe eine abgeschaltete Kopie über ihre
 *     URL, die Druckansicht und den Chatbot erreichbar, obwohl der Hub sie verbirgt.
 *  3. Standard-Vorlage mit diesem Slug (wenn aktiviert)
 */
export async function resolveCustomerTutorial(
  client: SupabaseClient,
  accountId: string,
  slug: string,
): Promise<string | null> {
  const [{ data: own }, { data: ats }] = await Promise.all([
    client
      .from("tutorials")
      .select("id")
      .eq("account_id", accountId)
      .eq("slug", slug)
      .eq("status", "published")
      .eq("visibility", "public")
      .order("created_at", { ascending: true }),
    client
      .from("account_templates")
      .select("template_id, enabled, forked_tutorial_id")
      .eq("account_id", accountId),
  ]);
  const atsList = (ats ?? []) as { template_id: string; enabled: boolean | null; forked_tutorial_id: string | null }[];
  const forkRow = new Map(
    atsList.filter((a) => a.forked_tutorial_id).map((a) => [a.forked_tutorial_id as string, a]),
  );

  const ownRows = own ?? [];
  const plain = ownRows.find((o) => !forkRow.has(o.id));
  if (plain) return plain.id;
  for (const o of ownRows) {
    const at = forkRow.get(o.id);
    if (at?.enabled && (await templatePublished(client, at.template_id))) return o.id;
  }

  const { data: tpl } = await client
    .from("tutorials")
    .select("id")
    .eq("is_template", true)
    .is("account_id", null)
    .eq("status", "published")
    .eq("slug", slug)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!tpl) return null;

  const at = atsList.find((a) => a.template_id === tpl.id);
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

/**
 * Standard-Vorlagen (zentrale Version, keine angepasste Kopie), die das Konto aktiviert hat und
 * die zentral veröffentlicht sind — genau die, die auf seiner Hilfe-Seite stehen. Sie werden
 * pro Konto in den Chatbot-Index aufgenommen (reindexAccount nach einem Upgrade).
 */
export async function enabledStandardTemplateIds(
  client: SupabaseClient,
  accountId: string,
): Promise<string[]> {
  const { data: ats } = await client
    .from("account_templates")
    .select("template_id")
    .eq("account_id", accountId)
    .eq("enabled", true)
    .is("forked_tutorial_id", null);
  const ids = (ats ?? []).map((a) => a.template_id as string);
  if (!ids.length) return [];
  const { data: live } = await client
    .from("tutorials")
    .select("id")
    .in("id", ids)
    .eq("is_template", true)
    .is("account_id", null)
    .eq("status", "published");
  return (live ?? []).map((t) => t.id as string);
}

/** Ist die globale Vorlage (noch) veröffentlicht? */
async function templatePublished(client: SupabaseClient, templateId: string): Promise<boolean> {
  const { data } = await client
    .from("tutorials")
    .select("id")
    .eq("id", templateId)
    .eq("is_template", true)
    .is("account_id", null)
    .eq("status", "published")
    .maybeSingle();
  return !!data;
}

/**
 * Darf eine angepasste Vorlage (Fork) öffentlich erscheinen (Hub-URL, Druck, Chatbot,
 * Sitemap)? Nur, wenn der Kunde die Vorlage aktiviert hat und sie zentral noch
 * veröffentlicht ist. Für Nicht-Forks immer true. Eine Quelle für Viewer, Index, Sitemap.
 */
export async function forkIsServable(
  client: SupabaseClient,
  accountId: string,
  tutorialId: string,
): Promise<boolean> {
  const { data: at } = await client
    .from("account_templates")
    .select("template_id, enabled")
    .eq("account_id", accountId)
    .eq("forked_tutorial_id", tutorialId)
    .maybeSingle();
  if (!at) return true; // kein Fork
  return !!at.enabled && (await templatePublished(client, at.template_id));
}
