import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { BrandingForm } from "@/components/app/branding-form";
import { DesignModeSwitcher } from "@/components/app/design-mode-switcher";
import { SettingsHeader } from "@/components/app/settings-ui";
import { publicImageUrl } from "@/lib/public-image";
import { brandColorsWithDefaults } from "@/lib/theme";
import { isBusiness } from "@/lib/plan";

export default async function AussehenPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data: theme } = await supabase
    .from("themes")
    .select(
      "tokens, ai_tokens, logo_path, ai_logo_path, mode, source_url, extreme_tokens, extreme_logo_path",
    )
    .eq("account_id", account.id)
    .single();

  const mode =
    theme?.mode === "extreme" ? "extreme" : theme?.mode === "ai" ? "ai" : "manual";
  const manualLogoUrl = theme?.logo_path ? publicImageUrl(theme.logo_path) : null;
  const aiLogoUrl = theme?.ai_logo_path ? publicImageUrl(theme.ai_logo_path) : null;
  const extremeLogoUrl = theme?.extreme_logo_path
    ? publicImageUrl(theme.extreme_logo_path)
    : null;

  return (
    <div className="grid gap-[18px]">
      <SettingsHeader
        group="Hilfe-Seite"
        title="Aussehen"
        lead="So sieht Ihre Hilfe-Seite für Kunden aus. Wählen Sie eine Grundlage und passen Sie Logo und Farben an."
      />

      <DesignModeSwitcher
        accountName={account.name}
        accountSlug={account.slug}
        mode={mode}
        manualTokens={theme?.tokens ?? null}
        manualLogoUrl={manualLogoUrl}
        aiTokens={theme?.ai_tokens ?? null}
        aiLogoUrl={aiLogoUrl}
        extremeTokens={theme?.extreme_tokens ?? null}
        extremeLogoUrl={extremeLogoUrl}
        sourceUrl={theme?.source_url ?? ""}
        business={isBusiness(account)}
      />

      <BrandingForm
        name={account.name}
        slug={account.slug}
        initialLogoUrl={manualLogoUrl}
        // Fehlende Farben = warme Standard-Farben der echten Hilfe-Seite (EINE Quelle).
        initialColors={brandColorsWithDefaults(theme?.tokens)}
        modeHint={
          mode === "manual"
            ? null
            : `Gilt für „Steply-Standard“. Gerade ist „${mode === "ai" ? "Von Ihrer Website" : "Nachgebaut"}“ aktiv – diese Einstellungen greifen, sobald Sie oben „Steply-Standard“ verwenden.`
        }
      />
    </div>
  );
}
