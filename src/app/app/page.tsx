import { Suspense } from "react";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicImageUrl } from "@/lib/public-image";
import type { Tutorial } from "@/lib/types";
import { LibraryBrowser, type LibraryCategory } from "@/components/app/library-browser";
import type { LibraryTutorial } from "@/components/app/tutorial-card";
import { TemplateSection, type TemplateItem } from "@/components/app/template-section";
import { InsightsCard } from "@/components/app/insights-card";
import { Loader2 } from "lucide-react";

/**
 * Bibliothek (Design-Handoff 07/2026, Option 2a/2b): Kategorien-Sidebar +
 * Kartenraster mit Bereichs-/Status-Filter. Laufende Video-Jobs über dem
 * Raster; Nutzung/Insights und Standard-Vorlagen darunter.
 */
export default async function DashboardPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();

  const [{ data: tutorials }, { data: categories }, { data: atRows }, { data: tpls }, { data: globalCats }, { data: activeJobs }] =
    await Promise.all([
      supabase
        .from("tutorials")
        .select("*")
        .eq("account_id", account.id)
        .order("updated_at", { ascending: false })
        .returns<Tutorial[]>(),
      supabase
        .from("categories")
        .select("id, name, position")
        .eq("account_id", account.id)
        .order("position", { ascending: true }),
      supabase
        .from("account_templates")
        .select("template_id, enabled, forked_tutorial_id")
        .eq("account_id", account.id),
      supabase
        .from("tutorials")
        .select("id, title, slug, category_id")
        .eq("is_template", true)
        .eq("status", "published")
        .order("created_at", { ascending: true }),
      supabase
        .from("categories")
        .select("id, name, position")
        .is("account_id", null)
        .order("position", { ascending: true }),
      // Laufende Video-Jobs (queued/processing) des Kontos für die „Wird erstellt…"-Karte.
      supabase
        .from("video_jobs")
        .select("id, title, status, progress")
        .eq("account_id", account.id)
        .in("status", ["queued", "processing"])
        .order("created_at", { ascending: true }),
    ]);

  const allOwn = tutorials ?? [];
  const cats = categories ?? [];
  const ats = atRows ?? [];
  const templates = tpls ?? [];
  const globalCatName = new Map((globalCats ?? []).map((c) => [c.id, c.name]));
  const ownById = new Map(allOwn.map((t) => [t.id, t]));
  const atByTpl = new Map(ats.map((a) => [a.template_id, a]));
  const forkIds = new Set(ats.map((a) => a.forked_tutorial_id).filter(Boolean) as string[]);

  // Eigene Tutorials ohne Forks (Forks erscheinen als Vorlagen-Eintrag)
  const own = allOwn.filter((t) => !forkIds.has(t.id));

  // Schritt-Zahl + Thumbnail (erstes Schritt-Bild) pro Anleitung:
  // EINE Query für ALLE eigenen Anleitungen (kein N+1), nach position sortiert.
  const thumbById = new Map<string, string>();
  const stepCountById = new Map<string, number>();
  const ownIds = own.map((t) => t.id);
  if (ownIds.length) {
    const admin = createAdminClient();
    const { data: stepRows } = await admin
      .from("steps")
      .select("tutorial_id, image_path, position")
      .in("tutorial_id", ownIds)
      .order("position", { ascending: true });
    const firstPath = new Map<string, string>();
    for (const r of stepRows ?? []) {
      stepCountById.set(r.tutorial_id, (stepCountById.get(r.tutorial_id) ?? 0) + 1);
      if (r.image_path && !firstPath.has(r.tutorial_id)) {
        firstPath.set(r.tutorial_id, r.image_path);
      }
    }
    // Published → öffentliche URL; Entwurf → signierte URL (privater Bucket), parallel.
    const statusById = new Map(own.map((t) => [t.id, t.status]));
    const resolved = await Promise.all(
      [...firstPath.entries()].map(async ([tutorialId, path]) => {
        if (statusById.get(tutorialId) === "published") {
          return [tutorialId, publicImageUrl(path)] as const;
        }
        const { data } = await admin.storage
          .from("tutorial-images")
          .createSignedUrl(path, 3600);
        return [tutorialId, data?.signedUrl ?? null] as const;
      }),
    );
    for (const [id, url] of resolved) if (url) thumbById.set(id, url);
  }

  // Standard-Anleitungen (Vorlagen)
  const templateItems: TemplateItem[] = templates.map((t) => {
    const row = atByTpl.get(t.id);
    const categoryName = (t.category_id && globalCatName.get(t.category_id)) || "Sonstiges";
    if (row?.forked_tutorial_id) {
      const fork = ownById.get(row.forked_tutorial_id);
      return {
        templateId: t.id,
        title: fork?.title ?? t.title,
        kind: "fork",
        enabled: !!row.enabled,
        renderId: row.forked_tutorial_id,
        slug: fork?.slug ?? t.slug,
        categoryName,
      };
    }
    return {
      templateId: t.id,
      title: t.title,
      kind: "standard",
      enabled: !!row?.enabled,
      renderId: t.id,
      slug: t.slug,
      categoryName,
    };
  });

  const items: LibraryTutorial[] = own.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    visibility: t.visibility,
    inLernen: !!t.in_lernen,
    updatedAt: t.updated_at,
    categoryId: t.category_id ?? null,
    slug: t.slug ?? null,
    freshness: t.freshness ?? null,
    stepCount: stepCountById.get(t.id) ?? 0,
    thumbnailUrl: thumbById.get(t.id) ?? null,
  }));

  const browserCats: LibraryCategory[] = cats.map((c) => ({ id: c.id, name: c.name }));
  const jobs = activeJobs ?? [];

  return (
    <LibraryBrowser
      tutorials={items}
      categories={browserCats}
      accountId={account.id}
      accountSlug={account.slug}
      topSlot={
        jobs.length > 0 ? (
          <div className="mb-4 space-y-2">
            {jobs.map((j) => (
              <div
                key={j.id}
                className="flex items-center gap-3 rounded-card border-2 border-primary/25 bg-accent/60 px-4 py-3"
              >
                <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-ink">
                    {j.title?.trim() || "Anleitung"} wird erstellt …
                  </p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {j.status === "queued"
                      ? "In der Warteschlange …"
                      : j.progress
                      ? `${j.progress} …`
                      : "KI verarbeitet das Video …"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : undefined
      }
    >
      {/* Nutzung/Insights (streamt nach; rendert sich weg ohne Events) */}
      <Suspense fallback={null}>
        <InsightsCard accountId={account.id} />
      </Suspense>

      {templateItems.length > 0 && (
        <div className="mt-8">
          <TemplateSection items={templateItems} />
        </div>
      )}
    </LibraryBrowser>
  );
}
