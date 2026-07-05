"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { TutorialCard, type LibraryTutorial } from "@/components/app/tutorial-card";
import { NewTutorialButton } from "@/components/app/new-tutorial-button";
import { BulkCleanupProvider, CleanupControls } from "@/components/app/bulk-cleanup";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { categoryColor, CATEGORY_NEUTRAL } from "@/lib/category-colors";
import { cn } from "@/lib/utils";

export type LibraryCategory = { id: string; name: string };

type Bereich = "alle" | "kunden" | "intern";
type StatusFilter = "alle" | "live" | "entwurf";

const STATUS_LABEL: Record<StatusFilter, string> = {
  alle: "Status: Alle",
  live: "Status: Veröffentlicht",
  entwurf: "Status: Entwurf",
};

/** Zählt Kunden-/Intern-Zugehörigkeit (öffentliche „+Team" zählen doppelt). */
function inBereich(t: LibraryTutorial, b: Bereich): boolean {
  if (b === "alle") return true;
  if (b === "kunden") return t.visibility === "public";
  return t.visibility === "internal" || (t.visibility === "public" && t.inLernen);
}

/**
 * Bibliothek (Design 2a/2b): Kategorien-Sidebar (Desktop) bzw. Chip-Leisten
 * (mobil) + Filterzeile + Kartenraster. Filterung rein clientseitig über die
 * server-gelieferte Liste. `topSlot` (z. B. Video-Jobs) erscheint über dem
 * Raster, `children` (Insights/Vorlagen) darunter — beides Server-Inhalt.
 */
export function LibraryBrowser({
  tutorials,
  categories,
  accountId,
  accountSlug,
  topSlot,
  children,
}: {
  tutorials: LibraryTutorial[];
  categories: LibraryCategory[];
  accountId: string;
  accountSlug: string;
  topSlot?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [bereich, setBereich] = useState<Bereich>("alle");
  const [categoryId, setCategoryId] = useState<string | "alle">("alle");
  const [status, setStatus] = useState<StatusFilter>("alle");

  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const inScope = useMemo(
    () => tutorials.filter((t) => inBereich(t, bereich)),
    [tutorials, bereich],
  );
  const visible = inScope.filter(
    (t) =>
      (categoryId === "alle" || (t.categoryId ?? "__none") === categoryId) &&
      (status === "alle" || (status === "live") === (t.status === "published")),
  );

  const bereichCounts: Record<Bereich, number> = useMemo(
    () => ({
      alle: tutorials.length,
      kunden: tutorials.filter((t) => inBereich(t, "kunden")).length,
      intern: tutorials.filter((t) => inBereich(t, "intern")).length,
    }),
    [tutorials],
  );
  const catCount = (id: string) =>
    inScope.filter((t) => (t.categoryId ?? "__none") === id).length;
  const hasUncategorized = tutorials.some((t) => !t.categoryId);

  const activeName =
    categoryId === "alle"
      ? "Alle Anleitungen"
      : categoryId === "__none"
        ? "Sonstiges"
        : (catById.get(categoryId)?.name ?? "Kategorie");

  const sidebarCats: { id: string; name: string }[] = [
    ...categories,
    ...(hasUncategorized ? [{ id: "__none", name: "Sonstiges" }] : []),
  ];

  return (
    <BulkCleanupProvider>
      <div className="flex min-h-0 flex-1">
        {/* Kategorien-Sidebar (Desktop) */}
        <aside className="hidden w-[230px] shrink-0 flex-col gap-5 border-r-2 border-line px-4 py-5 lg:flex">
          <SidebarGroup label="Bereich">
            {(
              [
                ["alle", "Alle"],
                ["kunden", "Für Kunden"],
                ["intern", "Intern"],
              ] as [Bereich, string][]
            ).map(([key, label]) => {
              const active = bereich === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBereich(key)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] font-bold transition-colors",
                    active
                      ? "bg-ink text-background"
                      : "text-ink-2 hover:bg-secondary",
                  )}
                >
                  {label}
                  <span
                    className={cn(
                      "ml-auto rounded-full px-2 text-[11.5px]",
                      active
                        ? "bg-[#4d4234] text-background"
                        : "bg-line text-muted-foreground",
                    )}
                  >
                    {bereichCounts[key]}
                  </span>
                </button>
              );
            })}
          </SidebarGroup>

          <SidebarGroup label="Kategorien">
            <CategoryRow
              name="Alle"
              count={inScope.length}
              active={categoryId === "alle"}
              onClick={() => setCategoryId("alle")}
            />
            {sidebarCats.map((c) => (
              <CategoryRow
                key={c.id}
                name={c.name}
                count={catCount(c.id)}
                active={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
                color={c.id === "__none" ? CATEGORY_NEUTRAL : categoryColor(c.name)}
              />
            ))}
          </SidebarGroup>
        </aside>

        {/* Hauptbereich */}
        <main className="min-w-0 flex-1 px-5 py-5 lg:px-7">
          {/* Mobile: Bereich-/Kategorie-Chips statt Sidebar */}
          <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                ["alle", "Alle"],
                ["kunden", "Kunden"],
                ["intern", "Intern"],
              ] as [Bereich, string][]
            ).map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                active={bereich === key}
                onClick={() => setBereich(key)}
              />
            ))}
            <span className="my-1 w-0.5 shrink-0 rounded bg-line" aria-hidden />
            <Chip
              label="Alle Kategorien"
              active={categoryId === "alle"}
              onClick={() => setCategoryId("alle")}
            />
            {sidebarCats.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                active={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
                color={c.id === "__none" ? CATEGORY_NEUTRAL : categoryColor(c.name)}
              />
            ))}
          </div>

          {topSlot}

          {/* Filterzeile */}
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-black">{activeName}</h1>
            <span className="text-[13px] font-bold text-faint">
              {visible.length} Anleitung{visible.length === 1 ? "" : "en"}
            </span>
            <div className="ml-auto flex items-center gap-2 text-xs font-extrabold">
              <CleanupControls />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-full border-2 border-line bg-card px-3.5 py-1.5 text-xs font-extrabold text-ink-2 transition-colors hover:border-[#e3d7c2]"
                    >
                      {STATUS_LABEL[status]} <ChevronDown className="size-3.5" />
                    </button>
                  }
                />
                <DropdownMenuContent align="end">
                  {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((s) => (
                    <DropdownMenuItem key={s} onClick={() => setStatus(s)}>
                      {STATUS_LABEL[s].replace("Status: ", "")}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Kartenraster */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((t) => (
              <TutorialCard
                key={t.id}
                tutorial={t}
                accountSlug={accountSlug}
                categoryName={
                  t.categoryId ? (catById.get(t.categoryId)?.name ?? null) : null
                }
              />
            ))}
            {/* Anlegen-Karte (Design: gestrichelt) */}
            <NewTutorialButton
              accountId={accountId}
              categoryId={
                categoryId !== "alle" && categoryId !== "__none" ? categoryId : null
              }
              trigger={
                <button
                  type="button"
                  className="grid min-h-[196px] place-items-center rounded-card border-2 border-dashed border-[#e3d7c2] text-center text-faint transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <span>
                    <span className="mx-auto mb-2 grid size-[38px] place-items-center rounded-full bg-line text-[17px] font-black text-muted-foreground">
                      ＋
                    </span>
                    <span className="block text-[13px] font-extrabold">
                      Neue Anleitung
                    </span>
                    <span className="mt-0.5 block text-[11.5px] font-semibold">
                      Durchklicken, Video oder selbst bauen
                    </span>
                  </span>
                </button>
              }
            />
          </div>

          {children}
        </main>
      </div>
    </BulkCleanupProvider>
  );
}

function SidebarGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-2.5 pb-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-faint">
        {label}
      </p>
      {children}
    </div>
  );
}

function CategoryRow({
  name,
  count,
  active,
  onClick,
  color,
}: {
  name: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: ReturnType<typeof categoryColor>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] font-bold transition-colors",
        active ? "" : "text-ink-2 hover:bg-secondary",
      )}
      style={active && color ? { background: color.soft, color: color.text } : undefined}
      data-active={active}
    >
      {color && (
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded"
          style={{ background: color.solid }}
        />
      )}
      <span className="truncate">{name}</span>
      <span
        className={cn(
          "ml-auto text-[11.5px]",
          active && color ? "" : "text-faint",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function Chip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: ReturnType<typeof categoryColor>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold transition-colors",
        active
          ? "bg-ink text-background"
          : "border-2 border-line bg-card text-muted-foreground",
      )}
      style={active && color ? { background: color.soft, color: color.text } : undefined}
    >
      {color && (
        <span
          aria-hidden
          className="size-2 rounded-[3px]"
          style={{ background: color.solid }}
        />
      )}
      {label}
    </button>
  );
}
