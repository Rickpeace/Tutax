"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CategoryPicker } from "@/components/builder/category-picker";
import { DriftCheckButton } from "@/components/builder/drift-check-button";
import { setTutorialTitle } from "@/app/app/tutorials/[id]/actions";
import { publishTutorial, unpublishTutorial } from "@/app/app/actions";

export function TutorialHeader({
  tutorialId,
  initialTitle,
  published: initialPublished,
  categories,
  categoryId,
}: {
  tutorialId: string;
  initialTitle: string;
  published: boolean;
  categories: { id: string; name: string }[];
  categoryId: string | null;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [saved, setSaved] = useState(initialTitle);
  const [published, setPublished] = useState(initialPublished);
  const [busy, setBusy] = useState(false);

  async function saveTitle() {
    const t = title.trim();
    if (!t) {
      setTitle(saved);
      return;
    }
    if (t === saved) return;
    try {
      await setTutorialTitle(tutorialId, t);
      setSaved(t);
      setTitle(t);
      toast.success("Titel gespeichert");
    } catch {
      setTitle(saved);
      toast.error("Titel konnte nicht gespeichert werden");
    }
  }

  async function togglePublish() {
    if (busy) return;
    const next = !published;
    setBusy(true);
    try {
      // Echte Publish-Logik: Slug + Bilder in den öffentlichen Bucket (bzw. entfernen).
      if (next) await publishTutorial(tutorialId);
      else await unpublishTutorial(tutorialId);
      setPublished(next);
      toast.success(next ? "Tutorial ist jetzt live" : "Auf Entwurf gesetzt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status konnte nicht geändert werden");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-start gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          className="mt-0.5 shrink-0 text-muted-foreground"
          nativeButton={false}
          render={<Link href="/app" aria-label="Zurück zur Übersicht" title="Zurück" />}
        >
          <ChevronLeft className="size-4" />
        </Button>

        <div className="min-w-0">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setTitle(saved);
                e.currentTarget.blur();
              }
            }}
            placeholder="Titel der Anleitung"
            aria-label="Tutorial-Titel"
            className="-mx-1.5 w-full truncate rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xl font-extrabold tracking-tight text-ink outline-none transition-colors hover:border-border focus:border-ring focus:bg-card"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1.5">
            <button
              type="button"
              onClick={togglePublish}
              disabled={busy}
              className="flex items-center gap-2 rounded-md py-0.5 text-sm disabled:opacity-70"
              aria-pressed={published}
              title={published ? "Ist veröffentlicht – antippen für Entwurf" : "Ist Entwurf – antippen zum Veröffentlichen"}
            >
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${published ? "bg-yes" : "bg-line"}`}>
                <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all ${published ? "left-[18px]" : "left-0.5"}`} />
              </span>
              <span className={published ? "font-medium text-ink" : "text-muted-foreground"}>
                {published ? "Veröffentlicht" : "Entwurf"}
              </span>
              {busy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            </button>
            <span className="text-line">·</span>
            <CategoryPicker tutorialId={tutorialId} categories={categories} currentCategoryId={categoryId} />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <DriftCheckButton tutorialId={tutorialId} />
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`/app/preview/${tutorialId}`} target="_blank" rel="noopener noreferrer" />}
        >
          <Eye className="size-4" /> Vorschau
        </Button>
      </div>
    </div>
  );
}
