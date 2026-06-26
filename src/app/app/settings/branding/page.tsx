import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { BrandingForm } from "@/components/app/branding-form";
import { AutoCi } from "@/components/app/auto-ci";
import { publicImageUrl } from "@/lib/public-image";

export default async function BrandingPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data: theme } = await supabase
    .from("themes")
    .select("tokens, logo_path, source_url")
    .eq("account_id", account.id)
    .single();
  const colors = ((theme?.tokens as { colors?: Record<string, string> })?.colors ?? {}) as Record<string, string>;
  const logoUrl = theme?.logo_path ? publicImageUrl(theme.logo_path) : null;

  return (
    <div>
      <h2 className="text-lg font-bold text-ink">Branding &amp; Hilfe-Seite</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Name, Adresse und Farben Ihrer öffentlichen Hilfe-Seite. (Automatische
        CI-Übernahme per Website-URL kommt mit der KI.)
      </p>
      <div className="mb-6">
        <AutoCi initialUrl={theme?.source_url ?? ""} />
      </div>

      <BrandingForm
        initialName={account.name}
        initialSlug={account.slug}
        initialLogoUrl={logoUrl}
        initialColors={{
          primary: colors.primary ?? "#3d4ee6",
          background: colors.background ?? "#f6f7fe",
          surface: colors.surface ?? "#eef0fe",
          text: colors.text ?? "#101524",
        }}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
      />
    </div>
  );
}
