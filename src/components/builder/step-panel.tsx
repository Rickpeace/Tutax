"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, GitBranch, Save, ChevronLeft, ChevronRight, ChevronDown, ArrowRight, ArrowUp, ArrowDown, X, Check, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RichText } from "@/components/builder/rich-text";
import { StatusSwitch } from "@/components/app/status-switch";
import { ImageField } from "@/components/builder/image-field";
import type { Step, StepBranch, Highlight, StepCondition } from "@/lib/types";

export function StepPanel({
  step,
  tutorialId,
  allSteps,
  branches,
  index,
  total,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  canMoveUp,
  canMoveDown,
  onMove,
  onSaveStep,
  onDirtyChange,
  hasSourceVideo = false,
  onSetImage,
  onRemoveImage,
  onSetHighlights,
  onSetDecision,
  onSetCondition,
  onAddBranch,
  onUpdateBranch,
  onDeleteBranch,
  onDeleteStep,
  onOpenStep,
  onInsertIntoBranch,
  onDuplicateImage,
  onClose,
  stepLabel,
}: {
  step: Step;
  tutorialId: string;
  allSteps: Step[];
  branches: StepBranch[];
  hasSourceVideo?: boolean;
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (id: string, dir: "up" | "down") => void;
  onSaveStep: (id: string, patch: { title: string; body: unknown }) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onSetImage: (
    id: string,
    img: {
      image_path: string | null;
      image_width: number | null;
      image_height: number | null;
    },
  ) => void;
  onRemoveImage?: (id: string) => void;
  onSetHighlights: (id: string, highlights: Highlight[]) => void;
  onSetDecision: (id: string, isDecision: boolean) => void;
  onSetCondition: (id: string, condition: StepCondition | null) => void;
  onAddBranch: (stepId: string) => void;
  onUpdateBranch: (
    branchId: string,
    patch: { label?: string; target_step_id?: string | null },
  ) => void;
  onDeleteBranch: (branchId: string) => void;
  onDeleteStep: (id: string) => void;
  onOpenStep: (id: string) => void;
  onInsertIntoBranch: (branchId: string) => void;
  /** Welle 51a: neuen Schritt direkt danach mit demselben Bild anlegen. */
  onDuplicateImage?: (stepId: string) => void;
  onClose?: () => void;
  /** Anzeigename eines Schritts: Titel, sonst „Schritt N“ (N = Nummer im Ablauf). */
  stepLabel: (s: Step) => string;
}) {
  const [title, setTitle] = useState(step.title ?? "");
  const [body, setBody] = useState<unknown>(step.body ?? null);
  const [dirty, setDirty] = useState(false);
  const [rtKey, setRtKey] = useState(0);
  const [pendingNav, setPendingNav] = useState<null | { run: () => void; label: string }>(null);

  // Eltern (Builder) über ungespeicherte Änderungen informieren (Schließen-Abfrage).
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  async function save(): Promise<boolean> {
    try {
      await onSaveStep(step.id, { title, body });
      setDirty(false);
      toast.success("Schritt gespeichert");
      return true;
    } catch {
      /* Fehler-Toast + Reload kommen aus dem Builder (persist); "Ungespeichert" bleibt stehen */
      return false;
    }
  }
  function discard() {
    setTitle(step.title ?? "");
    setBody(step.body ?? null);
    setRtKey((k) => k + 1);
    setDirty(false);
  }

  // Navigieren (Vor/Zurück oder zu einer Verzweigung): bei ungespeicherten Änderungen
  // erst fragen (Abbrechen / Verwerfen / Speichern).
  function guardedNav(run: () => void, label: string) {
    if (dirty) setPendingNav({ run, label });
    else run();
  }

  const targetOptions = allSteps.filter((s) => s.id !== step.id);

  // Frage-Toggle: beim Ausschalten mit mehreren Antworten warnen (alle außer der ersten
  // werden entfernt -> Folge-Schritte anderer Antworten sind dann nicht mehr verbunden).
  function toggleDecision() {
    const turningOff = step.is_decision;
    if (turningOff && branches.length > 1) {
      const ok = confirm(
        "Alle Antworten außer der ersten werden entfernt – Folge-Schritte anderer Antworten sind dann nicht mehr verbunden. Fortfahren?",
      );
      if (!ok) return;
    }
    onSetDecision(step.id, !step.is_decision);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 border-b border-line-2 bg-card/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-1">
          {onClose && (
            <Button variant="ghost" size="icon-sm" onClick={onClose} title="Editor schließen" aria-label="Editor schließen">
              <X className="size-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" disabled={!hasPrev} onClick={() => guardedNav(onPrev, "zurück")} title="Vorheriger Schritt" aria-label="Vorheriger Schritt">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">
            {index >= 0 ? `${index + 1} / ${total}` : ""}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => guardedNav(onNext, "weiter")} title={hasNext ? "Nächster Schritt" : "Neuen Schritt anlegen"} aria-label={hasNext ? "Nächster Schritt" : "Neuen Schritt anlegen"}>
            {hasNext ? <ChevronRight className="size-4" /> : <Plus className="size-4" />}
          </Button>
          <span className="mx-0.5 h-4 w-px bg-line-2" aria-hidden />
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!canMoveUp}
            onClick={() => onMove(step.id, "up")}
            title={canMoveUp ? "Schritt nach oben" : "Bei Verzweigungen bitte über die Antwort-Ziele umhängen"}
            aria-label="Schritt nach oben"
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!canMoveDown}
            onClick={() => onMove(step.id, "down")}
            title={canMoveDown ? "Schritt nach unten" : "Bei Verzweigungen bitte über die Antwort-Ziele umhängen"}
            aria-label="Schritt nach unten"
          >
            <ArrowDown className="size-4" />
          </Button>
        </div>
        {/* EIN Zustand statt „Gespeichert" neben ausgegrautem „Speichern": ohne Änderungen
            nur ein ruhiger Haken, mit Änderungen die beiden Knöpfe (Welle 50d). */}
        <div className="flex items-center gap-2" data-testid="step-save-state">
          {dirty ? (
            <>
              <Button variant="ghost" size="sm" onClick={discard}>
                Verwerfen
              </Button>
              <Button size="sm" onClick={save} title="Änderungen an Titel und Erklärtext speichern">
                <Save className="size-4" /> Speichern
              </Button>
            </>
          ) : (
            <span
              className="flex items-center gap-1 text-xs font-bold text-muted-foreground"
              title="Titel und Erklärtext sind gespeichert. Bild, Markierungen und Einstellungen speichern sofort."
            >
              <Check className="size-3.5 text-teal" /> Gespeichert
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="step-title">Titel (optional)</Label>
        <Input
          id="step-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          placeholder="z. B. App öffnen"
        />
      </div>

      {/* Reihenfolge (Welle 53): Titel → Erklärtext → Screenshot → Frage → Erweitert. */}
      <div className="space-y-1.5">
        <Label id={`body-label-${step.id}`}>Erklärtext</Label>
        <RichText
          key={rtKey}
          labelledBy={`body-label-${step.id}`}
          value={body}
          onChange={(json) => {
            setBody(json);
            setDirty(true);
          }}
        />
      </div>

      <ImageField
        tutorialId={tutorialId}
        stepId={step.id}
        imagePath={step.image_path}
        highlights={step.highlights ?? []}
        videoTime={step.video_time}
        hasSourceVideo={hasSourceVideo}
        onSetImage={onSetImage}
        onSetHighlights={onSetHighlights}
        onRemoveImage={onRemoveImage}
        onDuplicateImage={
          onDuplicateImage ? () => guardedNav(() => onDuplicateImage(step.id), "weiter") : undefined
        }
      />

      {/* Frage/Verzweigung: derselbe Schalter wie überall (StatusSwitch), die Karte bleibt
          neutral — nur ein dezenter Rand zeigt den aktiven Zustand. */}
      <div
        className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
          step.is_decision ? "border-primary/30 bg-card" : "border-border bg-card"
        }`}
      >
        <GitBranch
          aria-hidden
          className={step.is_decision ? "size-5 text-primary" : "size-5 text-muted-foreground"}
        />
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">Frage / Verzweigung</div>
          <div className="text-xs text-muted-foreground">
            {step.is_decision
              ? "Dieser Schritt verzweigt je nach Antwort."
              : "Linearer Schritt. Einschalten, um zu verzweigen."}
          </div>
        </div>
        <StatusSwitch
          on={step.is_decision}
          onToggle={toggleDecision}
          labelOn="Frage / Verzweigung"
          labelOff="Frage / Verzweigung"
          className="[&>span:last-child]:sr-only"
        />
      </div>

      {step.is_decision && (
        <div className="space-y-2">
          <Label>Antwort-Optionen</Label>
          {branches.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Noch keine Antworten. Fügen Sie z. B. „Ja“ und „Nein“ hinzu.
            </p>
          )}
          {branches
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((b) => (
              <BranchRow
                key={b.id}
                branch={b}
                targetOptions={targetOptions}
                onUpdate={onUpdateBranch}
                onDelete={onDeleteBranch}
                stepLabel={stepLabel}
                onGo={() =>
                  guardedNav(
                    () => (b.target_step_id ? onOpenStep(b.target_step_id) : onInsertIntoBranch(b.id)),
                    "weiter",
                  )
                }
              />
            ))}
          <Button variant="outline" size="sm" onClick={() => onAddBranch(step.id)}>
            <Plus className="size-4" /> Antwort-Option
          </Button>
        </div>
      )}

      {/* Nur für Automationen (Bedingung, Sprung) — der Mensch ignoriert es, darum eingeklappt. */}
      {!step.is_decision && <AdvancedSection step={step} onSetCondition={onSetCondition} />}

      <div className="border-t border-line-2 pt-4">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (confirm("Diesen Schritt mit allen Inhalten wirklich löschen?")) onDeleteStep(step.id);
          }}
        >
          <Trash2 className="size-4" /> Schritt löschen
        </Button>
      </div>

      <Dialog open={pendingNav !== null} onOpenChange={(o) => { if (!o) setPendingNav(null); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Noch nicht gespeichert</DialogTitle>
            <DialogDescription>
              Dieser Schritt hat Änderungen, die noch nicht gespeichert sind. Was möchten Sie tun?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button variant="ghost" onClick={() => setPendingNav(null)}>Abbrechen</Button>
            <Button
              variant="outline"
              onClick={() => { const p = pendingNav; setPendingNav(null); discard(); p?.run(); }}
            >
              Verwerfen &amp; {pendingNav?.label ?? "weiter"}
            </Button>
            <Button
              onClick={async () => {
                const p = pendingNav;
                // Erst speichern; nur bei Erfolg navigieren (sonst Dialog offen lassen).
                if (await save()) {
                  setPendingNav(null);
                  p?.run();
                }
              }}
            >
              Speichern &amp; {pendingNav?.label ?? "weiter"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * „Erweitert (für Automationen)" (Welle 50d): Bedingung und Sprung gelten nur beim
 * automatischen Ausführen. Standardmäßig eingeklappt; ein Etikett im Kopf zeigt, dass
 * trotzdem etwas eingestellt ist.
 */
function AdvancedSection({
  step,
  onSetCondition,
}: {
  step: Step;
  onSetCondition: (id: string, condition: StepCondition | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // Eine „URL enthält“-Bedingung ohne Muster ist noch nicht eingerichtet -> nicht als aktiv zählen.
  const condActive =
    !!step.condition && !(step.condition.kind === "url" && !step.condition.pattern.trim());
  const active = [condActive ? "Bedingung" : null, step.jump ? "Sprung" : null].filter(Boolean);
  return (
    <div className="rounded-lg border border-border bg-card" data-testid="step-advanced">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Zap className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm font-semibold text-ink">Erweitert (für Automationen)</span>
        {active.length > 0 && (
          <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-extrabold text-teal-text">
            {active.join(" + ")} aktiv
          </span>
        )}
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line-2 px-3 pb-3 pt-3">
          <ConditionField step={step} onSetCondition={onSetCondition} />
          {step.jump && (
            <p className="text-xs text-muted-foreground">
              Dieser Schritt hat einen Sprung für Automationen (überspringt bei zutreffender
              Bedingung einen Block). Sie ändern ihn in der Automation unter „Automationen“.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Bedingte Schritte (Welle 42): kompaktes Feld „nur ausführen, wenn …" je Schritt. RELEVANT NUR
 * für Automationen (der Mensch in der Führung ignoriert es). MVP: Element vorhanden (nutzt den
 * Selektor des Schritts, nur wenn vorhanden) ODER URL enthält (Teilstring/Glob), plus „umkehren".
 * KEIN vollwertiger Editor — die Aufnahme ist der Hauptweg. is_decision-Schritte lassen wir aus
 * (das ist der volle Verzweigungsbaum, später).
 */
function ConditionField({
  step,
  onSetCondition,
}: {
  step: Step;
  onSetCondition: (id: string, condition: StepCondition | null) => void;
}) {
  const cond = step.condition;
  const enabled = !!cond;
  const kind: "element" | "url" = cond?.kind ?? (step.selector ? "element" : "url");
  const hasSelector = !!step.selector;
  const negate = cond?.negate === true;
  const savedPattern = cond?.kind === "url" ? cond.pattern : "";
  // Muster lokal tippen; gespeichert wird entprellt bzw. spätestens beim Verlassen des Felds —
  // nicht mehr bei jedem Tastendruck (jede Speicherung war ein Server-Aufruf).
  const [pattern, setPatternDraft] = useState(savedPattern);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Beim Schließen des Panels einen noch ausstehenden Stand nicht verlieren.
  const flushRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
      flushRef.current?.();
    },
    [],
  );

  if (step.is_decision) return null; // Verzweigungs-Schritte: nicht im MVP

  function cancelPending() {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    flushRef.current = null;
  }
  function setKind(next: "element" | "url") {
    cancelPending();
    if (next === "element") {
      if (!step.selector) return;
      onSetCondition(step.id, { kind: "element", selector: step.selector, ...(negate ? { negate: true } : {}) });
    } else {
      onSetCondition(step.id, { kind: "url", pattern, ...(negate ? { negate: true } : {}) });
    }
  }
  function setNegate(next: boolean) {
    if (!cond) return;
    if (cond.kind === "element") {
      onSetCondition(step.id, { kind: "element", selector: cond.selector, ...(next ? { negate: true } : {}) });
    } else {
      // Getippten (evtl. noch nicht gespeicherten) Stand mitnehmen.
      cancelPending();
      onSetCondition(step.id, { kind: "url", pattern, ...(next ? { negate: true } : {}) });
    }
  }
  function commitPattern(next: string) {
    cancelPending();
    if (next === savedPattern) return;
    onSetCondition(step.id, { kind: "url", pattern: next, ...(negate ? { negate: true } : {}) });
  }
  function setPattern(next: string) {
    setPatternDraft(next);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    flushRef.current = () => commitPattern(next);
    commitTimer.current = setTimeout(() => commitPattern(next), 800);
  }
  function toggleEnabled() {
    cancelPending();
    if (enabled) {
      onSetCondition(step.id, null);
    } else if (step.selector) {
      onSetCondition(step.id, { kind: "element", selector: step.selector });
    } else {
      setPatternDraft("");
      onSetCondition(step.id, { kind: "url", pattern: "" });
    }
  }

  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={toggleEnabled}
          className="mt-0.5 size-4 accent-primary"
        />
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">Bedingung</div>
          <div className="text-xs text-muted-foreground">
            Diesen Schritt beim automatischen Ausführen nur ausführen, wenn er zutrifft — sonst
            überspringen. In der geführten Anleitung wird die Bedingung ignoriert.
          </div>
        </div>
      </label>

      {enabled && (
        <div className="mt-3 space-y-2 pl-7">
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <label className={`flex items-center gap-1.5 ${hasSelector ? "" : "opacity-40"}`}>
              <input
                type="radio"
                name={`cond-kind-${step.id}`}
                checked={kind === "element"}
                disabled={!hasSelector}
                onChange={() => setKind("element")}
                className="size-3.5 accent-primary"
              />
              <span className="font-semibold text-ink">Element vorhanden</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`cond-kind-${step.id}`}
                checked={kind === "url"}
                onChange={() => setKind("url")}
                className="size-3.5 accent-primary"
              />
              <span className="font-semibold text-ink">URL enthält</span>
            </label>
          </div>

          {kind === "element" ? (
            <p className="text-xs text-muted-foreground">
              Nur ausführen, wenn das Element dieses Schritts auf der Seite sichtbar ist (z. B. ein
              Cookie-Banner-Knopf).
            </p>
          ) : (
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              onBlur={(e) => commitPattern(e.target.value)}
              aria-label="URL enthält"
              placeholder="z. B. /login  oder  beispiel.de/app"
              className="h-8 text-[13px]"
            />
          )}

          <label className="flex items-center gap-1.5 text-[13px]">
            <input
              type="checkbox"
              checked={negate}
              onChange={(e) => setNegate(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            <span className="font-semibold text-ink">Umkehren (nur wenn NICHT zutrifft)</span>
          </label>
        </div>
      )}
    </div>
  );
}

function BranchRow({
  branch,
  targetOptions,
  onUpdate,
  onDelete,
  onGo,
  stepLabel,
}: {
  branch: StepBranch;
  targetOptions: Step[];
  onUpdate: (
    id: string,
    patch: { label?: string; target_step_id?: string | null },
  ) => void;
  onDelete: (id: string) => void;
  onGo: () => void;
  stepLabel: (s: Step) => string;
}) {
  const labelText = branch.label?.trim() || "Antwort";
  const currentTarget = targetOptions.find((s) => s.id === branch.target_step_id);
  return (
    // @container: Ist die Zeile schmal (Handy, schmales Panel), rutscht die Ziel-Auswahl in eine
    // eigene volle Zeile — sonst wäre der Schritt-Name bis zur Unlesbarkeit abgeschnitten.
    <div className="@container rounded-lg border border-border bg-card p-2">
    <div className="flex flex-wrap items-center gap-2">
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-full"
        style={{ background: branch.color || "var(--muted-foreground)" }}
      />
      {/* key = aktueller Wert: bleibt beim Tippen stabil (Commit erst onBlur), remountet
          aber bei EXTERNER Änderung (z. B. „Ja"/„Nein" beim Verzweigen) mit neuem Wert. */}
      <input
        key={`l:${branch.label ?? ""}`}
        defaultValue={branch.label ?? ""}
        placeholder="Antwort"
        aria-label="Antwort-Text"
        onBlur={(e) => {
          if (e.target.value !== (branch.label ?? ""))
            onUpdate(branch.id, { label: e.target.value });
        }}
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-ring @md:w-20 @md:flex-none"
      />
      <select
        key={`t:${branch.target_step_id ?? ""}`}
        defaultValue={branch.target_step_id ?? ""}
        onChange={(e) =>
          onUpdate(branch.id, { target_step_id: e.target.value || null })
        }
        aria-label={`Weiter bei Antwort „${labelText}“`}
        title={currentTarget ? stepLabel(currentTarget) : "Ende"}
        className="order-last w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-ring @md:order-none @md:w-auto @md:flex-1"
      >
        <option value="">→ Ende</option>
        {targetOptions.map((s) => (
          <option key={s.id} value={s.id}>
            → {stepLabel(s)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onGo}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50"
        title={branch.target_step_id ? "Zu diesem Schritt springen" : "Schritt für diese Antwort anlegen"}
        aria-label={branch.target_step_id ? "Zum Ziel-Schritt" : "Schritt anlegen"}
      >
        {branch.target_step_id ? <ArrowRight className="size-4" /> : <Plus className="size-4" />}
      </button>
      <button
        type="button"
        onClick={() => {
          if (confirm("Diese Antwort-Option löschen?")) onDelete(branch.id);
        }}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-no-soft hover:text-no focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Antwort löschen"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
    </div>
  );
}
