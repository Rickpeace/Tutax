import Link from "next/link";
import { LANG_LABEL, type ExtraLang, type HubLang } from "@/lib/i18n-hub";
import { TAP_AREA } from "@/lib/tap-target";

/**
 * Dezenter Sprach-Umschalter (Welle 13) für die öffentliche Hilfe-Seite.
 * DE ist immer dabei (ohne ?lang), die aktivierten Zusatzsprachen hängen ?lang=… an.
 * Rein serverseitige Links — keine Client-Interaktivität nötig.
 */
export function LangSwitcher({
  current,
  languages,
  basePath,
  label = "Sprache",
}: {
  current: HubLang;
  languages: ExtraLang[];
  basePath: string;
  /** Lokalisiertes aria-label (Welle 29). Default DE. */
  label?: string;
}) {
  const all: HubLang[] = ["de", ...languages];
  return (
    // Touch: 40-px-Trefferflächen (TAP_AREA) + mehr Abstand, damit sie sich nicht
    // überlappen (Handy-Audit 24.09.: vorher 16 × 16 px).
    <nav data-tx="lang" aria-label={label} className="flex shrink-0 items-center gap-1 text-xs pointer-coarse:gap-2.5">
      {all.map((l, i) => {
        const active = l === current;
        const href = l === "de" ? basePath : `${basePath}?lang=${l}`;
        return (
          <span key={l} className="flex items-center gap-1 pointer-coarse:gap-2.5">
            {i > 0 && <span className="opacity-30">·</span>}
            <Link
              href={href}
              hrefLang={l}
              aria-current={active ? "true" : undefined}
              className={`relative ${TAP_AREA} ${
                active
                  ? "font-bold text-[var(--brand-ink)]"
                  : "font-medium text-muted-foreground transition-colors hover:text-[var(--brand-ink)]"
              }`}
            >
              {LANG_LABEL[l]}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
