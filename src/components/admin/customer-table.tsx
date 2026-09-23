"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Crown, Puzzle, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { PlanKey } from "@/lib/admin-customers";

/** Zeile der Kundenliste — Zeitangaben kommen fertig formatiert vom Server (kein Hydration-Versatz). */
export type CustomerListItem = {
  id: string;
  name: string;
  slug: string;
  plan: PlanKey;
  ownerEmails: string[];
  members: number;
  pendingInvites: number;
  tutorials: number;
  published: number;
  views30: number;
  chats30: number;
  extension: boolean;
  onboarded: boolean;
  createdAt: string;
  createdLabel: string;
  lastActive: string | null;
  lastActiveLabel: string;
};

const PLAN_LABEL: Record<PlanKey, string> = { free: "Gratis", pro: "Pro", business: "Business" };

export function PlanBadge({ plan }: { plan: PlanKey }) {
  const cls =
    plan === "business"
      ? "bg-amber-soft text-amber-text"
      : plan === "pro"
        ? "bg-teal-soft text-[#118576]"
        : "bg-line-2 text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black ${cls}`}>
      {plan !== "free" && <Crown className="size-3" />}
      {PLAN_LABEL[plan]}
    </span>
  );
}

type Sort = "new" | "active" | "usage" | "name";

export function CustomerTable({ rows }: { rows: CustomerListItem[] }) {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState<PlanKey | "all">("all");
  const [sort, setSort] = useState<Sort>("new");

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (plan === "all" || r.plan === plan) &&
        (!needle ||
          r.name.toLowerCase().includes(needle) ||
          r.slug.toLowerCase().includes(needle) ||
          r.ownerEmails.some((e) => e.toLowerCase().includes(needle))),
    );
    const by: Record<Sort, (a: CustomerListItem, b: CustomerListItem) => number> = {
      new: (a, b) => b.createdAt.localeCompare(a.createdAt),
      active: (a, b) => (b.lastActive ?? "").localeCompare(a.lastActive ?? ""),
      usage: (a, b) => b.views30 + b.chats30 - (a.views30 + a.chats30),
      name: (a, b) => a.name.localeCompare(b.name, "de"),
    };
    return [...filtered].sort(by[sort]);
  }, [rows, q, plan, sort]);

  const planCount = (p: PlanKey) => rows.filter((r) => r.plan === p).length;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, Adresse oder E-Mail suchen …"
            aria-label="Kunden suchen"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Nach Tarif filtern">
          {(["all", "free", "pro", "business"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlan(p)}
              aria-pressed={plan === p}
              className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold transition-colors ${
                plan === p ? "border-ink bg-ink text-white" : "border-line bg-card text-ink-2 hover:border-ink/30"
              }`}
            >
              {p === "all" ? `Alle (${rows.length})` : `${PLAN_LABEL[p]} (${planCount(p)})`}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sortierung"
          className="h-9 rounded-full border-2 border-line bg-card px-3 text-xs font-extrabold text-ink"
        >
          <option value="new">Neueste zuerst</option>
          <option value="active">Zuletzt aktiv</option>
          <option value="usage">Meiste Nutzung (30 T.)</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      <p className="text-xs font-bold text-muted-foreground" data-testid="customer-count">
        {list.length} von {rows.length} Kunden
      </p>

      <div className="overflow-hidden rounded-card border-2 border-line bg-card">
        <div className="hidden grid-cols-[minmax(0,2fr)_90px_minmax(0,1.4fr)_70px_90px_110px_110px_20px] gap-3 border-b-2 border-line bg-line-2 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.06em] text-faint lg:grid">
          <span>Organisation</span>
          <span>Tarif</span>
          <span>Inhaber</span>
          <span>Team</span>
          <span>Anleitungen</span>
          <span>Nutzung 30 T.</span>
          <span>Zuletzt aktiv</span>
          <span />
        </div>
        {list.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm font-semibold text-muted-foreground">Keine Kunden gefunden.</p>
        ) : (
          list.map((r) => (
            <Link
              key={r.id}
              href={`/admin/kunden/${r.id}`}
              data-testid="customer-row"
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t-2 border-line-2 px-4 py-3 transition-colors first:border-t-0 hover:bg-[#fffcf7] lg:grid-cols-[minmax(0,2fr)_90px_minmax(0,1.4fr)_70px_90px_110px_110px_20px] lg:items-center"
            >
              <span className="min-w-0">
                <span className="block truncate font-extrabold text-ink">{r.name}</span>
                <span className="flex items-center gap-2 truncate text-xs font-semibold text-muted-foreground">
                  /h/{r.slug}
                  {!r.onboarded && <span className="rounded bg-line-2 px-1.5 text-[10px] font-bold">Einrichtung offen</span>}
                  {r.extension && (
                    <span title="Steply-Erweiterung verbunden" className="inline-flex">
                      <Puzzle className="size-3.5" />
                    </span>
                  )}
                </span>
              </span>
              <span className="justify-self-end lg:justify-self-start">
                <PlanBadge plan={r.plan} />
              </span>
              <span className="col-span-2 truncate text-xs font-semibold text-ink-2 lg:col-span-1 lg:text-sm">
                {r.ownerEmails.join(", ") || "—"}
              </span>
              <span className="text-xs font-semibold text-ink-2 lg:text-sm">
                <span className="lg:hidden">Team: </span>
                {r.members}
                {r.pendingInvites > 0 && <span className="text-faint"> +{r.pendingInvites}</span>}
              </span>
              <span className="text-xs font-semibold text-ink-2 lg:text-sm">
                <span className="lg:hidden">Anleitungen: </span>
                {r.published}/{r.tutorials}
              </span>
              <span className="text-xs font-semibold text-ink-2 lg:text-sm">
                {r.views30} Aufrufe · {r.chats30} Chat
              </span>
              <span className="text-xs font-semibold text-muted-foreground lg:text-sm" title={`Angelegt ${r.createdLabel}`}>
                {r.lastActiveLabel}
              </span>
              <ChevronRight className="hidden size-4 text-faint lg:block" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
