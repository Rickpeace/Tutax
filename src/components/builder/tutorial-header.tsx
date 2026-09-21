"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Eye, Globe, Languages, Loader2, Lock, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusSwitch } from "@/components/app/status-switch";
import { CategoryPicker } from "@/components/builder/category-picker";
import { SiteDomainsPicker } from "@/components/builder/site-domains-picker";
import { DriftCheckButton } from "@/components/builder/drift-check-button";
import {
  setTutorialTitle,
  setTutorialDescription,
  countUnreviewedBlurSteps,
} from "@/app/app/tutorials/[id]/actions";
import { translateTutorial } from "@/app/app/actions-translate";
import { publishTutorial, setTutorialAudience, unpublishTutorial } from "@/app/app/actions";
import { LANG_LABEL, type ExtraLang } from "@/lib/i18n-hub";
import type { TutorialVisibility } from "@/lib/types";

/**
 * Kopf im Anleitungs-Editor (Welle 50d, Entwurf „App-Makeover" §4):
 *   Zurück · Titel (Stift) · Kurzbeschreibung
 *   EINE Steuerzeile: Status-Schalter (Veröffentlicht/Entwurf) | Segment „Hilfe-Seite | Nur Team"
 *   + Schalter „Mit Schulungsnachweis" (nur bei Hilfe-Seite; Nur Team hat den Nachweis immer)
 *   | Kategorie- und Website-Pill — rechts „Aktualität prüfen" und „Vorschau".
 * Die Aktionen sind unverändert: publishTutorial/unpublishTutorial und setTutorialAudience
 * (visibility public/internal + in_lernen).
 */
export function TutorialHeader({
  tutorialId,
  initialTitle,
  initialDescription,
  published: initialPublished,
  visibility: initialVisibility,
  inLernen: initialInLernen,
  isBusiness,
  categories,
  categoryId,
  siteDomains,
  languages,
  translationsStale,
}: {
  tutorialId: string;
  initialTitle: string;
  initialDescription: string;
  published: boolean;
  visibility: TutorialVisibility;
  inLernen: boolean;
  isBusiness: boolean;
  categories: { id: string; name: string }[];
  categoryId: string | null;
  siteDomains: string[];
  languages: ExtraLang[];
  translationsStale: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [saved, setSaved] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  // Kurzbeschreibung (Untertitel auf der Hilfe-Seiten-Karte).
  const [desc, setDesc] = useState(initialDescription);
  const [savedDesc, setSavedDesc] = useState(initialDescription);
  const [descEditing, setDescEditing] = useState(false);
  const [published, setPublished] = useState(initialPublished);
  const [visibility, setVisibility] = useState<TutorialVisibility>(initialVisibility);
  // Wer sieht die Anleitung? „Hilfe-Seite" ⇔ public, „Nur Team" ⇔ internal.
  // Der Schulungsnachweis (in_lernen) ist nur bei Hilfe-Seite wählbar; Nur Team hat ihn immer.
  const publicOn = visibility === "public";
  const [inLernen, setInLernen] = useState(initialInLernen);
  const [busy, setBusy] = useState(false);
  const [visBusy, setVisBusy] = useState(false);
  const [trBusy, setTrBusy] = useState(false);
  const [stale, setStale] = useState(translationsStale);
  // Auto-Verpixelung (Welle 28): Anzahl Schritte mit ungeprüften Verpixelungen (>0 = Gate offen).
  const [blurGate, setBlurGate] = useState<number | null>(null);

  async function translate() {
    if (trBusy) return;
    setTrBusy(true);
    try {
      const res = await translateTutorial(tutorialId);
      setStale(false);
      const names = res.languages.map((l) => LANG_LABEL[l]).join(", ");
      toast.success(names ? `Übersetzt in ${names}` : "Übersetzt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Übersetzen fehlgeschlagen");
    } finally {
      setTrBusy(false);
    }
  }

  async function saveDescription() {
    const d = desc.replace(/\s+/g, " ").trim();
    if (d === savedDesc) return;
    try {
      await setTutorialDescription(tutorialId, d);
      setSavedDesc(d);
      setDesc(d);
      toast.success(d ? "Beschreibung gespeichert" : "Beschreibung entfernt");
    } catch {
      setDesc(savedDesc);
      toast.error("Beschreibung konnte nicht gespeichert werden");
    }
  }

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

  // Der eigentliche Veröffentlichen-Weg (Slug + Bilder in den öffentlichen Bucket bzw.
  // entfernen). Brennt Verpixelungen weiterhin serverseitig über ALLE Markierungen ein.
  async function doPublish(next: boolean) {
    setBusy(true);
    try {
      if (next) await publishTutorial(tutorialId);
      else await unpublishTutorial(tutorialId);
      setPublished(next);
      const liveMsg = publicOn
        ? "Anleitung ist jetzt veröffentlicht"
        : "Veröffentlicht – für Ihr Team in den Schulungen";
      toast.success(next ? liveMsg : "Auf Entwurf gesetzt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status konnte nicht geändert werden");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish() {
    if (busy) return;
    const next = !published;
    // Auto-Verpixelung (Welle 28): VOR dem Veröffentlichen prüfen, ob noch ungeprüfte
    // automatische Verpixelungen offen sind. Nur ein UI-Gate — der Server blockiert nie,
    // und die Prüfung selbst darf das Veröffentlichen niemals verhindern (fail-open).
    if (next) {
      setBusy(true);
      let unreviewed = 0;
      try {
        unreviewed = await countUnreviewedBlurSteps(tutorialId);
      } catch {
        unreviewed = 0;
      } finally {
        setBusy(false);
      }
      if (unreviewed > 0) {
        setBlurGate(unreviewed);
        return;
      }
    }
    await doPublish(next);
  }

  // Zielgruppe setzen. Regeln (unverändert seit Welle 20):
  //  - Hilfe-Seite ⇒ visibility public; Nur Team ⇒ internal.
  //  - Schulungsnachweis: bei Nur Team IMMER (implizit, in_lernen=false); bei Hilfe-Seite = in_lernen.
  async function applyAudience(nextPublic: boolean, nextLernen: boolean) {
    if (visBusy) return;
    const prevVis = visibility;
    const prevLernen = inLernen;
    // Optimistisch spiegeln (intern ⇒ Nachweis implizit, in_lernen zurückgesetzt).
    setVisibility(nextPublic ? "public" : "internal");
    setInLernen(nextPublic ? nextLernen : false);
    setVisBusy(true);
    try {
      await setTutorialAudience(tutorialId, { publicOn: nextPublic, lernenOn: nextLernen });
      toast.success(
        nextPublic
          ? nextLernen
            ? "Für die Hilfe-Seite – zusätzlich in den Schulungen mit Nachweis"
            : "Für die Hilfe-Seite"
          : "Nur für Ihr Team – in den Schulungen mit Nachweis",
      );
    } catch (e) {
      setVisibility(prevVis);
      setInLernen(prevLernen);
      toast.error(e instanceof Error ? e.message : "Sichtbarkeit konnte nicht geändert werden");
    } finally {
      setVisBusy(false);
    }
  }

  const setAudiencePublic = (nextPublic: boolean) => {
    if (nextPublic === publicOn) return;
    applyAudience(nextPublic, inLernen);
  };
  const toggleNachweis = () => applyAudience(true, !inLernen);

  // Nur Team ist Business. Wer (nach einem Downgrade) schon Nur Team hat, darf zurück.
  const teamLocked = !isBusiness && publicOn;

  return (
    <div className="mb-6">
      <Link
        href="/app"
        className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-muted-foreground transition-colors hover:text-ink"
      >
        <ChevronLeft className="size-4" /> Zurück
      </Link>

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
            aria-label="Titel der Anleitung"
            className="w-full rounded-md border border-ring bg-card px-2 py-0.5 text-[22px] font-black tracking-tight text-ink outline-none"
          />
        ) : (
          <div className="flex items-start gap-1.5">
            <h1 className="min-w-0 break-words text-[22px] font-black leading-tight tracking-tight text-ink">
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
        {/* Kurzbeschreibung: erscheint als Untertitel auf der Hilfe-Seiten-Karte. */}
        {descEditing ? (
          <input
            autoFocus
            value={desc}
            maxLength={160}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => {
              saveDescription();
              setDescEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setDesc(savedDesc);
                setDescEditing(false);
              }
            }}
            placeholder={
              publicOn
                ? "Kurzbeschreibung – erscheint unter dem Titel auf der Hilfe-Seite"
                : "Kurzbeschreibung – worum geht es in dieser Anleitung?"
            }
            aria-label="Kurzbeschreibung"
            className="mt-1 w-full rounded-md border border-ring bg-card px-2 py-0.5 text-sm text-ink-2 outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDesc(savedDesc);
              setDescEditing(true);
            }}
            className="group mt-0.5 flex max-w-full items-start gap-1.5 text-left"
            title="Kurzbeschreibung bearbeiten"
            data-testid="editor-description"
          >
            <span
              className={
                "min-w-0 break-words text-sm font-semibold " +
                (savedDesc ? "text-ink-2" : "text-muted-foreground italic")
              }
            >
              {savedDesc ||
                (publicOn
                  ? "Kurzbeschreibung ergänzen (erscheint auf der Hilfe-Seite)"
                  : "Kurzbeschreibung ergänzen …")}
            </span>
            <Pencil className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
      </div>

      {/* EINE Steuerzeile. Trenner sind Striche (nur ab sm), mobil bricht alles sauber um. */}
      <div
        className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2.5"
        data-testid="editor-controls"
      >
        <StatusSwitch
          on={published}
          onToggle={togglePublish}
          disabled={busy}
          busy={busy}
          className="text-[13px]"
          title={
            published
              ? "Ist veröffentlicht – antippen für Entwurf"
              : publicOn
                ? "Ist Entwurf – antippen, um auf der Hilfe-Seite zu veröffentlichen"
                : "Ist Entwurf – antippen, um für Ihr Team zu veröffentlichen"
          }
        />
        <ControlSep />

        <div
          role="radiogroup"
          aria-label="Wer sieht die Anleitung?"
          className="flex rounded-full bg-line-2 p-[3px]"
        >
          <SegmentButton
            active={publicOn}
            disabled={visBusy}
            onClick={() => setAudiencePublic(true)}
            icon={<Globe className="size-3.5" />}
            label="Hilfe-Seite"
            title="Erscheint (veröffentlicht) auf Ihrer Hilfe-Seite"
          />
          <SegmentButton
            active={!publicOn}
            disabled={visBusy || teamLocked}
            onClick={() => setAudiencePublic(false)}
            icon={<Lock className="size-3.5" />}
            label="Nur Team"
            title={
              teamLocked
                ? "„Nur Team“ ist im Business-Tarif enthalten"
                : "Nur für Ihr Team – in den Schulungen, mit Schulungsnachweis"
            }
          />
        </div>

        {publicOn && (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <StatusSwitch
                on={inLernen}
                onToggle={toggleNachweis}
                disabled={visBusy || !isBusiness}
                labelOn="Mit Schulungsnachweis"
                labelOff="Mit Schulungsnachweis"
                className="text-[12.5px]"
              />
            </TooltipTrigger>
            <TooltipContent>
              {!isBusiness
                ? "Schulungen mit Nachweis sind im Business-Tarif enthalten."
                : "Zusätzlich in den Schulungen Ihres Teams zeigen – mit Schulungsnachweis."}
            </TooltipContent>
          </Tooltip>
        )}
        {visBusy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />}
        <ControlSep />

        <CategoryPicker tutorialId={tutorialId} categories={categories} currentCategoryId={categoryId} />
        {/* „Gilt für Website" (Welle 31c): Basis-Domains, für die die Anleitung gilt. */}
        <SiteDomainsPicker tutorialId={tutorialId} initialDomains={siteDomains} />

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {languages.length > 0 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={translate}
                    disabled={trBusy}
                    className="relative"
                  />
                }
              >
                {trBusy ? <Loader2 className="size-4 animate-spin" /> : <Languages className="size-4" />}
                Übersetzen
                {stale && !trBusy && (
                  <span
                    aria-hidden
                    className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-500 ring-2 ring-card"
                  />
                )}
              </TooltipTrigger>
              <TooltipContent>
                {stale
                  ? "Übersetzungen sind veraltet oder unvollständig – jetzt aktualisieren."
                  : `Übersetzt automatisch nach ${languages.map((l) => LANG_LABEL[l]).join(", ")}. Knopf = manuell nachziehen.`}
              </TooltipContent>
            </Tooltip>
          )}
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

      {/* Auto-Verpixelung (Welle 28): Bestätigungs-Gate vor dem Veröffentlichen, wenn noch
          ungeprüfte automatische Verpixelungen offen sind. Serverseitig NICHT blockierend. */}
      <Dialog open={blurGate !== null} onOpenChange={(o) => { if (!o) setBlurGate(null); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ungeprüfte automatische Verpixelungen</DialogTitle>
            <DialogDescription>
              {blurGate === 1
                ? "1 Schritt enthält eine ungeprüfte automatische Verpixelung."
                : `${blurGate} Schritte enthalten ungeprüfte automatische Verpixelungen.`}{" "}
              Bitte prüfen Sie die markierten Stellen im Editor (verschieben, anpassen oder
              löschen), bevor Sie veröffentlichen — oder veröffentlichen Sie trotzdem. Die
              Verpixelungen werden in jedem Fall in die veröffentlichten Bilder eingebrannt.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setBlurGate(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                setBlurGate(null);
                doPublish(true);
              }}
            >
              Trotzdem veröffentlichen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Senkrechter Trenner in der Steuerzeile — nur ab sm (mobil bricht die Zeile ohnehin um). */
function ControlSep() {
  return <span aria-hidden className="hidden h-5 w-0.5 shrink-0 rounded-full bg-line sm:block" />;
}

/** Ein Feld des Segments „Hilfe-Seite | Nur Team". */
function SegmentButton({
  active,
  disabled,
  onClick,
  icon,
  label,
  title,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled && !active}
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "bg-card text-ink shadow-[0_1px_3px_rgba(51,41,31,0.12)]"
          : "text-ink-2 hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
