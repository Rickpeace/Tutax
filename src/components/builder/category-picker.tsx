"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { Tag, Plus, Check, ChevronDown } from "lucide-react";
import {
  createCategory,
  setTutorialCategory,
} from "@/app/app/tutorials/[id]/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  const searchId = useId();

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
    // Popover (Base UI) wie der Website-Picker: Esc schließt, aria-expanded am Auslöser,
    // Fokus springt ins Suchfeld und beim Schließen zurück.
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger
        className="flex max-w-full items-center gap-1.5 rounded-full border-2 border-line bg-card px-3 py-1 text-[12.5px] font-extrabold text-ink-2 outline-none transition-colors hover:border-[#e3d7c2] hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Kategorie wählen"
      >
        <Tag className="size-3.5 text-muted-foreground" />
        {selected ? selected.name : <span className="text-muted-foreground">Kategorie</span>}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-0 overflow-hidden p-0">
        <label htmlFor={searchId} className="sr-only">
          Kategorie suchen oder neu anlegen
        </label>
        <input
          id={searchId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !exact && query.trim()) create();
          }}
          placeholder="Suchen oder neu anlegen …"
          autoComplete="off"
          className="w-full border-b border-line-2 px-3 py-2 text-sm outline-none"
        />
        <div className="max-h-52 overflow-auto py-1">
          {/* „Sonstiges“ = derselbe Begriff wie in der Anleitungs-Übersicht für Anleitungen ohne Kategorie. */}
          <button
            type="button"
            onClick={() => choose(null)}
            className="flex w-full items-center justify-between px-3 py-1.5 text-sm outline-none hover:bg-muted focus-visible:bg-muted"
          >
            <span className="text-muted-foreground">Sonstiges</span>
            {selectedId === null && <Check className="size-4 text-primary" />}
          </button>
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => choose(c.id)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-sm outline-none hover:bg-muted focus-visible:bg-muted"
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
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary outline-none hover:bg-accent focus-visible:bg-accent"
            >
              <Plus className="size-4" /> Anlegen: „{query.trim()}“
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
