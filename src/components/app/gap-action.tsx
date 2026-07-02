"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PenLine } from "lucide-react";
import { createDraftFromQuestion } from "@/app/app/insights-actions";

/**
 * Kleiner Client-Wrapper für den Frage-Lücken-Miner (REVIEW H1): ruft die
 * Server-Action, die aus einer unbeantworteten Frage einen Tutorial-Entwurf baut,
 * und springt danach in den Editor. Zeigt einen Spinner während der (teuren)
 * KI-Erzeugung und eine deutsche Fehlermeldung als Toast.
 */
export function GapAction({ question }: { question: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function create() {
    startTransition(async () => {
      try {
        const { tutorialId } = await createDraftFromQuestion(question);
        toast.success("Entwurf erstellt", {
          description: "Ergänzen Sie jetzt Screenshots und Details.",
        });
        router.push(`/app/tutorials/${tutorialId}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Entwurf konnte nicht erstellt werden.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={create}
      disabled={pending}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <PenLine className="size-3.5" />
      )}
      Entwurf erstellen
    </button>
  );
}
