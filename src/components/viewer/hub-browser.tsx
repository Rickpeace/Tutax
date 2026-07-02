"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Layers, ChevronRight, Loader2 } from "lucide-react";
import { labelsFor, t as translate, type HubLabels, type HubLang } from "@/lib/i18n-hub";

export type HubTutorial = {
  title: string;
  description: string | null;
  slug: string;
  category: string;
};

export function HubBrowser({
  accountSlug,
  items,
  order,
  lang = "de",
  langQuery = "",
  labels,
}: {
  accountSlug: string;
  items: HubTutorial[];
  order: string[];
  /** Aktive Sprache; Default DE, damit /app-Vorschauen unverändert bleiben. */
  lang?: HubLang;
  /** „lang=xx“ oder "" (an interne Links anhängen, damit die Sprache erhalten bleibt). */
  langQuery?: string;
  /** UI-Strings; Default = deutsche Strings. */
  labels?: HubLabels;
}) {
  const L = labels ?? labelsFor(lang);
  // Query-Suffix für Karten-Links (?lang=… bzw. leer).
  const suffix = langQuery ? `?${langQuery}` : "";
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = term
      ? items.filter(
          (t) =>
            t.title.toLowerCase().includes(term) ||
            (t.description ?? "").toLowerCase().includes(term),
        )
      : items;
    const m = new Map<string, HubTutorial[]>();
    for (const t of filtered) {
      const l = m.get(t.category) ?? [];
      l.push(t);
      m.set(t.category, l);
    }
    return order.filter((c) => m.has(c)).map((c) => ({ name: c, items: m.get(c)! }));
  }, [q, items, order]);

  // Semantische Fallback-Suche: greift nur, wenn die lokale Titel-/Beschreibungs-Suche
  // 0 Treffer hat UND die Anfrage ≥ 3 Zeichen ist. Debounced (500 ms), damit nicht bei
  // jedem Tastendruck das RAG angefragt wird. Slugs der lokalen Treffer werden
  // ausgeblendet (hier per Titel-Match verhindert man Doppel-Vorschläge nicht nötig,
  // da die semantische Suche nur bei 0 lokalen Treffern läuft).
  const [sem, setSem] = useState<{ title: string; slug: string }[]>([]);
  const [semLoading, setSemLoading] = useState(false);
  const term = q.trim();
  const noLocal = groups.length === 0 && items.length > 0;
  // Semantische Suche nur, wenn lokal nichts gefunden wurde und die Eingabe ≥ 3 Zeichen ist.
  const semEligible = noLocal && term.length >= 3;

  useEffect(() => {
    if (!semEligible) return; // Reset erfolgt beim Rendern über semEligible (kein setState nötig).
    // Loading-Zustand vor dem debounced Fetch – bewusst im Effekt (Debounce-Muster).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSemLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/hub-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountSlug, q: term }),
          signal: ctrl.signal,
        });
        const j = await res.json().catch(() => ({}));
        if (!ctrl.signal.aborted) {
          setSem(Array.isArray(j?.results) ? j.results.slice(0, 5) : []);
          setSemLoading(false);
        }
      } catch {
        // abgebrochen oder Netzfehler -> keine Vorschläge, kein sichtbarer Fehler.
        if (!ctrl.signal.aborted) {
          setSem([]);
          setSemLoading(false);
        }
      }
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [semEligible, term, accountSlug]);

  return (
    <div data-tx="browser">
      <div data-tx="search" className="mb-5 flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-3">
        <Search className="size-4 text-muted-foreground" />
        <input
          type="search"
          aria-label={L.searchAria}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={L.searchPlaceholder}
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {groups.length === 0 ? (
        items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {L.noneYet}
          </p>
        ) : (
          <div className="flex flex-col items-center py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {translate(lang, "noneFound", { q: q.trim() })}
            </p>
            <button
              onClick={() => setQ("")}
              className="mt-3 rounded-lg border border-black/10 bg-white px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-[var(--brand-accent)]"
            >
              {L.resetSearch}
            </button>

            {semEligible && semLoading && sem.length === 0 && (
              <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> {L.searchingSimilar}
              </p>
            )}

            {semEligible && sem.length > 0 && (
              <div className="mt-5 w-full max-w-sm text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {L.didYouMean}
                </p>
                <div className="space-y-2">
                  {sem.map((t) => (
                    <Link
                      key={t.slug}
                      href={`/h/${accountSlug}/${t.slug}${suffix}`}
                      className="flex items-center gap-3 p-3 transition-transform hover:-translate-y-px"
                      style={{
                        background: "var(--brand-card-bg, #fff)",
                        border: "var(--brand-card-bw, 1px) solid var(--brand-card-border, rgba(16,21,36,0.1))",
                        borderRadius: "var(--brand-radius, 12px)",
                        boxShadow: "var(--brand-card-shadow, none)",
                      }}
                    >
                      <div
                        className="flex size-8 shrink-0 items-center justify-center"
                        style={{
                          background: "var(--brand-icon-bg, var(--brand-soft))",
                          color: "var(--brand-accent)",
                          borderRadius: "var(--brand-radius, 10px)",
                        }}
                      >
                        <Layers className="size-4" />
                      </div>
                      <span
                        className="min-w-0 flex-1 truncate text-sm font-bold"
                        style={{
                          color: "var(--brand-title, var(--brand-ink))",
                          fontFamily: "var(--brand-font-heading)",
                        }}
                      >
                        {t.title}
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0"
                        style={{ color: "var(--brand-accent)", opacity: 0.5 }}
                      />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-5 max-w-xs text-xs text-muted-foreground">
              {L.notRight}
            </p>
          </div>
        )
      ) : (
        groups.map((g) => (
          <section key={g.name} data-tx="cats" className="mb-6">
            <h2
              data-tx="cat"
              className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground"
              style={{ fontFamily: "var(--brand-font-heading)" }}
            >
              {g.name}
            </h2>
            <div className="space-y-2">
              {g.items.map((t) => (
                <Link
                  key={t.slug}
                  href={`/h/${accountSlug}/${t.slug}${suffix}`}
                  data-tx="card"
                  className="group flex items-center gap-3 p-4 transition-transform hover:-translate-y-px"
                  style={{
                    // Akzent-Dosierung (REVIEW G): Kartenrahmen neutral, erst bei Hover
                    // Akzent — statt jeden Rahmen dauerhaft in der CI-Farbe. Fläche/Radius/
                    // Schatten bleiben Token-gesteuert (Kunden-CI).
                    background: "var(--brand-card-bg, #fff)",
                    borderWidth: "var(--brand-card-bw, 1px)",
                    borderStyle: "solid",
                    borderColor: "rgba(16,21,36,0.08)",
                    borderRadius: "var(--brand-radius, 12px)",
                    boxShadow: "var(--brand-card-shadow, none)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--brand-accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(16,21,36,0.08)";
                  }}
                >
                  <div
                    className="flex size-10 shrink-0 items-center justify-center"
                    style={{
                      // Akzent-Dosierung: dezenter Akzent-Tint als Fläche + Akzent-Icon,
                      // statt eines harten Akzent-Rahmens ums Icon-Quadrat.
                      background: "color-mix(in srgb, var(--brand-accent) 10%, white)",
                      color: "var(--brand-accent)",
                      borderRadius: "var(--brand-radius, 10px)",
                    }}
                  >
                    <Layers className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      data-tx="card-title"
                      className="text-base font-bold"
                      style={{
                        // Akzent-Dosierung: Titel in Ink (nicht in der Akzentfarbe), damit
                        // die CI auf Logo/Topbar/Buttons/Chat konzentriert bleibt.
                        color: "var(--brand-ink)",
                        fontFamily: "var(--brand-font-heading)",
                        fontWeight: "var(--brand-heading-weight, 700)",
                      }}
                    >
                      {t.title}
                    </div>
                    {t.description && (
                      <div data-tx="card-desc" className="truncate text-sm text-muted-foreground">
                        {t.description}
                      </div>
                    )}
                  </div>
                  {/* Akzent-Dosierung: Chevron neutral statt in der Akzentfarbe. */}
                  <ChevronRight className="size-5 shrink-0" style={{ color: "var(--brand-ink)", opacity: 0.3 }} />
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
