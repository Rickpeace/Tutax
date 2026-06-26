"use client";

import { useRef, useState } from "react";
import { Plus, Trash2, GitBranch, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichText } from "@/components/builder/rich-text";
import { ImageField } from "@/components/builder/image-field";
import type { Step, StepBranch, Highlight } from "@/lib/types";

type SaveState = "idle" | "saving" | "saved";

export function StepPanel({
  step,
  tutorialId,
  allSteps,
  branches,
  onPatchStep,
  onSetImage,
  onSetHighlights,
  onSetDecision,
  onAddBranch,
  onUpdateBranch,
  onDeleteBranch,
  onDeleteStep,
}: {
  step: Step;
  tutorialId: string;
  allSteps: Step[];
  branches: StepBranch[];
  onPatchStep: (id: string, patch: { title?: string; body?: unknown }) => void;
  onSetImage: (
    id: string,
    img: {
      image_path: string | null;
      image_width: number | null;
      image_height: number | null;
    },
  ) => void;
  onSetHighlights: (id: string, highlights: Highlight[]) => void;
  onSetDecision: (id: string, isDecision: boolean) => void;
  onAddBranch: (stepId: string) => void;
  onUpdateBranch: (
    branchId: string,
    patch: { label?: string; target_step_id?: string | null },
  ) => void;
  onDeleteBranch: (branchId: string) => void;
  onDeleteStep: (id: string) => void;
}) {
  const [title, setTitle] = useState(step.title ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [rtKey, setRtKey] = useState(0);
  const [suggesting, setSuggesting] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function touched() {
    setSaveState("saving");
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaveState("saved"), 800);
  }

  // KI-Schritt-Assistent: aus dem Screenshot Titel, Text und Markierung vorschlagen.
  async function suggestFromImage() {
    if (!step.image_path) return;
    setSuggesting(true);
    try {
      const res = await fetch("/api/steps/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tutorialId, imagePath: step.image_path }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "KI-Fehler");

      if (j.title) {
        setTitle(j.title);
        onPatchStep(step.id, { title: j.title });
      }
      if (j.body) {
        onPatchStep(step.id, {
          body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: j.body }] }] },
        });
        setRtKey((k) => k + 1); // RichText neu mounten, damit der Text erscheint
      }
      if (j.highlight) {
        const hl: Highlight = {
          id: crypto.randomUUID(),
          type: "rect",
          x: j.highlight.x,
          y: j.highlight.y,
          w: j.highlight.w,
          h: j.highlight.h,
          color: "#3d4ee6",
          rounded: true,
        };
        onSetHighlights(step.id, [...(step.highlights ?? []), hl]);
      }
      touched();
      toast.success("KI-Vorschlag übernommen – bei Bedarf anpassen.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSuggesting(false);
    }
  }

  const targetOptions = allSteps.filter((s) => s.id !== step.id);

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="step-title">Titel</Label>
          <SaveIndicator state={saveState} />
        </div>
        <Input
          id="step-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            onPatchStep(step.id, { title: e.target.value });
            touched();
          }}
          placeholder="z. B. App öffnen"
        />
      </div>

      <ImageField
        tutorialId={tutorialId}
        stepId={step.id}
        imagePath={step.image_path}
        highlights={step.highlights ?? []}
        onSetImage={onSetImage}
        onSetHighlights={onSetHighlights}
      />

      {step.image_path && (
        <Button
          variant="outline"
          size="sm"
          disabled={suggesting}
          onClick={suggestFromImage}
          className="w-full border-primary/30 text-primary hover:bg-accent"
        >
          {suggesting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> KI analysiert den Screenshot …
            </>
          ) : (
            <>
              <Sparkles className="size-4" /> KI: Titel &amp; Text aus Bild vorschlagen
            </>
          )}
        </Button>
      )}

      <button
        type="button"
        onClick={() => onSetDecision(step.id, !step.is_decision)}
        className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
          step.is_decision
            ? "border-primary/40 bg-accent"
            : "border-border bg-card hover:bg-muted"
        }`}
      >
        <GitBranch
          className={step.is_decision ? "size-5 text-primary" : "size-5 text-muted-foreground"}
        />
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">Frage / Verzweigung</div>
          <div className="text-xs text-muted-foreground">
            {step.is_decision
              ? "Dieser Schritt verzweigt je nach Antwort."
              : "Linearer Schritt. Antippen, um zu verzweigen."}
          </div>
        </div>
        <Switch on={step.is_decision} />
      </button>

      <div className="space-y-1.5">
        <Label>Erklärtext</Label>
        <RichText
          key={rtKey}
          value={step.body}
          onChange={(json) => {
            onPatchStep(step.id, { body: json });
            touched();
          }}
        />
      </div>

      {step.is_decision && (
        <div className="space-y-2">
          <Label>Antwort-Optionen</Label>
          {branches.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Noch keine Antworten. Fügen Sie z. B. „Ja" und „Nein" hinzu.
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
              />
            ))}
          <Button variant="outline" size="sm" onClick={() => onAddBranch(step.id)}>
            <Plus className="size-4" /> Antwort-Option
          </Button>
        </div>
      )}

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
    </div>
  );
}

function BranchRow({
  branch,
  targetOptions,
  onUpdate,
  onDelete,
}: {
  branch: StepBranch;
  targetOptions: Step[];
  onUpdate: (
    id: string,
    patch: { label?: string; target_step_id?: string | null },
  ) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
      <span
        className="size-3 shrink-0 rounded-full"
        style={{ background: branch.color || "var(--muted-foreground)" }}
      />
      <input
        defaultValue={branch.label ?? ""}
        placeholder="Antwort"
        onBlur={(e) => {
          if (e.target.value !== (branch.label ?? ""))
            onUpdate(branch.id, { label: e.target.value });
        }}
        className="w-20 shrink-0 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-ring"
      />
      <select
        defaultValue={branch.target_step_id ?? ""}
        onChange={(e) =>
          onUpdate(branch.id, { target_step_id: e.target.value || null })
        }
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-ring"
      >
        <option value="">→ Ende</option>
        {targetOptions.map((s) => (
          <option key={s.id} value={s.id}>
            → {s.title?.trim() || "Ohne Titel"}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          if (confirm("Diese Antwort-Option löschen?")) onDelete(branch.id);
        }}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-no-soft hover:text-no"
        aria-label="Antwort löschen"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        on ? "bg-primary" : "bg-line"
      }`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${
          on ? "left-[18px]" : "left-0.5"
        }`}
      />
    </span>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Speichert …
      </span>
    );
  if (state === "saved")
    return (
      <span className="flex items-center gap-1 text-xs text-yes">
        <Check className="size-3" /> Gespeichert
      </span>
    );
  return null;
}
