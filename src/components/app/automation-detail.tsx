"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Check,
  X,
  Trash2,
  Info,
  MousePointerClick,
  Type,
  ListChecks,
  ToggleRight,
  Globe,
  ChevronDown,
  Upload,
  Clock,
  Play,
  AlertTriangle,
} from "lucide-react";
import { signedImageUrl } from "@/lib/upload";
import type { Highlight, StepCondition } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RunStatusBadge } from "@/components/app/automation-run-status";
import { relativeDe } from "@/lib/format";
import type { AutomationParam, AutomationSchedule, ScheduleFreq } from "@/lib/automations";
import {
  renameAutomation,
  updateAutomationParams,
  deleteAutomation,
  setAutomationSchedule,
  setAutomationStepCondition,
  markAutomationStepOptional,
} from "@/app/app/automationen/actions";

export type AutomationStepView = {
  id: string;
  position: number;
  title: string;
  action: "click" | "fill" | "select" | "toggle" | "upload";
  paramKey: string | null;
  imagePath: string | null;
  // Markierungen des Aufnahme-Schritts (Welle 37) — Overlay auf dem Referenz-Screenshot.
  // Bestands-Automationen haben []; dann wird kein Overlay gezeichnet.
  highlights: Highlight[];
  // Datei-Brücke (Welle 39): Download-Schritt liefert eine Datei (key), Upload-Schritt
  // verbraucht sie (source=key eines vorherigen Download-Schritts). null = normaler Schritt.
  fileMeta:
    | { role: "download"; key: string; filename?: string }
    | { role: "upload"; source: string; filename?: string }
    | null;
  // Bedingte Schritte (Welle 42): Ausführ-Bedingung {kind:element|url, …} | null. Der Lauf
  // führt den Schritt nur aus, wenn sie zutrifft; sonst wird er nahtlos übersprungen.
  condition: StepCondition | null;
};

export type AutomationRunView = {
  id: string;
  status: string;
  mode: string;
  // Auslöser (Welle 41): geplant (Wecker) vs. manuell (Panel).
  trigger: "manual" | "scheduled";
  startedAt: string;
  finishedAt: string | null;
  detail: string | null;
};

// Wochentag-Auswahl. Werte folgen der JS-Konvention (0=Sonntag) — deckungsgleich mit
// nextFireTime (getUTCDay) in der Extension.
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Montag" },
  { value: 2, label: "Dienstag" },
  { value: 3, label: "Mittwoch" },
  { value: 4, label: "Donnerstag" },
  { value: 5, label: "Freitag" },
  { value: 6, label: "Samstag" },
  { value: 0, label: "Sonntag" },
];
const MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Kanonische Signatur zum Erkennen ungespeicherter Änderungen. Ausgeschaltete Zeitpläne
// (enabled=false oder null) gelten als gleich — dann sind die übrigen Felder irrelevant.
function scheduleSig(s: AutomationSchedule | null): string {
  if (!s || !s.enabled) return "off";
  return s.freq === "weekly"
    ? `w:${s.weekday}:${s.hour}:${s.minute}`
    : `m:${s.day}:${s.hour}:${s.minute}`;
}

const ACTION_META: Record<
  AutomationStepView["action"],
  { label: string; Icon: typeof MousePointerClick }
> = {
  click: { label: "Klick", Icon: MousePointerClick },
  fill: { label: "Ausfüllen", Icon: Type },
  select: { label: "Auswählen", Icon: ListChecks },
  toggle: { label: "Umschalten", Icon: ToggleRight },
  upload: { label: "Datei hochladen", Icon: Upload },
};

const MODE_LABEL: Record<string, string> = {
  semi: "Halbautomatisch",
  auto: "Automatisch",
};

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "läuft …";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "–";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60} s`;
}

export function AutomationDetail({
  id,
  title,
  siteDomains,
  params,
  steps,
  runs,
  schedule,
}: {
  id: string;
  title: string;
  siteDomains: string[];
  params: AutomationParam[];
  steps: AutomationStepView[];
  runs: AutomationRunView[];
  schedule: AutomationSchedule | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ── Zeitplan (Welle 41) ──────────────────────────────────────────────────────
  const [schedEnabled, setSchedEnabled] = useState(schedule?.enabled ?? false);
  const [schedFreq, setSchedFreq] = useState<ScheduleFreq>(schedule?.freq ?? "weekly");
  const [schedWeekday, setSchedWeekday] = useState<number>(schedule?.weekday ?? 1);
  const [schedDay, setSchedDay] = useState<number>(schedule?.day ?? 1);
  const [schedHour, setSchedHour] = useState<number>(schedule?.hour ?? 8);
  const [schedMinute, setSchedMinute] = useState<number>(schedule?.minute ?? 0);
  const [savedSchedule, setSavedSchedule] = useState<AutomationSchedule | null>(schedule);

  const currentSchedule: AutomationSchedule =
    schedFreq === "weekly"
      ? { enabled: schedEnabled, freq: "weekly", weekday: schedWeekday, hour: schedHour, minute: schedMinute }
      : { enabled: schedEnabled, freq: "monthly", day: schedDay, hour: schedHour, minute: schedMinute };
  const scheduleDirty = scheduleSig(currentSchedule) !== scheduleSig(savedSchedule);
  const requiredParams = params.filter((p) => p.required);

  function saveSchedule() {
    // Ausgeschaltet → Zeitplan aus der DB entfernen (null); sonst das validierte Objekt.
    const toSave = schedEnabled ? currentSchedule : null;
    startTransition(async () => {
      try {
        await setAutomationSchedule(id, toSave);
        setSavedSchedule(toSave);
        toast.success(schedEnabled ? "Zeitplan gespeichert" : "Zeitplan entfernt");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  // Titel inline editierbar.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(title);
  const [currentTitle, setCurrentTitle] = useState(title);

  // Parameter-Tabelle (lokaler Bearbeitungszustand, „Speichern“ persistiert).
  const [paramState, setParamState] = useState<AutomationParam[]>(params);
  const [savedParams, setSavedParams] = useState<AutomationParam[]>(params);
  const paramsDirty = JSON.stringify(paramState) !== JSON.stringify(savedParams);

  const [deleteOpen, setDeleteOpen] = useState(false);

  // Schritt-Vorschau: Klick klappt den Referenz-Screenshot auf (Richard, 06.07.:
  // Titel allein sind oft nicht selbsterklärend). Signierte URL lazy beim ersten
  // Aufklappen (privater Bucket), danach im State gecacht. null = Laden schlug fehl.
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const [stepImageUrls, setStepImageUrls] = useState<Record<string, string | null>>({});

  function toggleStep(s: AutomationStepView) {
    if (!s.imagePath) return;
    const next = openStepId === s.id ? null : s.id;
    setOpenStepId(next);
    if (next && stepImageUrls[s.id] === undefined) {
      signedImageUrl(s.imagePath)
        .then((u) => setStepImageUrls((m) => ({ ...m, [s.id]: u ?? null })))
        .catch(() => setStepImageUrls((m) => ({ ...m, [s.id]: null })));
    }
  }

  function saveTitle() {
    const clean = titleValue.trim();
    if (!clean || clean === currentTitle) {
      setEditingTitle(false);
      setTitleValue(currentTitle);
      return;
    }
    setEditingTitle(false);
    setCurrentTitle(clean);
    startTransition(async () => {
      try {
        await renameAutomation(id, clean);
        toast.success("Umbenannt");
      } catch (e) {
        setCurrentTitle(title);
        setTitleValue(title);
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function updateParam(index: number, patch: Partial<AutomationParam>) {
    setParamState((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    );
  }

  function saveParams() {
    startTransition(async () => {
      try {
        await updateAutomationParams(id, paramState);
        setSavedParams(paramState);
        toast.success("Parameter gespeichert");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  // Bedingte Schritte (Welle 42): condition an einem Schritt entfernen („immer ausführen"). Kein
  // vollwertiger Editor — Aufnahme/Builder sind der Setz-Weg; hier nur das Abschalten.
  function clearStepCondition(stepId: string) {
    startTransition(async () => {
      try {
        await setAutomationStepCondition(id, stepId, null);
        toast.success("Bedingung entfernt — der Schritt läuft immer.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  // Nachträglich „nur wenn vorhanden" (Welle 42, Nachtrag): Schritt optional machen —
  // nutzt den eigenen Selektor des Schritts (z. B. Cookie-Banner-Klick), ohne neu aufzunehmen.
  function markStepOptional(stepId: string) {
    startTransition(async () => {
      try {
        await markAutomationStepOptional(id, stepId);
        toast.success("Schritt läuft nur noch, wenn das Element da ist.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function remove() {
    setDeleteOpen(false);
    startTransition(async () => {
      try {
        await deleteAutomation(id);
        toast.success("Gelöscht");
        router.push("/app/automationen");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8" data-pending={pending}>
      <Link
        href="/app/automationen"
        className="inline-flex items-center gap-1.5 text-[13px] font-bold text-muted-foreground transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Automationen
      </Link>

      {/* Titel */}
      <div className="mt-4 flex items-start gap-2">
        {editingTitle ? (
          <div className="flex flex-1 items-center gap-2">
            <Input
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") {
                  setEditingTitle(false);
                  setTitleValue(currentTitle);
                }
              }}
              className="text-lg font-black"
            />
            <Button size="icon-sm" onClick={saveTitle} aria-label="Speichern">
              <Check className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                setEditingTitle(false);
                setTitleValue(currentTitle);
              }}
              aria-label="Abbrechen"
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <>
            <h1 className="flex-1 text-[22px] font-black leading-tight text-ink">
              {currentTitle || "Automation"}
            </h1>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                setTitleValue(currentTitle);
                setEditingTitle(true);
              }}
              aria-label="Umbenennen"
              className="mt-1 shrink-0 text-faint hover:text-ink"
            >
              <Pencil className="size-4" />
            </Button>
          </>
        )}
      </div>

      {siteDomains.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {siteDomains.map((d) => (
            <span
              key={d}
              className="flex items-center gap-1 rounded-full bg-secondary px-2 py-[3px] text-[11px] font-bold text-ink-2"
            >
              <Globe className="size-3" /> {d}
            </span>
          ))}
        </div>
      )}

      {/* Hinweis-Box */}
      <div className="mt-5 flex items-start gap-2.5 rounded-card border-2 border-line bg-secondary/60 px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-ink-2" />
        <p className="text-[13px] font-semibold text-ink-2">
          Ausgeführt wird über die Steply-Extension — Werte und Passwörter bleiben in Ihrem
          Browser.
        </p>
      </div>

      {/* Parameter */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-black uppercase tracking-[0.06em] text-faint">
            Parameter
          </h2>
          {paramsDirty && (
            <Button size="sm" onClick={saveParams} disabled={pending}>
              Speichern
            </Button>
          )}
        </div>

        {paramState.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-muted-foreground">
            Dieser Ablauf benötigt keine Eingaben — er besteht nur aus Klicks.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-line text-left text-[11px] font-extrabold uppercase tracking-wide text-faint">
                  <th className="pb-2 pr-3 font-extrabold">Schlüssel</th>
                  <th className="pb-2 pr-3 font-extrabold">Bezeichnung</th>
                  <th className="pb-2 pr-3 font-extrabold">Typ</th>
                  <th className="pb-2 font-extrabold">Pflicht</th>
                </tr>
              </thead>
              <tbody>
                {paramState.map((p, i) => (
                  <tr key={p.key} className="border-b border-line">
                    <td className="py-2 pr-3 align-middle">
                      <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-ink-2">
                        {p.key}
                      </code>
                    </td>
                    <td className="py-2 pr-3 align-middle">
                      <Input
                        value={p.label}
                        onChange={(e) => updateParam(i, { label: e.target.value })}
                        className="h-8 text-[13px]"
                      />
                    </td>
                    <td className="py-2 pr-3 align-middle">
                      <select
                        value={p.type}
                        onChange={(e) =>
                          updateParam(i, {
                            type: e.target.value as AutomationParam["type"],
                          })
                        }
                        className="h-8 rounded-lg border-2 border-line bg-card px-2 text-[13px] font-semibold text-ink outline-none focus-visible:border-ring"
                      >
                        <option value="text">Text</option>
                        <option value="secret">Geheim</option>
                      </select>
                    </td>
                    <td className="py-2 align-middle">
                      <input
                        type="checkbox"
                        checked={p.required}
                        onChange={(e) => updateParam(i, { required: e.target.checked })}
                        className="size-4 accent-primary"
                        aria-label={`${p.label} ist Pflichtfeld`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Zeitplan (Welle 41) */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-sm font-black uppercase tracking-[0.06em] text-faint">
            <Clock className="size-4" /> Zeitplan
          </h2>
          {scheduleDirty && (
            <Button size="sm" onClick={saveSchedule} disabled={pending}>
              Speichern
            </Button>
          )}
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={schedEnabled}
            onChange={(e) => setSchedEnabled(e.target.checked)}
            className="size-4 accent-primary"
          />
          <span className="text-sm font-bold text-ink">Automatisch ausführen</span>
        </label>

        {schedEnabled && (
          <div className="mt-4 space-y-4 rounded-card border-2 border-line bg-card px-4 py-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-faint">
                  Frequenz
                </span>
                <select
                  value={schedFreq}
                  onChange={(e) => setSchedFreq(e.target.value as ScheduleFreq)}
                  className="h-8 rounded-lg border-2 border-line bg-card px-2 text-[13px] font-semibold text-ink outline-none focus-visible:border-ring"
                >
                  <option value="weekly">wöchentlich</option>
                  <option value="monthly">monatlich</option>
                </select>
              </label>

              {schedFreq === "weekly" ? (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-faint">
                    Wochentag
                  </span>
                  <select
                    value={schedWeekday}
                    onChange={(e) => setSchedWeekday(Number(e.target.value))}
                    className="h-8 rounded-lg border-2 border-line bg-card px-2 text-[13px] font-semibold text-ink outline-none focus-visible:border-ring"
                  >
                    {WEEKDAYS.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-faint">
                    Tag im Monat
                  </span>
                  <select
                    value={schedDay}
                    onChange={(e) => setSchedDay(Number(e.target.value))}
                    className="h-8 rounded-lg border-2 border-line bg-card px-2 text-[13px] font-semibold text-ink outline-none focus-visible:border-ring"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}.
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-faint">
                  Uhrzeit
                </span>
                <div className="flex items-center gap-1">
                  <select
                    value={schedHour}
                    onChange={(e) => setSchedHour(Number(e.target.value))}
                    aria-label="Stunde"
                    className="h-8 rounded-lg border-2 border-line bg-card px-2 text-[13px] font-semibold text-ink outline-none focus-visible:border-ring"
                  >
                    {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                      <option key={h} value={h}>
                        {pad2(h)}
                      </option>
                    ))}
                  </select>
                  <span className="font-black text-faint">:</span>
                  <select
                    value={schedMinute}
                    onChange={(e) => setSchedMinute(Number(e.target.value))}
                    aria-label="Minute"
                    className="h-8 rounded-lg border-2 border-line bg-card px-2 text-[13px] font-semibold text-ink outline-none focus-visible:border-ring"
                  >
                    {MINUTE_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {pad2(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            </div>

            {/* Klartext-Vorschau */}
            <p className="text-[13px] font-bold text-ink">
              {schedFreq === "weekly"
                ? `Läuft jeden ${
                    WEEKDAYS.find((w) => w.value === schedWeekday)?.label ?? "Montag"
                  } um ${pad2(schedHour)}:${pad2(schedMinute)}`
                : `Läuft am ${schedDay}. jedes Monats um ${pad2(schedHour)}:${pad2(schedMinute)}`}
              <span className="font-semibold text-muted-foreground">
                {" "}
                — im Browser dieses Geräts, wenn Chrome geöffnet ist.
              </span>
            </p>
            {schedFreq === "monthly" && schedDay >= 29 && (
              <p className="text-xs font-semibold text-muted-foreground">
                In kürzeren Monaten läuft der Ablauf am letzten Tag des Monats.
              </p>
            )}
          </div>
        )}

        {/* Ehrlichkeits-Hinweis (Pflicht): geplante Läufe brauchen ein offenes Chrome + gemerkte Werte. */}
        <div className="mt-4 flex items-start gap-2.5 rounded-card border-2 border-amber-soft bg-amber-soft/40 px-4 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-text" />
          <div className="text-[13px] font-semibold text-ink-2">
            <p className="font-black text-ink">Damit ein geplanter Lauf startet, braucht es:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>die Steply-Erweiterung, mit diesem Konto verbunden;</li>
              <li>einen laufenden Rechner mit geöffnetem Chrome zur geplanten Zeit;</li>
              <li>
                alle Pflicht-Werte in der Erweiterung als „Im Browser merken“ gespeichert.
              </li>
            </ul>
            <p className="mt-1.5">
              Es gibt keinen Server-Automatismus — der Wecker läuft ausschließlich im Browser
              dieses Geräts.
            </p>
          </div>
        </div>

        {schedEnabled && requiredParams.length > 0 && (
          <div className="mt-3 flex items-start gap-2.5 rounded-card border-2 border-line bg-secondary/60 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-text" />
            <p className="text-[13px] font-semibold text-ink-2">
              Dieser Ablauf hat Pflicht-Eingaben ({requiredParams.map((p) => p.label).join(", ")}).
              Diese müssen in der Erweiterung einmal eingetragen und mit „Im Browser merken“
              gespeichert sein — die App sieht diese Werte nicht. Fehlt ein Pflicht-Wert, wird der
              geplante Lauf übersprungen (mit einer Meldung in der Erweiterung).
            </p>
          </div>
        )}
      </section>

      {/* Schritt-Vorschau */}
      <section className="mt-8">
        <h2 className="text-sm font-black uppercase tracking-[0.06em] text-faint">
          Schritte ({steps.length})
        </h2>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          Schritt anklicken zeigt den Screenshot aus der Aufnahme.
        </p>
        <ol className="mt-3 space-y-2">
          {steps.map((s) => {
            const meta = ACTION_META[s.action];
            const open = openStepId === s.id;
            const imageUrl = stepImageUrls[s.id];
            // Datei-Brücke (Welle 39): Download liefert eine Datei, Upload verbraucht die
            // Datei aus dem Download-Schritt mit passendem key.
            const uploadSource = s.fileMeta?.role === "upload" ? s.fileMeta.source : null;
            const uploadSourceNo = uploadSource
              ? steps.find(
                  (d) => d.fileMeta?.role === "download" && d.fileMeta.key === uploadSource,
                )?.position ?? null
              : null;
            return (
              <li
                key={s.id}
                className="rounded-card border-2 border-line bg-card"
              >
                <button
                  type="button"
                  onClick={() => toggleStep(s)}
                  disabled={!s.imagePath}
                  aria-expanded={open}
                  className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left ${
                    s.imagePath ? "cursor-pointer hover:bg-accent/30" : "cursor-default"
                  } ${open ? "rounded-t-card" : "rounded-card"}`}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-black text-ink-2">
                    {s.position}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">
                    {s.title || "Schritt"}
                  </span>
                  {s.paramKey && (
                    <code className="hidden shrink-0 rounded bg-accent px-1.5 py-0.5 font-mono text-[11px] text-accent-foreground sm:inline">
                      {s.paramKey}
                    </code>
                  )}
                  {s.fileMeta?.role === "download" && (
                    <span
                      className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-[3px] text-[11px] font-extrabold text-accent-foreground"
                      title={s.fileMeta.filename ? `Liefert „${s.fileMeta.filename}“` : "Liefert Datei"}
                    >
                      📥 liefert Datei
                    </span>
                  )}
                  {s.fileMeta?.role === "upload" && (
                    <span
                      className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-[3px] text-[11px] font-extrabold text-accent-foreground"
                      title={s.fileMeta.filename ? `Datei „${s.fileMeta.filename}“` : "Getragene Datei"}
                    >
                      📤 {uploadSourceNo ? `Datei aus Schritt ${uploadSourceNo}` : "Datei"}
                    </span>
                  )}
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-[3px] text-[11px] font-extrabold text-ink-2">
                    <meta.Icon className="size-3" /> {meta.label}
                  </span>
                  {s.imagePath && (
                    <ChevronDown
                      className={`size-4 shrink-0 text-faint transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  )}
                </button>
                {s.condition ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line px-3.5 py-2">
                    <span
                      className="flex items-center gap-1 rounded-full bg-secondary px-2 py-[3px] text-[11px] font-extrabold text-ink-2"
                      title={conditionChipTitle(s.condition)}
                    >
                      ⓸ nur wenn: {conditionChipLabel(s.condition)}
                    </span>
                    <button
                      type="button"
                      onClick={() => clearStepCondition(s.id)}
                      disabled={pending}
                      className="text-[11px] font-bold text-muted-foreground underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
                    >
                      immer ausführen
                    </button>
                  </div>
                ) : (
                  // Nachträglich optional machen — nur sinnvoll bei Schritten mit Element (Klick/Eingabe).
                  s.action !== "upload" && (
                    <div className="border-t border-line px-3.5 py-2">
                      <button
                        type="button"
                        onClick={() => markStepOptional(s.id)}
                        disabled={pending}
                        title="Diesen Schritt beim automatischen Ausführen überspringen, wenn sein Element gerade nicht da ist (z. B. Cookie-Banner)."
                        className="text-[11px] font-bold text-muted-foreground underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
                      >
                        ⓸ nur ausführen, wenn vorhanden
                      </button>
                    </div>
                  )
                )}
                {open && (
                  <div className="border-t-2 border-line bg-line-2/40 p-3">
                    {imageUrl === undefined ? (
                      <p className="text-xs font-semibold text-muted-foreground">
                        Screenshot wird geladen …
                      </p>
                    ) : imageUrl === null ? (
                      <p className="text-xs font-semibold text-muted-foreground">
                        Der Screenshot konnte nicht geladen werden.
                      </p>
                    ) : (
                      <StepScreenshot
                        url={imageUrl}
                        highlights={s.highlights}
                        alt={`Screenshot zu Schritt ${s.position}: ${s.title || "Schritt"}`}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* Lauf-Historie */}
      <section className="mt-8">
        <h2 className="text-sm font-black uppercase tracking-[0.06em] text-faint">
          Läufe
        </h2>
        {runs.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-muted-foreground">
            Noch keine Läufe. Starten Sie diesen Ablauf über die Steply-Extension.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {runs.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border-2 border-line bg-card px-3.5 py-2.5 text-[12.5px]"
              >
                <RunStatusBadge status={r.status} />
                <span
                  className="flex items-center gap-1 rounded-full bg-secondary px-2 py-[3px] text-[11px] font-extrabold text-ink-2"
                  title={r.trigger === "scheduled" ? "Vom Zeitplan ausgelöst" : "Von Hand gestartet"}
                >
                  {r.trigger === "scheduled" ? (
                    <>
                      <Clock className="size-3" /> geplant
                    </>
                  ) : (
                    <>
                      <Play className="size-3" /> manuell
                    </>
                  )}
                </span>
                <span className="font-bold text-ink-2">
                  {MODE_LABEL[r.mode] ?? r.mode}
                </span>
                <span className="text-faint">{formatDuration(r.startedAt, r.finishedAt)}</span>
                <span className="text-faint">{relativeDe(r.startedAt)}</span>
                {r.detail && (
                  <span className="w-full text-[12px] font-semibold text-muted-foreground">
                    {r.detail}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Löschen */}
      <section className="mt-10 border-t-2 border-line pt-6">
        <Button
          variant="ghost"
          onClick={() => setDeleteOpen(true)}
          className="text-destructive hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="size-4" /> Automation löschen
        </Button>
      </section>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Automation löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            „{currentTitle}“ wird mit allen Schritten und der Lauf-Historie dauerhaft
            gelöscht. Das kann nicht rückgängig gemacht werden.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Abbrechen
            </Button>
            <Button variant="destructive" disabled={pending} onClick={remove}>
              Endgültig löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

// Bedingte Schritte (Welle 42): kurze Chip-Beschriftung „Element „…"" bzw. „URL „…"".
function conditionChipLabel(c: StepCondition): string {
  const not = c.negate ? "NICHT " : "";
  if (c.kind === "url") return `${not}URL „${c.pattern}“`;
  const sel = c.selector.text || c.selector.role || c.selector.css || "Element";
  return `${not}Element „${sel}“`;
}
// Ausführlicher Titel (Tooltip) — ganze Aussage.
function conditionChipTitle(c: StepCondition): string {
  const not = c.negate ? "nicht " : "";
  if (c.kind === "url") {
    return `Dieser Schritt läuft nur, wenn die URL ${not}„${c.pattern}“ enthält — sonst wird er übersprungen.`;
  }
  const sel = c.selector.text || c.selector.role || c.selector.css || "das Element";
  return `Dieser Schritt läuft nur, wenn „${sel}“ ${not}auf der Seite vorhanden ist — sonst wird er übersprungen.`;
}

/** 0..1 auf Prozent des Bild-Rahmens abbilden (defensiv gegen Nicht-Zahlen). */
function boxStyle(h: Highlight): CSSProperties {
  const c = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
  return {
    left: `${c(h.x) * 100}%`,
    top: `${c(h.y) * 100}%`,
    width: `${c(h.w) * 100}%`,
    height: `${c(h.h) * 100}%`,
  };
}

/**
 * Referenz-Screenshot mit Markierungs-Overlay (Welle 37, Fix 4). GEOMETRIE: Die Prozent-Boxen
 * hängen an einem shrink-wrap-Container, der EXAKT das gerenderte Bild umschließt — das <img>
 * ist `block` (KEIN object-contain), also gibt es keinen Letterbox-Versatz, und die Boxen
 * skalieren rein über CSS mit dem Bild mit (keine Pixel-Messung nötig). Blur-Markierungen als
 * halbtransparente dunkle Box, alles andere als Koralle-Rahmen (Ellipse rund).
 */
function StepScreenshot({
  url,
  highlights,
  alt,
}: {
  url: string;
  highlights: Highlight[];
  alt: string;
}) {
  return (
    <div className="flex justify-center">
      <div className="relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className="block max-h-80 max-w-full rounded-lg border border-line" />
        {highlights.map((h) =>
          h.type === "blur" ? (
            <div
              key={h.id}
              className="pointer-events-none absolute rounded-md"
              style={{ ...boxStyle(h), backgroundColor: "rgba(17, 24, 39, 0.72)" }}
            />
          ) : (
            <div
              key={h.id}
              className="pointer-events-none absolute border-2 border-primary"
              style={{
                ...boxStyle(h),
                borderRadius: h.type === "ellipse" ? "50%" : "6px",
                ...(h.color ? { borderColor: h.color } : {}),
              }}
            />
          ),
        )}
      </div>
    </div>
  );
}
