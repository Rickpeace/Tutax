"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DriftCheckButton({ tutorialId }: { tutorialId: string }) {
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
          toast.success("Tutorial wirkt aktuell.");
        }
        router.refresh();
      } catch {
        toast.error("Prüfung fehlgeschlagen");
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={pending}>
      <ShieldQuestion className="size-4" /> {pending ? "Prüft …" : "Jetzt prüfen"}
    </Button>
  );
}
