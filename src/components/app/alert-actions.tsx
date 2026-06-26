"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { updateAlertStatus } from "@/app/app/alerts/actions";

export function AlertActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const act = (status: "resolved" | "dismissed", label: string) =>
    start(async () => {
      try {
        await updateAlertStatus(id, status);
        toast.success(label);
      } catch {
        toast.error("Fehler");
      }
    });

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => act("resolved", "Als erledigt markiert")}
        className="flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-muted"
      >
        <Check className="size-3.5 text-yes" /> Erledigt
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => act("dismissed", "Ignoriert")}
        className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-ink"
      >
        <X className="size-3.5" /> Ignorieren
      </button>
    </div>
  );
}
