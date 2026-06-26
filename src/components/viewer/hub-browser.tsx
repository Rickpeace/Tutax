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
    <div>
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-3">
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
          <section key={g.name} className="mb-6">
            <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {g.name}
            </h2>
            <div className="space-y-2">
              {g.items.map((t) => (
                <Link
                  key={t.slug}
                  href={`/h/${accountSlug}/${t.slug}`}
                  className="flex items-center gap-3 rounded-xl border border-black/10 bg-white p-4 transition-colors hover:border-[var(--brand-accent)]"
                >
                  <div
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "var(--brand-soft)", color: "var(--brand-accent)" }}
                  >
                    <Layers className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[var(--brand-ink)]">{t.title}</div>
                    {t.description && (
                      <div className="truncate text-sm text-muted-foreground">
                        {t.description}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-black/20" />
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
