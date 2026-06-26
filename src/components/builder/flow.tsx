"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  GitBranch,
  CornerRightDown,
  Plus,
} from "lucide-react";
import type {
  RenderNode,
  RenderStep,
  RenderBranch,
} from "@/lib/builder/tree";

type FlowHandlers = {
  selectedId?: string | null;
  onSelect?: (stepId: string) => void;
  onInsertAfter?: (stepId: string) => void;
  onInsertIntoBranch?: (branchId: string) => void;
};

/** Karten-Flow eines Tutorials (Prototyp-Optik §7.2) mit Einfügepunkten (§7.4). */
export function Flow({ tree, ...h }: { tree: RenderNode } & FlowHandlers) {
  return <FlowNode node={tree} depth={0} {...h} />;
}

function FlowNode({
  node,
  depth,
  ...h
}: { node: RenderNode; depth: number } & FlowHandlers) {
  if (node.type === "merge") return <MergeRow label={node.label} isEnd={node.isEnd} />;

  const step = node as RenderStep;
  return (
    <div className="flex flex-col">
      <StepCard node={step} selected={h.selectedId === step.step.id} onSelect={h.onSelect} />

      {step.branches ? (
        <>
          {/* Verzweigung: farbig umrandete Ast-Blöcke */}
          <div className="mt-2 flex flex-col gap-2.5">
            {step.branches.map((b) => (
              <Branch key={b.branchId} branch={b} depth={depth + 1} {...h} />
            ))}
          </div>
          {step.after && (
            <>
              <Connector />
              <FlowNode node={step.after} depth={depth} {...h} />
            </>
          )}
        </>
      ) : (
        <>
          {/* Linearer Schritt: Einfügepunkt nach dieser Karte */}
          {h.onInsertAfter && (
            <InsertPoint onClick={() => h.onInsertAfter!(step.step.id)} />
          )}
          {step.next && <FlowNode node={step.next} depth={depth} {...h} />}
        </>
      )}
    </div>
  );
}

function StepCard({
  node,
  selected,
  onSelect,
}: {
  node: RenderStep;
  selected: boolean;
  onSelect?: (stepId: string) => void;
}) {
  const isQ = !!node.branches;
  const bodyText = plainBody(node.step.body);
  return (
    <button
      type="button"
      onClick={() => onSelect?.(node.step.id)}
      className={`flex w-full items-center gap-3 rounded-xl border bg-card p-[11px] text-left shadow-[0_1px_2px_rgba(16,21,36,0.03)] transition-all hover:-translate-y-px ${
        selected
          ? "border-primary shadow-[0_6px_20px_rgba(61,78,230,0.12)]"
          : "border-border hover:border-primary/40"
      }`}
    >
      <div className="flex size-[38px] shrink-0 items-center justify-center rounded-lg border border-line-2 bg-background text-muted-foreground">
        {isQ ? <GitBranch className="size-4 text-primary" /> : <span className="text-xs">•</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold text-ink">
          {node.step.title?.trim() || "Ohne Titel"}
          {isQ && <Tag tone="accent">Frage</Tag>}
        </div>
        {bodyText && (
          <div className="truncate text-[11.5px] text-muted-foreground">{bodyText}</div>
        )}
      </div>
      <ChevronRight className="size-4 text-line" />
    </button>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "accent" | "muted" }) {
  return (
    <span
      className={
        tone === "accent"
          ? "rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold text-primary"
          : "rounded-md bg-line-2 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
      }
    >
      {children}
    </span>
  );
}

function MergeRow({ label, isEnd }: { label: string; isEnd?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 px-1 pt-2 pb-0.5 text-muted-foreground">
      <CornerRightDown className="size-3.5" />
      <span className="text-xs">
        {isEnd ? (
          <b className="text-ink-2">Ende</b>
        ) : (
          <>
            weiter mit: <b className="text-ink-2">{label}</b>
          </>
        )}
      </span>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex justify-center">
      <div className="h-4 w-0.5 rounded bg-line" />
    </div>
  );
}

/** Klickbarer Einfügepunkt auf der Verbindungslinie (§7.4). */
function InsertPoint({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Schritt hier einfügen"
      className="group/ins relative flex h-9 w-full items-center justify-center"
    >
      <span className="absolute h-full w-0.5 bg-line" />
      <span className="relative flex size-6 items-center justify-center rounded-full border border-primary/40 bg-accent text-primary shadow-[0_1px_3px_rgba(61,78,230,0.18)] transition-all group-hover/ins:scale-110 group-hover/ins:border-primary group-hover/ins:bg-primary group-hover/ins:text-white">
        <Plus className="size-4" />
      </span>
    </button>
  );
}

function Branch({
  branch,
  depth,
  ...h
}: { branch: RenderBranch; depth: number } & FlowHandlers) {
  const [open, setOpen] = useState(depth < 3);
  const color = branch.color || "var(--muted-foreground)";
  const count = countSteps(branch.child);

  return (
    <div
      className="ml-1.5 rounded-xl pl-3"
      style={{
        borderLeft: `3px solid ${color}`,
        background: branch.color
          ? `linear-gradient(90deg, ${branch.color}14, transparent 60%)`
          : undefined,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 py-2"
      >
        <span
          className="rounded-full px-2.5 py-[3px] text-[11.5px] font-extrabold text-white"
          style={{ background: color }}
        >
          {branch.label}
        </span>
        {!open && (
          <span className="text-xs text-muted-foreground">
            {count} Schritt{count !== 1 ? "e" : ""}
          </span>
        )}
        {open ? (
          <ChevronDown className="ml-auto size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="pb-2.5">
          {/* Einfügepunkt am Anfang dieses Astes */}
          {h.onInsertIntoBranch && (
            <InsertPoint onClick={() => h.onInsertIntoBranch!(branch.branchId)} />
          )}
          <FlowNode node={branch.child} depth={depth} {...h} />
        </div>
      )}
    </div>
  );
}

function countSteps(node: RenderNode): number {
  if (node.type === "merge") return 0;
  let c = 1;
  if (node.branches) for (const b of node.branches) c += countSteps(b.child);
  if (node.next) c += countSteps(node.next);
  if (node.after) c += countSteps(node.after);
  return c;
}

/** Tiptap-JSON -> einzeilige Vorschau. */
function plainBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const node = n as { text?: string; content?: unknown[] };
    if (typeof node.text === "string") out.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(body);
  return out.join(" ").trim();
}
