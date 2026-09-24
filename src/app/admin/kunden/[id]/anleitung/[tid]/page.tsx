import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandStyle, resolveTheme, googleFontsHref, brandFonts } from "@/lib/theme";
import { brandedTheme } from "@/lib/plan";
import { publicImageUrl } from "@/lib/public-image";
import { Wizard } from "@/components/viewer/wizard";
import type { Step, StepBranch, Tutorial } from "@/lib/types";
import { isSafeStorageKey } from "@/lib/storage-path";

export const metadata: Metadata = { title: "Vorschau · Admin", robots: { index: false } };

const UUID = /^[0-9a-f-]{36}$/i;
const STATUS: Record<string, string> = { published: "Veröffentlicht", draft: "Entwurf" };

/**
 * Admin-Vorschau einer Kunden-Anleitung in JEDEM Zustand (Entwurf, „nur Team“, veröffentlicht) —
 * nur lesend, so wie die Kunden-Vorschau (/app/preview). Bilder aus dem privaten Speicher per
 * signierter URL; ohne accountSlug zählt der Player KEINE Aufrufe in die Kunden-Statistik.
 */
export default async function AdminTutorialPreview({ params }: { params: Promise<{ id: string; tid: string }> }) {
  await requireAdmin(); // eigenes Gate (PPR)
  const { id, tid } = await params;
  if (!UUID.test(id) || !UUID.test(tid)) notFound();
  const admin = createAdminClient();

  const [{ data: account }, { data: tutorial }] = await Promise.all([
    admin.from("accounts").select("id, name, slug, plan").eq("id", id).maybeSingle(),
    admin.from("tutorials").select("*").eq("id", tid).maybeSingle<Tutorial>(),
  ]);
  // Anleitung muss zu DIESEM Kunden gehören (URL nicht beliebig kombinierbar).
  if (!account || !tutorial || tutorial.account_id !== account.id) notFound();

  const { data: steps } = await admin.from("steps").select("*").eq("tutorial_id", tid).returns<Step[]>();
  const stepIds = (steps ?? []).map((s) => s.id);
  const [{ data: branches }, { data: theme }] = await Promise.all([
    stepIds.length
      ? admin.from("step_branches").select("*").in("step_id", stepIds).returns<StepBranch[]>()
      : Promise.resolve({ data: [] as StepBranch[] }),
    admin.from("themes").select("tokens, ai_tokens, logo_path, ai_logo_path, mode").eq("account_id", id).maybeSingle(),
  ]);

  const imageUrls: Record<string, string> = {};
  const withImage = (steps ?? []).filter((s) => s.image_path && isSafeStorageKey(s.image_path as string));
  const signed = await Promise.all(
    withImage.map((s) => admin.storage.from("tutorial-images").createSignedUrl(s.image_path!, 3600)),
  );
  withImage.forEach((s, i) => {
    const url = signed[i].data?.signedUrl;
    if (url) imageUrls[s.id] = url;
  });

  // Aussehen so, wie es der Kunde in seinem Tarif auf der Hilfe-Seite hat.
  const { tokens, logoPath } = resolveTheme(brandedTheme(account, theme));
  const fonts = brandFonts(tokens);
  const fontsHref = googleFontsHref(tokens);
  const logoUrl = logoPath ? publicImageUrl(logoPath) : null;
  const live = tutorial.status === "published" && tutorial.visibility === "public" && !!tutorial.slug;

  return (
    <div className="flex-1" style={{ ...brandStyle(tokens), background: "var(--brand-bg)", fontFamily: fonts.body }}>
      {fontsHref && <link rel="stylesheet" href={fontsHref} />}
      <div className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <span className="flex items-center gap-2 font-medium" data-testid="admin-preview-bar">
          <Eye className="size-4" /> Admin-Vorschau · {account.name} · {STATUS[tutorial.status] ?? tutorial.status}
          {tutorial.visibility === "internal" && " · nur Team"} · nur lesen
        </span>
        <span className="flex items-center gap-1">
          {live && (
            <Link
              href={`/h/${account.slug}/${tutorial.slug}`}
              target="_blank"
              className="flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-amber-100"
            >
              <ExternalLink className="size-4" /> Live ansehen
            </Link>
          )}
          <Link href={`/admin/kunden/${id}`} className="flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-amber-100">
            <ArrowLeft className="size-4" /> Zum Kunden
          </Link>
        </span>
      </div>

      <div className="mx-auto flex max-w-md flex-col px-4 py-6 sm:max-w-xl lg:max-w-4xl">
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
              {account.name.trim().charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div className="flex-1">
            <div className="font-bold text-[var(--brand-ink)]">{account.name}</div>
            <div className="text-xs text-muted-foreground">Hilfe &amp; Anleitungen</div>
          </div>
        </div>

        <h1 className="mb-3 text-base font-semibold text-[var(--brand-ink)]">{tutorial.title}</h1>

        {(steps ?? []).length === 0 ? (
          <p className="rounded-card border-2 border-line bg-card px-4 py-6 text-center text-sm font-semibold text-muted-foreground">
            Diese Anleitung hat noch keine Schritte.
          </p>
        ) : (
          <Wizard
            rootId={tutorial.root_step_id}
            steps={steps ?? []}
            branches={branches ?? []}
            imageUrls={imageUrls}
            placeholders={tutorial.is_template}
          />
        )}
      </div>
    </div>
  );
}
