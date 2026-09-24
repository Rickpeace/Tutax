import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import type { Metadata } from "next";
import { hubTag } from "@/lib/cache-tags";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandStyle, resolveTheme, googleFontsHref, brandFonts, hasCustomColors } from "@/lib/theme";
import { sanitizeSkinCss } from "@/lib/skin-css";
import { publicImageUrl } from "@/lib/public-image";
import { getCatalog } from "@/lib/templates";
import { HubBrowser, type HubTutorial } from "@/components/viewer/hub-browser";
import { ChatWidget } from "@/components/viewer/chat-widget";
import { LangSwitcher } from "@/components/viewer/lang-switcher";
import { LangSuggestBar } from "@/components/viewer/lang-suggest-bar";
import { HtmlLang } from "@/components/viewer/html-lang";
import {
  resolveLang,
  labelsFor,
  categoryName,
  isExtraLang,
  t,
  LANG_BCP47,
  type HubLang,
} from "@/lib/i18n-hub";
import { brandedTheme, isBusiness, isPro, planLanguages } from "@/lib/plan";
import { TAP_AREA } from "@/lib/tap-target";
import { publicAccountName } from "@/lib/public-name";

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
    .select("id, name, slug, languages, plan")
    .eq("slug", accountSlug)
    .single();
  if (!account) return null;
  account.name = publicAccountName(account.name as string | null); // nie eine E-Mail öffentlich

  const [catalog, { data: categories }, { data: theme }] = await Promise.all([
    getCatalog(admin, account.id),
    // eigene + globale (Standard-)Kategorien
    admin
      .from("categories")
      .select("id, name, name_i18n, position, account_id")
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

  // Mehrsprachigkeit ist Business — darunter nur Deutsch (gespeicherte Übersetzungen bleiben).
  const languages = planLanguages(account, ((account.languages as string[] | null) ?? []).filter(isExtraLang));
  // Eigenes Logo/CI erst ab Pro (Gratis: Steply-Standard, gespeicherte Werte bleiben).
  return { account, catalog, categories: categories ?? [], theme: brandedTheme(account, theme), translations, languages };
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
  // Titel/Beschreibung in der Seitensprache (Audit 24.09.) — Pro/Business ohne „· Steply“
  // im Tab (absoluter Titel statt Root-Template), Gratis behält den Steply-Zusatz.
  const labels = labelsFor(lang);
  const description = t(lang, "metaHubDescription", { name: account.name });
  const baseTitle = `${labels.helpTitle} · ${account.name}`;
  const title = isPro(account) ? { absolute: baseTitle } : baseTitle;
  // hreflang: DE + aktivierte Sprachen (nur wenn welche aktiv sind).
  const base = `/h/${account.slug}`;
  // canonical IMMER ohne ?lang=/?preview= — sonst indexieren Suchmaschinen dieselbe
  // Seite mehrfach. Die Sprachvarianten bleiben über hreflang erreichbar.
  const alternates = {
    canonical: base,
    ...(languages.length > 0
      ? {
          languages: {
            [LANG_BCP47.de]: base,
            ...Object.fromEntries(languages.map((l) => [LANG_BCP47[l], `${base}?lang=${l}`])),
          },
        }
      : {}),
  };
  const { logoPath } = resolveTheme(data.theme);
  // Leere Hilfe-Seite (noch keine sichtbare Anleitung) nicht indexieren (Runde 4).
  const empty = !data.catalog.some((e) => e.visible && e.slug);
  return {
    title,
    description,
    alternates,
    ...(empty ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: baseTitle,
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
  // Nur für Business (KI-Design ist Business) — sonst zeigte ?preview=ai|extreme das
  // gespeicherte KI-Design öffentlich an brandedTheme vorbei (Audit 24.09.).
  const previewMode =
    isBusiness(account) && ["manual", "ai", "extreme"].includes(preview ?? "") ? preview : null;
  const theme = previewMode ? { ...data.theme, mode: previewMode } : data.theme;
  // Kategorienamen sprachbewusst (Welle 29): name_i18n[lang] mit DE-Fallback.
  const catName = new Map(categories.map((c) => [c.id, categoryName(c, lang)]));
  // Farbfamilie je Kategorie aus dem DEUTSCHEN Namen (wie in der App) — sonst wechselte die
  // Farbe mit der Sprache (Audit 24.09.). Schlüssel = angezeigter (übersetzter) Name.
  const colorKeys: Record<string, string> = { [labels.otherCategory]: "Sonstiges" };
  for (const c of categories) {
    const shown = categoryName(c, lang);
    if (!(shown in colorKeys)) colorKeys[shown] = c.name;
  }

  const items: HubTutorial[] = catalog
    .filter((e) => e.visible && e.slug)
    .map((e) => {
      const tr = translations[e.renderTutorialId];
      return {
        title: tr?.title || e.title,
        description: tr?.description ?? e.description,
        slug: e.slug as string,
        category: (e.categoryId && catName.get(e.categoryId)) || labels.otherCategory,
      };
    });

  // eigene Kategorien zuerst, dann globale (Standard), Namen dedupliziert (übersetzt)
  const ordered = [
    ...categories.filter((c) => c.account_id),
    ...categories.filter((c) => !c.account_id),
  ];
  // Nur Kategorien mit sichtbaren Anleitungen an die Seite geben — Namen von Kategorien, die nur
  // Entwürfe/„Nur Team“ enthalten, standen sonst im Seiten-Payload (Sicherheitsprüfung Runde 4).
  const shown = new Set(items.map((i) => i.category));
  const order = [...new Set([...ordered.map((c) => categoryName(c, lang)), labels.otherCategory])].filter((n) =>
    shown.has(n),
  );
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
      style={{
        ...brandStyle(tokens),
        background: "var(--brand-bg)",
        color: "var(--brand-ink)",
        fontFamily: fonts.body,
      }}
    >
      {/* Sprache der Seite melden (Screenreader-Aussprache + Suchmaschinen). */}
      <HtmlLang lang={LANG_BCP47[lang]} />
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

      {/* Branding-Header (Design 3b): Leiste auf dem „Papier“ (hell: weiß, dunkles
          Design: dunkle Fläche — lib/theme.ts brandPaper) mit Kundenlogo + Name. */}
      <header
        data-tx="header"
        className="flex items-center gap-3 border-b-2 px-4 py-3.5 sm:px-10"
        style={{
          background: "var(--brand-paper, #fff)",
          borderColor: "color-mix(in srgb, var(--brand-ink) 8%, transparent)",
        }}
      >
        {logoUrl ? (
          // Breite Logos in voller Breite (feste Höhe) statt als Strich im Quadrat (Audit 24.09.).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            data-tx="logo"
            className="h-9 w-auto min-w-9 max-w-[120px] shrink-0 border border-black/5 bg-white object-contain p-1 sm:max-w-[180px]"
            style={{ borderRadius: "var(--brand-radius, 10px)" }}
          />
        ) : (
          <div
            data-tx="logo"
            className="flex size-9 shrink-0 items-center justify-center text-base font-extrabold"
            style={{
              background: "var(--brand-accent)",
              color: "var(--brand-accent-fg, #fff)",
              borderRadius: "var(--brand-radius, 10px)",
            }}
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
          <LangSwitcher
            current={lang}
            languages={languages}
            basePath={`/h/${account.slug}`}
            label={labels.language}
          />
        )}
      </header>

      {/* Browser-Sprach-Vorschlag (Welle 30): dezent, schließbar, rein clientseitig. */}
      <LangSuggestBar
        accountSlug={account.slug}
        languages={languages}
        currentLang={lang}
        basePath={`/h/${account.slug}`}
      />

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
          // Bunte Kategorien nur im reinen Steply-Standard (ohne eigene Farben) — Kunden-CI
          // bleibt monochrom in der Akzentfarbe (Audit 24.09.).
          colorful={mode === "manual" && !hasCustomColors(tokens)}
          colorKeys={colorKeys}
          chatAvailable={isPro(account)}
        />
      </div>

      <footer
        data-tx="footer"
        className={`flex items-center justify-center gap-2 border-t-2 px-4 py-4 text-xs font-bold text-muted-foreground ${isPro(account) ? "pb-24 sm:pb-4" : ""}`}
        style={{ borderColor: "color-mix(in srgb, var(--brand-ink) 8%, transparent)" }}
      >
        {/* „Erstellt mit Steply“ nur im Gratis-Tarif (Pro: ohne Hinweis, lib/pricing.ts). */}
        {!isPro(account) && (
          <>
            <span
              aria-hidden
              className="grid size-[18px] place-items-center rounded-full bg-primary text-[10px] font-black text-white"
            >
              S
            </span>
            {labels.createdWith}
            <span className="opacity-50">·</span>
          </>
        )}
        {/* Touch: unsichtbar 40 px hohe Trefferfläche (Handy-Audit 24.09.). */}
        <a href="/impressum" target="_blank" rel="noopener noreferrer" className={`relative hover:underline ${TAP_AREA}`}>
          {labels.imprint}
        </a>
        <span className="opacity-50">·</span>
        <a href="/datenschutz" target="_blank" rel="noopener noreferrer" className={`relative hover:underline ${TAP_AREA}`}>
          {labels.privacy}
        </a>
      </footer>
      {/* KI-Assistent (Chat) erst ab Pro. */}
      {isPro(account) && (
        <ChatWidget
          accountSlug={account.slug}
          accountName={account.name}
          labels={labels}
          lang={lang}
        />
      )}
    </main>
  );
}
