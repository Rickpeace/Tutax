"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Layers, ChevronRight } from "lucide-react";

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
}: {
  accountSlug: string;
  items: HubTutorial[];
  order: string[];
}) {
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

  return (
    <div data-tx="browser">
      <div data-tx="search" className="mb-5 flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-3">
        <Search className="size-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Anleitung suchen …"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {items.length === 0
            ? "Noch keine veröffentlichten Anleitungen."
            : "Keine Anleitung gefunden."}
        </p>
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
                  href={`/h/${accountSlug}/${t.slug}`}
                  data-tx="card"
                  className="flex items-center gap-3 p-4 transition-transform hover:-translate-y-px"
                  style={{
                    background: "var(--brand-card-bg, #fff)",
                    border: "var(--brand-card-bw, 1px) solid var(--brand-card-border, rgba(16,21,36,0.1))",
                    borderRadius: "var(--brand-radius, 12px)",
                    boxShadow: "var(--brand-card-shadow, none)",
                  }}
                >
                  <div
                    className="flex size-10 shrink-0 items-center justify-center"
                    style={{
                      background: "var(--brand-icon-bg, var(--brand-soft))",
                      color: "var(--brand-accent)",
                      border: "var(--brand-card-bw, 1px) solid var(--brand-card-border, transparent)",
                      borderRadius: "var(--brand-radius, 10px)",
                    }}
                  >
                    <Layers className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      data-tx="card-title"
                      className="font-bold"
                      style={{
                        color: "var(--brand-title, var(--brand-ink))",
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
                  <ChevronRight className="size-5 shrink-0" style={{ color: "var(--brand-accent)", opacity: 0.5 }} />
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
