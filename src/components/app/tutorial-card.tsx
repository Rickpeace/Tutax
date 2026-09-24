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
  Link2,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STABLE_LINK_HINT, copyText, hubTutorialUrl } from "@/lib/share-link";
import { GUIDE_TITLE_MAX } from "@/lib/text-limits";
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
import { unwrap, errorText, isNavigationError } from "@/lib/action-error";
import { TAP_AREA } from "@/lib/tap-target";

/** Serialisierbare Karten-Daten (Server → LibraryBrowser → Karte/Zeile). */
export type LibraryTutorial = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  visibility: string;
  inLernen: boolean;
  updatedAt: string;
  /**
   * Bereits auf dem Server formatierte Zeitangabe („vor 3 Tagen“). Wird NICHT im Browser
   * berechnet: `relativeDe(updatedAt)` lieferte beim Server-Rendern und beim ersten Rendern
   * im Browser unterschiedliche Texte → Hydration-Fehler (gleiches Muster wie bei der Glocke,
   * siehe src/app/app/layout.tsx).
   */
  updatedLabel: string;
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
  exportAllowed = true,
}: {
  tutorial: LibraryTutorial;
  accountSlug: string;
  categoryName: string | null;
  layout?: TutorialLayout;
  /** „Als Video exportieren“ ist Business — sonst kein Menüpunkt (statt Fehler nach dem Klick). */
  exportAllowed?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [title, setTitle] = useState(tutorial.title);
  // Sofort den neuen Namen zeigen (optimistisch) — vorher stand nach „Umbenannt“ noch ~3 s der
  // alte Titel auf der Karte, bis die Seite neu geladen war (Audit 23.09.).
  const [shownTitle, setShownTitle] = useState<string | null>(null);
  const displayTitle = shownTitle ?? tutorial.title;

  // Optimistischer Veröffentlicht-Zustand.
  const [live, setLive] = useState(tutorial.status === "published");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: optimistischen live-Zustand mit neuem Server-Status resyncen, kein Cascade
  useEffect(() => setLive(tutorial.status === "published"), [tutorial.status]);
  const stale = tutorial.freshness === "stale";
  const internal = tutorial.visibility === "internal";
  // Slug entsteht beim ersten Veröffentlichen — direkt übernehmen, damit „Link kopieren“
  // ohne Neuladen erscheint (Welle 51a). Danach bleibt er gleich (ensureSlug).
  const [slug, setSlug] = useState(tutorial.slug);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: mit neuem Server-Stand resyncen, kein Cascade
  useEffect(() => setSlug(tutorial.slug), [tutorial.slug]);

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
        if (isNavigationError(e)) return; // Weiterleitung (z. B. Tarif-Grenze) übernimmt Next
        toast.error(errorText(e));
      }
    });
  }

  // Als Automation nutzen: Snapshot der Aufnahme erstellen und in die Automation springen.
  // Ob überhaupt ausführbare Schritte (mit Selektoren) existieren, weiß die Karte nicht —
  // deshalb immer anbieten; die Action wirft sonst eine sprechende Meldung (→ Toast).
  function convertToAutomation() {
    startTransition(async () => {
      try {
        const { automationId } = unwrap(await createAutomationFromTutorial(tutorial.id));
        toast.success("Als Automation angelegt");
        router.push(`/app/automationen/${automationId}`);
      } catch (e) {
        if (isNavigationError(e)) return; // Weiterleitung (z. B. Tarif-Grenze) übernimmt Next
        toast.error(errorText(e));
      }
    });
  }

  // Leere Anleitung darf nicht veröffentlicht werden — gleiche Sperre wie im Editor
  // (tutorial-header.tsx). Zurück auf Entwurf bleibt immer möglich.
  const canPublish = tutorial.stepCount > 0;
  const publishBlocked = !live && !canPublish;

  // Sofort umschalten, im Hintergrund veröffentlichen/zurückziehen.
  const toggleLive = () => {
    const next = !live;
    if (next && !canPublish) return;
    setLive(next);
    if (next) {
      publishTutorial(tutorial.id)
        .then(unwrap)
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
          setSlug(res.slug);
          const url = `${window.location.origin}/h/${res.accountSlug}/${res.slug}`;
          toast.success("Veröffentlicht! 🎉", {
            description: url,
            action: {
              label: "Ansehen",
              onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
            },
          });
        })
        .catch((e) => {
          setLive(false);
          toast.error(errorText(e, "Konnte nicht veröffentlichen"));
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
  const switchEl = (
    <StatusSwitch
      on={live}
      onToggle={toggleLive}
      compact={layout === "row"}
      disabled={publishBlocked}
      title={
        publishBlocked
          ? "Erst Schritte anlegen"
          : internal
            ? "Nur für Ihr Team – veröffentlicht erscheint sie in den Schulungen"
            : "Veröffentlicht erscheint sie auf der Hilfe-Seite"
      }
    />
  );
  // Gesperrter Schalter: Grund als Tooltip. Der Auslöser ist ein span AUSSERHALB des
  // deaktivierten Knopfs — ein disabled button liefert selbst keine Maus-Ereignisse.
  const statusSwitch = publishBlocked ? (
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-flex shrink-0" data-testid="publish-blocked" />}
      >
        {switchEl}
      </TooltipTrigger>
      <TooltipContent>Erst Schritte anlegen</TooltipContent>
    </Tooltip>
  ) : (
    switchEl
  );
  const menu = (
    <TutorialMenu
      tutorial={{ ...tutorial, slug }}
      accountSlug={accountSlug}
      live={live}
      internal={internal}
      onExport={exportAllowed ? () => setExportOpen(true) : undefined}
      onRename={() => setRenameOpen(true)}
      onDuplicate={() => run(async () => { unwrap(await duplicateTutorial(tutorial.id)); }, "Dupliziert")}
      onAutomation={convertToAutomation}
      onDelete={() => setDeleteOpen(true)}
    />
  );
  const selectOverlay = cleanupActive && (
    <button
      type="button"
      onClick={() => cleanup?.toggle(tutorial.id)}
      aria-pressed={checked}
      aria-label={`${displayTitle} ${checked ? "abwählen" : "auswählen"}`}
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
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={GUIDE_TITLE_MAX}
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
                const next = title.replace(/\s+/g, " ").trim();
                setShownTitle(next);
                run(async () => {
                  try {
                    await renameTutorial(tutorial.id, title);
                  } catch (e) {
                    setShownTitle(null); // zurück auf den gespeicherten Namen
                    throw e;
                  }
                }, "Umbenannt");
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
            „{displayTitle}“ wird mit allen Schritten dauerhaft gelöscht. Das
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
  const videoExport = live && !internal && slug && (
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
                {displayTitle}
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
            {tutorial.updatedLabel}
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
              {displayTitle}
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
          {stepsLabel(tutorial.stepCount)} · {tutorial.updatedLabel}
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
  onExport?: () => void;
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
            // Touch: unsichtbar 40 px Trefferfläche (Handy-Audit 24.09.: vorher 28 × 28 px).
            className={`relative -mr-1 -mt-0.5 shrink-0 text-muted-foreground hover:text-ink ${TAP_AREA}`}
            aria-label="Aktionen"
          >
            <MoreVertical className="size-4" />
          </Button>
        }
      />
      {/* Eigene Breite statt Knopf-Breite (Audit 24.09.: 120 px, Einträge brachen dreizeilig);
          die Base-UI-Positionierung hält das Menü am Bildschirmrand. */}
      <DropdownMenuContent align="end" className="w-auto min-w-[200px] max-w-[calc(100vw-1rem)]">
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
            title={STABLE_LINK_HINT}
            onClick={async () => {
              const url = hubTutorialUrl(accountSlug, tutorial.slug!);
              if (await copyText(url)) {
                toast.success("Link kopiert", { description: `${url} – ${STABLE_LINK_HINT}` });
              } else {
                toast.error("Kopieren nicht möglich – bitte „Auf der Hilfe-Seite öffnen“ nutzen.");
              }
            }}
          >
            <Link2 className="size-4" /> Link kopieren
          </DropdownMenuItem>
        )}
        {publicLive && onExport && (
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
