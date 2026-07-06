"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Languages, X } from "lucide-react";
import { t, type ExtraLang, type HubLang } from "@/lib/i18n-hub";

/**
 * Browser-Sprach-Vorschlag (Welle 30) für die öffentliche Hilfe-Seite.
 *
 * Rein clientseitig: rendert serverseitig UND beim ersten Client-Render NICHTS (null).
 * Erst NACH dem Mount entscheidet sie anhand von navigator.language, ob eine dezente,
 * schließbare Leiste erscheint. So bleibt die /h-Shell statisch prerenderbar (kein neuer
 * dynamischer Read, kein Layout-Springen, kein Hydration-Mismatch, PPR-treu).
 *
 * Regeln (bewusst konservativ — niemals automatisch umleiten):
 *  - Nur auf der deutschen Standardansicht (kein ?lang= aktiv, currentLang === "de").
 *  - Nur wenn die Browser-Sprache eine im Konto AKTIVIERTE Zusatzsprache ist und ≠ Deutsch.
 *  - Text steht in der ZIELsprache (z. B. „View this help page in English?").
 *  - Schließen merkt sich der Browser je Konto-Slug (localStorage) → nie wieder vorschlagen.
 */
const dismissKey = (slug: string) => `steply.langhint.${slug}`;

/**
 * true erst NACH der Hydration. useSyncExternalStore nutzt bei der Hydration den
 * Server-Snapshot (false) → erstes Client-Render stimmt mit dem SSR-Null überein
 * (kein Hydration-Mismatch), danach re-rendert React mit dem Client-Snapshot (true).
 */
function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function LangSuggestBar({
  accountSlug,
  languages,
  currentLang,
  basePath,
}: {
  accountSlug: string;
  languages: ExtraLang[];
  currentLang: HubLang;
  basePath: string;
}) {
  const mounted = useMounted();
  const [dismissed, setDismissed] = useState(false);

  // Entscheidung rein im Render (keine setState-in-Effect-Kaskade). Browser-APIs werden
  // NUR angefasst, wenn `mounted` (also nach der Hydration) → serverseitig immer null.
  let target: ExtraLang | null = null;
  if (mounted && !dismissed && currentLang === "de") {
    let alreadyDismissed = false;
    try {
      alreadyDismissed = !!localStorage.getItem(dismissKey(accountSlug));
    } catch {
      alreadyDismissed = true; // localStorage nicht verfügbar → nicht nerven
    }
    if (!alreadyDismissed) {
      const base = (navigator.language || "").toLowerCase().split("-")[0];
      // Deutsch bevorzugt → kein Vorschlag. Sonst nur AKTIVIERTE Zusatzsprachen.
      if (base && base !== "de" && languages.includes(base as ExtraLang)) {
        target = base as ExtraLang;
      }
    }
  }

  if (!target) return null;

  const href = `${basePath}?lang=${target}`;
  function dismiss() {
    try {
      localStorage.setItem(dismissKey(accountSlug), "1");
    } catch {
      /* ignorieren — dann erscheint der Vorschlag beim nächsten Besuch erneut */
    }
    setDismissed(true);
  }

  return (
    <div
      data-tx="lang-suggest"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-sm"
      style={{
        background: "color-mix(in srgb, var(--brand-accent) 12%, var(--brand-bg))",
        borderBottom: "2px solid color-mix(in srgb, var(--brand-ink) 8%, transparent)",
        color: "var(--brand-ink)",
      }}
    >
      <Languages aria-hidden className="size-4 shrink-0 opacity-70" />
      <span className="font-semibold">{t(target, "langSuggest")}</span>
      <Link
        href={href}
        hrefLang={target}
        data-tx="lang-suggest-link"
        className="font-bold underline underline-offset-2 hover:opacity-80"
        style={{ color: "var(--brand-ink)" }}
      >
        {t(target, "langSuggestGo")}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        data-tx="lang-suggest-close"
        aria-label={t(target, "close")}
        className="ml-1 grid size-6 shrink-0 place-items-center rounded-full transition-colors hover:bg-black/5"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
