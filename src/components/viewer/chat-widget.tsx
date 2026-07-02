"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import {
  MessageCircle,
  X,
  Send,
  Sparkles,
  ArrowRight,
  Layers,
  RotateCcw,
  CalendarClock,
  Mail,
  Phone,
} from "lucide-react";

type Source = { title: string; slug: string };
type EscMethod = { type: string; label: string; value: string };
type Escalation = { message: string; methods: EscMethod[] };
type Msg = {
  role: "user" | "bot";
  text: string;
  sources?: Source[];
  escalation?: Escalation | null;
};

export function ChatWidget({
  accountSlug,
  accountName,
  embedded = false,
}: {
  accountSlug: string;
  accountName: string;
  /** Läuft im Script-Bubble-iFrame (Feature H4): Größe an das Eltern-Fenster melden. */
  embedded?: boolean;
}) {
  const greeting: Msg = {
    role: "bot",
    text: `Hallo! Ich bin der Hilfe-Assistent von ${accountName}. Stellen Sie mir eine Frage – ich finde die passende Anleitung.`,
  };
  const storageKey = `tutax-chat-${accountSlug}`;

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([greeting]);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Gespräch aus localStorage wiederherstellen (übersteht Navigieren/Reload).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bewusst: einmalige Gesprächs-Wiederherstellung aus localStorage nach Mount (hydration-sicher), kein Cascade
        if (Array.isArray(saved?.msgs) && saved.msgs.length) setMsgs(saved.msgs);
        if (typeof saved?.open === "boolean") setOpen(saved.open);
      }
    } catch {}
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gespräch speichern (max. 60 Nachrichten).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ msgs: msgs.slice(-60), open }));
    } catch {}
  }, [msgs, open, hydrated, storageKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs, busy]);

  // Beim Öffnen: Autofokus ins Eingabefeld. Esc schließt das Panel.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Script-Bubble (H4): dem Eltern-Fenster den Öffnen/Schließen-Zustand melden, damit
  // das einbettende <script> das iFrame vergrößert/verkleinert. Nur im Embedded-Modus.
  useEffect(() => {
    if (!embedded || !hydrated) return;
    try {
      window.parent?.postMessage({ steply: open ? "chat-open" : "chat-close" }, "*");
    } catch {}
  }, [embedded, hydrated, open]);

  function resetChat() {
    if (!window.confirm("Gespräch wirklich löschen?")) return;
    setMsgs([greeting]);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }

  // Immer die letzte Bot-Blase aktualisieren (wird beim Streamen live gefüllt).
  const patchBot = (patch: Partial<Msg>) =>
    setMsgs((m) => {
      const copy = m.slice();
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "bot") {
          copy[i] = { ...copy[i], ...patch };
          break;
        }
      }
      return copy;
    });

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    const history = msgs.slice(-8).map((m) => ({ role: m.role, text: m.text }));
    setInput("");
    // Nutzer-Nachricht + leere Bot-Blase (zeigt Tipp-Punkte, füllt sich dann live).
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "bot", text: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountSlug, question: q, history }),
      });

      const ct = res.headers.get("content-type") || "";
      if (!res.body || !ct.includes("ndjson")) {
        // Fehler / „nicht konfiguriert" / Rate-Limit -> einfache JSON-Antwort.
        const data = await res.json().catch(() => ({}));
        patchBot({
          text: data.answer || "Es ist ein Fehler aufgetreten.",
          sources: data.sources,
          escalation: data.escalation ?? null,
        });
        return;
      }

      // NDJSON-Stream: {"delta":"…"} füllt die Blase, {"meta":…} liefert Quellen/Eskalation.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: { delta?: string; meta?: { sources?: Source[]; escalation?: Escalation | null } };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.delta) {
            answer += ev.delta;
            patchBot({ text: answer });
          }
          if (ev.meta) {
            patchBot({ text: answer, sources: ev.meta.sources, escalation: ev.meta.escalation ?? null });
          }
        }
      }
    } catch {
      patchBot({ text: "Es ist ein Fehler aufgetreten." });
    } finally {
      setBusy(false);
      // Screenreader-Ansage NACH Abschluss (nicht beim Streamen -> nicht spammy).
      setStatus("Antwort erhalten");
    }
  }

  return (
    <>
      {/* Launcher. Im Embedded-Modus nur ZEIGEN, wenn geschlossen (das offene Panel
          füllt dann das ganze iFrame und hat einen eigenen Schließen-Knopf im Kopf). */}
      {!(embedded && open) && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Hilfe-Assistent"
          aria-expanded={open}
          className={
            embedded
              ? // Im iFrame geschlossen (76×76) den Launcher mittig platzieren.
                "fixed inset-0 z-40 m-auto flex size-14 items-center justify-center rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition-transform active:scale-95"
              : "fixed bottom-5 right-5 z-40 flex size-14 items-center justify-center rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition-transform active:scale-95"
          }
          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg, #fff)" }}
        >
          {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Hilfe-Assistent"
          className={
            embedded
              ? // Im iFrame gibt das Fenster die Größe vor -> Panel füllt es komplett.
                "fixed inset-0 z-40 flex flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_20px_60px_rgba(16,21,36,0.25)]"
              : // Dynamische Hoehe (REVIEW G): kurze Gespraeche zeigen weniger Leerraum
                // (h-auto + min-h), lange werden bei max-h scrollbar. Nachrichtenliste
                // bleibt flex-1, Input unten. Embedded-Modus (inset-0) unveraendert.
                "fixed bottom-24 right-3 left-3 z-40 flex h-auto max-h-[min(30rem,calc(100dvh-7rem))] min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_20px_60px_rgba(16,21,36,0.25)] sm:left-auto sm:w-[23rem]"
          }
        >
          <div
            className="flex items-center gap-2 border-b border-black/5 px-4 py-3"
            style={{ background: "var(--brand-bg)" }}
          >
            <Sparkles className="size-4" style={{ color: "var(--brand-accent-strong, var(--brand-accent))" }} />
            <span className="text-sm font-bold text-[var(--brand-ink)]">Hilfe-Assistent</span>
            {msgs.length > 1 && (
              <button
                onClick={resetChat}
                title="Gespräch zurücksetzen"
                aria-label="Gespräch zurücksetzen"
                className="ml-auto flex items-center gap-1 rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:text-[var(--brand-ink)]"
              >
                <RotateCcw className="size-3.5" /> Neu
              </button>
            )}
            {embedded && (
              <button
                onClick={() => setOpen(false)}
                title="Schließen"
                aria-label="Hilfe-Assistent schließen"
                className={`${msgs.length > 1 ? "" : "ml-auto"} flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-[var(--brand-ink)]`}
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <p className="border-b border-black/5 bg-white px-4 py-1.5 text-[11px] leading-snug text-muted-foreground">
            Antworten werden automatisiert per KI erstellt – bitte keine
            personenbezogenen Daten eingeben.{" "}
            <Link
              href="/datenschutz"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--brand-ink)]"
            >
              Datenschutz
            </Link>
          </p>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {msgs.map((m, i) => (
              <Bubble key={i} m={m} accountSlug={accountSlug} />
            ))}
          </div>

          {/* Screenreader-Status: erst nach Abschluss angesagt, nicht beim Streamen. */}
          <p role="status" aria-live="polite" className="sr-only">
            {status}
          </p>

          <div className="flex gap-2 border-t border-black/5 p-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
              }}
              placeholder="Frage stellen …"
              className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-[var(--brand-accent)]"
            />
            <button
              onClick={send}
              disabled={busy}
              aria-label="Senden"
              className="flex items-center rounded-lg px-3 disabled:opacity-50"
              style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg, #fff)" }}
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-current opacity-40"
      style={{ animationDelay: delay }}
    />
  );
}

function Bubble({ m, accountSlug }: { m: Msg; accountSlug: string }) {
  const bot = m.role === "bot";
  return (
    <div className={bot ? "" : "flex justify-end"}>
      <div
        className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          bot ? "rounded-tl-sm bg-[var(--brand-bg)] text-ink-2" : "rounded-tr-sm"
        }`}
        style={
          bot ? {} : { background: "var(--brand-accent)", color: "var(--brand-accent-fg, #fff)" }
        }
      >
        {bot && !m.text ? (
          <span className="flex gap-1 py-1" aria-label="tippt">
            <Dot delay="0ms" />
            <Dot delay="150ms" />
            <Dot delay="300ms" />
          </span>
        ) : (
          m.text
        )}
        {m.sources?.length ? (
          <div className="mt-2 space-y-1">
            {m.sources.map((s) => (
              <Link
                key={s.slug}
                href={`/h/${accountSlug}/${s.slug}`}
                className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-semibold text-ink hover:border-[var(--brand-accent)]"
              >
                <Layers className="size-3.5" style={{ color: "var(--brand-accent-strong, var(--brand-accent))" }} />
                <span className="truncate">{s.title}</span>
                <ArrowRight className="ml-auto size-3 shrink-0" />
              </Link>
            ))}
          </div>
        ) : null}
        {m.escalation?.methods?.length ? (
          <div className="mt-2 rounded-xl border border-black/10 bg-white p-2.5">
            <div className="text-xs text-ink-2">{m.escalation.message}</div>
            <div className="mt-2 space-y-1.5">
              {m.escalation.methods.map((mm, idx) => (
                <a
                  key={idx}
                  href={mm.value}
                  target={mm.value.startsWith("http") ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold"
                  style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg, #fff)" }}
                >
                  {mm.type === "email" ? (
                    <Mail className="size-3.5" />
                  ) : mm.type === "phone" ? (
                    <Phone className="size-3.5" />
                  ) : (
                    <CalendarClock className="size-3.5" />
                  )}
                  {mm.label}
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
