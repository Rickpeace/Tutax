"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  MoreVertical,
  AlertTriangle,
  FileText,
  Eye,
  ExternalLink,
} from "lucide-react";
import { HelpToggle } from "@/components/app/help-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { relativeDe } from "@/lib/format";
import {
  deleteTutorial,
  duplicateTutorial,
  renameTutorial,
  publishTutorial,
  unpublishTutorial,
} from "@/app/app/actions";
import type { Tutorial } from "@/lib/types";

export function TutorialCard({
  tutorial,
  accountSlug,
}: {
  tutorial: Tutorial;
  accountSlug: string;
}) {
  const [pending, startTransition] = useTransition();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [title, setTitle] = useState(tutorial.title);

  // Optimistischer „Auf Hilfe-Seite"-Zustand (= veröffentlicht).
  const [live, setLive] = useState(tutorial.status === "published");
  useEffect(() => setLive(tutorial.status === "published"), [tutorial.status]);
  const stale = tutorial.freshness === "stale";

  function run(fn: () => Promise<void>, success: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(success);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  // Sofort umschalten, im Hintergrund veröffentlichen/zurückziehen.
  const toggleLive = () => {
    const next = !live;
    setLive(next);
    if (next) {
      publishTutorial(tutorial.id)
        .then(({ slug, accountSlug: acc }) => {
          const url = `${window.location.origin}/h/${acc}/${slug}`;
          toast.success("Veröffentlicht! 🎉", {
            description: url,
            action: {
              label: "Live ansehen",
              onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
            },
          });
        })
        .catch(() => {
          setLive(false);
          toast.error("Konnte nicht speichern");
        });
    } else {
      unpublishTutorial(tutorial.id)
        .then(() => toast("Nicht mehr öffentlich."))
        .catch(() => {
          setLive(true);
          toast.error("Konnte nicht speichern");
        });
    }
  };

  return (
    <div
      className="group relative flex flex-col rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(16,21,36,0.03)] transition-all hover:-translate-y-0.5 hover:border-primary/40"
      data-pending={pending}
    >
      <div className="mb-2 flex items-center gap-2">
        <HelpToggle on={live} onToggle={toggleLive} />
        {stale && (
          <span className="flex items-center gap-1 rounded-md bg-no-soft px-2 py-0.5 text-xs font-bold text-no">
            <AlertTriangle className="size-3" /> Prüfen
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                aria-label="Aktionen"
              >
                <MoreVertical className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem render={<Link href={`/app/tutorials/${tutorial.id}`} />}>
              <FileText className="size-4" /> Bearbeiten
            </DropdownMenuItem>
            {live && tutorial.slug && (
              <DropdownMenuItem
                render={
                  <Link
                    href={`/h/${accountSlug}/${tutorial.slug}`}
                    target="_blank"
                  />
                }
              >
                <ExternalLink className="size-4" /> Live-Seite öffnen
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setRenameOpen(true)}>
              Umbenennen
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                run(() => duplicateTutorial(tutorial.id), "Dupliziert")
              }
            >
              Duplizieren
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              Löschen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Link href={`/app/tutorials/${tutorial.id}`} className="flex-1">
        <h3 className="font-bold text-ink group-hover:text-primary">
          {tutorial.title}
        </h3>
        {tutorial.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {tutorial.description}
          </p>
        )}
      </Link>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Geändert {relativeDe(tutorial.updated_at)}
        </p>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`/app/preview/${tutorial.id}`} target="_blank" />}
        >
          <Eye className="size-4" /> Ansehen
        </Button>
      </div>

      {/* Umbenennen */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tutorial umbenennen</DialogTitle>
          </DialogHeader>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={pending || !title.trim()}
              onClick={() => {
                setRenameOpen(false);
                run(() => renameTutorial(tutorial.id, title), "Umbenannt");
              }}
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Löschen */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tutorial löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            „{tutorial.title}" wird mit allen Schritten dauerhaft gelöscht. Das
            kann nicht rückgängig gemacht werden.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setDeleteOpen(false);
                run(() => deleteTutorial(tutorial.id), "Gelöscht");
              }}
            >
              Endgültig löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
