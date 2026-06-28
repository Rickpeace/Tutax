import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandStyle, resolveTheme, googleFontsHref, brandFonts } from "@/lib/theme";
import { publicImageUrl } from "@/lib/public-image";
import { Wizard } from "@/components/viewer/wizard";
import type { Step, StepBranch, Tutorial } from "@/lib/types";

export const metadata: Metadata = { title: "Vorschau · Steply", robots: { index: false } };

async function load(id: string) {
  const { account } = await requireAccount();
  const admin = createAdminClient();

  const { data: tutorial } = await admin
    .from("tutorials")
    .select("*")
    .eq("id", id)
    .single<Tutorial>();
  if (!tutorial) return null;

  // Nur eigene Tutorials oder veröffentlichte Standard-Templates dürfen vorab angesehen werden.
  const allowed =
    tutorial.account_id === account.id ||
    (tutorial.is_template && tutorial.status === "published");
  if (!allowed) return null;

  const { data: steps } = await admin
    .from("steps")
    .select("*")
    .eq("tutorial_id", id)
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

  // Bilder über signierte URLs aus dem privaten Bucket -> funktioniert in JEDEM Status.
  const imageUrls: Record<string, string> = {};
  for (const s of steps ?? []) {
    if (!s.image_path) continue;
    const { data } = await admin.storage.from("tutorial-images").createSignedUrl(s.image_path, 3600);
    if (data?.signedUrl) imageUrls[s.id] = data.signedUrl;
  }

  return { account, tutorial, steps: steps ?? [], branches: branches ?? [], theme, imageUrls };
}

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();

  const { account, tutorial, steps, branches, theme, imageUrls } = data;
  const initial = account.name.trim().charAt(0).toUpperCase() || "?";
  const { tokens, logoPath } = resolveTheme(theme);
  const fonts = brandFonts(tokens);
  const fontsHref = googleFontsHref(tokens);
  const logoUrl = logoPath ? publicImageUrl(logoPath) : null;

  return (
    <div className="min-h-screen" style={{ ...brandStyle(tokens), background: "var(--brand-bg)", fontFamily: fonts.body }}>
      {fontsHref && <link rel="stylesheet" href={fontsHref} />}
      {/* Vorschau-Leiste (gehört nicht zum Kunden-Look) */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <span className="flex items-center gap-2 font-medium">
          <Eye className="size-4" /> Vorschau – so sehen es Ihre Kunden {tutorial.status !== "published" && "(noch nicht live)"}
        </span>
        <Link href="/app" className="flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-amber-100">
          <ArrowLeft className="size-4" /> Zurück
        </Link>
      </div>

      <div className="mx-auto flex max-w-md flex-col px-4 py-6">
        <div className="mb-4 flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="size-9 border border-black/5 bg-white object-contain p-0.5"
              style={{ borderRadius: "var(--brand-radius, 12px)" }}
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

        <h1 className="mb-3 text-base font-semibold text-[var(--brand-ink)]">{tutorial.title}</h1>

        <Wizard
          rootId={tutorial.root_step_id}
          steps={steps}
          branches={branches}
          imageUrls={imageUrls}
          placeholders={tutorial.is_template}
        />
      </div>
    </div>
  );
}
