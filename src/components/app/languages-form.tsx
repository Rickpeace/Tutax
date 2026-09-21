"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Crown, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { saveLanguages } from "@/app/app/settings/branding/actions";
import { EXTRA_LANGS, LANG_NAME, type ExtraLang } from "@/lib/i18n-hub";

/**
 * „Sprachen“-Abschnitt (Einstellungen → Branding). Deutsch ist immer an; hier wählt
 * der Kunde zusätzliche Sprachen für die öffentliche Hilfe-Seite. Speichert nach jeder
 * Änderung optimistisch; bei Fehler Rollback + Toast. Mehrsprachigkeit ist Business —
 * Free/Pro sehen die Auswahl gesperrt als Teaser (wie im Onboarding), statt beim
 * Anhaken erst vom Server abgelehnt zu werden.
 */
export function LanguagesForm({
  initial,
  isBusiness,
}: {
  initial: ExtraLang[];
  isBusiness: boolean;
}) {
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
        {!isBusiness && (
          <Badge variant="secondary" className="gap-1">
            <Crown className="size-3" /> Business
          </Badge>
        )}
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
              className={`flex items-center gap-2.5 text-sm text-ink ${
                isBusiness ? "cursor-pointer" : "cursor-not-allowed"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={!isBusiness || pending}
                onChange={(e) => toggle(lang, e.target.checked)}
                className="size-4 accent-[var(--primary)] disabled:opacity-60"
              />
              {LANG_NAME[lang]}
            </label>
          );
        })}
      </div>
      {!isBusiness && (
        <p className="mt-3 text-xs text-muted-foreground">
          Mehrsprachige Hilfe-Seite gibt es im Business-Tarif.{" "}
          <Link
            href="/app/settings/abo"
            className="font-medium text-primary underline underline-offset-2"
          >
            Mehr erfahren
          </Link>
        </p>
      )}
    </div>
  );
}
