import { notFound } from "next/navigation";
import { after } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { hubTag, tutTag } from "@/lib/cache-tags";
import { recordEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandStyle, resolveTheme, googleFontsHref, brandFonts } from "@/lib/theme";
import { sanitizeSkinCss } from "@/lib/skin-css";
import { publicImageUrl, publicAudioUrl } from "@/lib/public-image";
import { resolveCustomerTutorial } from "@/lib/templates";
import { Wizard } from "@/components/viewer/wizard";
import { ChatWidget } from "@/components/viewer/chat-widget";
import { LangSwitcher } from "@/components/viewer/lang-switcher";
import { resolveLang, labelsFor, isExtraLang, LANG_BCP47, type HubLang } from "@/lib/i18n-hub";
import type { Step, StepBranch, Tutorial } from "@/lib/types";

// Öffentliche Seite: serverseitige, kontrollierte Reads (nur published).
// Cache Components: für alle Besucher gleich -> 'use cache' + Tags (Hub + Tutorial);
// `lang` ist Teil des Cache-Keys (Funktionsargument) -> DE/EN/PL/TR getrennt gecacht.
// Mutationen invalidieren via lib/cache-tags, Rest fängt cacheLife('hours') ab.
async function load(accountSlug: string, tutorialSlug: string, lang: HubLang) {
  "use cache";
  cacheTag(hubTag(accountSlug), tutTag(accountSlug, tutorialSlug));
  cacheLife("hours");
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id, name, slug, languages")
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

  const languages = ((account.languages as string[] | null) ?? []).filter(isExtraLang);

  // Übersetzungen laden + in Titel/Steps/Branches mergen (DE-Fallback pro Feld).
  let mergedTitle = tutorial.title;
  let mergedSteps = steps ?? [];
  let mergedBranches = branches ?? [];
  if (lang !== "de") {
    const [{ data: tutTr }, { data: stepTr }, { data: branchTr }] = await Promise.all([
      admin
        .from("tutorial_translations")
        .select("title")
        .eq("tutorial_id", tutorial.id)
        .eq("lang", lang)
        .maybeSingle(),
      stepIds.length
        ? admin
            .from("step_translations")
            .select("step_id, title, body")
            .eq("lang", lang)
            .in("step_id", stepIds)
        : Promise.resolve({ data: [] as { step_id: string; title: string | null; body: unknown }[] }),
      stepIds.length
        ? admin
            .from("branch_translations")
            .select("branch_id, label")
            .eq("lang", lang)
            .in("branch_id", (branches ?? []).map((b) => b.id))
        : Promise.resolve({ data: [] as { branch_id: string; label: string | null }[] }),
    ]);

    if (tutTr?.title?.trim()) mergedTitle = tutTr.title;

    const stepTrById = new Map(
      (stepTr ?? []).map((r) => [r.step_id as string, r]),
    );
    mergedSteps = (steps ?? []).map((s) => {
      const tr = stepTrById.get(s.id);
      if (!tr) return s;
      return {
        ...s,
        // Fallback pro Feld: fehlt Titel/Body in der Übersetzung -> Original behalten.
        title: tr.title?.trim() ? tr.title : s.title,
        body: tr.body ?? s.body,
      };
    });

    const branchTrById = new Map(
      (branchTr ?? []).map((r) => [r.branch_id as string, r]),
    );
    mergedBranches = (branches ?? []).map((b) => {
      const tr = branchTrById.get(b.id);
      if (!tr) return b;
      return { ...b, label: tr.label?.trim() ? tr.label : b.label };
    });
  }

  return {
    account,
    tutorial: { ...tutorial, title: mergedTitle },
    steps: mergedSteps,
    branches: mergedBranches,
    theme,
    languages,
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ account_slug: string; tutorial_slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { account_slug, tutorial_slug } = await params;
  const { lang: langParam } = await searchParams;
  // Erst DE laden (Sprachen/Existenz), dann ggf. in Zielsprache für den Titel.
  const probe = await load(account_slug, tutorial_slug, "de");
  if (!probe) return { title: "Nicht gefunden" };
  const lang = resolveLang(langParam, probe.languages);
  const data = lang === "de" ? probe : ((await load(account_slug, tutorial_slug, lang)) ?? probe);
  const { account, tutorial, languages } = data;
  const title = `${tutorial.title} · ${account.name}`;
  const description =
    tutorial.description?.trim() ||
    `Schritt-für-Schritt-Anleitung von ${account.name}: ${tutorial.title}.`;
  const base = `/h/${account.slug}/${tutorial_slug}`;
  const alternates =
    languages.length > 0
      ? {
          languages: {
            [LANG_BCP47.de]: base,
            ...Object.fromEntries(languages.map((l) => [LANG_BCP47[l], `${base}?lang=${l}`])),
          },
        }
      : undefined;
  const { logoPath } = resolveTheme(data.theme);
  return {
    title,
    description,
    ...(alternates ? { alternates } : {}),
    openGraph: {
      title,
      description,
      siteName: account.name,
      locale: LANG_BCP47[lang],
      ...(logoPath ? { images: [publicImageUrl(logoPath)] } : {}),
    },
  };
}

export default async function ViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ account_slug: string; tutorial_slug: string }>;
  searchParams: Promise<{ preview?: string; lang?: string }>;
}) {
  const { account_slug, tutorial_slug } = await params;
  const { preview, lang: langParam } = await searchParams;
  const probe = await load(account_slug, tutorial_slug, "de");
  if (!probe) notFound();
  const lang = resolveLang(langParam, probe.languages);
  const data = lang === "de" ? probe : ((await load(account_slug, tutorial_slug, lang)) ?? probe);

  const { account, tutorial, steps, branches, languages } = data;
  const labels = labelsFor(lang);

  // Aufruf zählen — NACH der Antwort (blockiert das Rendering nicht). Näherung:
  // Prefetch zählt kaum mit (dynamische Route ohne loading.tsx wird nicht geprefetcht).
  after(() => recordEvent({ account_id: account.id, type: "view", tutorial_slug }));

  const previewMode =
    preview && ["manual", "ai", "extreme"].includes(preview) ? preview : null;
  const theme = previewMode ? { ...data.theme, mode: previewMode } : data.theme;
  const imageUrls: Record<string, string> = {};
  for (const s of steps) if (s.image_path) imageUrls[s.id] = publicImageUrl(s.image_path);
  // Vorlesen (Welle 14): öffentliche MP3-URL je Schritt (v1 nur DE-Originaltext;
  // audio_path liegt auf der Original-Zeile und übersteht das Übersetzungs-Merge).
  const audioUrls: Record<string, string> = {};
  for (const s of steps) if (s.audio_path) audioUrls[s.id] = publicAudioUrl(s.audio_path);
  const initial = account.name.trim().charAt(0).toUpperCase() || "?";
  const { mode, tokens, logoPath, skinCss, layout } = resolveTheme(theme);
  const fonts = brandFonts(tokens);
  const fontsHref = googleFontsHref(tokens);
  const logoUrl = logoPath ? publicImageUrl(logoPath) : null;
  // Query-Bausteine: preview + lang zusammensetzen und an interne Links reichen.
  const qs = [
    previewMode ? `preview=${previewMode}` : "",
    lang === "de" ? "" : `lang=${lang}`,
  ].filter(Boolean);
  const queryStr = qs.length ? `?${qs.join("&")}` : "";
  const skinClass =
    mode === "extreme"
      ? `tutax-skin tx-h-${layout?.header ?? "left"} tx-c-${layout?.cards ?? "grid"} tx-hero-${layout?.hero ?? "none"}`
      : "";

  return (
    <main
      className={`min-h-screen ${skinClass}`}
      style={{ ...brandStyle(tokens), background: "var(--brand-bg)", fontFamily: fonts.body }}
    >
      {fontsHref && (
        <>
          {/* Preconnect vor dem Stylesheet (React 19 hoisted beides in den <head>) →
              vermeidet FOUT bei Kunden-Brand-Fonts (REVIEW A). */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontsHref} />
        </>
      )}
      {mode === "extreme" && skinCss && (
        <style dangerouslySetInnerHTML={{ __html: sanitizeSkinCss(skinCss) }} />
      )}
      {mode === "ai" && <div className="h-1.5 w-full" style={{ background: "var(--brand-accent)" }} />}
      {/* lg-Breite für die Schrittlisten-Sidebar linearer Tutorials (Design 3a). */}
      <div className="mx-auto flex max-w-md flex-col px-4 py-6 sm:max-w-xl lg:max-w-4xl">
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
          <div className="min-w-0 flex-1">
            <div
              data-tx="title"
              className="break-words text-xl font-extrabold"
              style={{
                fontFamily: fonts.heading,
                fontWeight: "var(--brand-heading-weight, 800)",
                color: "var(--brand-title, var(--brand-ink))",
              }}
            >
              {account.name}
            </div>
            <div data-tx="subtitle" className="text-sm text-muted-foreground">{labels.subtitle}</div>
          </div>
          {languages.length > 0 && (
            <LangSwitcher
              current={lang}
              languages={languages}
              basePath={`/h/${account.slug}/${tutorial_slug}`}
            />
          )}
        </div>

        <Link
          href={`/h/${account.slug}${queryStr}`}
          data-tx="back"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-[var(--brand-ink)]"
        >
          <ArrowLeft className="size-4" /> {labels.allTutorials}
        </Link>

        <h1
          data-tx="tut-title"
          className="mb-3 break-words text-base font-semibold"
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
          audioUrls={audioUrls}
          placeholders={tutorial.is_template}
          accountSlug={account.slug}
          tutorialSlug={tutorial_slug}
          labels={labels}
        />

        <div className="mt-4 text-center">
          {/* Druckansicht bleibt v1 auf Deutsch (kein ?lang durchreichen). */}
          <Link
            href={`/h/${account.slug}/${tutorial_slug}/drucken`}
            target="_blank"
            rel="noopener noreferrer"
            data-tx="print-link"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-[var(--brand-ink)]"
          >
            <Printer className="size-4" /> {labels.print}
          </Link>
        </div>

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
