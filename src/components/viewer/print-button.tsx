"use client";

import { Printer } from "lucide-react";

/** Kleiner Client-Auslöser für window.print() – wird im Druck selbst ausgeblendet. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-ink transition-colors hover:border-[var(--brand-accent)] print:hidden"
    >
      <Printer className="size-4" /> Drucken
    </button>
  );
}
