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
} from "lucide-react";
import { signedImageUrl } from "@/lib/upload";
import type { Highlight } from "@/lib/types";
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
import type { AutomationParam } from "@/lib/automations";
import {
  renameAutomation,
  updateAutomationParams,
  deleteAutomation,
} from "@/app/app/automationen/actions";

export type AutomationStepView = {
  id: string;
  position: number;
  title: string;
  action: "click" | "fill" | "select" | "toggle";
  paramKey: string | null;
  imagePath: string | null;
  // Markierungen des Aufnahme-Schritts (Welle 37) — Overlay auf dem Referenz-Screenshot.
  // Bestands-Automationen haben []; dann wird kein Overlay gezeichnet.
  highlights: Highlight[];
};

export type AutomationRunView = {
  id: string;
  status: string;
  mode: string;
  startedAt: string;
  finishedAt: string | null;
  detail: string | null;
};

const ACTION_META: Record<
  AutomationStepView["action"],
  { label: string; Icon: typeof MousePointerClick }
> = {
  click: { label: "Klick", Icon: MousePointerClick },
  fill: { label: "Ausfüllen", Icon: Type },
  select: { label: "Auswählen", Icon: ListChecks },
  toggle: { label: "Umschalten", Icon: ToggleRight },
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
}: {
  id: string;
  title: string;
  siteDomains: string[];
  params: AutomationParam[];
  steps: AutomationStepView[];
  runs: AutomationRunView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
