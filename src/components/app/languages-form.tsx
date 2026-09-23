"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Languages, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { BusinessPill, SettingsCard } from "@/components/app/settings-ui";
import { saveLanguages } from "@/app/app/settings/branding/actions";
import { EXTRA_LANGS, LANG_LABEL, LANG_NAME, type ExtraLang } from "@/lib/i18n-hub";

/**
 * „Sprachen“ (Einstellungen → Sprachen & Vorlesen). Deutsch ist immer an; hier wählt
 * der Kunde zusätzliche Sprachen für die öffentliche Hilfe-Seite. Jeder Schalter
 * speichert sofort (optimistisch; bei Fehler Rollback + Toast). Mehrsprachigkeit ist
 * Business — Free/Pro sehen die Auswahl gesperrt als Teaser (wie im Onboarding), statt
 * beim Einschalten erst vom Server abgelehnt zu werden.
 */
export function LanguagesForm({
  accountId,
  initial,
  isBusiness,
}: {
  accountId: string;
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
      const res = await saveLanguages(accountId, [...next]);
      if (!res.ok) {
        setSelected(prev);
        toast.error(res.error || "Sprachen konnten nicht gespeichert werden");
      } else {
        toast.success(
          on
            ? `${LANG_NAME[lang]} ist an – veröffentlichte Anleitungen werden im Hintergrund übersetzt.`
            : `${LANG_NAME[lang]} ist aus.`,
        );
      }
    });
  }

  const rows: { lang: "de" | ExtraLang; on: boolean; fixed: boolean }[] = [
    { lang: "de", on: true, fixed: true },
    ...EXTRA_LANGS.map((l) => ({ lang: l, on: selected.has(l), fixed: false })),
  ];

  return (
    <SettingsCard
      title="Sprachen der Hilfe-Seite"
      icon={Languages}
      aside={
        <>
          {!isBusiness && <BusinessPill />}
          {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </>
      }
      description="Eingeschaltete Sprachen erscheinen als Umschalter auf Ihrer Hilfe-Seite."
    >
      <ul className="-mx-[18px] divide-y-2 divide-line-2 border-y-2 border-line-2">
        {rows.map((r) => {
          // Ohne Business bleibt nur das EINSCHALTEN gesperrt. Eine bereits aktive
          // Sprache (z. B. nach einem Downgrade) muss abschaltbar bleiben — der Server
          // erlaubt das Leeren ausdrücklich (saveLanguages).
          const disabled = r.fixed || pending || (!isBusiness && !r.on);
          const id = `lang-${r.lang}`;
          return (
            <li key={r.lang} className="flex items-center gap-3 px-[18px] py-2.5">
              <span className="flex h-6 w-9 shrink-0 items-center justify-center rounded-md bg-line-2 text-[11px] font-black text-ink-2">
                {LANG_LABEL[r.lang]}
              </span>
              <label
                htmlFor={id}
                className={`min-w-0 flex-1 text-sm font-extrabold text-ink ${
                  disabled ? "cursor-default" : "cursor-pointer"
                }`}
              >
                {LANG_NAME[r.lang]}
                {r.fixed && (
                  <span className="ml-2 text-xs font-bold text-muted-foreground">immer an</span>
                )}
              </label>
              <Switch
                id={id}
                aria-label={LANG_NAME[r.lang]}
                checked={r.on}
                disabled={disabled}
                onCheckedChange={(v) => {
                  if (!r.fixed) toggle(r.lang as ExtraLang, v);
                }}
              />
            </li>
          );
        })}
      </ul>
      {!isBusiness && (
        <p className="text-xs text-muted-foreground">
          Mehrsprachige Hilfe-Seite gibt es im Business-Tarif.
          {selected.size > 0 ? " Bereits aktive Sprachen können Sie weiterhin abschalten." : ""}{" "}
          <Link
            href="/app/settings/tarif"
            className="font-extrabold text-primary underline underline-offset-2"
          >
            Mehr erfahren
          </Link>
        </p>
      )}
    </SettingsCard>
  );
}
