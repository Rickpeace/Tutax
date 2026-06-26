"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AutoCi({ initialUrl, compact }: { initialUrl: string; compact?: boolean }) {
  const [url, setUrl] = useState(initialUrl);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      try {
        const res = await fetch("/api/theme/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Fehler");
        if (data.ok) {
          toast.success("CI übernommen! Farben aktualisiert.");
          setTimeout(() => window.location.reload(), 900);
        } else if (data.message) {
          toast.message(data.message);
        } else {
          toast.error(data.error ?? "Analyse fehlgeschlagen");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  if (compact) {
    return (
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.kanzlei.de"
          className="h-9"
        />
        <Button onClick={run} disabled={pending || !url} variant="outline" size="sm">
          <Wand2 className="size-4" /> {pending ? "…" : "Analysieren"}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-primary/30 bg-accent/40 p-5">
      <div className="flex items-center gap-2 text-sm font-bold text-ink">
        <Wand2 className="size-4 text-primary" /> CI automatisch übernehmen (KI)
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Website-URL Ihrer Kanzlei angeben – die KI leitet daraus Farben, Schriften und
        das Look &amp; Feel ab.
      </p>
      <div className="mt-3 flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.kanzlei-mueller.de"
        />
        <Button onClick={run} disabled={pending || !url} variant="outline">
          {pending ? "…" : "Analysieren"}
        </Button>
      </div>
    </div>
  );
}
