"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";

/**
 * Fixierter Speichern-Balken der Einstellungen (Entwurf §2): erscheint NUR, wenn es
 * ungespeicherte Änderungen gibt. Sitzt über der mobilen TabBar bzw. unten in der
 * Inhaltsspalte (Desktop: rechts neben der 240px-Seitenleiste). Warnt beim Verlassen
 * der Seite (Neu laden/Tab schließen), solange etwas offen ist.
 */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!dirty && !saving) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 lg:bottom-5">
      {/* Gleiche Spaltengeometrie wie settings/layout.tsx (max 1180, Leiste 240, px-4/8). */}
      <div className="mx-auto max-w-[1180px] px-4 sm:px-8 lg:pl-[calc(240px+2rem)]">
        <div>
          <div
            role="region"
            aria-label="Ungespeicherte Änderungen"
            className="pointer-events-auto flex max-w-[820px] items-center gap-2.5 rounded-[14px] bg-ink py-2.5 pl-4 pr-3 font-extrabold text-white shadow-[0_12px_30px_rgba(51,41,31,0.25)] animate-in fade-in slide-in-from-bottom-2"
          >
            <span className="min-w-0 flex-1 text-sm">
              <span className="hidden sm:inline">Sie haben ungespeicherte Änderungen</span>
              <span className="sm:hidden">Ungespeicherte Änderungen</span>
            </span>
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className="rounded-full px-2.5 py-1.5 text-sm text-[#e9dfcf] transition-colors hover:text-white disabled:opacity-50"
            >
              Verwerfen
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-[7px] text-sm font-black text-white shadow-[0_3px_0_var(--primary-pressed)] transition-transform active:translate-y-px disabled:opacity-70"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Speichert …" : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
