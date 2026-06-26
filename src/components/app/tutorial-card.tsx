"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  MoreVertical,
  AlertTriangle,
  FileText,
  Eye,
  Send,
  Undo2,
} from "lucide-react";
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

  const published = tutorial.status === "published";
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

  return (
    <div
      className="group relative flex flex-col rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(16,21,36,0.03)] transition-all hover:-translate-y-0.5 hover:border-primary/40"
      data-pending={pending}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={
            published
              ? "rounded-md bg-yes-soft px-2 py-0.5 text-xs font-bold text-yes"
              : "rounded-md bg-accent px-2 py-0.5 text-xs font-bold text-primary"
          }
        >
          {published ? "Veröffentlicht" : "Entwurf"}
        </span>
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
            {published && tutorial.slug && (
              <DropdownMenuItem
                render={
                  <Link
                    href={`/h/${accountSlug}/${tutorial.slug}`}
                    target="_blank"
                  />
                }
              >
                <Eye className="size-4" /> Live ansehen
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {published ? (
              <DropdownMenuItem
                onClick={() =>
                  run(() => unpublishTutorial(tutorial.id), "Zurückgezogen")
                }
              >
                <Undo2 className="size-4" /> Zurückziehen
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() =>
                  run(
                    () => publishTutorial(tutorial.id).then(() => undefined),
                    "Veröffentlicht",
                  )
                }
              >
                <Send className="size-4" /> Veröffentlichen
              </DropdownMenuItem>
            )}
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
      <p className="mt-3 text-xs text-muted-foreground">
        Geändert {relativeDe(tutorial.updated_at)}
      </p>

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
