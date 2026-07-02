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
  ImageIcon,
  QrCode,
  Check,
  Lock,
  GraduationCap,
  Film,
} from "lucide-react";
import { HelpToggle } from "@/components/app/help-toggle";
import { useCleanup } from "@/components/app/bulk-cleanup";
import { useAudienceFilter, matchesAudience } from "@/components/app/audience-filter";
import { VideoExport } from "@/components/app/video-export";
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
  thumbnailUrl = null,
}: {
  tutorial: Tutorial;
  accountSlug: string;
  thumbnailUrl?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [title, setTitle] = useState(tutorial.title);

  // Optimistischer „Auf Hilfe-Seite"-Zustand (= veröffentlicht).
  const [live, setLive] = useState(tutorial.status === "published");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: optimistischen live-Zustand mit neuem Server-Status resyncen, kein Cascade
  useEffect(() => setLive(tutorial.status === "published"), [tutorial.status]);
  const stale = tutorial.freshness === "stale";
  const internal = tutorial.visibility === "internal";
  // Öffentliche Anleitung, die zusätzlich im Team-Lernbereich liegt (Welle 20).
  const teamToo = tutorial.visibility === "public" && tutorial.in_lernen;

  // Zielgruppen-Filter (Welle 20): Chips „Alle | Kunden | Team" über der Liste.
  const audienceFilter = useAudienceFilter();

  // Bulk-Aufräumen (REVIEW G): im Aufräum-Modus wird die Karte zur Auswahl-Fläche.
  const cleanup = useCleanup();
  const cleanupActive = cleanup?.active ?? false;
  const checked = cleanup?.isSelected(tutorial.id) ?? false;
  useEffect(() => {
    cleanup?.register(tutorial.id, tutorial.status === "published");
  }, [cleanup, tutorial.id, tutorial.status]);

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
        .then((res) => {
          if ("internal" in res) {
            const url = `${window.location.origin}/app/lernen/${tutorial.id}`;
            toast.success("Für das Team freigegeben", {
              action: {
                label: "Öffnen",
                onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
              },
            });
            return;
          }
          const url = `${window.location.origin}/h/${res.accountSlug}/${res.slug}`;
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
        .then(() => toast(internal ? "Nicht mehr freigegeben." : "Nicht mehr öffentlich."))
        .catch(() => {
          setLive(true);
          toast.error("Konnte nicht speichern");
        });
    }
  };

  // Zielgruppen-Filter: passt die Karte nicht, gar nicht rendern (nach allen Hooks).
  if (!matchesAudience(audienceFilter, tutorial)) return null;

  return (
    <div
      className={`group relative flex gap-3 rounded-xl border bg-card p-3 shadow-[0_1px_2px_rgba(16,21,36,0.03)] transition-all sm:p-4 ${
        cleanupActive
          ? checked
            ? "border-primary ring-2 ring-primary/30"
            : "border-border"
          : "border-border hover:-translate-y-0.5 hover:border-primary/40"
      }`}
      data-pending={pending}
    >
      {/* Aufräum-Modus: ganze Karte wird zur Auswahl-Fläche (Links deaktiviert). */}
      {cleanupActive && (
        <button
          type="button"
          onClick={() => cleanup?.toggle(tutorial.id)}
          aria-pressed={checked}
          aria-label={`${tutorial.title} ${checked ? "abwählen" : "auswählen"}`}
          className="absolute inset-0 z-10 cursor-pointer rounded-xl"
        >
          <span
            className={`absolute left-2 top-2 flex size-6 items-center justify-center rounded-md border-2 ${
              checked ? "border-primary bg-primary text-white" : "border-line-2 bg-white"
            }`}
          >
            {checked && <Check className="size-4" />}
          </span>
        </button>
      )}
      {/* Thumbnail links: erstes Schritt-Bild oder Platzhalter */}
      <Link
        href={`/app/tutorials/${tutorial.id}`}
        aria-label={`${tutorial.title} bearbeiten`}
        className="size-16 shrink-0 overflow-hidden rounded-lg border border-line-2 bg-muted sm:size-20"
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground/50">
            <ImageIcon className="size-6" />
          </div>
        )}
      </Link>

      {/* Inhalt rechts */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-2">
          <Link href={`/app/tutorials/${tutorial.id}`} className="min-w-0 flex-1">
            {/* Titel als ERSTES Text-Element */}
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="truncate font-bold text-ink group-hover:text-primary">
                {tutorial.title}
              </h3>
              {internal && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-medium text-ink-2"
                  title="Interne Anleitung – nur für das Team sichtbar"
                >
                  <Lock className="size-3" /> Intern
                </span>
              )}
              {/* KEIN Schloss: das Tutorial ist öffentlich — der Chip sagt nur
                  „läuft ZUSÄTZLICH als Team-Schulung" (Richard-Feedback 03.07.). */}
              {teamToo && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-medium text-ink-2"
                  title="Öffentlich auf der Hilfe-Seite UND zusätzlich im Team-Lernbereich (mit Schulungsnachweis)"
                >
                  <GraduationCap className="size-3" /> + Team
                </span>
              )}
            </div>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="-mr-1 -mt-0.5 shrink-0"
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
              {live && internal && (
                <DropdownMenuItem render={<Link href={`/app/lernen/${tutorial.id}`} />}>
                  <Lock className="size-4" /> Im Lernbereich öffnen
                </DropdownMenuItem>
              )}
              {live && !internal && tutorial.slug && (
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
              {live && !internal && tutorial.slug && (
                // QR-Code öffnen (H6): führt zur öffentlichen Anleitung; nur die eigene
                // Hilfe-URL wird an /api/qr übergeben (serverseitig zusätzlich geprüft).
                <DropdownMenuItem
                  onClick={() => {
                    const url = `${window.location.origin}/h/${accountSlug}/${tutorial.slug}`;
                    window.open(
                      `/api/qr?url=${encodeURIComponent(url)}`,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                >
                  <QrCode className="size-4" /> QR-Code öffnen
                </DropdownMenuItem>
              )}
              {live && !internal && tutorial.slug && (
                // Video-Export (Welle 18): nur für öffentlich veröffentlichte Tutorials.
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    setExportOpen(true);
                  }}
                >
                  <Film className="size-4" /> Als Video exportieren
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

        {tutorial.description && (
          <Link href={`/app/tutorials/${tutorial.id}`} className="mt-0.5">
            <p className="line-clamp-1 text-sm text-muted-foreground sm:line-clamp-2">
              {tutorial.description}
            </p>
          </Link>
        )}

        {/* Publish-Toggle UNTER dem Titel (nicht mehr darüber) */}
        <div className="mt-auto flex items-center gap-2 pt-2">
          <HelpToggle on={live} onToggle={toggleLive} label={internal ? "Fürs Team" : "Auf Hilfe-Seite"} />
          {stale && (
            <span className="flex items-center gap-1 rounded-md bg-no-soft px-1.5 py-0.5 text-xs font-bold text-no">
              <AlertTriangle className="size-3" /> Prüfen
            </span>
          )}
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
            {relativeDe(tutorial.updated_at)}
          </span>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            className="shrink-0"
            render={
              <Link
                href={internal ? `/app/lernen/${tutorial.id}` : `/app/preview/${tutorial.id}`}
                target={internal ? undefined : "_blank"}
              />
            }
          >
            <Eye className="size-4" /> Ansehen
          </Button>
        </div>

        {/* Video-Export: Status-/Download-Zeile + Stil-Dialog (nur öffentlich veröffentlichte). */}
        {live && !internal && tutorial.slug && (
          <VideoExport tutorialId={tutorial.id} open={exportOpen} onOpenChange={setExportOpen} />
        )}
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
            „{tutorial.title}“ wird mit allen Schritten dauerhaft gelöscht. Das
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
