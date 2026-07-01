import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandStyle, resolveTheme, googleFontsHref, brandFonts } from "@/lib/theme";
import { sanitizeSkinCss } from "@/lib/skin-css";
import { publicImageUrl } from "@/lib/public-image";
import { resolveCustomerTutorial } from "@/lib/templates";
import { Wizard } from "@/components/viewer/wizard";
import { ChatWidget } from "@/components/viewer/chat-widget";
import type { Step, StepBranch, Tutorial } from "@/lib/types";

// Öffentliche Seite: serverseitige, kontrollierte Reads (nur published).
// Per-Request via React cache(): generateMetadata + Seite teilen sich EINE Ausführung.
const load = cache(async (accountSlug: string, tutorialSlug: string) => {
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id, name, slug")
    .eq("slug", accountSlug)
    .single();
  if (!account) return null;

  const tutorialId = await resolveCustomerTutorial(admin, account.id, tutorialSlug);
  if (!tutorialId) return null;
  const { data: tutorial } = await admin
    .from("tutorials")
    .select("*")
    .eq("id", tutorialId)
    .single<Tutorial>();
  if (!tutorial) return null;

  const { data: steps } = await admin
    .from("steps")
    .select("*")
    .eq("tutorial_id", tutorial.id)
    .returns<Step[]>();
  const stepIds = (steps ?? []).map((s) => s.id);
  const { data: branches } = stepIds.length
    ? await admin.from("step_branches").select("*").in("step_id", stepIds).returns<StepBranch[]>()
    : { data: [] as StepBranch[] };
  const { data: theme } = await admin
    .from("themes")
    .select(
      "tokens, ai_tokens, logo_path, ai_logo_path, mode, extreme_tokens, extreme_css, extreme_layout, extreme_logo_path",
    )
    .eq("account_id", account.id)
    .single();

  return { account, tutorial, steps: steps ?? [], branches: branches ?? [], theme };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ account_slug: string; tutorial_slug: string }>;
}): Promise<Metadata> {
  const { account_slug, tutorial_slug } = await params;
  const data = await load(account_slug, tutorial_slug);
  if (!data) return { title: "Nicht gefunden" };
  const { account, tutorial } = data;
  const title = `${tutorial.title} · ${account.name}`;
  const description =
    tutorial.description?.trim() ||
    `Schritt-für-Schritt-Anleitung von ${account.name}: ${tutorial.title}.`;
  const { logoPath } = resolveTheme(data.theme);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: account.name,
      ...(logoPath ? { images: [publicImageUrl(logoPath)] } : {}),
    },
  };
}

export default async function ViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ account_slug: string; tutorial_slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { account_slug, tutorial_slug } = await params;
  const { preview } = await searchParams;
  const data = await load(account_slug, tutorial_slug);
  if (!data) notFound();

  const { account, tutorial, steps, branches } = data;
  const previewMode =
    preview && ["manual", "ai", "extreme"].includes(preview) ? preview : null;
  const theme = previewMode ? { ...data.theme, mode: previewMode } : data.theme;
  const imageUrls: Record<string, string> = {};
  for (const s of steps) if (s.image_path) imageUrls[s.id] = publicImageUrl(s.image_path);
  const initial = account.name.trim().charAt(0).toUpperCase() || "?";
  const { mode, tokens, logoPath, skinCss, layout } = resolveTheme(theme);
  const fonts = brandFonts(tokens);
  const fontsHref = googleFontsHref(tokens);
  const logoUrl = logoPath ? publicImageUrl(logoPath) : null;
  const previewQ = previewMode ? `?preview=${previewMode}` : "";
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
        <style dangerouslySetInnerHTML={{ __html: sanitizeSkinCss(skinCss) }} />
      )}
      {mode === "ai" && <div className="h-1.5 w-full" style={{ background: "var(--brand-accent)" }} />}
      <div className="mx-auto flex max-w-md flex-col px-4 py-6 sm:max-w-xl">
        <div data-tx="header" className="mb-4 flex items-center gap-3">
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
          <div className="flex-1">
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

        <Link
          href={`/h/${account.slug}${previewQ}`}
          data-tx="back"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-[var(--brand-ink)]"
        >
          <ArrowLeft className="size-4" /> Alle Anleitungen
        </Link>

        <h1
          data-tx="tut-title"
          className="mb-3 text-base font-semibold"
          style={{
            color: "var(--brand-title, var(--brand-ink))",
            fontFamily: fonts.heading,
            fontWeight: "var(--brand-heading-weight, 600)",
          }}
        >
          {tutorial.title}
        </h1>

        <Wizard
          rootId={tutorial.root_step_id}
          steps={steps}
          branches={branches}
          imageUrls={imageUrls}
          placeholders={tutorial.is_template}
        />

        <p data-tx="footer" className="mt-6 text-center text-xs text-muted-foreground">
          Bereitgestellt von {account.name} · powered by Steply
          <span className="mx-1.5 opacity-50">·</span>
          <a href="/impressum" target="_blank" rel="noopener noreferrer" className="hover:underline">
            Impressum
          </a>
          <span className="mx-1.5 opacity-50">·</span>
          <a href="/datenschutz" target="_blank" rel="noopener noreferrer" className="hover:underline">
            Datenschutz
          </a>
        </p>
      </div>
      <ChatWidget accountSlug={account.slug} accountName={account.name} />
    </main>
  );
}
