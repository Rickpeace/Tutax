import { AlertTriangle, FileText } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { NewTemplateButton } from "@/components/admin/new-template-button";
import { TemplateActions } from "@/components/admin/template-actions";
import { CategoryManager } from "@/components/admin/category-manager";
import { TemplateCategorySelect } from "@/components/admin/template-category-select";

export default async function AdminTemplatesPage() {
  const admin = createAdminClient();
  const [{ data: templates }, { data: categories }] = await Promise.all([
    admin
      .from("tutorials")
      .select("id, title, status, slug, freshness, category_id")
      .eq("is_template", true)
      .order("created_at", { ascending: true }),
    admin
      .from("categories")
      .select("id, name, position")
      .is("account_id", null)
      .order("position", { ascending: true }),
  ]);

  const list = templates ?? [];
  const cats = categories ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Standard-Templates</h1>
          <p className="text-sm text-muted-foreground">
            Zentral gepflegte Anleitungen. Kunden aktivieren & forken sie (§14).
          </p>
        </div>
        <NewTemplateButton />
      </div>

      <div className="mt-6">
        <CategoryManager categories={cats} />
      </div>

      {list.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
            <FileText className="size-6" />
          </div>
          <h2 className="mt-4 font-bold text-ink">Noch keine Templates</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Lege ein Standard-Template an oder seede die DATEV-Anleitungen per Skript.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {list.map((t) => {
            const published = t.status === "published";
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4"
              >
                <span
                  className={
                    published
                      ? "rounded-md bg-yes-soft px-2 py-0.5 text-xs font-bold text-yes"
                      : "rounded-md bg-line-2 px-2 py-0.5 text-xs font-bold text-muted-foreground"
                  }
                >
                  {published ? "Veröffentlicht" : "Entwurf"}
                </span>
                <span className="font-bold text-ink">{t.title}</span>
                {t.freshness === "stale" && (
                  <span className="flex items-center gap-1 rounded-md bg-no-soft px-2 py-0.5 text-xs font-bold text-no">
                    <AlertTriangle className="size-3" /> Prüfen
                  </span>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <TemplateCategorySelect
                    templateId={t.id}
                    value={t.category_id}
                    categories={cats}
                  />
                  <TemplateActions id={t.id} published={published} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
