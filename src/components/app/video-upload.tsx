"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clapperboard, Loader2, CheckCircle2, AlertCircle, UploadCloud } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Phase = "idle" | "uploading" | "queued" | "processing" | "done" | "failed";

export function VideoUpload({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tutorialId, setTutorialId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Job-Status pollen, bis fertig/fehlgeschlagen.
  useEffect(() => {
    if (!jobId || phase === "done" || phase === "failed") return;
    const supabase = createClient();
    const iv = setInterval(async () => {
      const { data } = await supabase
        .from("video_jobs")
        .select("status, tutorial_id, error")
        .eq("id", jobId)
        .single();
      if (!data) return;
      if (data.status === "processing") setPhase("processing");
      if (data.status === "done") {
        setTutorialId(data.tutorial_id);
        setPhase("done");
      }
      if (data.status === "failed") {
        setError(data.error || "Verarbeitung fehlgeschlagen.");
        setPhase("failed");
      }
    }, 4000);
    return () => clearInterval(iv);
  }, [jobId, phase]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setTutorialId(null);
    setPhase("uploading");
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const vpath = `${accountId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("tutorial-videos")
        .upload(vpath, file, { contentType: file.type || "video/mp4", upsert: false });
      if (upErr) throw upErr;
      const { data: job, error: jErr } = await supabase
        .from("video_jobs")
        .insert({ account_id: accountId, video_path: vpath, title: file.name.replace(/\.[^.]+$/, ""), status: "queued" })
        .select("id")
        .single();
      if (jErr) throw jErr;
      setJobId(job.id);
      setPhase("queued");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
      setPhase("failed");
    }
  }

  const reset = () => {
    setPhase("idle"); setError(null); setTutorialId(null); setJobId(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <Clapperboard className="size-4" /> Aus Video
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tutorial aus Video erstellen</DialogTitle>
        </DialogHeader>

        {phase === "idle" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Lade einen Screencast (mit Stimme) hoch — die KI macht daraus einen Entwurf
              mit Schritten, Screenshots und Markierungen, den du danach anpasst.
            </p>
            <input ref={fileRef} type="file" accept="video/*" onChange={onPick} className="hidden" />
            <Button className="w-full" onClick={() => fileRef.current?.click()}>
              <UploadCloud className="size-4" /> Video auswählen
            </Button>
            <p className="text-xs text-muted-foreground">Tipp: 1–3 Min, eine Aufgabe, dabei klar ansagen was du tust.</p>
          </div>
        )}

        {(phase === "uploading" || phase === "queued" || phase === "processing") && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-ink">
              {phase === "uploading" ? "Video wird hochgeladen …" : phase === "queued" ? "In der Warteschlange …" : "KI erstellt das Tutorial …"}
            </p>
            <p className="text-xs text-muted-foreground">Das kann ein paar Minuten dauern. Du kannst das Fenster offen lassen.</p>
          </div>
        )}

        {phase === "done" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="size-8 text-yes" />
            <p className="text-sm font-medium text-ink">Entwurf ist fertig! 🎉</p>
            {tutorialId && (
              <Link href={`/app/tutorials/${tutorialId}`} className="w-full">
                <Button className="w-full">Im Builder öffnen &amp; anpassen</Button>
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={reset}>Noch ein Video</Button>
          </div>
        )}

        {phase === "failed" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertCircle className="size-8 text-no" />
            <p className="text-sm font-medium text-ink">Da ging etwas schief.</p>
            <p className="max-w-[20rem] text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={reset}>Erneut versuchen</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
