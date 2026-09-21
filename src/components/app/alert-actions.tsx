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
        className="flex items-center gap-1 rounded-full border-2 border-line bg-card px-3 py-1 text-xs font-extrabold text-ink-2 transition-colors hover:border-[#e3d7c2] hover:text-ink"
      >
        <Check className="size-3.5 text-yes" /> Erledigt
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => act("dismissed", "Ignoriert")}
        className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold text-muted-foreground transition-colors hover:bg-line-2 hover:text-ink"
      >
        <X className="size-3.5" /> Ignorieren
      </button>
    </div>
  );
}
