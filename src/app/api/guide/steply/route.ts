import { NextResponse } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { hubTag } from "@/lib/cache-tags";
import { GUIDE_PUBLIC_CORS } from "@/lib/guide-payload";
import { createAdminClient } from "@/lib/supabase/admin";

// „Steply lernen" (Welle 35), Teil A/1a: GET /api/guide/steply.
//
// ÖFFENTLICHE Liste der Steply-Doku-Touren — sie erscheint in der Extension für JEDEN Kunden
// (nicht nur fürs Steply-Konto). KEIN Auth, KEIN Token. Damit kein fremdes Konto adressiert
// werden kann, ist die Route HART auf das Steply-Doku-Konto (slug „steply") verdrahtet: kein
// Query-Parameter beeinflusst das Konto. Es werden AUSSCHLIESSLICH veröffentlichte + öffentliche
// Tutorials geliefert (status='published' UND visibility='public').
//
// Antwort: { tutorials: [{ id, slug, title, category:{id,name}|null, stepCount, selectorCount,
//   site_domains }] }. Reihenfolge wie der Hub: Kategorien nach position (eigene vor globalen),
// Tutorials je Kategorie nach created_at; ohne Kategorie zuletzt.
//
// CORS: GUIDE_PUBLIC_CORS (GET/OPTIONS, ohne Authorization-Pflicht). Cache: 'use cache' mit Tag
// hub-steply + cacheLife('hours') — wie die Hub-Seite. Die Seed-/Shoot-Pipeline schreibt per
// Admin-Client (kein updateTag), daher greift primär der 1-h-Deckel von cacheLife.

const STEPLY_DOC_SLUG = "steply";

type TutorialRow = {
  id: string;
  title: string | null;
  slug: string | null;
  category_id: string | null;
  site_domains: string[] | null;
  created_at: string;
};
type CategoryRow = { id: string; name: string | null; position: number | null; account_id: string | null };

async function loadSteplyList() {
  "use cache";
  cacheTag(hubTag(STEPLY_DOC_SLUG));
  cacheLife("hours");

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id")
    .eq("slug", STEPLY_DOC_SLUG)
    .maybeSingle<{ id: string }>();
  if (!account) return [];

  const [{ data: tuts }, { data: cats }] = await Promise.all([
    admin
      .from("tutorials")
      .select("id, title, slug, category_id, site_domains, created_at")
      .eq("account_id", account.id)
      .eq("status", "published")
      .eq("visibility", "public")
      .order("created_at", { ascending: true })
      .returns<TutorialRow[]>(),
    // eigene + globale Kategorien für Namen + Gruppen-Reihenfolge (wie der Hub).
    admin
      .from("categories")
      .select("id, name, position, account_id")
      .or(`account_id.eq.${account.id},account_id.is.null`)
      .order("position", { ascending: true })
      .returns<CategoryRow[]>(),
  ]);

  const tutorials = (tuts ?? []).filter((t) => !!t.slug);
  const categories = cats ?? [];
  const ids = tutorials.map((t) => t.id);

  // Schrittzahl + Selektor-Zahl je Tutorial aus EINER Steps-Query (kein N+1).
  const counts = new Map<string, { stepCount: number; selectorCount: number }>();
  if (ids.length) {
    const { data: steps } = await admin
      .from("steps")
      .select("tutorial_id, selector")
      .in("tutorial_id", ids)
      .returns<{ tutorial_id: string; selector: unknown }[]>();
    for (const s of steps ?? []) {
      const c = counts.get(s.tutorial_id) ?? { stepCount: 0, selectorCount: 0 };
      c.stepCount += 1;
      if (s.selector != null) c.selectorCount += 1;
      counts.set(s.tutorial_id, c);
    }
  }

  const catById = new Map(categories.map((c) => [c.id, { id: c.id, name: c.name ?? "" }]));
  // Gruppen-Reihenfolge wie der Hub: eigene Kategorien vor globalen, je nach position.
  const orderedCatIds = [
    ...categories.filter((c) => c.account_id).map((c) => c.id),
    ...categories.filter((c) => !c.account_id).map((c) => c.id),
  ];

  const toOut = (t: TutorialRow) => {
    const c = counts.get(t.id) ?? { stepCount: 0, selectorCount: 0 };
    return {
      id: t.id,
      slug: t.slug as string,
      title: t.title ?? "",
      category: t.category_id ? catById.get(t.category_id) ?? null : null,
      stepCount: c.stepCount,
      selectorCount: c.selectorCount,
      site_domains: Array.isArray(t.site_domains) ? t.site_domains : [],
    };
  };

  // Nach Kategorie-Reihenfolge gruppieren; Tutorials je Kategorie nach created_at (schon
  // sortiert); Tutorials ohne (bekannte) Kategorie zuletzt.
  const out: ReturnType<typeof toOut>[] = [];
  for (const catId of orderedCatIds) {
    for (const t of tutorials) if (t.category_id === catId) out.push(toOut(t));
  }
  const placed = new Set(out.map((o) => o.id));
  for (const t of tutorials) if (!placed.has(t.id)) out.push(toOut(t));
  return out;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: GUIDE_PUBLIC_CORS });
}

export async function GET() {
  const tutorials = await loadSteplyList();
  return NextResponse.json({ tutorials }, { status: 200, headers: GUIDE_PUBLIC_CORS });
}
