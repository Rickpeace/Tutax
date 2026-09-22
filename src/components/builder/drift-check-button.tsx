"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

/** „Aktualität prüfen“ als Hook — der Editor-Kopf nutzt es im „…“-Menü (Welle 53). */
export function useDriftCheck(tutorialId: string) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function run() {
    start(async () => {
      try {
        const res = await fetch(`/api/tutorials/${tutorialId}/check`, { method: "POST" });
        const data = await res.json();
        if (data.configured === false) {
          toast.message(data.message);
          return;
        }
        // Cooldown (429): keine echte Fehlermeldung, nur ein Hinweis.
        if (res.status === 429 || data.cooldown) {
          toast.message(data.error ?? "Zuletzt kürzlich geprüft – bitte warten.");
          return;
        }
        if (data.error) {
          toast.error(data.error);
          return;
        }
        if (data.is_stale) {
          toast.message(`⚠ ${data.summary ?? "Mögliche Veralterung gefunden."}`, {
            action: { label: "Hinweise ansehen", onClick: () => router.push("/app/alerts") },
          });
        } else {
          toast.success("Die Anleitung wirkt aktuell.");
        }
        router.refresh();
      } catch {
        toast.error("Prüfung fehlgeschlagen");
      }
    });
  }

  return { pending, run };
}

export function DriftCheckButton({
  tutorialId,
  disabled = false,
}: {
  tutorialId: string;
  /** z. B. solange die Anleitung noch keine Schritte hat (Hinweis kommt vom Aufrufer). */
  disabled?: boolean;
}) {
  const { pending, run } = useDriftCheck(tutorialId);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={run}
      disabled={pending || disabled}
      title={disabled ? undefined : "Prüft per KI, ob die Anleitung noch zur Website passt"}
    >
      <ShieldQuestion className="size-4" /> {pending ? "Prüft …" : "Aktualität prüfen"}
    </Button>
  );
}
