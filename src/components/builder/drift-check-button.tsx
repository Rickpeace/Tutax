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
        if (data.error) {
          toast.error(data.error);
          return;
        }
        if (data.is_stale) {
          toast.message(`⚠ ${data.summary ?? "Mögliche Veralterung gefunden."}`);
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
