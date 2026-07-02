"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Loader2, Pencil, Clapperboard, ChevronLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTutorial } from "@/app/app/actions";
import { VideoUpload } from "@/components/app/video-upload";

/**
 * „Neues Tutorial" (Welle 20): öffnet zuerst eine Weiche mit zwei Karten —
 * „Selbst bauen" (Titel-Abfrage → createTutorial → Builder) oder „Aus Video"
 * (öffnet den bestehenden Video-Dialog aus video-upload.tsx, Kategorie durchgereicht).
 */
export function NewTutorialButton({
  accountId,
  variant = "default",
  categoryId = null,
  compact = false,
  label = "Neues Tutorial",
}: {
  accountId: string;
  variant?: "default" | "outline";
  categoryId?: string | null;
  compact?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  // "choice" = Weiche, "manual" = Titel-Abfrage. Video läuft im eigenen Dialog.
  const [mode, setMode] = useState<"choice" | "manual">("choice");
  const [videoOpen, setVideoOpen] = useState(false);

  const openWith = (o: boolean) => {
    setOpen(o);
    if (o) setMode("choice"); // beim Öffnen immer mit der Weiche starten
  };

  return (
    <>
      <Dialog open={open} onOpenChange={openWith}>
        <DialogTrigger
          render={
            compact ? (
              <Button variant="ghost" size="sm" className="text-primary">
                <Plus className="size-4" /> Tutorial
              </Button>
            ) : (
              <Button variant={variant}>
                <Plus className="size-4" /> {label}
              </Button>
            )
          }
        />
        <DialogContent className="sm:max-w-md">
          {mode === "choice" ? (
            <>
              <DialogHeader>
                <DialogTitle>Neues Tutorial</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40"
                >
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
                    <Pencil className="size-5" />
                  </span>
                  <span className="font-bold text-ink">Selbst bauen</span>
                  <span className="text-xs text-muted-foreground">
                    Schritte von Hand anlegen — Screenshot, Markierung und Text.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setVideoOpen(true);
                  }}
                  className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40"
                >
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
                    <Clapperboard className="size-5" />
                  </span>
                  <span className="font-bold text-ink">Aus Video</span>
                  <span className="text-xs text-muted-foreground">
                    Aufgabe einmal vorführen — die KI baut die Schritte daraus.
                  </span>
                </button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("choice")}
                    aria-label="Zurück zur Auswahl"
                    className="rounded-md p-0.5 text-muted-foreground transition-colors hover:text-ink"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  Selbst bauen
                </DialogTitle>
              </DialogHeader>
              <form action={createTutorial} className="space-y-4">
                <input type="hidden" name="category_id" value={categoryId ?? ""} />
                <div className="space-y-1.5">
                  <Label htmlFor="title">Titel</Label>
                  <Input
                    id="title"
                    name="title"
                    placeholder="z. B. SmartLogin einrichten"
                    autoFocus
                    required
                  />
                </div>
                <DialogFooter>
                  <SubmitButton />
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Video-Dialog extern gesteuert (kein eigener Trigger); Kategorie durchgereicht. */}
      <VideoUpload
        accountId={accountId}
        categoryId={categoryId}
        open={videoOpen}
        onOpenChange={setVideoOpen}
        hideTrigger
      />
    </>
  );
}

// Eigener Submit-Button: deaktiviert sich während des Absendens,
// damit Doppelklicks nicht mehrere Tutorials anlegen.
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Wird erstellt …
        </>
      ) : (
        <>Erstellen &amp; bearbeiten</>
      )}
    </Button>
  );
}
