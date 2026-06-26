import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { BrandingForm } from "@/components/app/branding-form";
import { DesignModeSwitcher } from "@/components/app/design-mode-switcher";
import { publicImageUrl } from "@/lib/public-image";
import { appBaseUrl } from "@/lib/url";

export default async function BrandingPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data: theme } = await supabase
    .from("themes")
    .select("tokens, ai_tokens, logo_path, ai_logo_path, mode, source_url")
    .eq("account_id", account.id)
    .single();

  const mode = theme?.mode === "ai" ? "ai" : "manual";
  const manualLogoUrl = theme?.logo_path ? publicImageUrl(theme.logo_path) : null;
  const aiLogoUrl = theme?.ai_logo_path ? publicImageUrl(theme.ai_logo_path) : null;
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
        mode={mode}
        manualTokens={theme?.tokens ?? null}
        manualLogoUrl={manualLogoUrl}
        aiTokens={theme?.ai_tokens ?? null}
        aiLogoUrl={aiLogoUrl}
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
    </div>
  );
}
