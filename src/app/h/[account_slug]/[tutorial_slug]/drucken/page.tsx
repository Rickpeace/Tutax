import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { hubTag, tutTag } from "@/lib/cache-tags";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandStyle, resolveTheme, brandFonts, googleFontsHref } from "@/lib/theme";
import { publicImageUrl } from "@/lib/public-image";
import { resolveCustomerTutorial } from "@/lib/templates";
import { buildRenderTree, type RenderNode } from "@/lib/builder/tree";
import { ViewerImage } from "@/components/viewer/viewer-image";
import { RichTextView } from "@/components/viewer/rich-text-view";
import { PrintButton } from "@/components/viewer/print-button";
import type { Step, StepBranch, Tutorial } from "@/lib/types";

// Öffentliche Druckansicht: gleiche gecachten Daten wie die Tutorial-Seite
// (Cache Components -> 'use cache' + Hub-/Tutorial-Tags; Mutationen invalidieren).
async function load(accountSlug: string, tutorialSlug: string) {
  "use cache";
  cacheTag(hubTag(accountSlug), tutTag(accountSlug, tutorialSlug));
  cacheLife("hours");
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
    .select("tokens, ai_tokens, logo_path, ai_logo_path, mode, extreme_tokens, extreme_layout, extreme_logo_path")
    .eq("account_id", account.id)
    .single();

  return { account, tutorial, steps: steps ?? [], branches: branches ?? [], theme };
}

/**
 * Flache Schritt-Reihenfolge (Fluss-DFS, jeder Schritt einmal) für die nummerierte
 * Druckliste. Nutzt die bestätigte Tree-Semantik aus lib/builder/tree.
 */
function flatOrder(steps: Step[], branches: StepBranch[], rootId: string | null): Step[] {
  const tree = buildRenderTree(steps, branches, rootId);
  const seen = new Set<string>();
  const ordered: Step[] = [];
  const walk = (node: RenderNode | null) => {
    if (!node || node.type !== "step") return;
    if (!seen.has(node.step.id)) {
      seen.add(node.step.id);
      ordered.push(node.step);
    }
    for (const b of node.branches ?? []) walk(b.child);
    walk(node.after);
    walk(node.next);
  };
  walk(tree);
  // Unerreichbare Schritte (kein eingehender Branch) hinten anhängen, nach Position.
  for (const s of [...steps].sort((a, b) => a.position - b.position)) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      ordered.push(s);
    }
  }
  return ordered;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ account_slug: string; tutorial_slug: string }>;
}): Promise<Metadata> {
  const { account_slug, tutorial_slug } = await params;
  const data = await load(account_slug, tutorial_slug);
  if (!data) return { title: "Nicht gefunden" };
  return { title: `${data.tutorial.title} · Druckansicht`, robots: { index: false } };
}

export default async function PrintPage({
  params,
}: {
  params: Promise<{ account_slug: string; tutorial_slug: string }>;
}) {
  const { account_slug, tutorial_slug } = await params;
  const data = await load(account_slug, tutorial_slug);
  if (!data) notFound();

  const { account, tutorial, steps, branches } = data;
  const ordered = flatOrder(steps, branches, tutorial.root_step_id);
  const numberById = new Map(ordered.map((s, i) => [s.id, i + 1]));
  const branchesByStep = new Map<string, StepBranch[]>();
  for (const b of branches) {
    const list = branchesByStep.get(b.step_id) ?? [];
    list.push(b);
    branchesByStep.set(b.step_id, list);
  }
  for (const l of branchesByStep.values()) l.sort((a, b) => a.position - b.position);

  const imageUrls: Record<string, string> = {};
  for (const s of steps) if (s.image_path) imageUrls[s.id] = publicImageUrl(s.image_path);

  const { tokens, logoPath } = resolveTheme(data.theme);
  const fonts = brandFonts(tokens);
  const fontsHref = googleFontsHref(tokens);
  const logoUrl = logoPath ? publicImageUrl(logoPath) : null;
  const initial = account.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <main
      className="min-h-screen bg-white print:bg-white"
      style={{ ...brandStyle(tokens), fontFamily: fonts.body, color: "var(--brand-ink)" }}
    >
      {fontsHref && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontsHref} />
        </>
      )}
      <div className="mx-auto max-w-3xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
        {/* Kopf: Logo/Kanzleiname + Drucken-Button (Button im Druck ausgeblendet). */}
        <div className="mb-6 flex items-center justify-between gap-3 border-b border-black/10 pb-4">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="size-11 border border-black/5 bg-white object-contain p-1"
                style={{ borderRadius: "var(--brand-radius, 12px)" }}
              />
            ) : (
              <div
                className="flex size-11 items-center justify-center text-lg font-extrabold text-white"
                style={{ background: "var(--brand-accent)", borderRadius: "var(--brand-radius, 12px)" }}
              >
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <div
                className="break-words text-lg font-extrabold"
                style={{ fontFamily: fonts.heading, color: "var(--brand-title, var(--brand-ink))" }}
              >
                {account.name}
              </div>
              <div className="break-words text-sm text-muted-foreground">{tutorial.title}</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 print:hidden">
            <PrintButton />
            <Link
              href={`/h/${account.slug}/${tutorial_slug}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-[var(--brand-ink)]"
            >
              <ArrowLeft className="size-3.5" /> Zur Anleitung
            </Link>
          </div>
        </div>

        <h1
          className="mb-6 break-words text-2xl font-extrabold"
          style={{ fontFamily: fonts.heading, color: "var(--brand-title, var(--brand-ink))" }}
        >
          {tutorial.title}
        </h1>

        <ol className="space-y-8">
          {ordered.map((step, i) => {
            const bs = branchesByStep.get(step.id) ?? [];
            return (
              <li key={step.id} className="break-inside-avoid">
                <div className="flex items-baseline gap-2">
                  <span
                    className="shrink-0 text-lg font-bold"
                    style={{ color: "var(--brand-accent-strong, var(--brand-accent))" }}
                  >
                    {i + 1}.
                  </span>
                  <h2
                    className="min-w-0 break-words text-lg font-bold"
                    style={{ fontFamily: fonts.heading, color: "var(--brand-title, var(--brand-ink))" }}
                  >
                    {step.title?.trim() || "Schritt"}
                  </h2>
                </div>

                {imageUrls[step.id] && (
                  <div className="mt-2 max-w-md">
                    <ViewerImage
                      url={imageUrls[step.id]}
                      highlights={step.highlights ?? []}
                      width={step.image_width}
                      height={step.image_height}
                      alt={step.title ?? ""}
                    />
                  </div>
                )}

                <div className="mt-2 text-[15px] leading-relaxed text-ink-2">
                  <RichTextView doc={step.body} />
                </div>

                {/* Verzweigungen als „Wenn X → weiter mit Schritt N"-Zeilen. */}
                {step.is_decision && bs.length > 0 && (
                  <div className="mt-2 space-y-1 break-words border-l-2 border-black/10 pl-3 text-sm">
                    {bs.map((b) => {
                      const targetNo = b.target_step_id ? numberById.get(b.target_step_id) : null;
                      return (
                        <div key={b.id}>
                          <span className="font-semibold">Wenn „{b.label?.trim() || "Weiter"}“</span>
                          {" → "}
                          {targetNo ? `weiter mit Schritt ${targetNo}` : "Ende"}
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <p className="mt-10 border-t border-black/10 pt-4 text-center text-xs text-muted-foreground">
          Bereitgestellt von {account.name} · powered by Steply
        </p>
      </div>
    </main>
  );
}
