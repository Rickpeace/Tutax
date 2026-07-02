"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Eye, Globe, Loader2, Lock, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CategoryPicker } from "@/components/builder/category-picker";
import { DriftCheckButton } from "@/components/builder/drift-check-button";
import { setTutorialTitle } from "@/app/app/tutorials/[id]/actions";
import { publishTutorial, setTutorialVisibility, unpublishTutorial } from "@/app/app/actions";
import type { TutorialVisibility } from "@/lib/types";

export function TutorialHeader({
  tutorialId,
  initialTitle,
  published: initialPublished,
  visibility: initialVisibility,
  categories,
  categoryId,
}: {
  tutorialId: string;
  initialTitle: string;
  published: boolean;
  visibility: TutorialVisibility;
  categories: { id: string; name: string }[];
  categoryId: string | null;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [saved, setSaved] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [published, setPublished] = useState(initialPublished);
  const [visibility, setVisibility] = useState<TutorialVisibility>(initialVisibility);
  const [busy, setBusy] = useState(false);
  const [visBusy, setVisBusy] = useState(false);

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
      const liveMsg = visibility === "internal" ? "Für das Team freigegeben" : "Tutorial ist jetzt live";
      toast.success(next ? liveMsg : "Auf Entwurf gesetzt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status konnte nicht geändert werden");
    } finally {
      setBusy(false);
    }
  }

  async function chooseVisibility(next: TutorialVisibility) {
    if (visBusy || next === visibility) return;
    const prev = visibility;
    setVisibility(next); // optimistisch
    setVisBusy(true);
    try {
      await setTutorialVisibility(tutorialId, next);
      toast.success(next === "internal" ? "Sichtbarkeit: Intern (nur Team)" : "Sichtbarkeit: Öffentlich");
    } catch (e) {
      setVisibility(prev);
      toast.error(e instanceof Error ? e.message : "Sichtbarkeit konnte nicht geändert werden");
    } finally {
      setVisBusy(false);
    }
  }

  return (
    <div className="mb-6">
      <Link
        href="/app"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
      >
        <ChevronLeft className="size-4" /> Zurück
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {editing ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => {
                saveTitle();
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setTitle(saved);
                  setEditing(false);
                }
              }}
              placeholder="Titel der Anleitung"
              aria-label="Tutorial-Titel"
              className="w-full rounded-md border border-ring bg-card px-2 py-0.5 text-xl font-extrabold tracking-tight text-ink outline-none"
            />
          ) : (
            <div className="flex items-start gap-1.5">
              <h1 className="min-w-0 text-xl font-extrabold tracking-tight text-ink break-words">
                {saved || "Ohne Titel"}
              </h1>
              <Button
                variant="ghost"
                size="icon-sm"
                className="mt-0.5 shrink-0 text-muted-foreground"
                onClick={() => {
                  setTitle(saved);
                  setEditing(true);
                }}
                title="Titel bearbeiten"
                aria-label="Titel bearbeiten"
              >
                <Pencil className="size-3.5" />
              </Button>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={togglePublish}
              disabled={busy}
              className="flex items-center gap-2 rounded-md py-0.5 text-sm disabled:opacity-70"
              aria-pressed={published}
              title={
                published
                  ? "Ist veröffentlicht – antippen für Entwurf"
                  : visibility === "internal"
                    ? "Ist Entwurf – antippen zum Freigeben fürs Team"
                    : "Ist Entwurf – antippen zum Veröffentlichen"
              }
            >
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${published ? "bg-yes" : "bg-line"}`}>
                <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all ${published ? "left-[18px]" : "left-0.5"}`} />
              </span>
              <span className={published ? "font-medium text-ink" : "text-muted-foreground"}>
                {published ? (visibility === "internal" ? "Freigegeben" : "Veröffentlicht") : "Entwurf"}
              </span>
              {busy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            </button>
            <span className="text-line">·</span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <div
                    role="group"
                    aria-label="Sichtbarkeit"
                    className="inline-flex items-center rounded-md border border-line bg-card p-0.5 text-sm"
                  />
                }
              >
                <button
                  type="button"
                  onClick={() => chooseVisibility("public")}
                  disabled={visBusy}
                  aria-pressed={visibility === "public"}
                  className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 transition-colors disabled:opacity-70 ${
                    visibility === "public" ? "bg-accent font-medium text-ink" : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  <Globe className="size-3.5" /> Öffentlich
                </button>
                <button
                  type="button"
                  onClick={() => chooseVisibility("internal")}
                  disabled={visBusy}
                  aria-pressed={visibility === "internal"}
                  className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 transition-colors disabled:opacity-70 ${
                    visibility === "internal" ? "bg-accent font-medium text-ink" : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  <Lock className="size-3.5" /> Intern (nur Team)
                </button>
                {visBusy && <Loader2 className="ml-1 size-3.5 animate-spin text-muted-foreground" />}
              </TooltipTrigger>
              <TooltipContent>
                Öffentlich: auf der Hilfe-Seite und im Chatbot sichtbar. Intern: nur für
                eingeloggte Team-Mitglieder unter „Lernen&ldquo; — nie öffentlich.
              </TooltipContent>
            </Tooltip>
            <span className="text-line">·</span>
            <CategoryPicker tutorialId={tutorialId} categories={categories} currentCategoryId={categoryId} />
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
    </div>
  );
}
