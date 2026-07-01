"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clapperboard, Loader2, CheckCircle2, AlertCircle, UploadCloud, Circle, Square, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Phase = "idle" | "recording" | "uploading" | "queued" | "processing" | "done" | "failed";

export function VideoUpload({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tutorialId, setTutorialId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Job-Status pollen
  useEffect(() => {
    if (!jobId || phase === "done" || phase === "failed") return;
    const supabase = createClient();
    const iv = setInterval(async () => {
      const { data } = await supabase.from("video_jobs").select("status, tutorial_id, error").eq("id", jobId).single();
      if (!data) return;
      if (data.status === "processing") setPhase("processing");
      if (data.status === "done") { setTutorialId(data.tutorial_id); setPhase("done"); }
      if (data.status === "failed") { setError(data.error || "Verarbeitung fehlgeschlagen."); setPhase("failed"); }
    }, 4000);
    return () => clearInterval(iv);
  }, [jobId, phase]);

  async function uploadAndQueue(blob: Blob, ext: string, niceName: string) {
    setPhase("uploading");
    try {
      const supabase = createClient();
      const vpath = `${accountId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("tutorial-videos").upload(vpath, blob, { contentType: blob.type || "video/webm", upsert: false });
      if (upErr) throw upErr;
      const { data: job, error: jErr } = await supabase
        .from("video_jobs")
        .insert({ account_id: accountId, video_path: vpath, title: niceName, status: "queued" })
        .select("id").single();
      if (jErr) throw jErr;
      setJobId(job.id);
      setPhase("queued");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
      setPhase("failed");
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setTutorialId(null);
    uploadAndQueue(file, (file.name.split(".").pop() || "mp4").toLowerCase(), file.name.replace(/\.[^.]+$/, ""));
  }

  async function startRecording() {
    setError(null); setTutorialId(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Dein Browser unterstützt keine Bildschirmaufnahme. Nutze Chrome/Edge oder lade eine Datei hoch.");
      setPhase("failed"); return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      let mic: MediaStream | null = null;
      try { mic = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { /* ohne Mikro weiter */ }
      streamsRef.current = [screen, ...(mic ? [mic] : [])];
      const tracks = [...screen.getVideoTracks(), ...(mic ? mic.getAudioTracks() : [])];
      const stream = new MediaStream(tracks);
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
        streamsRef.current = [];
        if (timerRef.current) clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        if (blob.size < 1000) { setError("Aufnahme leer."); setPhase("failed"); return; }
        await uploadAndQueue(blob, "webm", "Aufnahme");
      };
      // Stoppt die Aufnahme, wenn der Nutzer das Teilen über die Browser-Leiste beendet.
      screen.getVideoTracks()[0].addEventListener("ended", () => { if (recRef.current?.state !== "inactive") recRef.current?.stop(); });
      recRef.current = rec;
      rec.start();
      setSecs(0);
      timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
      setPhase("recording");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aufnahme konnte nicht gestartet werden.");
      setPhase("failed");
    }
  }

  const stopRecording = () => { if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop(); };

  const reset = () => {
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase("idle"); setError(null); setTutorialId(null); setJobId(null); setSecs(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const mmss = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={(o) => {
      // Während Aufnahme/Upload NICHT schließen (Klick neben das Fenster würde sonst die laufende Aufnahme abbrechen).
      if (!o && (phase === "recording" || phase === "uploading")) return;
      setOpen(o);
      if (!o) reset();
    }}>
      <DialogTrigger render={<Button variant="outline"><Clapperboard className="size-4" /> Aus Video</Button>} />
      <DialogContent className="sm:max-w-md" showCloseButton={phase !== "recording" && phase !== "uploading"}>
        <DialogHeader><DialogTitle>Tutorial aus Video erstellen</DialogTitle></DialogHeader>

        {phase === "idle" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Mach die Aufgabe einmal vor und erklär dabei ganz normal. Nach jedem Schritt sagst du
              <b> „Schnitt"</b> — daraus wird ein Schritt mit Screenshot und Markierung.
            </p>

            <div className="space-y-2 rounded-lg border border-line-2 bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5 font-semibold text-ink">
                <Info className="size-3.5 text-primary" /> So wird die Aufnahme am besten
              </p>
              <ol className="list-decimal space-y-1 pl-4 marker:text-muted-foreground">
                <li>Zeig die Aufgabe <b>einmal in Ruhe</b> vor und sprich dabei, als würdest du sie einem Kollegen erklären.</li>
                <li>Bewege die <b>Maus aufs Ziel</b> (Knopf/Feld) und halt kurz drauf, bevor du klickst.</li>
                <li>Ist der Schritt fertig, sag <b>„Schnitt"</b> — das trennt sauber zum nächsten Schritt.</li>
                <li>Ruhig arbeiten, nicht hetzen. Am Ende auf <b>„Aufnahme beenden"</b>.</li>
              </ol>
              <p className="pt-0.5">Kein Sekunden-Zählen, keine anderen Zauberwörter nötig. Feinschliff geht danach im Editor.</p>
            </div>

            <input ref={fileRef} type="file" accept="video/*" onChange={onPick} className="hidden" />
            <Button className="w-full" onClick={startRecording}>
              <Circle className="size-4 fill-current text-no" /> Jetzt aufnehmen (Bildschirm + Mikro)
            </Button>
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
              <UploadCloud className="size-4" /> Stattdessen Datei hochladen
            </Button>
          </div>
        )}

        {phase === "recording" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex items-center gap-2 text-no">
              <Circle className="size-3 animate-pulse fill-current" /> <span className="font-mono text-lg">{mmss}</span>
            </div>
            <p className="text-sm text-muted-foreground">Aufnahme läuft – mach den Schritt, sag dann <b>„Schnitt"</b>. So entsteht jeder Schritt sauber.</p>
            <Button className="w-full" onClick={stopRecording}><Square className="size-4 fill-current" /> Aufnahme beenden</Button>
          </div>
        )}

        {(phase === "uploading" || phase === "queued" || phase === "processing") && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-ink">
              {phase === "uploading" ? "Video wird hochgeladen …" : phase === "queued" ? "In der Warteschlange …" : "KI erstellt das Tutorial …"}
            </p>
            <p className="text-xs text-muted-foreground">Das kann ein paar Minuten dauern. Fenster offen lassen.</p>
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
