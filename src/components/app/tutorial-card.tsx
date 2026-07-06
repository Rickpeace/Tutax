"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MoreVertical,
  AlertTriangle,
  FileText,
  Eye,
  ExternalLink,
  QrCode,
  Check,
  Lock,
  Film,
  Zap,
} from "lucide-react";
import { HelpToggle } from "@/components/app/help-toggle";
import { useCleanup } from "@/components/app/bulk-cleanup";
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
import { categoryColor, categoryStripes, CATEGORY_NEUTRAL } from "@/lib/category-colors";
import {
  deleteTutorial,
  duplicateTutorial,
  renameTutorial,
  publishTutorial,
  unpublishTutorial,
} from "@/app/app/actions";
import { createAutomationFromTutorial } from "@/app/app/automationen/actions";

/** Serialisierbare Karten-Daten (Server → LibraryBrowser → Karte). */
export type LibraryTutorial = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  visibility: string;
  inLernen: boolean;
  updatedAt: string;
  categoryId: string | null;
  slug: string | null;
  freshness: string | null;
  stepCount: number;
  thumbnailUrl: string | null;
};

/**
 * Bibliotheks-Karte (Design 2a): Streifen-Thumbnail im Kategorie-Pastell
 * (oder echtes Schritt-Bild) mit Kategorie-/Bereichs-Chips, darunter Titel,
 * Meta und Fußzeile mit Status-Chip. Funktionalität wie gehabt: optimistischer
 * Publish-Toggle, Kontextmenü (Umbenennen/Duplizieren/QR/Export/Löschen),
 * Aufräum-Modus als Auswahl-Fläche.
 */
export function TutorialCard({
  tutorial,
  accountSlug,
  categoryName,
}: {
  tutorial: LibraryTutorial;
  accountSlug: string;
  categoryName: string | null;
}) {
  const router = useRouter();
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

  const color = categoryName ? categoryColor(categoryName) : CATEGORY_NEUTRAL;

  // Bulk-Aufräumen: im Aufräum-Modus wird die Karte zur Auswahl-Fläche.
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

  // Als Automation nutzen: Snapshot der Aufnahme erstellen und in die Automation springen.
  // Ob überhaupt ausführbare Schritte (mit Selektoren) existieren, weiß die Karte nicht —
  // deshalb immer anbieten; die Action wirft sonst eine sprechende Meldung (→ Toast).
  function convertToAutomation() {
    startTransition(async () => {
      try {
        const { automationId } = await createAutomationFromTutorial(tutorial.id);
        toast.success("Als Automation angelegt");
        router.push(`/app/automationen/${automationId}`);
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

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-card border-2 bg-card transition-colors ${
        cleanupActive
          ? checked
            ? "border-primary ring-2 ring-primary/25"
            : "border-line"
          : "border-line hover:border-[#e3d7c2]"
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
          className="absolute inset-0 z-10 cursor-pointer rounded-card"
        >
          <span
            className={`absolute left-2 top-2 flex size-6 items-center justify-center rounded-md border-2 ${
              checked ? "border-primary bg-primary text-white" : "border-line bg-card"
            }`}
          >
            {checked && <Check className="size-4" />}
          </span>
        </button>
      )}

      {/* Thumbnail: erstes Schritt-Bild oder Kategorie-Streifen */}
      <Link
        href={`/app/tutorials/${tutorial.id}`}
        aria-label={`${tutorial.title} bearbeiten`}
        className="relative block h-[110px] w-full overflow-hidden"
        style={
          tutorial.thumbnailUrl ? undefined : { background: categoryStripes(color) }
        }
      >
        {tutorial.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tutorial.thumbnailUrl}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <span
            className="absolute inset-0 grid place-items-center font-mono text-[9.5px]"
            style={{ color: color.deep }}
            aria-hidden
          >
            noch kein screenshot
          </span>
        )}
        {categoryName && (
          <span
            className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-card px-2 py-[3px] text-[10px] font-extrabold"
            style={{ color: color.text }}
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: color.solid }}
            />
            {categoryName}
          </span>
        )}
        <span
          className={`absolute right-2 top-2 flex items-center gap-1 rounded-full px-2 py-[3px] text-[10px] font-extrabold ${
            internal
              ? "border-[1.5px] border-line bg-card text-ink-2"
              : "bg-ink text-background"
          }`}
          title={
            internal
              ? "Interne Anleitung – nur für das Team sichtbar"
              : "Für Kunden auf der Hilfe-Seite"
          }
        >
          {internal ? (
            <>
              <Lock className="size-2.5" /> Intern
            </>
          ) : (
            "Kunde"
          )}
        </span>
      </Link>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col px-3.5 pb-3 pt-3">
        <div className="flex items-start gap-2">
          <Link href={`/app/tutorials/${tutorial.id}`} className="min-w-0 flex-1">
            <h3 className="line-clamp-2 break-words text-sm font-extrabold leading-[1.3] text-ink group-hover:text-primary">
              {tutorial.title}
            </h3>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="-mr-1 -mt-0.5 shrink-0 text-faint hover:text-ink"
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
              <DropdownMenuItem
                render={
                  <Link
                    href={
                      internal
                        ? `/app/lernen/${tutorial.id}`
                        : `/app/preview/${tutorial.id}`
                    }
                    target={internal ? undefined : "_blank"}
                  />
                }
              >
                <Eye className="size-4" /> Ansehen
              </DropdownMenuItem>
              {live && !internal && tutorial.slug && (
                <DropdownMenuItem
                  render={
                    <Link href={`/h/${accountSlug}/${tutorial.slug}`} target="_blank" />
                  }
                >
                  <ExternalLink className="size-4" /> Live-Seite öffnen
                </DropdownMenuItem>
              )}
              {live && !internal && tutorial.slug && (
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
                onClick={() => run(() => duplicateTutorial(tutorial.id), "Dupliziert")}
              >
                Duplizieren
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={convertToAutomation}>
                <Zap className="size-4" /> Als Automation nutzen
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="mt-1 text-xs font-semibold text-faint">
          {tutorial.stepCount} Schritt{tutorial.stepCount === 1 ? "" : "e"} ·{" "}
          {relativeDe(tutorial.updatedAt)}
          {tutorial.description ? (
            <span className="block truncate">{tutorial.description}</span>
          ) : null}
        </p>

        {/* Fußzeile: Status-Chip + Prüfen-Hinweis + Publish-Toggle */}
        <div className="mt-auto flex items-center gap-1.5 pt-2.5 text-[11px] font-extrabold">
          <span
            className={`rounded-full px-2.5 py-[3px] ${
              live ? "bg-teal-soft text-teal-text" : "bg-amber-soft text-amber-text"
            }`}
          >
            {live ? (internal ? "Freigegeben" : "Veröffentlicht") : "Entwurf"}
          </span>
          {stale && (
            <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-[3px] text-accent-foreground">
              <AlertTriangle className="size-3" /> Prüfen
            </span>
          )}
          <span className="ml-auto">
            <HelpToggle
              on={live}
              onToggle={toggleLive}
              label={internal ? "Fürs Team" : "Auf Hilfe-Seite"}
            />
          </span>
        </div>
      </div>

      {/* Video-Export: Status-/Download-Zeile + Stil-Dialog (nur öffentlich
          veröffentlichte). empty:hidden: ohne sichtbaren Inhalt darf der Wrapper
          kein Phantom-Padding erzeugen — sonst sitzt die Fußzeile dieser Karten
          höher als bei den anderen. */}
      {live && !internal && tutorial.slug && (
        <div className="px-3.5 pb-3 empty:hidden">
          <VideoExport
            tutorialId={tutorial.id}
            open={exportOpen}
            onOpenChange={setExportOpen}
          />
        </div>
      )}

      {/* Umbenennen */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anleitung umbenennen</DialogTitle>
          </DialogHeader>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
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
            <DialogTitle>Anleitung löschen?</DialogTitle>
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
