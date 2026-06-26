import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import type { Tutorial } from "@/lib/types";
import { NewTutorialButton } from "@/components/app/new-tutorial-button";
import { TutorialCard } from "@/components/app/tutorial-card";
import { Layers } from "lucide-react";

export default async function DashboardPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const [{ data: tutorials }, { data: categories }] = await Promise.all([
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
  ]);

  const tuts = tutorials ?? [];
  const cats = categories ?? [];
  const count = tuts.length;

  const byCat = new Map<string, Tutorial[]>();
  for (const t of tuts) {
    const k = t.category_id ?? "__none";
    const l = byCat.get(k) ?? [];
    l.push(t);
    byCat.set(k, l);
  }

  const sections: { id: string | null; name: string; items: Tutorial[] }[] = [
    ...cats.map((c) => ({ id: c.id, name: c.name, items: byCat.get(c.id) ?? [] })),
    ...(byCat.has("__none")
      ? [{ id: null, name: "Sonstiges", items: byCat.get("__none")! }]
      : []),
  ];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Tutorials</h1>
          <p className="text-sm text-muted-foreground">
            {count === 0
              ? "Noch keine Anleitungen"
              : `${count} Anleitung${count === 1 ? "" : "en"}`}
          </p>
        </div>
        <NewTutorialButton />
      </div>

      {count === 0 && cats.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
            <Layers className="size-6" />
          </div>
          <h2 className="mt-4 font-bold text-ink">Erstellen Sie Ihr erstes Tutorial</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Schritte mit Screenshots, Highlights und Verzweigungen – im Karten-Flow
            zusammengeklickt. Kategorien legen Sie im Editor an.
          </p>
          <div className="mt-5">
            <NewTutorialButton />
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {sections.map((s) => (
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
                <p className="py-2 text-sm text-muted-foreground">
                  Noch keine Tutorials in dieser Kategorie.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {s.items.map((t) => (
                    <TutorialCard key={t.id} tutorial={t} accountSlug={account.slug} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
