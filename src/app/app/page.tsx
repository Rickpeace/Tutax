import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import type { Tutorial } from "@/lib/types";
import { NewTutorialButton } from "@/components/app/new-tutorial-button";
import { TutorialCard } from "@/components/app/tutorial-card";
import { TemplateSection, type TemplateItem } from "@/components/app/template-section";
import { Layers } from "lucide-react";

export default async function DashboardPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();

  const [{ data: tutorials }, { data: categories }, { data: atRows }, { data: tpls }] =
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
        .select("id, title, slug")
        .eq("is_template", true)
        .eq("status", "published")
        .order("created_at", { ascending: true }),
    ]);

  const allOwn = tutorials ?? [];
  const cats = categories ?? [];
  const ats = atRows ?? [];
  const templates = tpls ?? [];
  const ownById = new Map(allOwn.map((t) => [t.id, t]));
  const atByTpl = new Map(ats.map((a) => [a.template_id, a]));
  const forkIds = new Set(ats.map((a) => a.forked_tutorial_id).filter(Boolean) as string[]);

  // Eigene Tutorials ohne Forks (Forks erscheinen als Template-Eintrag)
  const own = allOwn.filter((t) => !forkIds.has(t.id));

  // Standard-Anleitungen (Templates)
  const templateItems: TemplateItem[] = templates.map((t) => {
    const row = atByTpl.get(t.id);
    if (row?.forked_tutorial_id) {
      const fork = ownById.get(row.forked_tutorial_id);
      return {
        templateId: t.id,
        title: fork?.title ?? t.title,
        kind: "fork",
        enabled: !!row.enabled,
        renderId: row.forked_tutorial_id,
        slug: fork?.slug ?? t.slug,
      };
    }
    return {
      templateId: t.id,
      title: t.title,
      kind: "standard",
      enabled: !!row?.enabled,
      renderId: t.id,
      slug: t.slug,
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
        <NewTutorialButton />
      </div>

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
            <section key={s.id ?? "none"}>
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-line-2 pb-1.5">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  {s.name}
                  <span className="rounded-full bg-line-2 px-1.5 text-[11px] font-bold text-muted-foreground">
                    {s.items.length}
                  </span>
                </h2>
                {s.id !== null && <NewTutorialButton compact categoryId={s.id} />}
              </div>
              {s.items.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">Noch keine Tutorials in dieser Kategorie.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {s.items.map((t) => (
                    <TutorialCard key={t.id} tutorial={t} accountSlug={account.slug} />
                  ))}
                </div>
              )}
            </section>
          ))}

          <TemplateSection items={templateItems} />
        </div>
      )}
    </main>
  );
}
