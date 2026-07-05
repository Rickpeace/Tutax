import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import type { Metadata } from "next";
import { hubTag } from "@/lib/cache-tags";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandStyle, resolveTheme, googleFontsHref, brandFonts } from "@/lib/theme";
import { sanitizeSkinCss } from "@/lib/skin-css";
import { publicImageUrl } from "@/lib/public-image";
import { getCatalog } from "@/lib/templates";
import { HubBrowser, type HubTutorial } from "@/components/viewer/hub-browser";
import { ChatWidget } from "@/components/viewer/chat-widget";
import { LangSwitcher } from "@/components/viewer/lang-switcher";
import {
  resolveLang,
  labelsFor,
  isExtraLang,
  LANG_BCP47,
  type HubLang,
} from "@/lib/i18n-hub";

// Cache Components: Hub-Daten sind für ALLE Besucher gleich -> 'use cache' mit Tag pro
// Konto. WICHTIG: `lang` ist Teil des Cache-Keys (Funktionsargument), damit DE/EN/PL/TR
// getrennt gecacht werden. Mutationen (publish/theme/übersetzen/…) invalidieren via
// updateTag (lib/cache-tags); verpasste Pfade fängt cacheLife('hours') ab.
async function load(accountSlug: string, lang: HubLang) {
  "use cache";
  cacheTag(hubTag(accountSlug));
  cacheLife("hours");
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id, name, slug, languages")
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
      .select(
        "tokens, ai_tokens, logo_path, ai_logo_path, mode, extreme_tokens, extreme_css, extreme_layout, extreme_logo_path",
      )
      .eq("account_id", account.id)
      .single(),
  ]);

  // Übersetzte Katalog-Titel/Beschreibungen (nur wenn lang≠de). Fallback = DE.
  // Als schlichtes Record (serialisierbar über die 'use cache'-Grenze).
  const translations: Record<string, { title: string; description: string | null }> = {};
  if (lang !== "de") {
    const ids = catalog.map((e) => e.renderTutorialId);
    if (ids.length) {
      const { data: trows } = await admin
        .from("tutorial_translations")
        .select("tutorial_id, title, description")
        .eq("lang", lang)
        .in("tutorial_id", ids);
      for (const t of trows ?? []) {
        translations[t.tutorial_id as string] = {
          title: t.title as string,
          description: (t.description as string | null) ?? null,
        };
      }
    }
  }

  const languages = ((account.languages as string[] | null) ?? []).filter(isExtraLang);
  return { account, catalog, categories: categories ?? [], theme, translations, languages };
}

/** Statische Shell: Demo-Hub zur Build-Zeit; weitere Slugs zur Laufzeit (Fallback-Shell). */
export function generateStaticParams() {
  return [{ account_slug: "demo" }];
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ account_slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { account_slug } = await params;
  const { lang: langParam } = await searchParams;
  // Metadaten sprachneutral laden (nur für Sprachliste/Existenz) -> DE.
  const data = await load(account_slug, "de");
  if (!data) return { title: "Nicht gefunden" };
  const { account, languages } = data;
  const lang = resolveLang(langParam, languages);
  const description = `Hilfe & Anleitungen von ${account.name} – Schritt für Schritt erklärt.`;
  // hreflang: DE + aktivierte Sprachen (nur wenn welche aktiv sind).
  const base = `/h/${account.slug}`;
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
    title: `Hilfe & Anleitungen · ${account.name}`,
    description,
    ...(alternates ? { alternates } : {}),
    openGraph: {
      title: `Hilfe & Anleitungen · ${account.name}`,
      description,
      siteName: account.name,
      locale: LANG_BCP47[lang],
      ...(logoPath ? { images: [publicImageUrl(logoPath)] } : {}),
    },
  };
}

export default async function HubPage({
  params,
  searchParams,
}: {
  params: Promise<{ account_slug: string }>;
  searchParams: Promise<{ preview?: string; lang?: string }>;
}) {
  const { account_slug } = await params;
  const { preview, lang: langParam } = await searchParams;
  // lang zuerst grob laden (DE), um die aktivierten Sprachen zu kennen, dann final
  // mit korrekter Sprache laden (getrennter Cache-Key). Bei lang=de identisch.
  const probe = await load(account_slug, "de");
  if (!probe) notFound();
  const lang = resolveLang(langParam, probe.languages);
  const data = lang === "de" ? probe : ((await load(account_slug, lang)) ?? probe);

  const { account, catalog, categories, translations, languages } = data;
  const labels = labelsFor(lang);
  // Suffix, das alle internen Links die Sprache mitgeben (kein Zurückfallen auf DE).
  const langQ = lang === "de" ? "" : `lang=${lang}`;
  // Vorschau: ein Design erzwingen, OHNE es zu aktivieren (ändert themes.mode nicht).
  const previewMode = ["manual", "ai", "extreme"].includes(preview ?? "") ? preview : null;
  const theme = previewMode ? { ...data.theme, mode: previewMode } : data.theme;
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const items: HubTutorial[] = catalog
    .filter((e) => e.visible && e.slug)
    .map((e) => {
      const tr = translations[e.renderTutorialId];
      return {
        title: tr?.title || e.title,
        description: tr?.description ?? e.description,
        slug: e.slug as string,
        category: (e.categoryId && catName.get(e.categoryId)) || "Sonstiges",
      };
    });

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
      className={`flex min-h-screen flex-col ${skinClass}`}
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

      {/* Branding-Header (Design 3b): weiße Leiste mit Kundenlogo + Name. */}
      <header
        data-tx="header"
        className="flex items-center gap-3 border-b-2 bg-white px-4 py-3.5 sm:px-10"
        style={{ borderColor: "color-mix(in srgb, var(--brand-ink) 8%, transparent)" }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            data-tx="logo"
            className="size-9 border border-black/5 bg-white object-contain p-1"
            style={{ borderRadius: "var(--brand-radius, 10px)" }}
          />
        ) : (
          <div
            data-tx="logo"
            className="flex size-9 items-center justify-center text-base font-extrabold text-white"
            style={{ background: "var(--brand-accent)", borderRadius: "var(--brand-radius, 10px)" }}
          >
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div
            data-tx="title"
            className="truncate text-base font-black leading-tight"
            style={{
              fontFamily: fonts.heading,
              fontWeight: "var(--brand-heading-weight, 900)",
              color: "var(--brand-title, var(--brand-ink))",
            }}
          >
            {account.name}
          </div>
          <div data-tx="subtitle" className="text-[11.5px] font-bold text-muted-foreground">
            {labels.subtitle}
          </div>
        </div>
        {languages.length > 0 && (
          <LangSwitcher current={lang} languages={languages} basePath={`/h/${account.slug}`} />
        )}
      </header>

      {/* Hero (Design 3b): zentrierte Frage + große Suche (Suche wohnt im Browser). */}
      <div
        data-tx="hero"
        className="px-4 pb-2 pt-9 text-center sm:pt-11"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--brand-accent) 7%, var(--brand-bg)) 0%, var(--brand-bg) 100%)",
        }}
      >
        <h1
          className="text-[26px] font-black leading-tight sm:text-[34px]"
          style={{
            fontFamily: fonts.heading,
            fontWeight: "var(--brand-heading-weight, 900)",
            color: "var(--brand-title, var(--brand-ink))",
            letterSpacing: "-0.01em",
          }}
        >
          {labels.heroTitle}
        </h1>
        <p className="mt-2 text-sm font-bold text-muted-foreground sm:text-[15px]">
          {labels.helpTitle} · {account.name}
        </p>
      </div>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 pb-10 sm:px-10">
        <HubBrowser
          accountSlug={account.slug}
          items={items}
          order={order}
          lang={lang}
          langQuery={langQ}
          labels={labels}
          colorful={mode === "manual"}
        />
      </div>

      <footer
        data-tx="footer"
        className="flex items-center justify-center gap-2 border-t-2 px-4 py-4 text-xs font-bold text-muted-foreground"
        style={{ borderColor: "color-mix(in srgb, var(--brand-ink) 8%, transparent)" }}
      >
        <span
          aria-hidden
          className="grid size-[18px] place-items-center rounded-full bg-primary text-[10px] font-black text-white"
        >
          S
        </span>
        Erstellt mit Steply
        <span className="opacity-50">·</span>
        <a href="/impressum" target="_blank" rel="noopener noreferrer" className="hover:underline">
          Impressum
        </a>
        <span className="opacity-50">·</span>
        <a href="/datenschutz" target="_blank" rel="noopener noreferrer" className="hover:underline">
          Datenschutz
        </a>
      </footer>
      <ChatWidget accountSlug={account.slug} accountName={account.name} />
    </main>
  );
}
