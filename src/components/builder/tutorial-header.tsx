"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronLeft, Eye, Globe, Languages, Loader2, Lock, Pencil } from "lucide-react";
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
import { CategoryPicker } from "@/components/builder/category-picker";
import { DriftCheckButton } from "@/components/builder/drift-check-button";
import { setTutorialTitle, countUnreviewedBlurSteps } from "@/app/app/tutorials/[id]/actions";
import { translateTutorial } from "@/app/app/actions-translate";
import { publishTutorial, setTutorialAudience, unpublishTutorial } from "@/app/app/actions";
import { LANG_LABEL, type ExtraLang } from "@/lib/i18n-hub";
import type { TutorialVisibility } from "@/lib/types";

export function TutorialHeader({
  tutorialId,
  initialTitle,
  published: initialPublished,
  visibility: initialVisibility,
  inLernen: initialInLernen,
  isBusiness,
  categories,
  categoryId,
  languages,
  translationsStale,
}: {
  tutorialId: string;
  initialTitle: string;
  published: boolean;
  visibility: TutorialVisibility;
  inLernen: boolean;
  isBusiness: boolean;
  categories: { id: string; name: string }[];
  categoryId: string | null;
  languages: ExtraLang[];
  translationsStale: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [saved, setSaved] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [published, setPublished] = useState(initialPublished);
  const [visibility, setVisibility] = useState<TutorialVisibility>(initialVisibility);
  // Zwei Häkchen (Welle 20): „Auf der Hilfe-Seite" ⇔ public; „Im Lern-Bereich".
  // publicOn ist die Ableitung aus der Sichtbarkeit; lernenOn ist bei intern implizit an.
  const publicOn = visibility === "public";
  const [inLernen, setInLernen] = useState(initialInLernen);
  const [busy, setBusy] = useState(false);
  const [visBusy, setVisBusy] = useState(false);
  const [trBusy, setTrBusy] = useState(false);
  const [stale, setStale] = useState(translationsStale);
  // Auto-Schwärzung (Welle 28): Anzahl Schritte mit ungeprüften Blurs (>0 = Gate offen).
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

  // Der eigentliche Publish/Unpublish-Weg (Slug + Bilder in den öffentlichen Bucket bzw.
  // entfernen). Brennt Blur weiterhin serverseitig über ALLE Blurs (inkl. suggested) ein.
  async function doPublish(next: boolean) {
    setBusy(true);
    try {
      if (next) await publishTutorial(tutorialId);
      else await unpublishTutorial(tutorialId);
      setPublished(next);
      const liveMsg = !publicOn ? "Für das Team freigegeben" : "Tutorial ist jetzt live";
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
    // Auto-Schwärzung (Welle 28): VOR dem Veröffentlichen prüfen, ob noch ungeprüfte
    // automatische Schwärzungen offen sind. Nur ein UI-Gate — der Server blockiert nie,
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

  // Zielgruppe umschalten (Häkchen). Regeln:
  //  - „Auf der Hilfe-Seite" (publicOn): an ⇒ visibility public, aus ⇒ internal.
  //  - „Im Lern-Bereich" (lernenOn): bei intern IMMER an (implizit, disabled). Bei
  //    öffentlich = in_lernen.
  //  - Beide aus ist nicht erlaubt: das letzte aktive Häkchen bleibt gesetzt.
  async function applyAudience(nextPublic: boolean, nextLernen: boolean) {
    if (visBusy) return;
    // Hinweis: Ein „beide aus"-Zustand ist über die Häkchen NICHT erreichbar —
    // Haken1 aus ⇒ visibility internal (= Team sichtbar, Lernen implizit an),
    // Haken2 ist bei intern disabled-checked und lässt sich nicht abwählen.
    const prevVis = visibility;
    const prevLernen = inLernen;
    // Optimistisch spiegeln (intern ⇒ Lernen implizit an, in_lernen zurückgesetzt).
    setVisibility(nextPublic ? "public" : "internal");
    setInLernen(nextPublic ? nextLernen : false);
    setVisBusy(true);
    try {
      await setTutorialAudience(tutorialId, { publicOn: nextPublic, lernenOn: nextLernen });
      toast.success(
        nextPublic
          ? nextLernen
            ? "Sichtbar: Kunden + Team-Lernbereich"
            : "Sichtbar: Kunden (Hilfe-Seite)"
          : "Sichtbar: Team (Lern-Bereich)",
      );
    } catch (e) {
      setVisibility(prevVis);
      setInLernen(prevLernen);
      toast.error(e instanceof Error ? e.message : "Sichtbarkeit konnte nicht geändert werden");
    } finally {
      setVisBusy(false);
    }
  }

  // Klick auf „Auf der Hilfe-Seite" (Haken 1). Aus ⇒ intern (Lernen implizit).
  const togglePublic = () => applyAudience(!publicOn, inLernen);
  // Klick auf „Im Lern-Bereich" (Haken 2). Nur bei öffentlich wirksam (intern = disabled).
  const toggleLernen = () => applyAudience(publicOn, !inLernen);

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
                  : !publicOn
                    ? "Ist Entwurf – antippen zum Freigeben fürs Team"
                    : "Ist Entwurf – antippen zum Veröffentlichen"
              }
            >
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${published ? "bg-yes" : "bg-line"}`}>
                <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all ${published ? "left-[18px]" : "left-0.5"}`} />
              </span>
              <span className={published ? "font-medium text-ink" : "text-muted-foreground"}>
                {published ? (!publicOn ? "Freigegeben" : "Veröffentlicht") : "Entwurf"}
              </span>
              {busy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            </button>
            <span className="text-line">·</span>
            {/* Zielgruppe als zwei Häkchen (Welle 20): Kunden (Hilfe-Seite) und/oder
                Team-Lernbereich. Intern ⇒ Lernen implizit an (disabled-checked). */}
            <div role="group" aria-label="Sichtbarkeit" className="inline-flex items-center gap-2 text-sm">
              <AudienceCheckbox
                icon={<Globe className="size-3.5" />}
                label="Auf der Hilfe-Seite (Kunden)"
                checked={publicOn}
                disabled={visBusy}
                onToggle={togglePublic}
              />
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <AudienceCheckbox
                    icon={<Lock className="size-3.5" />}
                    label="Im Lern-Bereich (Team, mit Nachweis)"
                    checked={!publicOn ? true : inLernen}
                    // Bei intern implizit an und nicht abwählbar; ohne Business gesperrt.
                    disabled={visBusy || !publicOn || !isBusiness}
                    onToggle={toggleLernen}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {!isBusiness
                    ? "Der Lern-Bereich (Team-Schulung mit Nachweis) ist im Business-Tarif enthalten."
                    : !publicOn
                      ? "Interne Anleitungen sind immer im Lern-Bereich — nie auf der Hilfe-Seite."
                      : "Zusätzlich im Team-Lernbereich zeigen (mit Schulungsnachweis)."}
                </TooltipContent>
              </Tooltip>
              {visBusy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            </div>
            <span className="text-line">·</span>
            <CategoryPicker tutorialId={tutorialId} categories={categories} currentCategoryId={categoryId} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
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

      {/* Auto-Schwärzung (Welle 28): Bestätigungs-Gate vor dem Veröffentlichen, wenn noch
          ungeprüfte automatische Schwärzungen offen sind. Serverseitig NICHT blockierend. */}
      <Dialog open={blurGate !== null} onOpenChange={(o) => { if (!o) setBlurGate(null); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ungeprüfte automatische Schwärzungen</DialogTitle>
            <DialogDescription>
              {blurGate === 1
                ? "1 Schritt enthält eine ungeprüfte automatische Schwärzung."
                : `${blurGate} Schritte enthalten ungeprüfte automatische Schwärzungen.`}{" "}
              Bitte prüfen Sie die markierten Stellen im Editor (verschieben, anpassen oder
              löschen), bevor Sie veröffentlichen — oder veröffentlichen Sie trotzdem. Die
              Schwärzungen werden in jedem Fall in die veröffentlichten Bilder eingebrannt.
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

/** Häkchen für die Zielgruppen-Wahl (Welle 20): kleine Box + Label, Base-UI-frei. */
function AudienceCheckbox({
  icon,
  label,
  checked,
  disabled,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-muted-foreground transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
          checked ? "border-primary bg-primary text-white" : "border-line bg-card"
        }`}
      >
        {checked && <Check className="size-3" />}
      </span>
      <span className={`inline-flex items-center gap-1 ${checked ? "font-medium text-ink" : ""}`}>
        {icon} {label}
      </span>
    </button>
  );
}
