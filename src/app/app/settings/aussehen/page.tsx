import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { AppearanceEditor } from "@/components/app/appearance-editor";
import { SettingsHeader } from "@/components/app/settings-ui";
import { publicImageUrl } from "@/lib/public-image";
import { brandColorsWithDefaults } from "@/lib/theme";
import { isBusiness, isPro } from "@/lib/plan";

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

  // Wirksamer Modus wie auf der Hilfe-Seite (brandedTheme): KI-Design gilt nur mit Business —
  // nach einem Herabstufen ist „Steply-Standard“ aktiv, das gespeicherte KI-Design bleibt.
  const mode = !isBusiness(account)
    ? "manual"
    : theme?.mode === "extreme" ? "extreme" : theme?.mode === "ai" ? "ai" : "manual";

  return (
    <div className="grid gap-[18px]">
      <SettingsHeader
        group="Hilfe-Seite"
        title="Aussehen"
        lead="So sieht Ihre Hilfe-Seite für Kunden aus. Grundlage wählen, anpassen – und sofort in der Vorschau sehen."
      />
      <AppearanceEditor
        accountId={account.id}
        accountName={account.name}
        accountSlug={account.slug}
        activeMode={mode}
        pro={isPro(account)}
        business={isBusiness(account)}
        manualTokens={isPro(account) ? (theme?.tokens ?? null) : null}
        // Fehlende Farben = warme Standard-Farben der echten Hilfe-Seite (EINE Quelle).
        initialColors={brandColorsWithDefaults(theme?.tokens)}
        initialLogoUrl={isPro(account) && theme?.logo_path ? publicImageUrl(theme.logo_path) : null}
        aiTokens={theme?.ai_tokens ?? null}
        aiLogoUrl={theme?.ai_logo_path ? publicImageUrl(theme.ai_logo_path) : null}
        extremeTokens={theme?.extreme_tokens ?? null}
        extremeLogoUrl={theme?.extreme_logo_path ? publicImageUrl(theme.extreme_logo_path) : null}
        sourceUrl={theme?.source_url ?? ""}
      />
    </div>
  );
}
