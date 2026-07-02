"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Clapperboard, Loader2, CheckCircle2, AlertCircle, UploadCloud, Circle, Square, Info, Link2, MousePointerClick } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Phase = "idle" | "recording" | "uploading" | "queued" | "processing" | "done" | "failed" | "bulk" | "bulkDone";

// Fortschritt je Datei im Bulk-Upload (mehrere Dateien auf einmal).
type BulkItem = { name: string; status: "pending" | "uploading" | "done" | "error"; error?: string };

// Ein Klick-Marker aus dem Steply Recorder (clicks.json). Vertrag siehe extension/README.md
// bzw. Migration 0020 (video_jobs.clicks): [{ t, x:0..1, y:0..1, label? }].
type Click = { t: number; x: number; y: number; label?: string };

// clicks.json einlesen + streng validieren. Wirft mit klarer deutscher Meldung bei
// Ungültigkeit (der Aufrufer zeigt sie als toast.error). Bei Erfolg: bereinigte Klicks
// (x/y geklemmt auf 0..1, label auf 60 Zeichen gekappt). x/y nur „knapp daneben" wird
// geklemmt — grob unsinnige Werte (>2 bzw. <-1) gelten als kaputt.
async function parseClicksFile(file: File): Promise<Click[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error("Die Klick-Datei ist kein gültiges JSON.");
  }
  if (!Array.isArray(raw)) throw new Error("Die Klick-Datei muss eine JSON-Liste sein.");
  if (raw.length === 0) throw new Error("Die Klick-Datei enthält keine Einträge.");
  if (raw.length > 500) throw new Error("Die Klick-Datei hat zu viele Einträge (max. 500).");
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const out: Click[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i] as Record<string, unknown> | null;
    const where = `Eintrag ${i + 1}`;
    if (!c || typeof c !== "object") throw new Error(`Klick-Datei: ${where} ist kein Objekt.`);
    const { t, x, y, label } = c as { t?: unknown; x?: unknown; y?: unknown; label?: unknown };
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0) throw new Error(`Klick-Datei: ${where} hat kein gültiges „t" (Sekunden ≥ 0).`);
    if (typeof x !== "number" || !Number.isFinite(x) || x < -1 || x > 2) throw new Error(`Klick-Datei: ${where} hat kein gültiges „x" (0..1).`);
    if (typeof y !== "number" || !Number.isFinite(y) || y < -1 || y > 2) throw new Error(`Klick-Datei: ${where} hat kein gültiges „y" (0..1).`);
    if (label !== undefined && typeof label !== "string") throw new Error(`Klick-Datei: ${where} hat ein ungültiges „label".`);
    const click: Click = { t, x: clamp01(x), y: clamp01(y) };
    if (typeof label === "string" && label.length > 0) click.label = label.slice(0, 60);
    out.push(click);
  }
  return out;
}

export function VideoUpload({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [noMic, setNoMic] = useState(false);
  const [tutorialId, setTutorialId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const [showUrl, setShowUrl] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [clicksName, setClicksName] = useState<string | null>(null); // Anzeige des gewählten clicks.json
  const [clicksCount, setClicksCount] = useState<number | null>(null); // Anzahl akzeptierter Klick-Marker (für UI-Feedback)
  const fileRef = useRef<HTMLInputElement>(null);
  const clicksRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Job-Status pollen (mit Gesamt-Timeout, damit der Spinner nicht ewig dreht).
  // Deps nur [jobId]: der Effect beendet sich bei Terminal-Status selbst via clearInterval,
  // statt bei jedem Phasenwechsel neu zu starten (sonst Doppel-Poll + Timeout-Reset).
  useEffect(() => {
    if (!jobId) return;
    const supabase = createClient();
    const startedAt = Date.now();
    const MAX_MS = 12 * 60 * 1000; // nach 12 Min. aufgeben (Worker down / haengt)
    const iv = setInterval(async () => {
      if (Date.now() - startedAt > MAX_MS) {
        setError("Die Verarbeitung dauert ungewöhnlich lange. Schau später bei deinen Tutorials nach oder versuch es erneut.");
        setPhase("failed");
        clearInterval(iv);
        return;
      }
      const { data, error } = await supabase
        .from("video_jobs")
        .select("status, tutorial_id, error, note, progress")
        .eq("id", jobId)
        .maybeSingle();
      if (error || !data) return; // transienter Fehler -> weiter pollen bis Timeout
      if (data.status === "processing") { setPhase("processing"); setProgress(data.progress ?? null); }
      if (data.status === "done") { setTutorialId(data.tutorial_id); setNote(data.note ?? null); setPhase("done"); clearInterval(iv); }
      if (data.status === "failed") { setError(data.error || "Verarbeitung fehlgeschlagen."); setPhase("failed"); clearInterval(iv); }
    }, 4000);
    return () => clearInterval(iv);
  }, [jobId]);

  // Kern: Datei hochladen + einen video_job einreihen, jobId zurückgeben.
  // Setzt KEINE Komponenten-States — Einzel- und Bulk-Flow steuern die UI selbst.
  // `clicks` optional: nur der Einzel-Upload reicht validierte Steply-Klick-Marker durch;
  // Bulk/URL/Aufnahme lassen das Feld weg (Row ohne `clicks`).
  async function uploadOne(blob: Blob, ext: string, niceName: string, clicks?: Click[]): Promise<{ jobId: string }> {
    const supabase = createClient();
    const vpath = `${accountId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("tutorial-videos").upload(vpath, blob, { contentType: blob.type || "video/webm", upsert: false });
    if (upErr) throw upErr;
    const row: Record<string, unknown> = { account_id: accountId, video_path: vpath, title: niceName, status: "queued" };
    if (clicks && clicks.length > 0) row.clicks = clicks;
    const { data: job, error: jErr } = await supabase
      .from("video_jobs")
      .insert(row)
      .select("id").single();
    if (jErr) throw jErr;
    return { jobId: job.id };
  }

  // Einzel-Flow: wie bisher (Phase uploading -> queued, Polling via setJobId).
  // `clicks` optional (nur Einzel-Upload) — steuert auch das „mit N Klick-Markern"-Feedback.
  async function uploadAndQueue(blob: Blob, ext: string, niceName: string, clicks?: Click[]) {
    setPhase("uploading");
    setClicksCount(clicks && clicks.length > 0 ? clicks.length : null);
    try {
      const { jobId } = await uploadOne(blob, ext, niceName, clicks);
      setJobId(jobId);
      setPhase("queued");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
      setPhase("failed");
    }
  }

  const extOf = (name: string) => (name.split(".").pop() || "mp4").toLowerCase();
  const baseName = (name: string) => name.replace(/\.[^.]+$/, "");

  // Bulk-Flow: mehrere Dateien nacheinander hochladen + je einen Job einreihen.
  // KEIN jobId/Polling — die „Wird erstellt…"-Karten auf dem Dashboard übernehmen.
  // Fehler pro Datei einsammeln und mit den restlichen weitermachen.
  async function uploadBulk(files: File[]) {
    setError(null); setTutorialId(null);
    setBulkItems(files.map((f) => ({ name: f.name, status: "pending" })));
    setPhase("bulk");
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setBulkItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: "uploading" } : it)));
      try {
        await uploadOne(f, extOf(f.name), baseName(f.name));
        setBulkItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: "done" } : it)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload fehlgeschlagen.";
        setBulkItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: "error", error: msg } : it)));
      }
    }
    setPhase("bulkDone");
  }

  // Gemeinsamer Einstieg für Datei-Input UND Drag&Drop: 1 Datei = Einzel-Flow (wie
  // bisher), mehrere = Bulk-Flow. Nicht-Video-Dateien werden ignoriert/gemeldet.
  // Nur der Einzel-Upload wertet ein optional gewähltes clicks.json aus: ist es kaputt,
  // toast.error + Upload läuft OHNE Klicks weiter. Bulk ignoriert das Feld komplett.
  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list).filter((f) => f.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(f.name));
    if (files.length === 0) {
      setError("Bitte eine Video-Datei auswählen.");
      setPhase("failed");
      return;
    }
    if (files.length === 1) {
      const f = files[0];
      setError(null); setTutorialId(null);
      let clicks: Click[] | undefined;
      const clickFile = clicksRef.current?.files?.[0];
      if (clickFile) {
        try {
          clicks = await parseClicksFile(clickFile);
        } catch (err) {
          clicks = undefined;
          toast.error(err instanceof Error ? err.message : "Die Klick-Datei konnte nicht gelesen werden.", {
            description: "Das Tutorial wird trotzdem erstellt — nur ohne Klick-Marker.",
          });
        }
      }
      uploadAndQueue(f, extOf(f.name), baseName(f.name), clicks);
    } else {
      uploadBulk(files);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    handleFiles(list);
  }

  // Nur Anzeige des gewählten clicks.json — validiert/gelesen wird erst beim Upload
  // (in handleFiles), damit der Fehlerfall den Upload sauber ohne Klicks fortsetzt.
  function onPickClicks(e: React.ChangeEvent<HTMLInputElement>) {
    setClicksName(e.target.files?.[0]?.name ?? null);
  }

  function onDropVideo(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const list = e.dataTransfer.files;
    if (!list || list.length === 0) return;
    handleFiles(list);
  }

  // Video per direktem Link importieren: der Server lädt es (SSRF-geschützt) und reiht
  // den Job ein; ab da übernimmt das bestehende Polling (setJobId + Phase queued).
  async function importFromUrl() {
    const url = importUrl.trim();
    if (!url || importing) return;
    setError(null); setTutorialId(null); setImporting(true);
    try {
      const res = await fetch("/api/video-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.jobId) {
        setError(data?.error || "Import fehlgeschlagen.");
        setPhase("failed");
        return;
      }
      setJobId(data.jobId);
      setPhase("queued");
    } catch {
      setError("Import fehlgeschlagen. Bitte Link prüfen.");
      setPhase("failed");
    } finally {
      setImporting(false);
    }
  }

  async function startRecording() {
    setError(null); setTutorialId(null); setNoMic(false);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Dein Browser unterstützt keine Bildschirmaufnahme. Nutze Chrome/Edge oder lade eine Datei hoch.");
      setPhase("failed"); return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      let mic: MediaStream | null = null;
      // Ohne Ton kann „Schnitt" nicht erkannt werden und die Schritte werden schlechter
      // segmentiert -> deutlich warnen, aber Aufnahme trotzdem zulassen.
      try { mic = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setNoMic(true); }
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
    setPhase("idle"); setError(null); setTutorialId(null); setJobId(null); setNote(null); setProgress(null); setSecs(0); setNoMic(false);
    setShowUrl(false); setImportUrl(""); setImporting(false); setBulkItems([]); setDragActive(false);
    setClicksName(null); setClicksCount(null);
    if (fileRef.current) fileRef.current.value = "";
    if (clicksRef.current) clicksRef.current.value = "";
  };

  const mmss = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={(o) => {
      // Während Aufnahme/Upload NICHT schließen (Klick neben das Fenster würde sonst die laufende Aufnahme/Uploads abbrechen).
      if (!o && (phase === "recording" || phase === "uploading" || phase === "bulk")) return;
      setOpen(o);
      if (!o) reset();
    }}>
      <DialogTrigger render={<Button variant="outline"><Clapperboard className="size-4" /> Aus Video</Button>} />
      <DialogContent className="sm:max-w-md" showCloseButton={phase !== "recording" && phase !== "uploading" && phase !== "bulk"}>
        <DialogHeader><DialogTitle>Tutorial aus Video erstellen</DialogTitle></DialogHeader>

        {phase === "idle" && (
          <div
            className={`space-y-3 rounded-lg transition-shadow ${
              dragActive ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
            }`}
            onDrop={onDropVideo}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
          >
            <p className="text-sm text-muted-foreground">
              Mach die Aufgabe einmal vor und erklär dabei ganz normal. Nach jedem Schritt sagst du
              <b> „Schnitt“</b> — daraus wird ein Schritt mit Screenshot und Markierung.
            </p>

            <div className="space-y-2 rounded-lg border border-line-2 bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5 font-semibold text-ink">
                <Info className="size-3.5 text-primary" /> So wird die Aufnahme am besten
              </p>
              <ol className="list-decimal space-y-1 pl-4 marker:text-muted-foreground">
                <li>Zeig die Aufgabe <b>einmal in Ruhe</b> vor und sprich dabei, als würdest du sie einem Kollegen erklären.</li>
                <li>Bewege die <b>Maus aufs Ziel</b> (Knopf/Feld) und halt kurz drauf, bevor du klickst.</li>
                <li>Ist der Schritt fertig, sag <b>„Schnitt“</b> — das trennt sauber zum nächsten Schritt.</li>
                <li>Ruhig arbeiten, nicht hetzen. Am Ende auf <b>„Aufnahme beenden“</b>.</li>
              </ol>
              <p className="pt-0.5">Kein Sekunden-Zählen, keine anderen Zauberwörter nötig. Feinschliff geht danach im Editor.</p>
            </div>

            <input ref={fileRef} type="file" accept="video/*" multiple onChange={onPick} className="hidden" />
            <input ref={clicksRef} type="file" accept=".json,application/json" onChange={onPickClicks} className="hidden" />
            <Button className="w-full" onClick={startRecording}>
              <Circle className="size-4 fill-current text-no" /> Jetzt aufnehmen (Bildschirm + Mikro)
            </Button>
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
              <UploadCloud className="size-4" /> {dragActive ? "Videos hier ablegen" : "Datei(en) hochladen oder hierher ziehen"}
            </Button>

            {/* Optionales zweites Feld: Klick-Daten vom Steply Recorder. Dezent, nur beim
                Einzel-Upload wirksam (bei mehreren Dateien wird es ignoriert). */}
            <button
              type="button"
              onClick={() => clicksRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-line-2 bg-muted/20 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MousePointerClick className="size-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">
                {clicksName ? (
                  <>Klick-Daten: <b className="text-ink">{clicksName}</b></>
                ) : (
                  "Klick-Daten (clicks.json, optional — vom Steply Recorder)"
                )}
              </span>
              {clicksName && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setClicksName(null); if (clicksRef.current) clicksRef.current.value = ""; }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setClicksName(null); if (clicksRef.current) clicksRef.current.value = ""; } }}
                  className="shrink-0 rounded px-1 text-muted-foreground hover:text-ink"
                >
                  entfernen
                </span>
              )}
            </button>
            <p className="-mt-1 px-1 text-[11px] leading-snug text-muted-foreground/80">
              Nur bei einer einzelnen Datei: setzt exakte Schrittgrenzen und Markierungen.
            </p>
            {!showUrl ? (
              <Button variant="ghost" className="w-full" onClick={() => setShowUrl(true)}>
                <Link2 className="size-4" /> Von URL importieren
              </Button>
            ) : (
              <div className="space-y-2 rounded-lg border border-line-2 bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  Direkter Video-Link (MP4/WebM). Loom: über <b>Teilen → Video herunterladen</b> und hier hochladen.
                </p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    inputMode="url"
                    autoFocus
                    placeholder="https://…/video.mp4"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") importFromUrl(); }}
                    className="min-w-0 flex-1 rounded-md border border-line-2 bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button onClick={importFromUrl} disabled={importing || !importUrl.trim()}>
                    {importing ? <Loader2 className="size-4 animate-spin" /> : "Importieren"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {phase === "recording" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex items-center gap-2 text-no">
              <Circle className="size-3 animate-pulse fill-current" /> <span className="font-mono text-lg">{mmss}</span>
            </div>
            <p className="text-sm text-muted-foreground">Aufnahme läuft – mach den Schritt, sag dann <b>„Schnitt“</b>. So entsteht jeder Schritt sauber.</p>
            {noMic && (
              <div className="flex items-start gap-2 rounded-lg border border-no/30 bg-no/5 p-2.5 text-left text-xs text-no">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  <b>Kein Mikrofon.</b> Ohne Ton wird „Schnitt“ nicht erkannt und die Schritte werden schlechter.
                  Für beste Ergebnisse abbrechen, Mikro erlauben und neu starten.
                </span>
              </div>
            )}
            <Button className="w-full" onClick={stopRecording}><Square className="size-4 fill-current" /> Aufnahme beenden</Button>
          </div>
        )}

        {(phase === "uploading" || phase === "queued" || phase === "processing") && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-ink">
              {phase === "uploading"
                ? "Video wird hochgeladen …"
                : phase === "queued"
                ? "In der Warteschlange …"
                : progress
                ? `${progress} …`
                : "KI erstellt das Tutorial …"}
            </p>
            {clicksCount !== null && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <MousePointerClick className="size-3.5 shrink-0" /> mit {clicksCount} {clicksCount === 1 ? "Klick-Marker" : "Klick-Markern"}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Sie können das Fenster schließen – der Entwurf erscheint auf dem Dashboard.
            </p>
          </div>
        )}

        {phase === "bulk" && (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-ink">
              <Loader2 className="size-4 animate-spin text-primary" />
              {bulkItems.filter((it) => it.status === "done" || it.status === "error").length}/{bulkItems.length} hochgeladen …
            </div>
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line-2 bg-muted/40 p-2 text-xs">
              {bulkItems.map((it, i) => (
                <li key={i} className="flex items-center gap-2">
                  {it.status === "done" ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-yes" />
                  ) : it.status === "error" ? (
                    <AlertCircle className="size-3.5 shrink-0 text-no" />
                  ) : it.status === "uploading" ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Circle className="size-3.5 shrink-0 text-muted-foreground/50" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-muted-foreground" title={it.name}>{it.name}</span>
                  {it.status === "error" && <span className="shrink-0 text-no">Fehler</span>}
                </li>
              ))}
            </ul>
            <p className="text-center text-xs text-muted-foreground">Bitte kurz warten – die Videos werden nacheinander hochgeladen.</p>
          </div>
        )}

        {phase === "bulkDone" && (() => {
          const okCount = bulkItems.filter((it) => it.status === "done").length;
          const errs = bulkItems.filter((it) => it.status === "error");
          return (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="size-8 text-yes" />
              <p className="text-sm font-medium text-ink">
                {okCount} {okCount === 1 ? "Video" : "Videos"} eingereiht 🎉
              </p>
              <p className="max-w-[22rem] text-xs text-muted-foreground">
                Die Entwürfe erscheinen nacheinander auf dem Dashboard – der Dialog kann zu.
              </p>
              {errs.length > 0 && (
                <div className="w-full space-y-1 rounded-lg border border-no/30 bg-no/5 p-2.5 text-left text-xs text-no">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <AlertCircle className="size-3.5 shrink-0" /> {errs.length} {errs.length === 1 ? "Datei" : "Dateien"} fehlgeschlagen:
                  </p>
                  <ul className="space-y-0.5 pl-5">
                    {errs.map((it, i) => (
                      <li key={i} className="list-disc break-words">
                        <span className="font-medium">{it.name}</span>{it.error ? ` – ${it.error}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={reset}>Noch Videos hochladen</Button>
            </div>
          );
        })()}

        {phase === "done" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="size-8 text-yes" />
            <p className="text-sm font-medium text-ink">Entwurf ist fertig! 🎉</p>
            {note && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-50 p-2.5 text-left text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>{note}</span>
              </div>
            )}
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
