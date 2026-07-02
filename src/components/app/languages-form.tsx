"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { saveLanguages } from "@/app/app/settings/branding/actions";
import { EXTRA_LANGS, LANG_NAME, type ExtraLang } from "@/lib/i18n-hub";

/**
 * „Sprachen“-Abschnitt (Einstellungen → Branding). Deutsch ist immer an; hier wählt
 * der Kunde zusätzliche Sprachen für die öffentliche Hilfe-Seite. Speichert nach jeder
 * Änderung optimistisch; bei Fehler Rollback + Toast.
 */
export function LanguagesForm({ initial }: { initial: ExtraLang[] }) {
  const [selected, setSelected] = useState<Set<ExtraLang>>(new Set(initial));
  const [pending, startTransition] = useTransition();

  function toggle(lang: ExtraLang, on: boolean) {
    const prev = new Set(selected);
    const next = new Set(selected);
    if (on) next.add(lang);
    else next.delete(lang);
    setSelected(next); // optimistisch

    startTransition(async () => {
      const res = await saveLanguages([...next]);
      if (!res.ok) {
        setSelected(prev);
        toast.error(res.error || "Sprachen konnten nicht gespeichert werden");
      } else {
        toast.success("Sprachen gespeichert");
      }
    });
  }

  return (
    <div className="border-t border-line-2 pt-6">
      <h3 className="flex items-center gap-2 font-bold text-ink">
        Sprachen
        {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </h3>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        Deutsch ist immer an. Zusätzliche Sprachen erscheinen als Umschalter auf Ihrer
        Hilfe-Seite. Übersetzt wird pro Anleitung im Editor über „Übersetzen&ldquo;.
      </p>
      <div className="flex flex-col gap-2.5">
        {EXTRA_LANGS.map((lang) => {
          const on = selected.has(lang);
          return (
            <label
              key={lang}
              className="flex cursor-pointer items-center gap-2.5 text-sm text-ink"
            >
              <input
                type="checkbox"
                checked={on}
                disabled={pending}
                onChange={(e) => toggle(lang, e.target.checked)}
                className="size-4 accent-[var(--primary)] disabled:opacity-60"
              />
              {LANG_NAME[lang]}
            </label>
          );
        })}
      </div>
    </div>
  );
}
