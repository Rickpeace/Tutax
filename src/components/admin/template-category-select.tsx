"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setTemplateCategory } from "@/app/admin/actions";

export function TemplateCategorySelect({
  templateId,
  value,
  categories,
}: {
  templateId: string;
  value: string | null;
  categories: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <select
      disabled={pending}
      value={value ?? ""}
      aria-label="Kategorie"
      onChange={(e) => {
        const v = e.target.value || null;
        start(async () => {
          try {
            await setTemplateCategory(templateId, v);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Fehler");
          }
        });
      }}
      className="h-8 rounded-md border border-border bg-card px-2 text-sm text-ink disabled:opacity-50"
    >
      <option value="">— ohne Kategorie —</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
