import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { appBaseUrl } from "@/lib/url";

// Sitemap: alle Account-Hubs (/h/{slug}) + veröffentlichte, eigene Tutorials
// (/h/{acc}/{slug}). Bewusst simpel: nur echte Tutorials mit account_id — geteilte
// Standard-Templates (account_id NULL) tauchen NICHT eigenständig auf.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appBaseUrl();
  const admin = createAdminClient();

  const [{ data: accounts }, { data: tutorials }] = await Promise.all([
    admin.from("accounts").select("id, slug").not("slug", "is", null),
    admin
      .from("tutorials")
      .select("slug, account_id, updated_at")
      .eq("status", "published")
      .not("slug", "is", null)
      .not("account_id", "is", null),
  ]);

  const slugById = new Map((accounts ?? []).map((a) => [a.id, a.slug as string]));

  const hubEntries: MetadataRoute.Sitemap = (accounts ?? [])
    .filter((a) => a.slug)
    .map((a) => ({
      url: `${base}/h/${a.slug}`,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

  const tutorialEntries: MetadataRoute.Sitemap = (tutorials ?? [])
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
