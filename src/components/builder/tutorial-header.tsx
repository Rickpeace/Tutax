"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BadgeCheck,
  Check,
  ChevronLeft,
  ExternalLink,
  Eye,
  Globe,
  Languages,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Send,
  ShieldQuestion,
  Sparkles,
  Undo2,
  Users,
} from "lucide-react";
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
import { SiteDomainsPicker } from "@/components/builder/site-domains-picker";
import { useDriftCheck } from "@/components/builder/drift-check-button";
import { IMPROVE_TEXTS_EVENT } from "@/components/builder/improve-texts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  setTutorialTitle,
  setTutorialDescription,
  listUnreviewedBlurSteps,
} from "@/app/app/tutorials/[id]/actions";
import { translateTutorial } from "@/app/app/actions-translate";
import { publishTutorial, setTutorialAudience, unpublishTutorial } from "@/app/app/actions";
import { LANG_NAME, type ExtraLang } from "@/lib/i18n-hub";
import { STABLE_LINK_HINT, copyText, hubTutorialUrl } from "@/lib/share-link";
import type { TutorialVisibility } from "@/lib/types";
import { GUIDE_DESCRIPTION_MAX, GUIDE_TITLE_MAX } from "@/lib/text-limits";
import { unwrap, errorText } from "@/lib/action-error";

/**
 * Kopf im Anleitungs-Editor (Welle 50d, Entwurf „App-Makeover" §4; Welle 54 umgebaut):
 *   Zurück · Titel (Stift) · Kurzbeschreibung
 *   EINE Steuerzeile: Zielgruppe als zwei unabhängige Chips „Hilfe-Seite (für alle)“ und
 *   „Team“ (+ fester Hinweis „mit Schulungsnachweis“, wenn Team an ist) | Kategorie- und
 *   Website-Pill — rechts „Vorschau“, dann „Veröffentlichen“ (Entwurf) bzw. das Etikett
 *   „✓ Veröffentlicht“, dann das „…“-Menü (dort auch „Zurück auf Entwurf“).
 * Die Aktionen sind unverändert: publishTutorial/unpublishTutorial und setTutorialAudience.
 * Abbildung der Chips auf die BESTEHENDEN Daten (keine Migration):
 *   nur Hilfe-Seite = visibility public + in_lernen false
 *   nur Team        = visibility internal
 *   beides          = visibility public + in_lernen true
 */
export function TutorialHeader({
  tutorialId,
  initialTitle,
  initialDescription,
  published: initialPublished,
  visibility: initialVisibility,
  inLernen: initialInLernen,
  isBusiness,
  isPro,
  categories,
  categoryId,
  siteDomains,
  languages,
  translationsStale,
  accountSlug,
  slug: initialSlug,
  hasSteps,
}: {
  tutorialId: string;
  initialTitle: string;
  initialDescription: string;
  published: boolean;
  visibility: TutorialVisibility;
  inLernen: boolean;
  isBusiness: boolean;
  /** Pro oder höher: „Team“ zusätzlich zur Hilfe-Seite (Schulungen mit Nachweis). */
  isPro: boolean;
  categories: { id: string; name: string }[];
  categoryId: string | null;
  siteDomains: string[];
  languages: ExtraLang[];
  translationsStale: boolean;
  /** Welle 51a: für „Link kopieren“ (/h/<accountSlug>/<slug>). */
  accountSlug: string;
  slug: string | null;
  /** Leere Anleitung: Übersetzen, Aktualität prüfen und Veröffentlichen sind gesperrt. */
  hasSteps: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [saved, setSaved] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  // Kurzbeschreibung (Untertitel auf der Hilfe-Seiten-Karte).
  const [desc, setDesc] = useState(initialDescription);
  const [savedDesc, setSavedDesc] = useState(initialDescription);
  const [descEditing, setDescEditing] = useState(false);
  const [published, setPublished] = useState(initialPublished);
  // Server-Stand übernehmen, wenn er sich ändert (z. B. automatisch auf Entwurf, nachdem der
  // Builder den letzten Schritt gelöscht und neu geladen hat) — sonst stünde hier weiter
  // „Veröffentlicht“. Muster „State bei Prop-Wechsel anpassen“ (ohne Effekt).
  const [serverPublished, setServerPublished] = useState(initialPublished);
  if (serverPublished !== initialPublished) {
    setServerPublished(initialPublished);
    setPublished(initialPublished);
  }
  const [visibility, setVisibility] = useState<TutorialVisibility>(initialVisibility);
  // Wer sieht die Anleitung? Zwei unabhängige Chips (mind. einer an):
  //   Hilfe-Seite ⇔ visibility public;  Team ⇔ internal ODER (public + in_lernen).
  const publicOn = visibility === "public";
  const [inLernen, setInLernen] = useState(initialInLernen);
  const teamOn = !publicOn || inLernen;
  const [busy, setBusy] = useState(false);
  const [visBusy, setVisBusy] = useState(false);
  const [trBusy, setTrBusy] = useState(false);
  const [stale, setStale] = useState(translationsStale);
  // Auto-Verpixelung (Welle 28): Schritte (Anzeigenamen) mit ungeprüften Verpixelungen (Gate offen).
  const [blurGate, setBlurGate] = useState<string[] | null>(null);
  // Slug entsteht beim ersten Veröffentlichen (ensureSlug) und bleibt danach gleich.
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const shareable = published && publicOn && !!slug;

  async function copyLink() {
    if (!slug) return;
    const url = hubTutorialUrl(accountSlug, slug);
    if (await copyText(url)) toast.success("Link kopiert", { description: url });
    else toast.error("Kopieren nicht möglich – bitte den Link über „Öffnen“ aufrufen.");
  }

  async function translate() {
    if (trBusy) return;
    setTrBusy(true);
    try {
      const res = await translateTutorial(tutorialId);
      setStale(false);
      const names = res.languages.map((l) => LANG_NAME[l]).join(", ");
      toast.success(names ? `Übersetzt in ${names}` : "Übersetzt");
    } catch (e) {
      toast.error(errorText(e, "Übersetzen fehlgeschlagen"));
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
      unwrap(await setTutorialTitle(tutorialId, t));
      setSaved(t);
      setTitle(t);
      toast.success("Titel gespeichert");
    } catch (e) {
      setTitle(saved);
      toast.error(errorText(e, "Titel konnte nicht gespeichert werden"));
    }
  }

  // Der eigentliche Veröffentlichen-Weg (Slug + Bilder in den öffentlichen Bucket bzw.
  // entfernen). Brennt Verpixelungen weiterhin serverseitig über ALLE Markierungen ein.
  async function doPublish(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        const res = unwrap(await publishTutorial(tutorialId));
        if ("slug" in res && res.slug) setSlug(res.slug);
      } else await unpublishTutorial(tutorialId);
      setPublished(next);
      const liveMsg = !publicOn
        ? "Veröffentlicht – für Ihr Team in den Schulungen"
        : teamOn
          ? "Veröffentlicht – auf der Hilfe-Seite und in den Schulungen Ihres Teams"
          : "Anleitung ist jetzt veröffentlicht";
      toast.success(next ? liveMsg : "Auf Entwurf gesetzt");
    } catch (e) {
      toast.error(errorText(e, "Status konnte nicht geändert werden"));
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish() {
    if (busy) return;
    const next = !published;
    // Leere Anleitung: Veröffentlichen gesperrt (Zurück auf Entwurf bleibt immer möglich).
    if (next && !hasSteps) return;
    // Auto-Verpixelung (Welle 28): VOR dem Veröffentlichen prüfen, ob noch ungeprüfte
    // automatische Verpixelungen offen sind. Nur ein UI-Gate — der Server blockiert nie,
    // und die Prüfung selbst darf das Veröffentlichen niemals verhindern (fail-open).
    if (next) {
      setBusy(true);
      let unreviewed: string[] = [];
      try {
        unreviewed = await listUnreviewedBlurSteps(tutorialId);
      } catch {
        unreviewed = [];
      } finally {
        setBusy(false);
      }
      if (unreviewed.length > 0) {
        setBlurGate(unreviewed);
        return;
      }
    }
    await doPublish(next);
  }

  // Zielgruppe setzen (Server-Regeln unverändert seit Welle 20):
  //  - Hilfe-Seite an ⇒ visibility public; aus ⇒ internal (nur Team).
  //  - Team neben Hilfe-Seite ⇒ in_lernen; bei nur Team implizit (in_lernen=false).
  async function applyAudience(nextPublic: boolean, nextLernen: boolean) {
    if (visBusy) return;
    const prevVis = visibility;
    const prevLernen = inLernen;
    // Optimistisch spiegeln (intern ⇒ Nachweis implizit, in_lernen zurückgesetzt).
    setVisibility(nextPublic ? "public" : "internal");
    setInLernen(nextPublic ? nextLernen : false);
    setVisBusy(true);
    try {
      unwrap(await setTutorialAudience(tutorialId, { publicOn: nextPublic, lernenOn: nextLernen }));
      toast.success(
        nextPublic
          ? nextLernen
            ? "Hilfe-Seite und Team – Ihr Team findet die Anleitung unter Schulungen"
            : "Nur auf der Hilfe-Seite (für alle)"
          : "Nur für Ihr Team – unter Schulungen, mit Schulungsnachweis",
      );
    } catch (e) {
      setVisibility(prevVis);
      setInLernen(prevLernen);
      toast.error(errorText(e, "Sichtbarkeit konnte nicht geändert werden"));
    } finally {
      setVisBusy(false);
    }
  }

  // Zwei unabhängige Chips; der LETZTE aktive lässt sich nicht abwählen (nie „nirgends sichtbar“).
  const toggleHelp = () => {
    if (publicOn && !teamOn) return; // letzter aktiver Chip
    if (helpLocked) return;
    if (publicOn) applyAudience(false, false); // beides → nur Team
    else applyAudience(true, true); // nur Team → beides
  };
  // „Team“ zusätzlich zur Hilfe-Seite (Schulungsnachweis) ist Pro (Tarifseite). Wer (nach einem
  // Downgrade) Team schon hat, darf es behalten/abwählen.
  const teamLocked = !isPro && !teamOn;
  // Hilfe-Seite abwählen hieße „nur Team“ (internal) — ebenfalls Business (Server-Gate).
  const helpLocked = !isBusiness && publicOn && teamOn;
  const toggleTeam = () => {
    if (teamOn && !publicOn) return; // letzter aktiver Chip
    if (teamLocked) return;
    applyAudience(true, !teamOn); // beides → nur Hilfe-Seite bzw. nur Hilfe-Seite → beides
  };
  const noSteps = !hasSteps;
  const drift = useDriftCheck(tutorialId);
  // „Übersetzung veraltet“ als kleiner Punkt am „…“-Knopf (vorher am Übersetzen-Knopf).
  const showStaleDot = languages.length > 0 && stale && !noSteps && !trBusy;

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
            maxLength={GUIDE_TITLE_MAX}
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
            maxLength={GUIDE_DESCRIPTION_MAX}
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
        {/* Zielgruppe: zwei unabhängige Chips (Mehrfachauswahl, mind. einer an). */}
        <div
          role="group"
          aria-label="Wer sieht die Anleitung?"
          aria-busy={visBusy || undefined}
          className="flex flex-wrap items-center gap-1.5"
          data-testid="audience-chips"
        >
          <AudienceChip
            active={publicOn}
            locked={(publicOn && !teamOn) || helpLocked}
            busy={visBusy}
            onClick={toggleHelp}
            icon={<Globe className="size-3.5" aria-hidden />}
            label="Hilfe-Seite (für alle)"
            hint={
              helpLocked
                ? "Anleitungen nur für Ihr Team sind im Business-Tarif enthalten."
                : publicOn && !teamOn
                ? "Mindestens eine Zielgruppe bleibt aktiv – schalten Sie zuerst „Team“ ein."
                : publicOn
                  ? "Erscheint auf Ihrer Hilfe-Seite – für alle sichtbar. Antippen, um sie nur für Ihr Team zu zeigen."
                  : "Zusätzlich auf Ihrer Hilfe-Seite zeigen – für alle sichtbar."
            }
          />
          <AudienceChip
            active={teamOn}
            locked={teamOn && !publicOn}
            disabled={teamLocked}
            busy={visBusy}
            onClick={toggleTeam}
            icon={<Users className="size-3.5" aria-hidden />}
            label="Team"
            hint={
              teamLocked
                ? "„Team“ (Schulungen mit Nachweis) ist ab dem Pro-Tarif enthalten."
                : teamOn && !publicOn
                  ? "Mindestens eine Zielgruppe bleibt aktiv – schalten Sie zuerst „Hilfe-Seite (für alle)“ ein."
                  : teamOn
                    ? "Ihr Team sieht die Anleitung unter Schulungen. Antippen, um sie nur auf der Hilfe-Seite zu zeigen."
                    : "Zusätzlich für Ihr Team unter Schulungen zeigen – mit Schulungsnachweis."
            }
          />
          {teamOn && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    tabIndex={0}
                    data-testid="training-proof-hint"
                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-1 text-[12px] font-bold text-violet-text outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                }
              >
                <BadgeCheck className="size-3.5" aria-hidden /> mit Schulungsnachweis
              </TooltipTrigger>
              <TooltipContent>
                Mitarbeiter finden die Anleitung unter Schulungen und bestätigen sie dort.
              </TooltipContent>
            </Tooltip>
          )}
          {visBusy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />}
        </div>
        <ControlSep />

        <CategoryPicker tutorialId={tutorialId} categories={categories} currentCategoryId={categoryId} />
        {/* „Gilt für Website" (Welle 31c): Basis-Domains, für die die Anleitung gilt. */}
        <SiteDomainsPicker tutorialId={tutorialId} initialDomains={siteDomains} />

        {/* Rechts nur „Vorschau“ + „…“ (Welle 53): seltene Aktionen im Menü, damit die
            Steuerzeile bei 1440 px nie umbricht und mobil weniger Knöpfe vor dem Ablauf stehen. */}
        <div className="flex items-center gap-2 sm:ml-auto">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/app/preview/${tutorialId}`} target="_blank" rel="noopener noreferrer" />}
          >
            <Eye className="size-4" /> Vorschau
          </Button>
          {published ? (
            // Veröffentlicht: Etikett statt Knopf; „Zurück auf Entwurf“ steht im „…“-Menü.
            <span
              data-testid="published-badge"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-teal-soft px-3 text-[0.8rem] font-extrabold text-teal-text"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
              )}
              Veröffentlicht
            </span>
          ) : (
            // Leere Anleitung: Veröffentlichen gesperrt, Hinweis „Erst Schritte anlegen“.
            <EmptyLock locked={noSteps}>
              <Button
                size="sm"
                onClick={togglePublish}
                disabled={busy || noSteps}
                data-testid="publish-button"
                title={
                  noSteps
                    ? undefined
                    : !publicOn
                      ? "Für Ihr Team unter Schulungen veröffentlichen"
                      : teamOn
                        ? "Auf der Hilfe-Seite und für Ihr Team veröffentlichen"
                        : "Auf der Hilfe-Seite veröffentlichen"
                }
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Veröffentlichen
              </Button>
            </EmptyLock>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="relative"
                  aria-label={
                    showStaleDot ? "Weitere Aktionen (Übersetzung veraltet)" : "Weitere Aktionen"
                  }
                  title="Weitere Aktionen"
                  data-testid="editor-more"
                />
              }
            >
              {trBusy || drift.pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MoreHorizontal className="size-4" />
              )}
              {showStaleDot && (
                <span
                  aria-hidden
                  data-testid="translation-stale-dot"
                  className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber ring-2 ring-card"
                />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {languages.length > 0 && (
                <DropdownMenuItem onClick={translate} disabled={noSteps || trBusy} className="items-start">
                  {trBusy ? <Loader2 className="mt-0.5 size-4 animate-spin" /> : <Languages className="mt-0.5 size-4" />}
                  <MenuText
                    label={trBusy ? "Übersetzt …" : "Übersetzen"}
                    hint={
                      noSteps
                        ? "Erst Schritte anlegen"
                        : stale
                          ? "Übersetzungen sind veraltet oder unvollständig – jetzt aktualisieren."
                          : `Wird automatisch übersetzt in: ${languages.map((l) => LANG_NAME[l]).join(", ")}. Klicken, um jetzt zu aktualisieren.`
                    }
                    dot={stale && !noSteps && !trBusy}
                  />
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={drift.run} disabled={noSteps || drift.pending || !isPro} className="items-start">
                {drift.pending ? (
                  <Loader2 className="mt-0.5 size-4 animate-spin" />
                ) : (
                  <ShieldQuestion className="mt-0.5 size-4" />
                )}
                <MenuText
                  label={drift.pending ? "Prüft …" : "Aktualität prüfen"}
                  hint={
                    !isPro
                      ? "Ab Pro – prüft per KI, ob die Anleitung noch zur Website passt"
                      : noSteps
                        ? "Erst Schritte anlegen"
                        : "Prüft per KI, ob die Anleitung noch zur Website passt"
                  }
                />
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => window.dispatchEvent(new Event(IMPROVE_TEXTS_EVENT))}
                disabled={noSteps || !isPro}
                className="items-start"
                data-testid="menu-improve-texts"
              >
                <Sparkles className="mt-0.5 size-4" />
                <MenuText
                  label="Texte mit KI verbessern"
                  hint={
                    !isPro
                      ? "Ab Pro – formuliert Titel und Texte natürlicher"
                      : noSteps
                        ? "Erst Schritte anlegen"
                        : "Formuliert Titel und Texte natürlicher – Sie sehen vorher jeden Vorschlag"
                  }
                />
              </DropdownMenuItem>
              {shareable && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={copyLink} data-testid="copy-link" className="items-start">
                    <Link2 className="mt-0.5 size-4" />
                    <MenuText label="Link zur Hilfe-Seite kopieren" hint={STABLE_LINK_HINT} />
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    render={
                      <a
                        href={`/h/${accountSlug}/${slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="open-help-page"
                      />
                    }
                  >
                    <ExternalLink className="size-4" /> Auf der Hilfe-Seite öffnen
                  </DropdownMenuItem>
                </>
              )}
              {published && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={togglePublish}
                    disabled={busy}
                    data-testid="unpublish"
                    className="items-start"
                  >
                    <Undo2 className="mt-0.5 size-4" />
                    <MenuText
                      label="Zurück auf Entwurf"
                      hint={
                        !publicOn
                          ? "Verschwindet aus den Schulungen, bis Sie wieder veröffentlichen."
                          : teamOn
                            ? "Verschwindet von der Hilfe-Seite und aus den Schulungen, bis Sie wieder veröffentlichen."
                            : "Verschwindet von der Hilfe-Seite, bis Sie wieder veröffentlichen."
                      }
                    />
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Auto-Verpixelung (Welle 28): Bestätigungs-Gate vor dem Veröffentlichen, wenn noch
          ungeprüfte automatische Verpixelungen offen sind. Serverseitig NICHT blockierend. */}
      <Dialog open={blurGate !== null} onOpenChange={(o) => { if (!o) setBlurGate(null); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ungeprüfte automatische Verpixelungen</DialogTitle>
            <DialogDescription>
              {blurGate?.length === 1
                ? "1 Schritt enthält eine ungeprüfte automatische Verpixelung."
                : `${blurGate?.length ?? 0} Schritte enthalten ungeprüfte automatische Verpixelungen.`}{" "}
              Bitte prüfen Sie die markierten Stellen im Editor (verschieben, anpassen oder
              löschen), bevor Sie veröffentlichen — oder veröffentlichen Sie trotzdem. Die
              Verpixelungen werden in jedem Fall in die veröffentlichten Bilder eingebrannt.
            </DialogDescription>
          </DialogHeader>
          {blurGate && blurGate.length > 0 && (
            <ul
              className="max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-sm text-ink-2"
              data-testid="blur-gate-steps"
            >
              {blurGate.map((name, i) => (
                <li key={`${i}:${name}`} className="break-words">
                  {name}
                </li>
              ))}
            </ul>
          )}
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

/**
 * Gesperrtes Bedienelement bei leerer Anleitung: Hinweis „Erst Schritte anlegen“ als Tooltip.
 * Der Auslöser ist ein Span, weil deaktivierte Knöpfe selbst keine Maus-Ereignisse melden.
 */
function EmptyLock({ locked, children }: { locked: boolean; children: React.ReactNode }) {
  if (!locked) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" tabIndex={0} data-testid="empty-lock" />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>Erst Schritte anlegen</TooltipContent>
    </Tooltip>
  );
}

/** Zweizeiliger Menüeintrag: Aktion + kurze Erklärung (ersetzt die Tooltips der Knöpfe). */
function MenuText({ label, hint, dot }: { label: string; hint: string; dot?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex items-center gap-1.5 font-bold">
        {label}
        {dot && <span aria-label="veraltet" className="size-2 rounded-full bg-amber" />}
      </span>
      <span className="text-xs font-normal text-muted-foreground">{hint}</span>
    </span>
  );
}

/** Senkrechter Trenner in der Steuerzeile — nur ab sm (mobil bricht die Zeile ohnehin um). */
function ControlSep() {
  return <span aria-hidden className="hidden h-5 w-0.5 shrink-0 rounded-full bg-line sm:block" />;
}

/**
 * Ein Zielgruppen-Chip (Welle 54): Umschaltknopf mit aria-pressed. `locked` = letzter aktiver
 * Chip (nicht abwählbar), `disabled` = Tarif-Sperre. Beides über aria-disabled statt disabled,
 * damit der Tooltip mit der Begründung auch dann erscheint (Maus UND Tastatur-Fokus).
 */
function AudienceChip({
  active,
  locked,
  disabled,
  busy,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  locked?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  const inert = locked || disabled || busy;
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-pressed={active}
        aria-disabled={inert || undefined}
        onClick={() => {
          if (!inert) onClick();
          // Gesperrt: Begründung auch per Klick/Tippen zeigen (Tooltip schließt beim Klick,
          // Touch-Geräte haben keinen Hover).
          else if (!busy) toast(hint, { id: "audience-locked" });
        }}
        data-active={active}
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border-2 px-3 text-[12.5px] font-extrabold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
          active
            ? "border-teal bg-teal-soft text-teal-text"
            : "border-line bg-card text-ink-2 hover:border-[#e3d7c2] hover:text-ink"
        } ${disabled ? "cursor-not-allowed opacity-50" : locked ? "cursor-default" : ""}`}
      >
        {active ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : icon}
        {label}
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
