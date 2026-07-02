import { Suspense } from "react";
import { brandStyle, resolveTheme, brandFonts } from "@/lib/theme";
import { loadHubTheme } from "@/lib/hub-theme";

/**
 * Persistenter Brand-Wrapper für ALLE /h-Unterrouten (Hub, Tutorial, Chat, Druck).
 *
 * Zweck: Beim Navigieren Hub -> Tutorial bleibt dieses Layout stehen (Layouts
 * re-rendern nicht), d. h. die loading.tsx-Skeletons erscheinen INNERHALB der
 * Kunden-CI-Variablen — vorher blitzte ein Steply-lavendelfarbener Ladescreen
 * auf, der mit fremden Designs kollidierte.
 *
 * Cache Components: der (gecachte) Theme-Load steckt in einer eigenen
 * Suspense-Boundary, damit die Fallback-Shell unbekannter Slugs statisch bleibt.
 * Die Seiten setzen ihre Brand-Vars weiterhin selbst (identisch, harmlos doppelt).
 */
export default function HubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ account_slug: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <Themed params={params}>{children}</Themed>
    </Suspense>
  );
}

async function Themed({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ account_slug: string }>;
}) {
  const { account_slug } = await params;
  const data = await loadHubTheme(account_slug);
  // Unbekannter Slug: Seite kümmert sich um notFound — hier neutral durchreichen.
  if (!data) return <>{children}</>;

  const { tokens } = resolveTheme(data.theme);
  const fonts = brandFonts(tokens);

  return (
    <div
      className="min-h-screen"
      style={{
        ...brandStyle(tokens),
        background: "var(--brand-bg, #f6f7fe)",
        fontFamily: fonts.body,
      }}
    >
      {children}
    </div>
  );
}
