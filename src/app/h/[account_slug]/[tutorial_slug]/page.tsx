import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandStyle, resolveTheme, googleFontsHref, brandFonts } from "@/lib/theme";
import { publicImageUrl } from "@/lib/public-image";
import { resolveCustomerTutorial } from "@/lib/templates";
import { Wizard } from "@/components/viewer/wizard";
import type { Step, StepBranch, Tutorial } from "@/lib/types";

// Öffentliche Seite: serverseitige, kontrollierte Reads (nur published).
async function load(accountSlug: string, tutorialSlug: string) {
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
    .select("tokens, ai_tokens, logo_path, ai_logo_path, mode")
    .eq("account_id", account.id)
    .single();

  return { account, tutorial, steps: steps ?? [], branches: branches ?? [], theme };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ account_slug: string; tutorial_slug: string }>;
}): Promise<Metadata> {
  const { account_slug, tutorial_slug } = await params;
  const data = await load(account_slug, tutorial_slug);
  if (!data) return { title: "Nicht gefunden" };
  return { title: `${data.tutorial.title} · ${data.account.name}` };
}

export default async function ViewerPage({
  params,
}: {
  params: Promise<{ account_slug: string; tutorial_slug: string }>;
}) {
  const { account_slug, tutorial_slug } = await params;
  const data = await load(account_slug, tutorial_slug);
  if (!data) notFound();

  const { account, tutorial, steps, branches, theme } = data;
  const imageUrls: Record<string, string> = {};
  for (const s of steps) if (s.image_path) imageUrls[s.id] = publicImageUrl(s.image_path);
  const initial = account.name.trim().charAt(0).toUpperCase() || "?";
  const { tokens, logoPath } = resolveTheme(theme);
  const fonts = brandFonts(tokens);
  const fontsHref = googleFontsHref(tokens);
  const logoUrl = logoPath ? publicImageUrl(logoPath) : null;

  return (
    <main
      className="min-h-screen"
      style={{ ...brandStyle(tokens), background: "var(--brand-bg)", fontFamily: fonts.body }}
    >
      {fontsHref && <link rel="stylesheet" href={fontsHref} />}
      <div className="mx-auto flex max-w-md flex-col px-4 py-6">
        <div className="mb-4 flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="size-9 rounded-lg border border-black/5 bg-white object-contain p-0.5"
            />
          ) : (
            <div
              className="flex size-9 items-center justify-center rounded-lg font-extrabold text-white"
              style={{ background: "var(--brand-accent)" }}
            >
              {initial}
            </div>
          )}
          <div className="flex-1">
            <div className="font-bold text-[var(--brand-ink)]">{account.name}</div>
            <div className="text-xs text-muted-foreground">Hilfe &amp; Anleitungen</div>
          </div>
        </div>

        <Link
          href={`/h/${account.slug}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-[var(--brand-ink)]"
        >
          <ArrowLeft className="size-4" /> Alle Anleitungen
        </Link>

        <h1 className="mb-3 text-base font-semibold text-[var(--brand-ink)]" style={{ fontFamily: fonts.heading }}>
          {tutorial.title}
        </h1>

        <Wizard
          rootId={tutorial.root_step_id}
          steps={steps}
          branches={branches}
          imageUrls={imageUrls}
          placeholders={tutorial.is_template}
        />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Bereitgestellt von {account.name} · powered by Tutax
        </p>
      </div>
    </main>
  );
}
