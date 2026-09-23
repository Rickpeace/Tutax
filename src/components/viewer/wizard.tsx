"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Check, Image as ImageIcon, X, ThumbsUp, ThumbsDown, Loader2, Volume2, VolumeX, Pause, PlayCircle, PauseCircle, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import type { Step, StepBranch } from "@/lib/types";
import { ViewerImage } from "@/components/viewer/viewer-image";
import { RichTextView } from "@/components/viewer/rich-text-view";
import { recordFeedback, recordStepFeedback } from "@/app/h/actions";
import { dateDe } from "@/lib/format";
import { labelsFor, type HubLabels } from "@/lib/i18n-hub";
import { backAction, nextSnapshot, type WizMove, type WizSnapshot } from "@/lib/wizard-history";
import { resolveRoot } from "@/lib/builder/tree";

/** Schlüssel, unter dem der Wizard seinen Stand im Browser-Verlaufseintrag ablegt. */
const WIZ_STATE = "steplyWizard";

export function Wizard({
  rootId: rootIdProp,
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
  chatAvailable = true,
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
  /** Gibt es den Hilfe-Assistenten auf dieser Seite (ab Pro)? Sonst kein Verweis darauf. */
  chatAvailable?: boolean;
}) {
  const L = labels ?? labelsFor("de");
  const stepById = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);
  // Gleiche Startschritt-Regel wie Editor/Druck (fehlt der gespeicherte Start, nicht sofort „Fertig“).
  const rootId = useMemo(() => resolveRoot(steps, branches, rootIdProp), [steps, branches, rootIdProp]);
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
    /** Alt-Text = Schritt-Titel (wie am Bild im Schritt selbst). */
    alt: string;
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

  // ---- Browser-Verlauf (Welle 52) ----------------------------------------
  // Jeder Schrittwechsel legt einen Verlaufseintrag an, der den kompletten Stand
  // (aktueller Schritt + Weg dorthin) trägt. So geht der Zurück-Knopf des Browsers
  // EINEN Schritt zurück statt die Anleitung zu verlassen; Vorwärts funktioniert
  // genauso, und erst am ersten Schritt verlässt Zurück die Seite.
  // WICHTIG: Der bestehende Zustand (Next.js-Router-Interna) wird mitkopiert —
  // ohne ihn lädt der Router bei popstate die Seite komplett neu.
  const depthRef = useRef(0);
  // Entstand der aktuelle Verlaufseintrag durch einen Vorwärts-Schritt? Nur dann darf
  // „Zurück“ den Browser zurückschicken (lib/wizard-history.ts, backAction).
  const fwdRef = useRef(false);
  // Aktueller Stand für Rückrufe (Timer/„Ton zu Ende“), die sonst veraltete Werte sähen.
  const stateRef = useRef<{ cur: string | null; history: string[] }>({ cur: rootId, history: [] });

  const writeHistory = useCallback(
    (prevCur: string | null, nextCur: string | null, nextHistory: string[], move: WizMove) => {
      if (typeof window === "undefined") return;
      const { snap, push } = nextSnapshot(
        { cur: prevCur, depth: depthRef.current, fwd: fwdRef.current },
        nextCur,
        nextHistory,
        move,
      );
      depthRef.current = snap.depth;
      fwdRef.current = snap.fwd === true;
      try {
        const next = { ...(window.history.state ?? {}), [WIZ_STATE]: snap };
        if (push) window.history.pushState(next, "");
        else window.history.replaceState(next, "");
      } catch {
        /* Verlaufs-Komfort darf nie brechen */
      }
    },
    [],
  );

  /**
   * Einzige Stelle, die den Schritt wechselt — hält React-Zustand und Verlauf synchron.
   * `move` bestimmt, ob ein neuer Verlaufseintrag entsteht (Vorwärts/Sprung) oder der
   * aktuelle ersetzt wird (Zurück ohne passenden Vorgänger-Eintrag).
   */
  const navigate = useCallback(
    (nextCur: string | null, nextHistory: string[], move: WizMove) => {
      const prevCur = stateRef.current.cur;
      stateRef.current = { cur: nextCur, history: nextHistory };
      setCur(nextCur);
      setHistory(nextHistory);
      writeHistory(prevCur, nextCur, nextHistory, move);
    },
    [writeHistory],
  );

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const snap = (e.state as Record<string, unknown> | null)?.[WIZ_STATE] as
        | WizSnapshot
        | undefined;
      if (!snap || typeof snap !== "object") return;
      const nc = typeof snap.cur === "string" && stepById.has(snap.cur) ? snap.cur : null;
      const nh = Array.isArray(snap.history)
        ? snap.history.filter((h) => typeof h === "string" && stepById.has(h))
        : [];
      depthRef.current = typeof snap.depth === "number" ? snap.depth : 0;
      fwdRef.current = snap.fwd === true;
      stateRef.current = { cur: nc, history: nh };
      setCur(nc);
      setHistory(nh);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [stepById]);

  // Position übersteht Reload/Zurück (REVIEW A1): pro Tutorial in sessionStorage.
  // Nur wiederherstellen, wenn alle gespeicherten Schritt-IDs noch existieren
  // (Tutorial könnte inzwischen geändert worden sein). Der Verlaufseintrag dieses
  // Browser-Eintrags hat Vorrang — er ist genauer als der tab-weite Speicher.
  const storKey =
    accountSlug && tutorialSlug ? `steply-wiz-${accountSlug}-${tutorialSlug}` : null;
  useEffect(() => {
    let initCur: string | null = rootId;
    let initHistory: string[] = [];
    const valid = (c: unknown, h: unknown): h is string[] =>
      (c === null || (typeof c === "string" && stepById.has(c))) &&
      Array.isArray(h) &&
      h.every((x) => typeof x === "string" && stepById.has(x));
    try {
      const snap = (window.history.state as Record<string, unknown> | null)?.[WIZ_STATE] as
        | WizSnapshot
        | undefined;
      if (snap && typeof snap === "object" && valid(snap.cur, snap.history)) {
        initCur = snap.cur;
        initHistory = snap.history;
        depthRef.current = typeof snap.depth === "number" ? snap.depth : 0;
        fwdRef.current = snap.fwd === true;
      } else if (storKey) {
        // Aus dem Tab-Speicher (z. B. nach Sprachwechsel oder erneutem Öffnen): der Weg
        // steht NICHT im Browser-Verlauf -> „Zurück“ geht den Weg ohne history.back().
        const raw = sessionStorage.getItem(storKey);
        const s = raw ? (JSON.parse(raw) as { cur?: string | null; history?: string[] }) : null;
        if (s && valid(s.cur ?? null, s.history)) {
          initCur = s.cur ?? null;
          initHistory = s.history;
        }
      }
    } catch {
      /* Tracking-Komfort darf nie brechen */
    }
    stateRef.current = { cur: initCur, history: initHistory };
    if (initCur !== rootId || initHistory.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: einmalige Positions-Wiederherstellung nach Mount (hydration-sicher), kein Cascade
      setCur(initCur);
      setHistory(initHistory);
    }
    // Startposition in den BESTEHENDEN Verlaufseintrag schreiben (kein neuer Eintrag):
    // so verlässt Zurück am ersten Schritt die Seite und ein Neuladen hält die Position.
    writeHistory(initCur, initCur, initHistory, "init");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur beim ersten Rendern
  }, []);
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

  // Linearer Pfad (geordnete Schritt-IDs) für die Schrittlisten-Sidebar
  // (Design 3a, nur Desktop + nur wenn es keinen Verzweigungs-Baum gibt).
  const linearPath = useMemo(() => {
    if (linearTotal == null) return null;
    const ids: string[] = [];
    let id: string | null = rootId;
    const seen = new Set<string>();
    while (id != null && stepById.has(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
      id = branchesByStep.get(id)?.[0]?.target_step_id ?? null;
    }
    return ids;
  }, [linearTotal, rootId, stepById, branchesByStep]);

  // Zu einem Schritt der linearen Liste springen (Historie = Pfad davor).
  const jumpTo = (idx: number) => {
    if (!linearPath) return;
    gestureRef.current = true;
    navigate(linearPath[idx] ?? null, linearPath.slice(0, idx), "jump");
  };

  const go = (target: string | null) => {
    gestureRef.current = true; // Navigation = Geste vorhanden (erlaubt Auto-Play)
    const { cur: c, history: h } = stateRef.current;
    navigate(target, c != null ? [...h, c] : h, "forward");
  };
  const back = () => {
    gestureRef.current = true;
    const action = backAction({
      history: stateRef.current.history,
      depth: depthRef.current,
      fwd: fwdRef.current,
    });
    // Eintrag stammt von einem Vorwärts-Schritt -> davor liegt genau der vorige Stand:
    // den Browser zurückgehen lassen (Knopf und Browser-Zurück nehmen denselben Weg).
    if (action.kind === "browser") window.history.back();
    // Sonst (wiederhergestellt, Sprung, Neustart): den Weg zurück, Eintrag ersetzen.
    else if (action.kind === "replace") navigate(action.cur, action.history, "back");
  };
  const restart = () => navigate(rootId, [], "jump");

  const step = cur != null ? stepById.get(cur) : null;

  // Auto-Modus: zum nächsten Schritt entlang des Standard-Ausgangs (branches[0]).
  // Nur für NICHT-Entscheidungsschritte gedacht (Entscheidungen warten auf Klick).
  const goNext = useCallback(() => {
    const { cur: c, history: h } = stateRef.current;
    if (c == null) return;
    const target = branchesByStep.get(c)?.[0]?.target_step_id ?? null;
    navigate(target, [...h, c], "forward");
  }, [branchesByStep, navigate]);

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

  // Großansicht: Knopf merken, der sie geöffnet hat — dorthin geht der Fokus zurück.
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);
  const closeLightbox = useCallback(() => {
    setLightbox(null);
    zoomTriggerRef.current?.focus();
  }, []);

  return (
    <div
      data-tx="step"
      className={`w-full overflow-hidden border-2 bg-white ${linearPath ? "lg:flex" : ""}`}
      style={{
        borderRadius: "var(--brand-radius, 16px)",
        borderColor:
          "var(--brand-card-border, color-mix(in srgb, var(--brand-ink) 9%, transparent))",
        boxShadow:
          "var(--brand-card-shadow, 0 5px 0 color-mix(in srgb, var(--brand-ink) 7%, transparent))",
      }}
    >
      {/* Schrittliste (Design 3a): nur Desktop + nur lineare Tutorials —
          bei Verzweigungen gibt es keine ehrliche Gesamtliste. */}
      {linearPath && (
        <aside
          className="hidden w-[210px] shrink-0 flex-col self-stretch border-r-2 lg:flex xl:w-[250px]"
          style={{
            borderColor: "color-mix(in srgb, var(--brand-ink) 8%, transparent)",
          }}
        >
          <div className="px-4 pb-1 pt-4 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
            {L.stepsHeading}
          </div>
          <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3 pt-1">
            {linearPath.map((id, i) => {
              const s = stepById.get(id);
              const curIdx = step == null ? linearPath.length : history.length;
              const state = i < curIdx ? "done" : i === curIdx ? "active" : "open";
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => jumpTo(i)}
                  aria-current={state === "active" ? "step" : undefined}
                  className="flex items-center gap-3 rounded-[13px] px-2.5 py-2 text-left transition-colors"
                  style={
                    state === "active" ? { background: "var(--brand-soft)" } : undefined
                  }
                >
                  <span
                    className="grid size-[25px] shrink-0 place-items-center rounded-full text-[11.5px] font-black"
                    style={
                      state === "done"
                        ? {
                            background:
                              "color-mix(in srgb, var(--brand-ink) 7%, transparent)",
                            color: "var(--brand-ink)",
                            opacity: 0.7,
                          }
                        : state === "active"
                          ? {
                              background: "var(--brand-accent)",
                              color: "var(--brand-accent-fg, #fff)",
                            }
                          : {
                              background: "#fff",
                              border:
                                "2px solid color-mix(in srgb, var(--brand-ink) 12%, transparent)",
                              color: "var(--brand-ink)",
                              opacity: 0.55,
                            }
                    }
                  >
                    {state === "done" ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${
                      state === "active" ? "font-extrabold" : "font-bold"
                    }`}
                    style={{
                      color: "var(--brand-ink)",
                      opacity: state === "open" ? 0.6 : 1,
                      textDecoration: state === "done" ? "line-through" : undefined,
                      textDecorationColor:
                        state === "done"
                          ? "color-mix(in srgb, var(--brand-ink) 30%, transparent)"
                          : undefined,
                    }}
                  >
                    {s?.title?.trim() || `${L.stepNoun} ${i + 1}`}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      )}

      <div className="min-w-0 flex-1 p-4 sm:p-5">
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
            <div data-tx="progress" className="mb-3.5 flex items-center gap-3">
              <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
                {L.stepXofY
                  .replace("{n}", String(history.length + 1))
                  .replace("{total}", String(linearTotal))}
              </span>
              <span
                className="h-1.5 flex-1 overflow-hidden rounded-full"
                style={{
                  background: "color-mix(in srgb, var(--brand-ink) 9%, transparent)",
                }}
                aria-hidden
              >
                <span
                  className="block h-full rounded-full transition-[width] duration-300 ease-out"
                  style={{
                    width: `${Math.round(((history.length + 1) / linearTotal) * 100)}%`,
                    background: "var(--brand-accent)",
                  }}
                />
              </span>
            </div>
          )}
          {imageUrls[step.id] ? (
            <button
              type="button"
              ref={zoomTriggerRef}
              onClick={() =>
                setLightbox({
                  url: imageUrls[step.id],
                  highlights: step.highlights ?? [],
                  image_width: step.image_width,
                  image_height: step.image_height,
                  alt: step.title ?? "",
                })
              }
              aria-label={L.enlargeImage}
              className="mb-4 block w-full cursor-zoom-in overflow-hidden rounded-2xl border-2"
              style={{
                borderColor: "color-mix(in srgb, var(--brand-ink) 9%, transparent)",
                boxShadow:
                  "0 5px 0 color-mix(in srgb, var(--brand-ink) 7%, transparent)",
              }}
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
              <StepPlaceholder title={step.title} label={L.screenshotComing} />
            </div>
          ) : null}
          {(step.title || audioUrls[step.id]) && (
            <div className="flex items-start gap-2">
              {step.title ? (
                <h2
                  ref={titleRef}
                  tabIndex={-1}
                  data-tx="step-title"
                  className="min-w-0 flex-1 break-words text-lg font-bold outline-none sm:text-xl"
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
            {step.is_decision && (branchesByStep.get(step.id) ?? []).length > 0 ? (
              <div className="flex flex-col gap-2">
                {(branchesByStep.get(step.id) ?? []).map((b) => (
                  <button
                    key={b.id}
                    data-tx="btn"
                    onClick={() => go(b.target_step_id)}
                    className="w-full break-words border-2 bg-white px-4 py-3 text-base font-extrabold transition-transform active:translate-y-px"
                    style={{
                      borderColor: b.color ?? "var(--brand-accent-strong, var(--brand-accent))",
                      color: b.color ?? "var(--brand-accent-strong, var(--brand-accent))",
                      borderRadius: "var(--brand-btn-radius, 999px)",
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
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full border-2 bg-white py-2.5 text-sm font-extrabold text-muted-foreground transition-transform active:translate-y-px"
                style={{
                  borderColor: "color-mix(in srgb, var(--brand-ink) 9%, transparent)",
                }}
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
                    {chatAvailable ? L.stuckThanks : L.stuckThanks.split(/(?<=[.!?])\s/)[0]}
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
            className="mt-5 flex items-center gap-1.5 px-5 py-3 text-base font-extrabold transition-all active:translate-y-[2px]"
            style={{
              background: "var(--brand-accent)",
              color: "var(--brand-accent-fg, #fff)",
              borderRadius: "var(--brand-btn-radius, 999px)",
              boxShadow: "0 4px 0 color-mix(in srgb, var(--brand-accent) 72%, #000)",
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

      {lightbox && <Lightbox data={lightbox} labels={L} onClose={closeLightbox} />}
      </div>
    </div>
  );
}

/** Höhe der Werkzeugleiste der Großansicht (fließt in die nutzbare Bildhöhe ein). */
const LB_TOOLBAR = 56;
const LB_MAX_ZOOM = 6;

const readViewport = () =>
  typeof window === "undefined"
    ? { w: 0, h: 0 }
    : { w: window.innerWidth, h: window.innerHeight };

/**
 * Maße der Großansicht: „passend“ (ganzes Bild) plus die Startvergrößerung.
 * Auf schmalen Fenstern füllt „passend“ nur die Breite — das Bild wäre dann kaum größer
 * als im Schritt. Darum startet die Ansicht dort so weit vergrößert, dass das Bild die
 * Fensterhöhe nutzt (höchstens 2,5×); „Ganzes Bild“ holt jederzeit die Übersicht zurück.
 */
function fitBox(vp: { w: number; h: number }, aspect: number) {
  const availW = Math.max(1, vp.w);
  const availH = Math.max(1, vp.h - LB_TOOLBAR);
  const fitW = Math.min(availW, availH * aspect);
  const fitH = fitW / aspect;
  return { availW, availH, fitW, fitH, startZoom: Math.min(2.5, Math.max(1, availH / Math.max(1, fitH))) };
}

type LightboxData = {
  url: string;
  highlights: NonNullable<Step["highlights"]>;
  image_width: number | null;
  image_height: number | null;
  alt: string;
};

/**
 * Großansicht eines Schritt-Bildes.
 *
 * Nutzt das GANZE Fenster (die alte Fassung ließ 5 % Rand und passte das Bild in die
 * Fensterhöhe — auf dem Handy war das Bild danach kaum größer als im Schritt) und erlaubt
 * Vergrößern/Verschieben: Knöpfe, Doppeltippen und Ziehen. Auf schmalen Fenstern startet
 * sie bereits vergrößert (das Bild füllt die Höhe), weil genau dort das Vergrößern zählt.
 *
 * Barrierefreiheit: Fokus wandert beim Öffnen in den Dialog, Tab bleibt darin gefangen,
 * Escape schließt; zurück geht der Fokus auf das auslösende Bild (siehe closeLightbox).
 */
function Lightbox({
  data,
  labels,
  onClose,
}: {
  data: LightboxData;
  labels: HubLabels;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const aspect =
    data.image_width && data.image_height ? data.image_width / data.image_height : 16 / 10;

  // Fenstergröße SOFORT beim ersten Rendern messen (die Großansicht entsteht erst nach
  // einem Klick, also nie auf dem Server). Sonst gäbe es einen Frame mit Platzhaltermaßen,
  // in dem das Bild schon sichtbar, die Markierungs-Ebene aber noch 0 px hoch wäre.
  const [vp, setVp] = useState(readViewport);
  const fit = fitBox(vp, aspect);
  const [zoom, setZoom] = useState(() => fitBox(readViewport(), aspect).startZoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    const update = () => setVp(readViewport());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const { availW, availH, fitW, fitH } = fit;
  const maxX = Math.max(0, (fitW * zoom - availW) / 2);
  const maxY = Math.max(0, (fitH * zoom - availH) / 2);
  const clampPan = (p: { x: number; y: number }) => ({
    x: Math.min(maxX, Math.max(-maxX, p.x)),
    y: Math.min(maxY, Math.max(-maxY, p.y)),
  });
  const shown = clampPan(pan);

  const setZoomAt = (next: number) => {
    const z = Math.min(LB_MAX_ZOOM, Math.max(1, next));
    setZoom(z);
    if (z <= 1.001) setPan({ x: 0, y: 0 });
  };

  // Fokusfalle + Escape + Seite hinter dem Overlay ruhigstellen.
  useEffect(() => {
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = rootRef.current;
      if (!root) return;
      const items = [...root.querySelectorAll<HTMLElement>("button:not([disabled])")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && root.contains(active);
      if (e.shiftKey && (!inside || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={labels.imagePreview}
      className="fixed inset-0 z-[100] flex flex-col bg-black/90"
    >
      <div
        className="flex shrink-0 items-center justify-end gap-2 px-2"
        style={{ height: LB_TOOLBAR }}
      >
        <ToolButton onClick={() => setZoomAt(zoom / 1.6)} label={labels.zoomOut} disabled={zoom <= 1.001}>
          <ZoomOut className="size-5" />
        </ToolButton>
        <ToolButton onClick={() => setZoomAt(1)} label={labels.zoomReset} disabled={zoom <= 1.001}>
          <Maximize2 className="size-5" />
        </ToolButton>
        <ToolButton onClick={() => setZoomAt(zoom * 1.6)} label={labels.zoomIn} disabled={zoom >= LB_MAX_ZOOM - 0.001}>
          <ZoomIn className="size-5" />
        </ToolButton>
        <ToolButton onClick={onClose} label={labels.close} ref={closeRef}>
          <X className="size-5" />
        </ToolButton>
      </div>

      <div
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        style={{ cursor: zoom > 1.001 ? "grab" : "zoom-in" }}
        onPointerDown={(e) => {
          movedRef.current = false;
          if (zoom <= 1.001) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: shown.x, py: shown.y };
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
          setPan(clampPan({ x: d.px + dx, y: d.py + dy }));
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onDoubleClick={() => setZoomAt(zoom > 1.001 ? 1 : 3)}
        onClick={(e) => {
          // Klick auf die freie Fläche schließt — ein Ziehen aber nicht.
          if (movedRef.current) return;
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transform: `translate(${shown.x}px, ${shown.y}px) scale(${zoom})` }}
        >
          {/* Gleiche Darstellung wie im Schritt — inkl. Markierungen und Verpixelung. */}
          <div style={{ width: fitW || undefined }}>
            <ViewerImage
              url={data.url}
              highlights={data.highlights}
              width={data.image_width}
              height={data.image_height}
              alt={data.alt}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  children,
  label,
  onClick,
  disabled,
  ref,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-lg transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
    >
      {children}
    </button>
  );
}

/** Platzhalter-Grafik für Standard-Templates ohne echten Screenshot. */
function StepPlaceholder({ title, label }: { title: string | null; label: string }) {
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
        {title?.trim() || label}
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
      className="flex w-full items-center justify-center gap-2 px-4 py-3 text-base font-extrabold transition-all active:translate-y-[2px]"
      style={{
        background: "var(--brand-accent)",
        color: "var(--brand-accent-fg, #fff)",
        borderRadius: "var(--brand-btn-radius, 999px)",
        boxShadow: "0 4px 0 color-mix(in srgb, var(--brand-accent) 72%, #000)",
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
