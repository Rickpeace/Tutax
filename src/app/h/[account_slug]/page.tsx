import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandStyle, resolveTheme, googleFontsHref, brandFonts } from "@/lib/theme";
import { publicImageUrl } from "@/lib/public-image";
import { getCatalog } from "@/lib/templates";
import { HubBrowser, type HubTutorial } from "@/components/viewer/hub-browser";
import { ChatWidget } from "@/components/viewer/chat-widget";

async function load(accountSlug: string) {
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id, name, slug")
    .eq("slug", accountSlug)
    .single();
  if (!account) return null;

  const [catalog, { data: categories }, { data: theme }] = await Promise.all([
    getCatalog(admin, account.id),
    // eigene + globale (Standard-)Kategorien
    admin
      .from("categories")
      .select("id, name, position, account_id")
      .or(`account_id.eq.${account.id},account_id.is.null`)
      .order("position", { ascending: true }),
    admin
      .from("themes")
      .select("tokens, ai_tokens, logo_path, ai_logo_path, mode")
      .eq("account_id", account.id)
      .single(),
  ]);

  return { account, catalog, categories: categories ?? [], theme };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ account_slug: string }>;
}): Promise<Metadata> {
  const { account_slug } = await params;
  const data = await load(account_slug);
  if (!data) return { title: "Nicht gefunden" };
  return { title: `Hilfe & Anleitungen · ${data.account.name}` };
}

export default async function HubPage({
  params,
}: {
  params: Promise<{ account_slug: string }>;
}) {
  const { account_slug } = await params;
  const data = await load(account_slug);
  if (!data) notFound();

  const { account, catalog, categories, theme } = data;
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const items: HubTutorial[] = catalog
    .filter((e) => e.visible && e.slug)
    .map((e) => ({
      title: e.title,
      description: e.description,
      slug: e.slug as string,
      category: (e.categoryId && catName.get(e.categoryId)) || "Sonstiges",
    }));

  // eigene Kategorien zuerst, dann globale (Standard), Namen dedupliziert
  const ordered = [
    ...categories.filter((c) => c.account_id),
    ...categories.filter((c) => !c.account_id),
  ];
  const order = [...new Set([...ordered.map((c) => c.name), "Sonstiges"])];
  const initial = account.name.trim().charAt(0).toUpperCase() || "?";
  const { mode, tokens, logoPath, skinCss, layout } = resolveTheme(theme);
  const fonts = brandFonts(tokens);
  const fontsHref = googleFontsHref(tokens);
  const logoUrl = logoPath ? publicImageUrl(logoPath) : null;
  const skinClass =
    mode === "extreme"
      ? `tutax-skin tx-h-${layout?.header ?? "left"} tx-c-${layout?.cards ?? "grid"} tx-hero-${layout?.hero ?? "none"}`
      : "";

  return (
    <main
      className={`min-h-screen ${skinClass}`}
      style={{ ...brandStyle(tokens), background: "var(--brand-bg)", fontFamily: fonts.body }}
    >
      {fontsHref && <link rel="stylesheet" href={fontsHref} />}
      {mode === "extreme" && skinCss && (
        <style dangerouslySetInnerHTML={{ __html: skinCss }} />
      )}
      {mode === "ai" && <div className="h-1.5 w-full" style={{ background: "var(--brand-accent)" }} />}
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div data-tx="header" className="mb-5 flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              data-tx="logo"
              className="size-11 border border-black/5 bg-white object-contain p-1"
              style={{ borderRadius: "var(--brand-radius, 12px)" }}
            />
          ) : (
            <div
              data-tx="logo"
              className="flex size-11 items-center justify-center text-lg font-extrabold text-white"
              style={{ background: "var(--brand-accent)", borderRadius: "var(--brand-radius, 12px)" }}
            >
              {initial}
            </div>
          )}
          <div>
            <div
              data-tx="title"
              className="text-xl font-extrabold"
              style={{
                fontFamily: fonts.heading,
                fontWeight: "var(--brand-heading-weight, 800)",
                color: "var(--brand-title, var(--brand-ink))",
              }}
            >
              {account.name}
            </div>
            <div data-tx="subtitle" className="text-sm text-muted-foreground">Hilfe &amp; Anleitungen</div>
          </div>
        </div>

        <HubBrowser accountSlug={account.slug} items={items} order={order} />

        <p data-tx="footer" className="mt-8 text-center text-xs text-muted-foreground">powered by Tutax</p>
      </div>
      <ChatWidget accountSlug={account.slug} accountName={account.name} />
    </main>
  );
}
