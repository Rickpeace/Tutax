"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyField({
  value,
  multiline = false,
}: {
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex min-w-0 gap-2">
      {multiline ? (
        <textarea
          readOnly
          value={value}
          rows={3}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full resize-none rounded-xl border-2 border-line bg-background px-3 py-2 font-mono text-xs text-ink-2 outline-none focus:border-primary/50"
        />
      ) : (
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 w-full min-w-0 rounded-xl border-2 border-line bg-background px-3 font-mono text-xs text-ink-2 outline-none focus:border-primary/50"
        />
      )}
      <button
        type="button"
        onClick={copy}
        className="flex h-10 shrink-0 items-center gap-1.5 self-start rounded-full border-2 border-line bg-card px-3.5 text-sm font-extrabold text-ink-2 transition-colors hover:border-[#e3d7c2] hover:text-ink"
      >
        {copied ? (
          <>
            <Check className="size-4 text-yes" /> Kopiert
          </>
        ) : (
          <>
            <Copy className="size-4" /> Kopieren
          </>
        )}
      </button>
    </div>
  );
}
