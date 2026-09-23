import { RefreshCw, Volume2 } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { LanguagesForm } from "@/components/app/languages-form";
import { BusinessPill, SettingsCard, SettingsHeader } from "@/components/app/settings-ui";
import { isExtraLang, type ExtraLang } from "@/lib/i18n-hub";
import { isBusiness } from "@/lib/plan";

export default async function SprachenPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data: acc } = await supabase
    .from("accounts")
    .select("languages")
    .eq("id", account.id)
    .single();
  const languages = ((acc?.languages as string[] | null) ?? []).filter(
    isExtraLang,
  ) as ExtraLang[];
  const business = isBusiness(account);

  return (
    <div className="grid gap-[18px]">
      <SettingsHeader
        group="Hilfe-Seite"
        title="Sprachen & Vorlesen"
        lead="Ihre Hilfe-Seite in mehreren Sprachen – Steply übersetzt automatisch und kann jeden Schritt vorlesen."
      />

      <LanguagesForm accountId={account.id} initial={languages} isBusiness={business} />

      {/* Stand laut OVERVIEW (Auto-Sync): Publish = Vollübersetzung, Änderung = Delta,
          Sprache einschalten = Backfill — alles automatisch im Hintergrund. */}
      <SettingsCard
        title="Automatische Übersetzung"
        icon={RefreshCw}
        description="Sie müssen nichts von Hand übersetzen."
      >
        <ul className="grid gap-2 text-sm text-ink-2">
          <li className="flex gap-2">
            <Dot />
            <span>
              <b className="text-ink">Beim Veröffentlichen</b> wird eine Anleitung vollständig in
              alle eingeschalteten Sprachen übersetzt.
            </span>
          </li>
          <li className="flex gap-2">
            <Dot />
            <span>
              <b className="text-ink">Spätere Änderungen</b> werden automatisch nachgezogen – nur
              das geänderte Stück wird neu übersetzt.
            </span>
          </li>
          <li className="flex gap-2">
            <Dot />
            <span>
              <b className="text-ink">Neu eingeschaltete Sprachen</b> ergänzt Steply für bereits
              veröffentlichte Anleitungen im Hintergrund.
            </span>
          </li>
          <li className="flex gap-2">
            <Dot />
            <span>Anleitungen, die „Nur Team“ sieht, werden nicht übersetzt.</span>
          </li>
        </ul>
      </SettingsCard>

      <SettingsCard
        title="Vorlesen"
        icon={Volume2}
        aside={!business ? <BusinessPill /> : undefined}
        description="Beim Veröffentlichen erzeugt Steply für jeden Schritt eine natürliche Vorlese-Stimme. Ihre Kunden starten sie auf der Hilfe-Seite mit dem ▶-Knopf – eine Einstellung ist dafür nicht nötig."
      />
    </div>
  );
}

function Dot() {
  return <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />;
}
