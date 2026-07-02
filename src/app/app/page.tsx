import { Suspense } from "react";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicImageUrl } from "@/lib/public-image";
import type { Tutorial } from "@/lib/types";
import { NewTutorialButton } from "@/components/app/new-tutorial-button";
import { VideoUpload } from "@/components/app/video-upload";
import { TutorialCard } from "@/components/app/tutorial-card";
import { TemplateSection, type TemplateItem } from "@/components/app/template-section";
import { CollapsibleSection } from "@/components/app/collapsible-section";
import { InsightsCard } from "@/components/app/insights-card";
import { Layers, Loader2 } from "lucide-react";

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

  // Eigene Tutorials ohne Forks (Forks erscheinen als Template-Eintrag)
  const own = allOwn.filter((t) => !forkIds.has(t.id));

  // Thumbnails: erstes Schritt-Bild (kleinste position mit image_path) pro Tutorial.
  // EINE Query für ALLE eigenen Tutorials (kein N+1), nach position sortiert →
  // erster Treffer pro Tutorial gewinnt.
  const thumbById = new Map<string, string>();
  const ownIds = own.map((t) => t.id);
  if (ownIds.length) {
    const admin = createAdminClient();
    const { data: stepRows } = await admin
      .from("steps")
      .select("tutorial_id, image_path, position")
      .in("tutorial_id", ownIds)
      .not("image_path", "is", null)
      .order("position", { ascending: true });
    // Erster (kleinste position) Treffer pro Tutorial.
    const firstPath = new Map<string, string>();
    for (const r of stepRows ?? []) {
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

  // Standard-Anleitungen (Templates)
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

  // Eigene nach Kategorie gruppieren
  const byCat = new Map<string, Tutorial[]>();
  for (const t of own) {
    const k = t.category_id ?? "__none";
    const l = byCat.get(k) ?? [];
    l.push(t);
    byCat.set(k, l);
  }
  const ownSections = [
    ...cats.map((c) => ({ id: c.id, name: c.name, items: byCat.get(c.id) ?? [] })),
    ...(byCat.has("__none") ? [{ id: null, name: "Sonstiges", items: byCat.get("__none")! }] : []),
  ].filter((s) => s.items.length > 0 || s.id !== null);

  const jobs = activeJobs ?? [];
  const nothing = own.length === 0 && templateItems.length === 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Tutorials</h1>
          <p className="text-sm text-muted-foreground">
            {own.length === 0 ? "Eigene Anleitungen" : `${own.length} eigene Anleitung${own.length === 1 ? "" : "en"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <VideoUpload accountId={account.id} />
          <NewTutorialButton />
        </div>
      </div>

      {jobs.length > 0 && (
        <div className="mt-6 space-y-2">
          {jobs.map((j) => (
            <div
              key={j.id}
              className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-accent/50 px-4 py-3"
            >
              <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {j.title?.trim() || "Anleitung"} wird erstellt …
                </p>
                <p className="text-xs text-muted-foreground">
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
      )}

      {/* Insights über den Tutorial-Sektionen; streamt nach (blockiert das Dashboard
          nicht) und rendert sich selbst weg, wenn es keine Events gibt. */}
      <Suspense fallback={null}>
        <InsightsCard accountId={account.id} />
      </Suspense>

      {nothing ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
            <Layers className="size-6" />
          </div>
          <h2 className="mt-4 font-bold text-ink">Erstellen Sie Ihr erstes Tutorial</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Eigene Anleitung bauen – oder unten eine Standard-Anleitung aktivieren.
          </p>
          <div className="mt-5">
            <NewTutorialButton />
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {ownSections.map((s) => (
            <CollapsibleSection
              key={s.id ?? "none"}
              title={s.name}
              count={s.items.length}
              storageKey={`dash:own:${s.id ?? "none"}`}
              action={s.id !== null ? <NewTutorialButton compact categoryId={s.id} /> : undefined}
            >
              {s.items.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">Noch keine Tutorials in dieser Kategorie.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {s.items.map((t) => (
                    <TutorialCard
                      key={t.id}
                      tutorial={t}
                      accountSlug={account.slug}
                      thumbnailUrl={thumbById.get(t.id) ?? null}
                    />
                  ))}
                </div>
              )}
            </CollapsibleSection>
          ))}

          <TemplateSection items={templateItems} />
        </div>
      )}
    </main>
  );
}
