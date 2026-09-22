"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, LayoutGrid, List } from "lucide-react";
import {
  TutorialCard,
  type LibraryTutorial,
  type TutorialLayout,
} from "@/components/app/tutorial-card";
import { NewTutorialButton } from "@/components/app/new-tutorial-button";
import { PageHeader } from "@/components/app/page-header";
import { BulkCleanupProvider, CleanupControls } from "@/components/app/bulk-cleanup";
import { CategoryMenu } from "@/components/app/category-menu";
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

/** Bereich-Filter: dieselben Wörter auf Desktop und Handy (Begriffsliste). */
const BEREICH_LABELS: [Bereich, string][] = [
  ["alle", "Alle"],
  ["kunden", "Hilfe-Seite"],
  ["intern", "Nur Team"],
];
type StatusFilter = "alle" | "live" | "entwurf";

// Karten/Liste (Welle 49): Wahl je Browser merken (reine Komfort-Einstellung).
const VIEW_KEY = "steply-library-view";

const STATUS_LABEL: Record<StatusFilter, string> = {
  alle: "Status: Alle",
  live: "Status: Veröffentlicht",
  entwurf: "Status: Entwurf",
};

/** Zählt Hilfe-Seite-/Nur-Team-Zugehörigkeit (öffentliche „+Schulungen“ zählen doppelt). */
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
  canManageCategories = false,
  topSlot,
  children,
}: {
  tutorials: LibraryTutorial[];
  categories: LibraryCategory[];
  accountId: string;
  accountSlug: string;
  /** Eigene Kategorien löschen dürfen (Rollen mit Bearbeiten-Recht; Server prüft erneut). */
  canManageCategories?: boolean;
  topSlot?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [bereich, setBereich] = useState<Bereich>("alle");
  const [categoryId, setCategoryId] = useState<string | "alle">("alle");
  const [status, setStatus] = useState<StatusFilter>("alle");
  const [view, setView] = useState<TutorialLayout>("card");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- einmalig die gemerkte Ansicht nach dem Hydrieren übernehmen
      if (localStorage.getItem(VIEW_KEY) === "row") setView("row");
    } catch {
      /* Speicher gesperrt → Karten */
    }
  }, []);
  const chooseView = (v: TutorialLayout) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* egal */
    }
  };

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
  // Für den Lösch-Dialog: ALLE Anleitungen der Kategorie (unabhängig von Bereich/Status).
  const totalInCat = (id: string) => tutorials.filter((t) => t.categoryId === id).length;
  // Für den Umbenennen-Dialog: Namen der übrigen eigenen Kategorien (Duplikat-Hinweis).
  const otherCatNames = (id: string) => categories.filter((c) => c.id !== id).map((c) => c.name);
  const activeOwnCat =
    canManageCategories && categoryId !== "alle" && categoryId !== "__none"
      ? catById.get(categoryId)
      : undefined;

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

  const categoryNameOf = (t: LibraryTutorial) =>
    t.categoryId ? (catById.get(t.categoryId)?.name ?? null) : null;
  const newCategoryId = categoryId !== "alle" && categoryId !== "__none" ? categoryId : null;
  // Liste: Gruppen in Sidebar-Reihenfolge, „Sonstiges" zuletzt; leere Gruppen fallen weg.
  const listGroups = sidebarCats
    .map((c) => ({
      id: c.id,
      name: c.name,
      color: c.id === "__none" ? CATEGORY_NEUTRAL : categoryColor(c.name),
      items: visible.filter((t) => (t.categoryId ?? "__none") === c.id),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <BulkCleanupProvider>
      <div className="flex min-h-0 flex-1">
        {/* Kategorien-Sidebar (Desktop) */}
        <aside className="hidden w-[230px] shrink-0 flex-col gap-5 border-r-2 border-line px-4 py-5 lg:flex">
          <SidebarGroup label="Bereich">
            {BEREICH_LABELS.map(([key, label]) => {
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
            {sidebarCats.map((c) => {
              const row = (
                <CategoryRow
                  key={c.id}
                  name={c.name}
                  count={catCount(c.id)}
                  active={categoryId === c.id}
                  onClick={() => setCategoryId(c.id)}
                  color={c.id === "__none" ? CATEGORY_NEUTRAL : categoryColor(c.name)}
                />
              );
              // Eigene Kategorie: „…“-Menü (Umbenennen, Kategorie löschen) — erscheint bei Hover/Fokus.
              if (c.id === "__none" || !canManageCategories) return row;
              return (
                <div key={c.id} className="group/cat relative flex items-center" data-testid="category-row">
                  <div className="min-w-0 flex-1 [&>button]:w-full [&>button]:pr-9">{row}</div>
                  <CategoryMenu
                    categoryId={c.id}
                    categoryName={c.name}
                    tutorialCount={totalInCat(c.id)}
                    otherNames={otherCatNames(c.id)}
                    onDeleted={() => {
                      if (categoryId === c.id) setCategoryId("alle");
                    }}
                    className={cn(
                      "absolute right-1 opacity-0 group-hover/cat:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 data-[popup-open]:opacity-100",
                      categoryId === c.id && "opacity-100",
                    )}
                  />
                </div>
              );
            })}
          </SidebarGroup>
        </aside>

        {/* Hauptbereich */}
        <main className="min-w-0 flex-1 px-5 py-5 lg:px-7">
          {/* Mobile: Bereich-/Kategorie-Chips statt Sidebar */}
          <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {BEREICH_LABELS.map(([key, label]) => (
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
          <PageHeader
            className="mb-4 items-center"
            title={
              activeOwnCat ? (
                <span className="inline-flex max-w-full items-center gap-1">
                  <span className="min-w-0 break-words">{activeName}</span>
                  {/* Mobil gibt es keine Seitenleiste: „…“ (Umbenennen, Kategorie löschen) neben dem Titel. */}
                  <CategoryMenu
                    categoryId={activeOwnCat.id}
                    categoryName={activeOwnCat.name}
                    tutorialCount={totalInCat(activeOwnCat.id)}
                    otherNames={otherCatNames(activeOwnCat.id)}
                    onDeleted={() => setCategoryId("alle")}
                    className="lg:hidden"
                  />
                </span>
              ) : (
                activeName
              )
            }
            meta={`${visible.length} Anleitung${visible.length === 1 ? "" : "en"}`}
            actions={
            <div className="flex items-center gap-2 text-xs font-extrabold">
              <CleanupControls />
              <ViewToggle view={view} onChange={chooseView} />
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
            }
          />

          {view === "row" && (
            /* Liste: nach Kategorie gruppiert, Spalten zum Überfliegen */
            <div className="overflow-hidden rounded-card border-2 border-line bg-card" data-testid="library-list">
              <div className="hidden grid-cols-[minmax(0,1fr)_190px_90px_110px_150px_32px] gap-4 border-b-2 border-line px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-faint md:grid">
                <span>Anleitung</span>
                <span>Website</span>
                <span>Schritte</span>
                <span>Geändert</span>
                <span>Status</span>
                <span />
              </div>
              {listGroups.map((g) => (
                <div key={g.id}>
                  <div className="flex items-center gap-2 bg-line-2 px-4 py-2 text-[11.5px] font-black uppercase tracking-[0.06em] text-ink-2">
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: g.color.solid }}
                    />
                    {g.name}
                    <span className="text-faint">{g.items.length}</span>
                  </div>
                  {g.items.map((t) => (
                    <TutorialCard
                      key={t.id}
                      tutorial={t}
                      accountSlug={accountSlug}
                      categoryName={categoryNameOf(t)}
                      layout="row"
                    />
                  ))}
                </div>
              ))}
              <NewTutorialButton
                accountId={accountId}
                categoryId={newCategoryId}
                trigger={
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 border-t-2 border-line-2 px-4 py-3 text-left text-[13px] font-extrabold text-faint transition-colors hover:bg-[#fffcf7] hover:text-primary"
                  >
                    <span className="grid size-6 place-items-center rounded-full bg-line text-sm font-black text-muted-foreground">
                      ＋
                    </span>
                    Neue Anleitung
                  </button>
                }
              />
            </div>
          )}

          {/* Kartenraster */}
          {view === "card" && (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((t) => (
              <TutorialCard
                key={t.id}
                tutorial={t}
                accountSlug={accountSlug}
                categoryName={categoryNameOf(t)}
              />
            ))}
            {/* Anlegen-Karte (Design: gestrichelt) */}
            <NewTutorialButton
              accountId={accountId}
              categoryId={newCategoryId}
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
          )}

          {children}
        </main>
      </div>
    </BulkCleanupProvider>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: TutorialLayout;
  onChange: (v: TutorialLayout) => void;
}) {
  const opts: [TutorialLayout, string, typeof LayoutGrid][] = [
    ["card", "Karten", LayoutGrid],
    ["row", "Liste", List],
  ];
  return (
    <div
      className="flex rounded-full border-2 border-line bg-card p-0.5"
      role="group"
      aria-label="Ansicht"
    >
      {opts.map(([v, label, Icon]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={view === v}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold transition-colors",
            view === v ? "bg-ink text-background" : "text-ink-2 hover:text-ink",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
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
