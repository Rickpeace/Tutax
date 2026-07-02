import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandStyle, resolveTheme, googleFontsHref, brandFonts } from "@/lib/theme";
import { ChatWidget } from "@/components/viewer/chat-widget";

// Chat-only-Seite (Feature H4 „Script-Chat-Bubble"): rendert NUR den ChatWidget,
// CSS-isoliert in einem eigenen iFrame. Wiederverwendet das komplette bestehende
// Chat-Setup (RAG/NDJSON/Branding) – hier kommt nur die minimale, transparente Hülle dazu.

// Per-Request via React cache(): generateMetadata + Seite teilen sich EINE Ausführung.
const load = cache(async (accountSlug: string) => {
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id, name, slug")
    .eq("slug", accountSlug)
    .single();
  if (!account) return null;

  const { data: theme } = await admin
    .from("themes")
    .select(
      "tokens, ai_tokens, logo_path, ai_logo_path, mode, extreme_tokens, extreme_css, extreme_layout, extreme_logo_path",
    )
    .eq("account_id", account.id)
    .single();

  return { account, theme };
});

export const metadata: Metadata = {
  title: "Hilfe-Assistent",
  robots: { index: false, follow: false },
};

export default async function ChatEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ account_slug: string }>;
  searchParams: Promise<{ embedded?: string }>;
}) {
  const { account_slug } = await params;
  const { embedded } = await searchParams;
  const data = await load(account_slug);
  if (!data) notFound();

  const { account, theme } = data;
  const { tokens } = resolveTheme(theme);
  const fonts = brandFonts(tokens);
  const fontsHref = googleFontsHref(tokens);

  return (
    <div style={{ ...brandStyle(tokens), fontFamily: fonts.body }}>
      {/* Das iFrame gibt die Größe vor; die Seite selbst bleibt transparent, damit
          die Bubble (rund/eckig) frei „schwebt". */}
      <style>{"html,body{background:transparent!important}"}</style>
      {fontsHref && (
        <>
          {/* Preconnect vor dem Stylesheet (React 19 hoisted beides in den <head>) →
              vermeidet FOUT bei Kunden-Brand-Fonts (REVIEW A). */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontsHref} />
        </>
      )}
      <ChatWidget
        accountSlug={account.slug}
        accountName={account.name}
        embedded={embedded === "1"}
      />
    </div>
  );
}
