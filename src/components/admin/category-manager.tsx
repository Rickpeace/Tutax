"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { X, Plus, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createTemplateCategory,
  deleteTemplateCategory,
} from "@/app/admin/actions";

export function CategoryManager({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-bold text-ink">
        <FolderTree className="size-4 text-primary" /> Standard-Kategorien
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Erscheinen automatisch beim Kunden und im Kunden-Hub.
      </p>

      <div className="flex flex-wrap gap-2">
        {categories.length === 0 && (
          <span className="text-sm text-muted-foreground">Noch keine.</span>
        )}
        {categories.map((c) => (
          <span
            key={c.id}
            className="flex items-center gap-1.5 rounded-full bg-line-2 px-3 py-1 text-sm font-medium text-ink"
          >
            {c.name}
            <button
              type="button"
              disabled={pending}
              aria-label={`Kategorie ${c.name} löschen`}
              className="text-muted-foreground hover:text-no disabled:opacity-50"
              onClick={() => {
                if (confirm(`Kategorie „${c.name}" löschen? Zuordnungen werden gelöst.`))
                  start(async () => {
                    try {
                      await deleteTemplateCategory(c.id);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Fehler");
                    }
                  });
              }}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
      </div>

      <form action={createTemplateCategory} className="mt-3 flex gap-2">
        <Input name="name" placeholder="Neue Kategorie…" className="h-9 max-w-xs" required />
        <Button type="submit" size="sm" variant="outline">
          <Plus className="size-4" /> Anlegen
        </Button>
      </form>
    </div>
  );
}
