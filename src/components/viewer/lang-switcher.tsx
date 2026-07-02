import Link from "next/link";
import { LANG_LABEL, type ExtraLang, type HubLang } from "@/lib/i18n-hub";

/**
 * Dezenter Sprach-Umschalter (Welle 13) für die öffentliche Hilfe-Seite.
 * DE ist immer dabei (ohne ?lang), die aktivierten Zusatzsprachen hängen ?lang=… an.
 * Rein serverseitige Links — keine Client-Interaktivität nötig.
 */
export function LangSwitcher({
  current,
  languages,
  basePath,
}: {
  current: HubLang;
  languages: ExtraLang[];
  basePath: string;
}) {
  const all: HubLang[] = ["de", ...languages];
  return (
    <nav data-tx="lang" aria-label="Sprache" className="flex shrink-0 items-center gap-1 text-xs">
      {all.map((l, i) => {
        const active = l === current;
        const href = l === "de" ? basePath : `${basePath}?lang=${l}`;
        return (
          <span key={l} className="flex items-center gap-1">
            {i > 0 && <span className="opacity-30">·</span>}
            <Link
              href={href}
              hrefLang={l}
              aria-current={active ? "true" : undefined}
              className={
                active
                  ? "font-bold text-[var(--brand-ink)]"
                  : "font-medium text-muted-foreground transition-colors hover:text-[var(--brand-ink)]"
              }
            >
              {LANG_LABEL[l]}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
