"use client";

import { useCallback } from "react";

export type JumpSection = { domId: string; name: string; count: number };

/**
 * Mobile Kategorie-Sprungleiste fürs Dashboard (REVIEW G): horizontale, scrollbare
 * Chip-Leiste, sticky unter dem App-Header. Klick scrollt sanft zur Sektion
 * (`scrollIntoView`). Nur auf Mobile sichtbar (bis md), Desktop unverändert.
 *
 * Rendert nichts, wenn < 3 Sektionen — dann lohnt die Sprungleiste nicht.
 */
export function CategoryJump({ sections }: { sections: JumpSection[] }) {
  const jump = useCallback((domId: string) => {
    const el = document.getElementById(domId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (sections.length < 3) return null;

  return (
    <nav
      aria-label="Kategorien"
      // sticky unter dem 56px-Header; z unter dem Header (z-20), über dem Inhalt.
      className="sticky top-14 z-10 -mx-5 mb-4 border-b border-line-2 bg-background/90 backdrop-blur md:hidden"
    >
      <div className="flex gap-2 overflow-x-auto px-5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => (
          <button
            key={s.domId}
            type="button"
            onClick={() => jump(s.domId)}
            className="shrink-0 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:border-primary/40 hover:text-ink active:bg-accent"
          >
            {s.name}
            <span className="ml-1.5 text-[10px] font-bold text-muted-foreground">{s.count}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
