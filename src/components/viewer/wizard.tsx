"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Check, Image as ImageIcon, X, ThumbsUp, ThumbsDown, Loader2, Volume2, VolumeX, Pause, PlayCircle, PauseCircle } from "lucide-react";
import type { Step, StepBranch } from "@/lib/types";
import { ViewerImage } from "@/components/viewer/viewer-image";
import { RichTextView } from "@/components/viewer/rich-text-view";
import { recordFeedback, recordStepFeedback } from "@/app/h/actions";
import { dateDe } from "@/lib/format";
import { labelsFor, type HubLabels } from "@/lib/i18n-hub";

export function Wizard({
  rootId,
  steps,
  branches,
  imageUrls,
  audioUrls = {},
  placeholders = false,
  accountSlug,
  tutorialSlug,
  internalMode = false,
  completion,
  onComplete,
  onUncomplete,
  labels,
}: {
  rootId: string | null;
  steps: Step[];
  branches: StepBranch[];
  imageUrls: Record<string, string>;
  /** Vorlese-Audio je Schritt (Welle 14). Nur öffentlicher Viewer; sonst leer. */
  audioUrls?: Record<string, string>;
  placeholders?: boolean;
  accountSlug?: string;
  tutorialSlug?: string;
  /** Interner Lern-Modus (/app/lernen): kein öffentliches Feedback, dafür Schulungsnachweis. */
  internalMode?: boolean;
  completion?: { completed: boolean; completedAt: string | null };
  onComplete?: () => Promise<void>;
  onUncomplete?: () => Promise<void>;
  /** UI-Strings; Default = deutsche Strings (damit /app/lernen & Vorschau unverändert bleiben). */
  labels?: HubLabels;
}) {
  const L = labels ?? labelsFor("de");
  const stepById = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);
  const branchesByStep = useMemo(() => {
    const m = new Map<string, StepBranch[]>();
    for (const b of branches) {
      const list = m.get(b.step_id) ?? [];
      list.push(b);
      m.set(b.step_id, list);
    }
    for (const l of m.values()) l.sort((a, b) => a.position - b.position);
    return m;
  }, [branches]);

  const [cur, setCur] = useState<string | null>(rootId);
  const [history, setHistory] = useState<string[]>([]);

  // Hat das Tutorial ÜBERHAUPT Audio? Nur dann erscheinen Ton-/Auto-Schalter.
  // (lernen/internalMode/Vorschau reichen keine audioUrls -> hier immer false.)
  const hasAudio = useMemo(
    () => Object.keys(audioUrls).some((k) => audioUrls[k]),
    [audioUrls],
  );
  const [lightbox, setLightbox] = useState<{
    url: string;
    highlights: NonNullable<Step["highlights"]>;
    image_width: number | null;
    image_height: number | null;
  } | null>(null);
  const [feedback, setFeedback] = useState<"sent" | null>(null);
  // Schritt-IDs, für die schon „komme nicht weiter" gemeldet wurde (1×/Schritt).
  const [stuckSent, setStuckSent] = useState<Set<string>>(() => new Set());

  // Interner Schulungsnachweis: optimistischer Absolviert-Zustand.
  const [done, setDone] = useState<boolean>(completion?.completed ?? false);
  const [doneAt, setDoneAt] = useState<string | null>(completion?.completedAt ?? null);
  const [markBusy, setMarkBusy] = useState(false);

  const markDone = async () => {
    if (markBusy || !onComplete) return;
    const now = new Date().toISOString();
    setDone(true);
    setDoneAt(now); // optimistisch
    setMarkBusy(true);
    try {
      await onComplete();
    } catch {
      setDone(false);
      setDoneAt(null);
    } finally {
      setMarkBusy(false);
    }
  };
  const undoDone = async () => {
    if (markBusy || !onUncomplete) return;
    const prevAt = doneAt;
    setDone(false);
    setDoneAt(null); // optimistisch
    setMarkBusy(true);
    try {
      await onUncomplete();
    } catch {
      setDone(true);
      setDoneAt(prevAt);
    } finally {
      setMarkBusy(false);
    }
  };

  // Position übersteht Reload/Zurück (REVIEW A1): pro Tutorial in sessionStorage.
  // Nur wiederherstellen, wenn alle gespeicherten Schritt-IDs noch existieren
  // (Tutorial könnte inzwischen geändert worden sein).
  const storKey =
    accountSlug && tutorialSlug ? `steply-wiz-${accountSlug}-${tutorialSlug}` : null;
  useEffect(() => {
    if (!storKey) return;
    try {
      const raw = sessionStorage.getItem(storKey);
      if (!raw) return;
      const s = JSON.parse(raw) as { cur?: string | null; history?: string[] };
      if (!Array.isArray(s.history)) return;
      const validCur = s.cur === null || (typeof s.cur === "string" && stepById.has(s.cur));
      const validHist = s.history.every((h) => typeof h === "string" && stepById.has(h));
      if (validCur && validHist && (s.cur !== rootId || s.history.length > 0)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: einmalige Positions-Wiederherstellung aus sessionStorage nach Mount (hydration-sicher), kein Cascade
        setCur(s.cur ?? null);
        setHistory(s.history);
      }
    } catch {
      /* Tracking-Komfort darf nie brechen */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storKey]);
  useEffect(() => {
    if (!storKey) return;
    try {
      sessionStorage.setItem(storKey, JSON.stringify({ cur, history }));
    } catch {}
  }, [cur, history, storKey]);

  const sendFeedback = (helpful: boolean) => {
    setFeedback("sent"); // optimistisch — Tracking darf den Endkunden nie blockieren
    if (accountSlug && tutorialSlug) void recordFeedback(accountSlug, tutorialSlug, helpful);
  };

  const sendStuck = (stepId: string, stepTitle: string | null) => {
    setStuckSent((s) => new Set(s).add(stepId)); // optimistisch, 1×/Schritt
    if (accountSlug && tutorialSlug)
      void recordStepFeedback(accountSlug, tutorialSlug, stepTitle ?? "");
  };

  const titleRef = useRef<HTMLHeadingElement>(null);

  // Vorlesen (Welle 14): ein einziges <audio>-Element, per Ref gesteuert. Beim
  // Schrittwechsel stoppt die Wiedergabe (siehe Effekt weiter unten).
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  // --- Audio-UX Welle 16 (nur öffentlicher Wizard, hasAudio) ---
  // Ton-Schalter: persistent (localStorage, EIN globaler Key, Default: Ton AN).
  // Wegen Browser-Autoplay-Policy startet Auto-Play trotzdem erst nach einer Geste.
  const MUTE_KEY = "steply-tts-muted";
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- einmalige Übernahme des persistenten Stumm-Zustands nach Mount (hydration-sicher: Server rendert immer „Ton an“)
      if (localStorage.getItem(MUTE_KEY) === "1") setMuted(true);
    } catch {}
  }, []);

  // Auto-Modus: NICHT persistent (bewusst pro Besuch). Impliziert Ton an.
  const [auto, setAuto] = useState(false);
  // „Hatten wir schon eine User-Geste?“ (Start eines Tons ODER Weiter/Zurück).
  // Erst dann darf ein neuer Schritt automatisch vorgelesen werden (Autoplay-Policy).
  const gestureRef = useRef(false);
  // Timer für audiolose Schritte im Auto-Modus (4 s -> weiter).
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAutoTimer = useCallback(() => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }, []);

  // Wiedergabe versuchen; bei Block durch die Autoplay-Policy still zurückfallen
  // (kein Fehler-Toast) — der ▶-Knopf bleibt der Einstieg.
  const tryPlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    void el.play().catch(() => setPlaying(false));
  }, []);

  const toggleAudio = () => {
    const el = audioRef.current;
    if (!el) return;
    gestureRef.current = true; // erster Ton = Geste vorhanden
    if (el.paused) tryPlay();
    else el.pause();
  };

  // Ton-Schalter umlegen. Stumm ⇒ laufende Wiedergabe stoppen + Auto-Modus aus.
  const toggleMuted = () => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {}
      if (next) {
        audioRef.current?.pause();
        setAuto(false);
        clearAutoTimer();
      }
      return next;
    });
  };

  // Auto-Modus umlegen. Aktivieren impliziert Ton an + zählt als Geste.
  const toggleAuto = () => {
    setAuto((a) => {
      const next = !a;
      if (next) {
        gestureRef.current = true;
        if (muted) {
          setMuted(false);
          try {
            localStorage.setItem(MUTE_KEY, "0");
          } catch {}
        }
      } else {
        clearAutoTimer();
      }
      return next;
    });
  };

  // Linear = keine Verzweigungen: kein Schritt ist eine Entscheidung UND kein
  // Schritt hat mehr als einen Ausgang. Nur dann ist „Schritt x von y" ehrlich.
  const linearTotal = useMemo(() => {
    const linear =
      !steps.some((s) => s.is_decision) &&
      [...branchesByStep.values()].every((b) => b.length <= 1);
    if (!linear) return null;
    // Länge des Pfades ab root entlang des einzigen Ausgangs zählen.
    let count = 0;
    let id: string | null = rootId;
    const seen = new Set<string>();
    while (id != null && stepById.has(id) && !seen.has(id)) {
      seen.add(id);
      count++;
      id = branchesByStep.get(id)?.[0]?.target_step_id ?? null;
    }
    return count > 0 ? count : null;
  }, [steps, branchesByStep, stepById, rootId]);

  const go = (target: string | null) => {
    gestureRef.current = true; // Navigation = Geste vorhanden (erlaubt Auto-Play)
    setHistory((h) => (cur != null ? [...h, cur] : h));
    setCur(target);
  };
  const back = () => {
    gestureRef.current = true;
    setHistory((h) => {
      if (!h.length) return h;
      const n = [...h];
      setCur(n.pop() ?? rootId);
      return n;
    });
  };
  const restart = () => {
    setCur(rootId);
    setHistory([]);
  };

  const step = cur != null ? stepById.get(cur) : null;

  // Auto-Modus: zum nächsten Schritt entlang des Standard-Ausgangs (branches[0]).
  // Nur für NICHT-Entscheidungsschritte gedacht (Entscheidungen warten auf Klick).
  const goNext = useCallback(() => {
    setCur((c) => {
      if (c == null) return c;
      const target = branchesByStep.get(c)?.[0]?.target_step_id ?? null;
      setHistory((h) => [...h, c]);
      return target;
    });
  }, [branchesByStep]);

  // Nach Schrittwechsel Fokus auf den Schritt-Titel (A11y: Screenreader/Tastatur).
  useEffect(() => {
    if (step) titleRef.current?.focus();
  }, [cur, step]);

  // Schrittwechsel stoppt die Wiedergabe und setzt den Play-Button zurück.
  useEffect(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: Play-Zustand beim Schrittwechsel zurücksetzen
    setPlaying(false);
  }, [cur]);

  // Auto-Play pro Schritt + Auto-Modus-Steuerung. Läuft bei jedem Schrittwechsel.
  // Bedingungen (öffentlicher Wizard mit Audio):
  //  - Ton nicht stumm UND (schon eine Geste ODER Auto-Modus) UND der Schritt hat Audio
  //    -> automatisch abspielen (play()-Promise fällt still zurück, siehe tryPlay).
  //  - Auto-Modus + Schritt OHNE Audio -> nach 4 s weiter (audiolose Schritte).
  // Der ▶-Knopf am ersten Schritt bleibt der Einstieg, weil ohne Geste nichts startet.
  useEffect(() => {
    clearAutoTimer();
    if (!hasAudio || muted || step == null) return;
    const stepHasAudio = !!(cur && audioUrls[cur]);
    if (stepHasAudio) {
      if (gestureRef.current || auto) tryPlay();
      // ended-Handler (im <audio>) übernimmt das Weiterschalten im Auto-Modus.
      return;
    }
    // Schritt ohne Audio: im Auto-Modus nach 4 s weiter (aber nicht an Entscheidungen).
    if (auto && !step.is_decision) {
      autoTimerRef.current = setTimeout(goNext, 4000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gezielt auf Schrittwechsel + Moduswechsel reagieren; Refs (gesture) sind stabil
  }, [cur, auto, muted, hasAudio]);

  // Auto-Modus pausiert, wenn der Tab in den Hintergrund geht (visibilitychange).
  useEffect(() => {
    if (!auto) return;
    const onVis = () => {
      if (document.hidden) {
        audioRef.current?.pause();
        clearAutoTimer();
      } else {
        // Zurück im Vordergrund: laufenden Schritt fortsetzen.
        const stepHasAudio = !!(cur && audioUrls[cur]);
        if (stepHasAudio) tryPlay();
        else if (step && !step.is_decision && !autoTimerRef.current)
          autoTimerRef.current = setTimeout(goNext, 4000);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, cur]);

  // Auto-Modus endet am Fertig-Screen (kein aktueller Schritt mehr).
  useEffect(() => {
    if (auto && step == null) {
      clearAutoTimer();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: Auto-Modus am Ende zurücksetzen
      setAuto(false);
    }
  }, [auto, step, clearAutoTimer]);

  // Timer/Audio beim Unmount aufräumen.
  useEffect(() => () => clearAutoTimer(), [clearAutoTimer]);

  // Lightbox per Escape schließen.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  return (
    <div
      data-tx="step"
      className="w-full border bg-white p-4 shadow-[0_10px_40px_rgba(16,21,36,0.08)] sm:p-5"
      style={{
        borderRadius: "var(--brand-radius, 16px)",
        borderColor: "var(--brand-card-border, rgba(16,21,36,0.06))",
        borderWidth: "var(--brand-card-bw, 1px)",
      }}
    >
      {/* Audio-UX Welle 16: Ton- und Auto-Schalter oben rechts, nur wenn das
          Tutorial überhaupt Vorlese-Audio hat (also nur im öffentlichen Wizard). */}
      {hasAudio && (
        <div className="mb-2 flex items-center justify-end gap-1.5">
          <button
            type="button"
            data-tx="tts-auto"
            onClick={toggleAuto}
            aria-pressed={auto}
            aria-label={auto ? L.autoOff : L.autoOn}
            title={auto ? L.autoOff : L.autoOn}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors"
            style={
              auto
                ? { background: "var(--brand-accent)", color: "var(--brand-accent-fg, #fff)" }
                : { background: "var(--brand-soft, #f1f2f6)", color: "var(--brand-ink, #3b4254)" }
            }
          >
            {auto ? <PauseCircle className="size-3.5" /> : <PlayCircle className="size-3.5" />}
            <span>Auto</span>
          </button>
          <button
            type="button"
            data-tx="tts-mute"
            onClick={toggleMuted}
            aria-pressed={muted}
            aria-label={muted ? L.soundOff : L.soundOn}
            title={muted ? L.soundOff : L.soundOn}
            className="flex size-7 shrink-0 items-center justify-center rounded-full transition-colors"
            style={{ background: "var(--brand-soft, #f1f2f6)", color: "var(--brand-ink, #3b4254)" }}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
        </div>
      )}
      {step ? (
        <>
          {linearTotal != null && (
            <div
              data-tx="progress"
              className="mb-3 text-xs font-semibold text-muted-foreground"
            >
              {L.stepXofY
                .replace("{n}", String(history.length + 1))
                .replace("{total}", String(linearTotal))}
            </div>
          )}
          {imageUrls[step.id] ? (
            <button
              type="button"
              onClick={() =>
                setLightbox({
                  url: imageUrls[step.id],
                  highlights: step.highlights ?? [],
                  image_width: step.image_width,
                  image_height: step.image_height,
                })
              }
              aria-label="Bild vergrößern"
              className="mb-4 block w-full cursor-zoom-in"
            >
              <ViewerImage
                url={imageUrls[step.id]}
                highlights={step.highlights ?? []}
                width={step.image_width}
                height={step.image_height}
                alt={step.title ?? ""}
              />
            </button>
          ) : placeholders ? (
            <div className="mb-4">
              <StepPlaceholder title={step.title} />
            </div>
          ) : null}
          {(step.title || audioUrls[step.id]) && (
            <div className="flex items-start gap-2">
              {step.title ? (
                <h2
                  ref={titleRef}
                  tabIndex={-1}
                  data-tx="step-title"
                  className="min-w-0 flex-1 text-lg font-bold outline-none sm:text-xl"
                  style={{
                    color: "var(--brand-title, var(--brand-ink))",
                    fontFamily: "var(--brand-font-heading)",
                    fontWeight: "var(--brand-heading-weight, 700)",
                  }}
                >
                  {step.title}
                </h2>
              ) : (
                <span className="flex-1" />
              )}
              {/* Vorlesen (Welle 14): kleiner runder Play/Pause-Knopf, nur wenn der
                  Schritt eine Audio-URL hat. Ein <audio>-Element via Ref (oben). */}
              {audioUrls[step.id] && (
                <>
                  <button
                    type="button"
                    data-tx="tts"
                    onClick={toggleAudio}
                    aria-label={playing ? L.pauseAloud : L.readAloud}
                    className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95"
                    style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg, #fff)" }}
                  >
                    {playing ? <Pause className="size-4" /> : <Volume2 className="size-4" />}
                  </button>
                  <audio
                    ref={audioRef}
                    src={audioUrls[step.id]}
                    preload="none"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => {
                      setPlaying(false);
                      // Auto-Modus: nach dem Vorlesen weiter — außer an
                      // Entscheidungsschritten, die auf die Antwort warten.
                      if (auto && step && !step.is_decision) goNext();
                    }}
                  />
                </>
              )}
            </div>
          )}
          <div data-tx="step-body" className="mt-1.5 text-base leading-relaxed text-ink-2">
            <RichTextView doc={step.body} />
          </div>

          <div className="mt-5">
            {step.is_decision ? (
              <div className="flex flex-col gap-2">
                {(branchesByStep.get(step.id) ?? []).map((b) => (
                  <button
                    key={b.id}
                    data-tx="btn"
                    onClick={() => go(b.target_step_id)}
                    className="w-full border-2 bg-white px-4 py-3 text-base font-bold transition-transform active:translate-y-px"
                    style={{
                      borderColor: b.color ?? "var(--brand-accent-strong, var(--brand-accent))",
                      color: b.color ?? "var(--brand-accent-strong, var(--brand-accent))",
                      borderRadius: "var(--brand-btn-radius, 12px)",
                    }}
                  >
                    {b.label || L.next}
                  </button>
                ))}
              </div>
            ) : (
              <NextButton
                branches={branchesByStep.get(step.id) ?? []}
                onNext={(t) => go(t)}
                nextLabel={L.next}
                doneLabel={L.done}
              />
            )}

            {history.length > 0 && (
              <button
                onClick={back}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold text-muted-foreground"
              >
                <ChevronLeft className="size-4" /> {L.back}
              </button>
            )}

            {/* Inline-Feedback pro Schritt (REVIEW H): dezenter Ausweg, wenn der
                Nutzer nicht weiterkommt. Landet als negatives Feedback-Event mit
                Schritt-Titel -> taucht als Wissenslücke in der Insights-Karte auf.
                Intern ausgeblendet: schriebe public-Events (falsche Semantik). */}
            {!internalMode && accountSlug && tutorialSlug && (
              <div className="mt-3 text-center" data-tx="stuck">
                {stuckSent.has(step.id) ? (
                  <p className="text-xs text-muted-foreground" role="status">
                    {L.stuckThanks}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => sendStuck(step.id, step.title)}
                    className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-[var(--brand-ink)]"
                  >
                    {L.stuck}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center py-8 text-center">
          <div
            className="flex size-14 items-center justify-center rounded-full"
            style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg, #fff)" }}
          >
            <Check className="size-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-[var(--brand-ink)]">{L.finished}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {L.finishedSub}
          </p>

          {/* Interner Schulungsnachweis statt öffentlichem Feedback. */}
          {internalMode && (
            <div className="mt-4">
              {done ? (
                <div className="flex flex-col items-center gap-1.5">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-yes" role="status">
                    <Check className="size-4" /> Absolviert{doneAt ? ` am ${dateDe(doneAt)}` : ""}
                  </p>
                  {onUncomplete && (
                    <button
                      type="button"
                      onClick={undoDone}
                      disabled={markBusy}
                      className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-ink disabled:opacity-60"
                    >
                      Zurücknehmen
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={markDone}
                  disabled={markBusy || !onComplete}
                  className="inline-flex items-center gap-2 rounded-xl bg-yes px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-yes/90 disabled:opacity-60"
                >
                  {markBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  Als absolviert markieren
                </button>
              )}
            </div>
          )}

          {!internalMode && accountSlug && tutorialSlug && (
            <div className="mt-4">
              {feedback === "sent" ? (
                <p className="text-sm font-medium text-muted-foreground" role="status">
                  {L.feedbackThanks}
                </p>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm text-muted-foreground">{L.helpful}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => sendFeedback(true)}
                      aria-label={L.yes}
                      className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-[var(--brand-accent)]"
                    >
                      <ThumbsUp className="size-4" /> {L.yes}
                    </button>
                    <button
                      onClick={() => sendFeedback(false)}
                      aria-label={L.no}
                      className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-[var(--brand-accent)]"
                    >
                      <ThumbsDown className="size-4" /> {L.no}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={restart}
            className="mt-5 flex items-center gap-1.5 px-5 py-3 text-base font-semibold"
            style={{
              background: "var(--brand-accent)",
              color: "var(--brand-accent-fg, #fff)",
              borderRadius: "var(--brand-btn-radius, 12px)",
            }}
          >
            <RotateCcw className="size-4" /> {L.restart}
          </button>
          {history.length > 0 && (
            <button
              onClick={back}
              className="mt-2 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-muted-foreground"
            >
              <ChevronLeft className="size-4" /> {L.back}
            </button>
          )}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Bildvorschau"
        >
          {/* Gleiche Darstellung wie im Schritt — inkl. Markierungen (nicht nur das
              rohe Bild). Breite so, dass Bild samt Seitenverhältnis in 92vh/95vw passt. */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width:
                lightbox.image_width && lightbox.image_height
                  ? `min(95vw, calc(92vh * ${lightbox.image_width / lightbox.image_height}))`
                  : "min(95vw, 1100px)",
            }}
          >
            <ViewerImage
              url={lightbox.url}
              highlights={lightbox.highlights}
              width={lightbox.image_width}
              height={lightbox.image_height}
              alt=""
            />
          </div>
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Schließen"
            className="fixed right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-lg transition-transform hover:scale-105"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Platzhalter-Grafik für Standard-Templates ohne echten Screenshot. */
function StepPlaceholder({ title }: { title: string | null }) {
  return (
    <div
      className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 border border-dashed text-center"
      style={{
        borderColor: "color-mix(in srgb, var(--brand-accent) 35%, transparent)",
        background: "color-mix(in srgb, var(--brand-accent) 7%, white)",
        borderRadius: "var(--brand-radius, 12px)",
      }}
    >
      <ImageIcon className="size-8" style={{ color: "var(--brand-accent)" }} />
      <span className="max-w-[80%] text-xs font-medium text-muted-foreground">
        {title?.trim() || "Screenshot folgt"}
      </span>
    </div>
  );
}

function NextButton({
  branches,
  onNext,
  nextLabel,
  doneLabel,
}: {
  branches: StepBranch[];
  onNext: (target: string | null) => void;
  nextLabel: string;
  doneLabel: string;
}) {
  const target = branches[0]?.target_step_id ?? null;
  const hasNext = branches.length > 0 && target != null;
  return (
    <button
      data-tx="btn"
      onClick={() => onNext(target)}
      className="flex w-full items-center justify-center gap-2 px-4 py-3 text-base font-semibold transition-transform active:translate-y-px"
      style={{
        background: "var(--brand-accent)",
        color: "var(--brand-accent-fg, #fff)",
        borderRadius: "var(--brand-btn-radius, 12px)",
      }}
    >
      {hasNext ? (
        <>
          {nextLabel} <ChevronRight className="size-5" />
        </>
      ) : (
        <>
          {doneLabel} <Check className="size-5" />
        </>
      )}
    </button>
  );
}
