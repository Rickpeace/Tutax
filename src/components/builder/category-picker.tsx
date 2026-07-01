"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Tag, Plus, Check, ChevronDown } from "lucide-react";
import {
  createCategory,
  setTutorialCategory,
} from "@/app/app/tutorials/[id]/actions";

type Cat = { id: string; name: string };

export function CategoryPicker({
  tutorialId,
  categories,
  currentCategoryId,
}: {
  tutorialId: string;
  categories: Cat[];
  currentCategoryId: string | null;
}) {
  const [cats, setCats] = useState<Cat[]>(categories);
  const [selectedId, setSelectedId] = useState<string | null>(currentCategoryId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = cats.find((c) => c.id === selectedId) ?? null;
  const term = query.trim().toLowerCase();
  const filtered = term ? cats.filter((c) => c.name.toLowerCase().includes(term)) : cats;
  const exact = cats.some((c) => c.name.toLowerCase() === term);

  async function choose(id: string | null) {
    const prev = selectedId;
    setSelectedId(id);
    setOpen(false);
    setQuery("");
    try {
      await setTutorialCategory(tutorialId, id);
    } catch {
      setSelectedId(prev); // optimistische Auswahl zurückrollen
      toast.error("Speichern fehlgeschlagen");
    }
  }

  async function create() {
    if (!query.trim() || busy) return;
    setBusy(true);
    try {
      const c = await createCategory(query.trim());
      setCats((p) => [...p, c]);
      setSelectedId(c.id);
      setOpen(false);
      setQuery("");
      await setTutorialCategory(tutorialId, c.id);
      toast.success("Kategorie angelegt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-ink-2 transition-colors hover:bg-muted"
      >
        <Tag className="size-3.5 text-muted-foreground" />
        {selected ? selected.name : <span className="text-muted-foreground">Kategorie</span>}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-1 w-60 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !exact && query.trim()) create();
              }}
              placeholder="Suchen oder neu anlegen …"
              className="w-full border-b border-line-2 px-3 py-2 text-sm outline-none"
            />
            <div className="max-h-52 overflow-auto py-1">
              <button
                type="button"
                onClick={() => choose(null)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-muted"
              >
                <span className="text-muted-foreground">Keine Kategorie</span>
                {selectedId === null && <Check className="size-4 text-primary" />}
              </button>
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => choose(c.id)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-muted"
                >
                  <span className="truncate">{c.name}</span>
                  {selectedId === c.id && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              ))}
              {query.trim() && !exact && (
                <button
                  type="button"
                  onClick={create}
                  disabled={busy}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                >
                  <Plus className="size-4" /> Anlegen: „{query.trim()}"
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
