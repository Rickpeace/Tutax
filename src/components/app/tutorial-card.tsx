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
  Globe,
} from "lucide-react";
import { useCleanup } from "@/components/app/bulk-cleanup";
import { StatusSwitch } from "@/components/app/status-switch";
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
  categoryColor,
  categoryStripes,
  CATEGORY_NEUTRAL,
  type CategoryColor,
} from "@/lib/category-colors";
import {
  deleteTutorial,
  duplicateTutorial,
  renameTutorial,
  publishTutorial,
  unpublishTutorial,
} from "@/app/app/actions";
import { createAutomationFromTutorial } from "@/app/app/automationen/actions";

/** Serialisierbare Karten-Daten (Server → LibraryBrowser → Karte/Zeile). */
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
  /** Website, auf der die Anleitung spielt (erste tutorials.site_domains) — sonst null. */
  siteDomain: string | null;
};

export type TutorialLayout = "card" | "row";

/**
 * Eine Anleitung in der Bibliothek (Welle 49, nach Richards Auswahl aus den Varianten):
 *  - layout "card": Kopf-Feld in der Kategorie-Farbe mit TITEL + Website, darunter Kategorie
 *    (+ „Intern" nur als Ausnahme), Schritte · Datum und EIN Status-Schalter.
 *  - layout "row": Listenzeile (Titel · Website · Schritte · Geändert · Status · Menü).
 * Beide teilen Zustand, Menü und Dialoge: optimistischer Veröffentlichen-Schalter, Kontextmenü
 * (Umbenennen/Duplizieren/QR/Export/Automation/Löschen), Aufräum-Modus als Auswahl-Fläche.
 */
export function TutorialCard({
  tutorial,
  accountSlug,
  categoryName,
  layout = "card",
}: {
  tutorial: LibraryTutorial;
  accountSlug: string;
  categoryName: string | null;
  layout?: TutorialLayout;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [title, setTitle] = useState(tutorial.title);

  // Optimistischer Veröffentlicht-Zustand.
  const [live, setLive] = useState(tutorial.status === "published");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: optimistischen live-Zustand mit neuem Server-Status resyncen, kein Cascade
  useEffect(() => setLive(tutorial.status === "published"), [tutorial.status]);
  const stale = tutorial.freshness === "stale";
  const internal = tutorial.visibility === "internal";

  const color = categoryName ? categoryColor(categoryName) : CATEGORY_NEUTRAL;

  // Bulk-Aufräumen: im Aufräum-Modus wird Karte/Zeile zur Auswahl-Fläche.
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
            toast.success("Veröffentlicht – für Ihr Team in den Schulungen", {
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
              label: "Ansehen",
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
        .then(() => toast(
            internal
              ? "Auf Entwurf gesetzt – nicht mehr in den Schulungen."
              : "Auf Entwurf gesetzt – nicht mehr auf der Hilfe-Seite.",
          ),
        )
        .catch(() => {
          setLive(true);
          toast.error("Konnte nicht speichern");
        });
    }
  };

  const editHref = `/app/tutorials/${tutorial.id}`;
  const statusSwitch = (
    <StatusSwitch
      on={live}
      onToggle={toggleLive}
      compact={layout === "row"}
      title={
        internal
          ? "Nur für Ihr Team – veröffentlicht erscheint sie in den Schulungen"
          : "Veröffentlicht erscheint sie auf der Hilfe-Seite"
      }
    />
  );
  const menu = (
    <TutorialMenu
      tutorial={tutorial}
      accountSlug={accountSlug}
      live={live}
      internal={internal}
      onExport={() => setExportOpen(true)}
      onRename={() => setRenameOpen(true)}
      onDuplicate={() => run(() => duplicateTutorial(tutorial.id), "Dupliziert")}
      onAutomation={convertToAutomation}
      onDelete={() => setDeleteOpen(true)}
    />
  );
  const selectOverlay = cleanupActive && (
    <button
      type="button"
      onClick={() => cleanup?.toggle(tutorial.id)}
      aria-pressed={checked}
      aria-label={`${tutorial.title} ${checked ? "abwählen" : "auswählen"}`}
      className={`absolute inset-0 z-10 cursor-pointer ${layout === "card" ? "rounded-card" : ""}`}
    >
      <span
        className={`absolute flex size-6 items-center justify-center rounded-md border-2 ${
          layout === "card" ? "left-2 top-2" : "left-2 top-1/2 -translate-y-1/2"
        } ${checked ? "border-primary bg-primary text-white" : "border-line bg-card"}`}
      >
        {checked && <Check className="size-4" />}
      </span>
    </button>
  );
  const dialogs = (
    <>
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
    </>
  );
  // Video-Export: Status-/Download-Zeile + Stil-Dialog (nur öffentlich veröffentlichte).
  // empty:hidden: ohne sichtbaren Inhalt darf der Wrapper kein Phantom-Padding erzeugen.
  const videoExport = live && !internal && tutorial.slug && (
    <div className={layout === "card" ? "px-3.5 pb-3 empty:hidden" : "px-4 pb-2.5 empty:hidden"}>
      <VideoExport tutorialId={tutorial.id} open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  );

  if (layout === "row") {
    return (
      <div
        className={`group relative border-t-2 border-line-2 transition-colors ${
          cleanupActive && checked ? "bg-accent/50" : "hover:bg-[#fffcf7]"
        } ${cleanupActive ? "pl-8" : ""}`}
        data-pending={pending}
      >
        {selectOverlay}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_190px_90px_110px_150px_32px] md:gap-4">
          <div className="min-w-0">
            <Link href={editHref} className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-extrabold text-ink group-hover:text-primary">
                {tutorial.title}
              </span>
              {internal && <InternBadge />}
              {stale && <StaleBadge />}
            </Link>
            {tutorial.description && (
              <p className="truncate text-xs font-semibold text-faint">{tutorial.description}</p>
            )}
          </div>
          <span className="hidden min-w-0 md:block">
            <SiteLabel domain={tutorial.siteDomain} />
          </span>
          <span className="hidden text-xs font-bold tabular-nums text-muted-foreground md:block">
            {stepsLabel(tutorial.stepCount)}
          </span>
          <span className="hidden text-xs font-bold text-muted-foreground md:block">
            {relativeDe(tutorial.updatedAt)}
          </span>
          {statusSwitch}
          {menu}
        </div>
        {videoExport}
        {dialogs}
      </div>
    );
  }

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
      {selectOverlay}

      {/* Kopf-Feld in der Kategorie-Farbe: Titel + Website (Richards Wahl, Welle 49). */}
      <div
        className="flex flex-col gap-2.5 border-b-2 border-line px-4 pb-3.5 pt-3"
        style={{ background: categoryStripes(color, 12) }}
      >
        <div className="flex items-start gap-2">
          <Link href={editHref} className="min-w-0 flex-1">
            <h3 className="line-clamp-2 min-h-[2.6em] break-words text-[17px] font-black leading-[1.3] text-ink [text-wrap:balance] group-hover:text-primary">
              {tutorial.title}
            </h3>
          </Link>
          {menu}
        </div>
        <SiteLabel domain={tutorial.siteDomain} pill />
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 pb-3 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryLabel name={categoryName} color={color} />
          {internal && <InternBadge />}
          {stale && <StaleBadge />}
        </div>
        <p className="text-xs font-bold text-muted-foreground">
          {stepsLabel(tutorial.stepCount)} · {relativeDe(tutorial.updatedAt)}
        </p>
        {tutorial.description && (
          <p className="truncate text-xs font-semibold text-faint">{tutorial.description}</p>
        )}
        <div className="mt-auto border-t-2 border-line-2 pt-2.5">{statusSwitch}</div>
      </div>

      {videoExport}
      {dialogs}
    </div>
  );
}

const stepsLabel = (n: number) => `${n} Schritt${n === 1 ? "" : "e"}`;

/** Website der Anleitung (aus der Aufnahme bzw. „Gilt für Website"); ohne → nichts/Strich. */
function SiteLabel({ domain, pill }: { domain: string | null; pill?: boolean }) {
  // Karte ohne Website: Platz trotzdem halten, sonst stehen die Farbfelder einer Reihe ungleich.
  if (!domain) {
    return pill ? <span aria-hidden className="h-6" /> : <span className="text-xs font-bold text-faint">–</span>;
  }
  return (
    <span
      className={`flex min-w-0 max-w-full items-center gap-1.5 text-xs font-extrabold text-ink-2 ${
        pill ? "self-start rounded-full bg-card/90 px-2.5 py-1" : ""
      }`}
      title={domain}
    >
      <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{domain}</span>
    </span>
  );
}

function CategoryLabel({ name, color }: { name: string | null; color: CategoryColor }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-extrabold text-ink-2">
      <span aria-hidden className="size-2 rounded-full" style={{ background: color.solid }} />
      {name ?? "Sonstiges"}
    </span>
  );
}

/** Nur die AUSNAHME wird markiert: „Nur Team“ (Hilfe-Seite ist der Normalfall). */
function InternBadge() {
  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-full bg-violet-soft px-2 py-[2px] text-[11px] font-black text-violet-text"
      title="Nur für Ihr Team sichtbar – erscheint nicht auf der Hilfe-Seite"
    >
      <Lock className="size-2.5" /> Nur Team
    </span>
  );
}

function StaleBadge() {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-[2px] text-[11px] font-extrabold text-accent-foreground">
      <AlertTriangle className="size-3" /> Prüfen
    </span>
  );
}

function TutorialMenu({
  tutorial,
  accountSlug,
  live,
  internal,
  onExport,
  onRename,
  onDuplicate,
  onAutomation,
  onDelete,
}: {
  tutorial: LibraryTutorial;
  accountSlug: string;
  live: boolean;
  internal: boolean;
  onExport: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onAutomation: () => void;
  onDelete: () => void;
}) {
  const publicLive = live && !internal && !!tutorial.slug;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mr-1 -mt-0.5 shrink-0 text-muted-foreground hover:text-ink"
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
              href={internal ? `/app/lernen/${tutorial.id}` : `/app/preview/${tutorial.id}`}
              target={internal ? undefined : "_blank"}
            />
          }
        >
          <Eye className="size-4" /> Ansehen
        </DropdownMenuItem>
        {publicLive && (
          <DropdownMenuItem
            render={<Link href={`/h/${accountSlug}/${tutorial.slug}`} target="_blank" />}
          >
            <ExternalLink className="size-4" /> Auf der Hilfe-Seite öffnen
          </DropdownMenuItem>
        )}
        {publicLive && (
          <DropdownMenuItem
            onClick={() => {
              const url = `${window.location.origin}/h/${accountSlug}/${tutorial.slug}`;
              window.open(`/api/qr?url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
            }}
          >
            <QrCode className="size-4" /> QR-Code öffnen
          </DropdownMenuItem>
        )}
        {publicLive && (
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              onExport();
            }}
          >
            <Film className="size-4" /> Als Video exportieren
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onRename}>Umbenennen</DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>Duplizieren</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onAutomation}>
          <Zap className="size-4" /> Als Automation nutzen
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          Löschen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
