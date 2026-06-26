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
    <div className="flex gap-2">
      {multiline ? (
        <textarea
          readOnly
          value={value}
          rows={3}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-ink-2 outline-none"
        />
      ) : (
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-ink-2 outline-none"
        />
      )}
      <button
        type="button"
        onClick={copy}
        className="flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-muted"
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
