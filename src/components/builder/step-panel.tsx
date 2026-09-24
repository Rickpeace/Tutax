"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, GitBranch, Save, ChevronLeft, ChevronRight, ChevronDown, ArrowRight, ArrowUp, ArrowDown, X, Check, Zap, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STEP_TITLE_MAX } from "@/lib/text-limits";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { RichText } from "@/components/builder/rich-text";
import { StatusSwitch } from "@/components/app/status-switch";
import { ImageField } from "@/components/builder/image-field";
import type { Step, StepBranch, Highlight, StepCondition } from "@/lib/types";
import { TAP_AREA } from "@/lib/tap-target";

// Handy-Audit 24.09.: Schritt-Navigation im Kopf war 28 × 28 px — auf Touch unsichtbar 40 px.
const HEAD_TAP = `relative ${TAP_AREA}`;

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
  onSetNext,
  onUpdateBranch,
  onDeleteBranch,
  onDeleteStep,
  deleteContinuesAt = null,
  onOpenStep,
  onInsertIntoBranch,
  onDuplicateImage,
  onClose,
  stepLabel,
  published = false,
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
  onSaveStep: (id: string, patch: { title?: string; body?: unknown }) => Promise<void>;
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
  /** Normaler Schritt: wohin es danach geht (null = Ende). */
  onSetNext?: (stepId: string, target: string | null) => void;
  onUpdateBranch: (
    branchId: string,
    patch: { label?: string; target_step_id?: string | null },
  ) => void;
  onDeleteBranch: (branchId: string) => void;
  onDeleteStep: (id: string) => void;
  /** Schritt, bei dem der Ablauf nach dem Löschen weitergeht (null = Ende) — für die Ansage. */
  deleteContinuesAt?: Step | null;
  onOpenStep: (id: string) => void;
  onInsertIntoBranch: (branchId: string) => void;
  /** Welle 51a: neuen Schritt direkt danach mit demselben Bild anlegen. */
  onDuplicateImage?: (stepId: string) => void;
  onClose?: () => void;
  /** Anzeigename eines Schritts: Titel, sonst „Schritt N“ (N = Nummer im Ablauf). */
  stepLabel: (s: Step) => string;
  /** Ist die Anleitung veröffentlicht? Nur für die Ansage beim Löschen des letzten Schritts. */
  published?: boolean;
}) {
  const [title, setTitle] = useState(step.title ?? "");
  const [body, setBody] = useState<unknown>(step.body ?? null);
  const [dirty, setDirty] = useState(false);
  // Zuletzt gespeicherter Stand (beim Öffnen: der des Schritts) — Basis für „was hat sich geändert“.
  const saved = useRef<{ title: string; body: unknown }>({ title: step.title ?? "", body: step.body ?? null });
  const [rtKey, setRtKey] = useState(0);
  const [pendingNav, setPendingNav] = useState<null | { run: () => void; label: string }>(null);
  const [confirm, confirmDialog] = useConfirm();

  // Eltern (Builder) über ungespeicherte Änderungen informieren (Schließen-Abfrage).
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  // Verschwindet das Panel (Schritt gelöscht, anderer gewählt), sind seine Eingaben weg —
  // sonst fragte der Builder danach grundlos „Änderungen verwerfen?“.
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => () => onDirtyChangeRef.current?.(false), []);

  // Verlust-Schutz: Tab schließen/neu laden/wegnavigieren bei ungespeichertem Titel/Text abfangen.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Aktueller Eingabestand für den asynchronen Abschluss: wer WÄHREND des Speicherns weitertippt,
  // bleibt „ungespeichert“ (Audit 24.09.: sonst stand „✓ Gespeichert“ da, das Getippte war weg).
  const latestInput = useRef({ title, body });
  useEffect(() => {
    latestInput.current = { title, body };
  }, [title, body]);
  async function save(): Promise<boolean> {
    const sent = { title, body };
    // Nur GEÄNDERTE Felder schicken: hatten zwei Personen denselben Schritt offen, überschrieb
    // die zweite sonst still den Titel der ersten, obwohl sie nur den Text ergänzt hatte
    // (Grenzfall-Audit 24.09.).
    // Vergleich mit dem Stand beim Öffnen (nicht mit `step`: der kann per Neuladen schon den
    // Stand der anderen Person tragen — dann ginge deren Änderung doch wieder verloren).
    const patch: { title?: string; body?: unknown } = {};
    if (title !== saved.current.title) patch.title = title;
    if (JSON.stringify(body ?? null) !== JSON.stringify(saved.current.body ?? null)) patch.body = body;
    try {
      if (Object.keys(patch).length > 0) await onSaveStep(step.id, patch);
      saved.current = sent;
      const cur = latestInput.current;
      if (cur.title === sent.title && cur.body === sent.body) setDirty(false);
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
    saved.current = { title: step.title ?? "", body: step.body ?? null };
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
  async function toggleDecision() {
    const turningOff = step.is_decision;
    if (turningOff && branches.length > 1) {
      const ok = await confirm({
        title: "Frage ausschalten?",
        description:
          "Alle Antworten außer der ersten werden entfernt. Folge-Schritte der anderen Antworten bleiben erhalten, sind danach aber nicht mehr mit dem Ablauf verbunden.",
        confirmLabel: "Ausschalten",
        destructive: true,
      });
      if (!ok) return;
    }
    onSetDecision(step.id, !step.is_decision);
  }

  // Schritt löschen: Folge klar benennen. Verhalten = Builder.handleDeleteStep/deleteStep
  // (lib/builder/rewire.ts): linearer Schritt -> Vorgänger zeigen auf den nächsten Schritt;
  // Frage -> Antworten gehen mit, Vorgänger zeigen auf die Zusammenführung der Äste (sonst
  // das Ziel der ersten Antwort); Schritte nur in den Ästen bleiben unverbunden stehen.
  async function askDeleteStep() {
    // Einziger Schritt der Anleitung: danach ist sie leer. Eine VERÖFFENTLICHTE Anleitung
    // setzt der Builder dann automatisch auf Entwurf zurück — das wird hier angesagt.
    const isOnlyStep = allSteps.length === 1;
    let consequence: string;
    if (isOnlyStep) {
      consequence = published
        ? "Die Anleitung hat danach keine Schritte mehr und wird auf Entwurf zurückgesetzt."
        : "Die Anleitung hat danach keine Schritte mehr.";
    } else if (step.is_decision && branches.length > 0) {
      const names = branches
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((b) => `„${b.label?.trim() || "Antwort"}“`)
        .join(", ");
      // Ast-Schritte = Antwort-Ziele, bei denen der Ablauf NICHT weitergeht.
      const hasBranchSteps = branches.some(
        (b) => b.target_step_id && b.target_step_id !== deleteContinuesAt?.id,
      );
      const next = deleteContinuesAt
        ? ` Der Ablauf geht danach mit „${stepLabel(deleteContinuesAt)}“ weiter.`
        : hasPrev
          ? " Die Anleitung endet danach beim vorigen Schritt."
          : "";
      consequence =
        `Die Antworten ${names} werden mit gelöscht.` +
        next +
        (hasBranchSteps
          ? " Schritte, die nur in den Ästen stehen, bleiben erhalten, sind danach aber nicht mehr mit dem Ablauf verbunden."
          : "");
    } else if (!step.is_decision && branches.some((b) => b.target_step_id)) {
      consequence = "Der Ablauf geht danach direkt mit dem nächsten Schritt weiter.";
    } else if (hasPrev) {
      consequence = "Die Anleitung endet danach beim vorigen Schritt.";
    } else {
      // Erster Schritt im Ablauf ohne Nachfolger: „vorigen Schritt“ gibt es hier nicht.
      consequence = "Dieser Schritt hat weder einen vorigen noch einen nächsten Schritt.";
    }
    const ok = await confirm({
      title: `„${stepLabel(step)}“ löschen?`,
      description: `Titel, Erklärtext, Screenshot und Markierungen dieses Schritts werden gelöscht. ${consequence}`,
      confirmLabel: "Schritt löschen",
      destructive: true,
    });
    if (!ok) return;
    onDeleteStep(step.id);
    toast.success("Schritt gelöscht");
  }

  async function askDeleteBranch(branch: StepBranch) {
    const target = branch.target_step_id ? allSteps.find((s) => s.id === branch.target_step_id) : null;
    const ok = await confirm({
      title: `Antwort „${branch.label?.trim() || "Antwort"}“ löschen?`,
      description: target
        ? `Der Schritt „${stepLabel(target)}“ dahinter bleibt erhalten, ist aber nicht mehr mit dieser Antwort verbunden.`
        : undefined,
      confirmLabel: "Antwort löschen",
      destructive: true,
    });
    if (ok) onDeleteBranch(branch.id);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 border-b-2 border-line-2 bg-card/95 px-4 py-2 backdrop-blur">
        {/* Touch: mehr Abstand, damit sich die 40-px-Trefferflächen nicht überlappen. */}
        <div className="flex items-center gap-1 pointer-coarse:gap-2">
          {onClose && (
            // Ungespeichert: dieselbe Abfrage wie bei Vor/Zurück — inkl. „Speichern & schließen“
            // (Audit 24.09.: vorher nur „Verwerfen“ oder „Weiter bearbeiten“).
            <Button variant="ghost" size="icon-sm" className={HEAD_TAP} onClick={() => guardedNav(onClose, "schließen")} title="Editor schließen" aria-label="Editor schließen">
              <X className="size-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" className={HEAD_TAP} disabled={!hasPrev} onClick={() => guardedNav(onPrev, "zurück")} title="Vorheriger Schritt" aria-label="Vorheriger Schritt">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="hidden min-w-12 text-center text-xs tabular-nums text-muted-foreground sm:inline-block">
            {index >= 0 ? `${index + 1} / ${total}` : ""}
          </span>
          <Button variant="ghost" size="icon-sm" className={HEAD_TAP} onClick={() => guardedNav(onNext, "weiter")} title={hasNext ? "Nächster Schritt" : "Neuen Schritt anlegen"} aria-label={hasNext ? "Nächster Schritt" : "Neuen Schritt anlegen"}>
            {hasNext ? <ChevronRight className="size-4" /> : <Plus className="size-4" />}
          </Button>
          <span className="mx-0.5 h-4 w-px bg-line-2" aria-hidden />
          <Button
            variant="ghost"
            size="icon-sm" className={HEAD_TAP}
            disabled={!canMoveUp}
            onClick={() => onMove(step.id, "up")}
            title={canMoveUp ? "Schritt nach oben" : "Bei Verzweigungen bitte über die Antwort-Ziele umhängen"}
            aria-label="Schritt nach oben"
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm" className={HEAD_TAP}
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
              {/* Handy: nur Symbole — sonst war „Speichern“ bei 390 px abgeschnitten (Audit 24.09.). */}
              <Button variant="ghost" size="sm" onClick={discard} title="Änderungen verwerfen" aria-label="Verwerfen">
                <Undo2 className="size-4 sm:hidden" />
                <span className="hidden sm:inline">Verwerfen</span>
              </Button>
              <Button size="sm" onClick={save} title="Änderungen an Titel und Erklärtext speichern" aria-label="Speichern">
                <Save className="size-4" /> <span className="hidden sm:inline">Speichern</span>
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
          maxLength={STEP_TITLE_MAX}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          placeholder="z. B. App öffnen"
        />
      </div>

      {/* Reihenfolge (Welle 53): Titel → Erklärtext → Screenshot → Frage → Erweitert. */}
      {/* Touch: Erklärtext in 16 px — darunter zoomt iOS beim Antippen in die Seite (Audit
          24.09.; die Schriftgröße setzt der Editor in rich-text.tsx, hier nur überschrieben). */}
      <div className="space-y-1.5 pointer-coarse:[&_.ProseMirror]:text-base">
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
        className={`flex items-center gap-3 rounded-lg border-2 p-3 transition-colors ${
          step.is_decision ? "border-primary/30 bg-card" : "border-line bg-card"
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
                onDelete={() => askDeleteBranch(b)}
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

      {/* „Danach weiter mit“ (Runde 5): z. B. den „Nein“-Ast nach einer Frage wieder auf den Hauptweg
          führen. Standard ist der nächste Schritt; hier lässt er sich frei wählen oder auf Ende setzen. */}
      {!step.is_decision && onSetNext && (
        <div className="space-y-1.5">
          <Label>Danach weiter mit</Label>
          <Select
            value={branches[0]?.target_step_id ?? END}
            items={[
              { value: END, label: "→ Ende der Anleitung" },
              ...targetOptions.map((s) => ({ value: s.id, label: `→ ${stepLabel(s)}` })),
            ]}
            onValueChange={(v) => onSetNext(step.id, !v || v === END ? null : String(v))}
          >
            <SelectTrigger aria-label="Danach weiter mit" className="w-full min-w-0">
              <SelectValue className="min-w-0 truncate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={END}>→ Ende der Anleitung</SelectItem>
              {targetOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  → {stepLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Nach einer Frage können Sie hier einen Antwort-Weg wieder mit dem Hauptweg zusammenführen.
          </p>
        </div>
      )}

      {/* Nur für Automationen (Bedingung, Sprung) — der Mensch ignoriert es, darum eingeklappt. */}
      {!step.is_decision && <AdvancedSection step={step} onSetCondition={onSetCondition} />}

      <div className="border-t-2 border-line-2 pt-4">
        <Button
          variant="destructive"
          size="sm"
          onClick={askDeleteStep}
        >
          <Trash2 className="size-4" /> Schritt löschen
        </Button>
      </div>

      {confirmDialog}

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
              onClick={() => {
                const p = pendingNav;
                setPendingNav(null);
                discard();
                // Sofort melden (nicht erst im Effekt): sonst fragte der Builder beim Schließen
                // ein zweites Mal „Änderungen verwerfen?“.
                onDirtyChange?.(false);
                p?.run();
              }}
            >
              Verwerfen &amp; {pendingNav?.label ?? "weiter"}
            </Button>
            <Button
              onClick={async () => {
                const p = pendingNav;
                // Erst speichern; nur bei Erfolg navigieren (sonst Dialog offen lassen).
                if (await save()) {
                  setPendingNav(null);
                  onDirtyChange?.(false); // wie oben: keine zweite Abfrage beim Schließen
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
    <div className="rounded-lg border-2 border-line bg-card" data-testid="step-advanced">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Zap className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm font-semibold text-ink">Erweitert (für Automationen)</span>
        {active.length > 0 && (
          <span className="rounded-full bg-teal-soft px-2 py-0.5 text-xs font-extrabold text-teal-text">
            {active.join(" + ")} aktiv
          </span>
        )}
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t-2 border-line-2 px-3 pb-3 pt-3">
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
        <Switch
          checked={enabled}
          onCheckedChange={toggleEnabled}
          aria-label="Bedingung"
          className="mt-0.5"
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
        <div className="mt-3 space-y-2 pl-[50px]">
          <div className="flex flex-wrap items-center gap-3 text-sm">
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
              className="h-8"
            />
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={negate}
              onCheckedChange={(c) => setNegate(c)}
              aria-label="Umkehren (nur wenn NICHT zutrifft)"
            />
            <span className="font-semibold text-ink">Umkehren (nur wenn NICHT zutrifft)</span>
          </label>
        </div>
      )}
    </div>
  );
}

/** Auswahl-Wert für „Ende“ (kein Ziel-Schritt) — Base-UI-Select braucht einen echten Wert. */
const END = "__end__";

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
  onDelete: () => void;
  onGo: () => void;
  stepLabel: (s: Step) => string;
}) {
  const labelText = branch.label?.trim() || "Antwort";
  const currentTarget = targetOptions.find((s) => s.id === branch.target_step_id);
  const targetItems = [
    { value: END, label: "→ Ende" },
    ...targetOptions.map((s) => ({ value: s.id, label: `→ ${stepLabel(s)}` })),
  ];
  return (
    // @container: Ist die Zeile schmal (Handy, schmales Panel), rutscht die Ziel-Auswahl in eine
    // eigene volle Zeile — sonst wäre der Schritt-Name bis zur Unlesbarkeit abgeschnitten.
    <div className="@container rounded-lg border-2 border-line bg-card p-2">
    <div className="flex flex-wrap items-center gap-2">
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-full"
        style={{ background: branch.color || "var(--muted-foreground)" }}
      />
      {/* key = aktueller Wert: bleibt beim Tippen stabil (Commit erst onBlur), remountet
          aber bei EXTERNER Änderung (z. B. „Ja"/„Nein" beim Verzweigen) mit neuem Wert. */}
      <Input
        key={`l:${branch.label ?? ""}`}
        defaultValue={branch.label ?? ""}
        placeholder="Antwort"
        aria-label="Antwort-Text"
        onBlur={(e) => {
          if (e.target.value !== (branch.label ?? ""))
            onUpdate(branch.id, { label: e.target.value });
        }}
        className="min-w-0 flex-1 @md:w-24 @md:flex-none"
      />
      <Select
        value={branch.target_step_id ?? END}
        items={targetItems}
        onValueChange={(v) =>
          onUpdate(branch.id, { target_step_id: !v || v === END ? null : String(v) })
        }
      >
        <SelectTrigger
          aria-label={`Weiter bei Antwort „${labelText}“`}
          title={currentTarget ? stepLabel(currentTarget) : "Ende"}
          className="order-last w-full min-w-0 @md:order-none @md:w-auto @md:flex-1"
        >
          <SelectValue className="min-w-0 truncate" />
        </SelectTrigger>
        <SelectContent>
          {targetItems.map((it) => (
            <SelectItem key={it.value} value={it.value}>
              {it.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={onGo}
        className={`relative flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 ${TAP_AREA}`}
        title={branch.target_step_id ? "Zu diesem Schritt springen" : "Schritt für diese Antwort anlegen"}
        aria-label={branch.target_step_id ? "Zum Ziel-Schritt" : "Schritt anlegen"}
      >
        {branch.target_step_id ? <ArrowRight className="size-4" /> : <Plus className="size-4" />}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className={`relative flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-no-soft hover:text-no focus-visible:ring-3 focus-visible:ring-ring/50 ${TAP_AREA}`}
        aria-label="Antwort löschen"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
    </div>
  );
}
