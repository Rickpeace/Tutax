import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { BrandingForm } from "@/components/app/branding-form";
import { DesignModeSwitcher } from "@/components/app/design-mode-switcher";
import { LanguagesForm } from "@/components/app/languages-form";
import { publicImageUrl } from "@/lib/public-image";
import { appBaseUrl } from "@/lib/url";
import { isExtraLang, type ExtraLang } from "@/lib/i18n-hub";

export default async function BrandingPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const [{ data: theme }, { data: acc }] = await Promise.all([
    supabase
      .from("themes")
      .select(
        "tokens, ai_tokens, logo_path, ai_logo_path, mode, source_url, extreme_tokens, extreme_logo_path",
      )
      .eq("account_id", account.id)
      .single(),
    supabase.from("accounts").select("languages").eq("id", account.id).single(),
  ]);
  const languages = ((acc?.languages as string[] | null) ?? []).filter(
    isExtraLang,
  ) as ExtraLang[];

  const mode =
    theme?.mode === "extreme" ? "extreme" : theme?.mode === "ai" ? "ai" : "manual";
  const manualLogoUrl = theme?.logo_path ? publicImageUrl(theme.logo_path) : null;
  const aiLogoUrl = theme?.ai_logo_path ? publicImageUrl(theme.ai_logo_path) : null;
  const extremeLogoUrl = theme?.extreme_logo_path
    ? publicImageUrl(theme.extreme_logo_path)
    : null;
  const colors = ((theme?.tokens as { colors?: Record<string, string> })?.colors ?? {}) as Record<string, string>;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-ink">Branding &amp; Hilfe-Seite</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Wählen Sie, ob Ihre öffentliche Hilfe-Seite das <b>Standard-CI</b> oder ein von der
          <b> KI aus Ihrer Website</b> abgeleitetes Design nutzt. Vorschau unten, dann aktivieren.
        </p>
      </div>

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
      />

      <div className="border-t border-line-2 pt-6">
        <h3 className="font-bold text-ink">Standard-CI anpassen</h3>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Name, Adresse (Slug), Logo und Farben des Standard-Designs.
        </p>
        <BrandingForm
          initialName={account.name}
          initialSlug={account.slug}
          initialLogoUrl={manualLogoUrl}
          initialColors={{
            primary: colors.primary ?? "#3d4ee6",
            background: colors.background ?? "#f6f7fe",
            surface: colors.surface ?? "#eef0fe",
            text: colors.text ?? "#101524",
          }}
          appUrl={appBaseUrl()}
        />
      </div>

      <LanguagesForm initial={languages} />
    </div>
  );
}
