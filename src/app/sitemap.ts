import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { appBaseUrl } from "@/lib/url";

// Sitemap: Account-Hubs mit sichtbaren Anleitungen (/h/{slug}) + veröffentlichte, eigene Tutorials
// (/h/{acc}/{slug}). Bewusst simpel: nur echte Tutorials mit account_id — geteilte
// Standard-Templates (account_id NULL) tauchen NICHT eigenständig auf.
//
// Datenschutz: NUR visibility='public'. Interne Anleitungen sind zwar inhaltlich
// gesperrt, ihr aus dem Titel gebildeter Slug (z. B. „gehaltsabrechnung-…“) verriete
// aber bereits Internes, sobald er Suchmaschinen aktiv gemeldet wird.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appBaseUrl();
  const admin = createAdminClient();

  const [{ data: accounts }, { data: tutorials }, { data: forks }, { data: liveTemplates }] =
    await Promise.all([
      admin.from("accounts").select("id, slug").not("slug", "is", null),
      admin
        .from("tutorials")
        .select("id, slug, account_id, updated_at")
        .eq("status", "published")
        .eq("visibility", "public")
        .not("slug", "is", null)
        .not("account_id", "is", null),
      admin.from("account_templates").select("account_id, template_id, enabled, forked_tutorial_id"),
      admin.from("tutorials").select("id").eq("is_template", true).is("account_id", null).eq("status", "published"),
    ]);

  const slugById = new Map((accounts ?? []).map((a) => [a.id, a.slug as string]));
  // Angepasste Vorlagen (Forks) nur, solange die Vorlage beim Kunden aktiviert und zentral
  // veröffentlicht ist — dieselbe Regel wie resolveCustomerTutorial (sonst meldeten wir
  // Suchmaschinen Adressen, die „Nicht gefunden“ zeigen).
  const livePublished = new Set((liveTemplates ?? []).map((t) => t.id as string));
  const hiddenForks = new Set(
    (forks ?? [])
      .filter((f) => f.forked_tutorial_id && (!f.enabled || !livePublished.has(f.template_id as string)))
      .map((f) => f.forked_tutorial_id as string),
  );

  // Nur Hilfe-Seiten mit mindestens einer sichtbaren Anleitung melden (Runde 4: leere Seiten —
  // Testkonten, Titel mit E-Mail-Adresse — standen sonst in der Sitemap).
  const withContent = new Set<string>();
  for (const t of tutorials ?? []) {
    if (t.account_id && !hiddenForks.has(t.id as string)) withContent.add(t.account_id as string);
  }
  for (const f of forks ?? []) {
    if (f.enabled && livePublished.has(f.template_id as string)) withContent.add(f.account_id as string);
  }

  const hubEntries: MetadataRoute.Sitemap = (accounts ?? [])
    .filter((a) => a.slug && withContent.has(a.id as string))
    .map((a) => ({
      url: `${base}/h/${a.slug}`,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

  const tutorialEntries: MetadataRoute.Sitemap = (tutorials ?? [])
    .filter((t) => !hiddenForks.has(t.id as string))
    .map((t) => {
      const accSlug = t.account_id ? slugById.get(t.account_id) : null;
      if (!accSlug || !t.slug) return null;
      return {
        url: `${base}/h/${accSlug}/${t.slug}`,
        lastModified: t.updated_at ? new Date(t.updated_at) : undefined,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return [...hubEntries, ...tutorialEntries];
}
