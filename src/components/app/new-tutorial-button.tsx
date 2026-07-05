"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  Plus,
  Loader2,
  Pencil,
  Clapperboard,
  ChevronLeft,
  Zap,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
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
 * Erkennt clientseitig (nach Mount) die installierte Recorder-Extension am DOM-Marker
 * `data-steply-recorder` (content.js setzt ihn frueh; isolated world -> nur das DOM ist
 * geteilt). Gibt {installed, version} zurueck. Kurze Nachkontrollen fangen eine gerade
 * erst installierte Extension ab.
 */
function useRecorderExtension() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [version, setVersion] = useState("");
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      if (cancelled) return true;
      const v = document.documentElement.getAttribute("data-steply-recorder");
      if (v != null) {
        setInstalled(true);
        setVersion(v);
        return true;
      }
      return false;
    };
    // setState ASYNCHRON planen (kein synchrones setState im Effekt-Body): erste Pruefung
    // + zwei Nachkontrollen, falls die Extension gerade erst installiert wurde.
    const t0 = setTimeout(() => {
      if (!read()) setInstalled(false);
    }, 0);
    const t1 = setTimeout(read, 500);
    const t2 = setTimeout(read, 1500);
    return () => {
      cancelled = true;
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  return { installed, version };
}

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
  label = "Neue Anleitung",
  trigger,
}: {
  accountId: string;
  variant?: "default" | "outline";
  categoryId?: string | null;
  compact?: boolean;
  label?: string;
  /** Eigenes Trigger-Element (Base UI render) statt des Standard-Buttons. */
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  // "choice" = Weiche, "manual" = Titel-Abfrage. Video läuft im eigenen Dialog.
  const [mode, setMode] = useState<"choice" | "manual">("choice");
  const [videoOpen, setVideoOpen] = useState(false);
  const { installed: extInstalled, version: extVersion } = useRecorderExtension();

  const openWith = (o: boolean) => {
    setOpen(o);
    if (o) setMode("choice"); // beim Öffnen immer mit der Weiche starten
  };

  return (
    <>
      <Dialog open={open} onOpenChange={openWith}>
        <DialogTrigger
          render={
            trigger ??
            (compact ? (
              <Button variant="ghost" size="sm" className="text-primary">
                <Plus className="size-4" /> Anleitung
              </Button>
            ) : (
              <Button variant={variant}>
                <Plus className="size-4" /> {label}
              </Button>
            ))
          }
        />
        <DialogContent className="sm:max-w-md">
          {mode === "choice" ? (
            <>
              <DialogHeader>
                <DialogTitle>Neue Anleitung</DialogTitle>
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

              {/* Dritte Option: Sofort-Anleitung (Recorder-Extension, Tango-Stil). Kein
                  Navigations-Ziel bei installierter Extension — die Aufnahme laeuft in der
                  Seitenleiste, der Entwurf erscheint automatisch in der Bibliothek. */}
              <SofortAnleitungCard installed={extInstalled} version={extVersion} />
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

/**
 * Sofort-Anleitung-Karte im „Neue Anleitung"-Dialog. Installiert -> Kurzanleitung (kein
 * Navigations-Ziel: die Aufnahme laeuft in der Seitenleiste); nicht installiert -> Link
 * auf /extension. Warm-Redesign-Optik (Koralle-Akzent, 2px-Border, rounded-xl).
 */
function SofortAnleitungCard({
  installed,
  version,
}: {
  installed: boolean | null;
  version: string;
}) {
  // Waehrend der Erkennung (installed === null) neutral-installiert-freundlich rendern:
  // wir zeigen die Kurzanleitung erst bei bestaetigter Installation, sonst den Install-Link.
  const isInstalled = installed === true;

  if (isInstalled) {
    return (
      <div className="mt-3 rounded-xl border-2 border-primary/25 bg-accent/40 p-4">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Zap className="size-5" />
          </span>
          <span className="font-bold text-ink">Sofort-Anleitung</span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-line-2 px-2 py-0.5 text-[11px] font-bold text-ink">
            <CheckCircle2 className="size-3 text-primary" /> Installiert
            {version ? " (v" + version + ")" : ""}
          </span>
        </div>
        <p className="mt-2 text-xs text-ink-2">
          Seitenleiste öffnen (Extension-Symbol anklicken), Zielseite aufrufen,
          losklicken — der fertige Entwurf erscheint automatisch hier in der Bibliothek.
        </p>
      </div>
    );
  }

  return (
    <Link
      href="/extension"
      target="_blank"
      className="mt-3 flex items-center gap-3 rounded-xl border-2 border-dashed border-primary/30 bg-card p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent/30"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
        <Zap className="size-5" />
      </span>
      <span className="flex-1">
        <span className="block font-bold text-ink">Sofort-Anleitung</span>
        <span className="block text-xs text-muted-foreground">
          Klicken statt filmen: Extension installieren, dann entsteht bei jedem Klick ein
          Schritt.
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-primary" />
    </Link>
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
