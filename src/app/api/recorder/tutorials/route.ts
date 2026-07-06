import { type NextRequest, NextResponse } from "next/server";
import {
  accountForRecorderToken,
  bearerToken,
  RECORDER_ME_CORS,
} from "@/lib/recorder";
import { createAdminClient } from "@/lib/supabase/admin";

// Live-Führung (Welle 31), Schritt 1a: GET /api/recorder/tutorials.
//
// Die Extension-Seitenleiste listet in ihrem „Führen"-Bereich die Tutorials des
// verbundenen Kontos. AUTH wie /api/recorder/me: „Authorization: Bearer <recorder_token>"
// (accountForRecorderToken, Admin-Client/RLS-Bypass, weil die Extension cross-origin ohne
// Session aufruft). KEINE Cookies. CORS: RECORDER_ME_CORS (GET/OPTIONS + Authorization).
//
// Antwort: { tutorials: [{ id, title, slug, status, visibility, site_domains, stepCount,
//   selectorCount, category, updated_at }] } — NUR Tutorials des Token-Kontos, updated_at
//   desc, max 200. selectorCount = Schritte mit non-null selector (Live-Führung mit
// Bildschirm-Markierung möglich). stepCount + selectorCount kommen aus EINER Steps-Query
// (kein N+1) und werden in JS je Tutorial aggregiert.
// category (Welle 32, Punkt C): { id, name } | null je Tutorial. EINE zusätzliche
// categories-Query über die vorkommenden category_ids — löst dabei AUCH globale Kategorien
// (account_id IS NULL) auf, weil per id (nicht per account_id) gefiltert wird. Kein N+1.

type TutorialRow = {
  id: string;
  title: string | null;
  slug: string | null;
  status: string | null;
  visibility: string | null;
  site_domains: string[] | null;
  category_id: string | null;
  updated_at: string;
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: RECORDER_ME_CORS });
}

export async function GET(req: NextRequest) {
  const token = bearerToken(req.headers.get("authorization"));
  const account = await accountForRecorderToken(token);
  if (!account) {
    return NextResponse.json(
      { error: "Ungültiger oder unbekannter Verbindungs-Token." },
      { status: 401, headers: RECORDER_ME_CORS },
    );
  }

  const admin = createAdminClient();

  const { data: tuts } = await admin
    .from("tutorials")
    .select("id, title, slug, status, visibility, site_domains, category_id, updated_at")
    .eq("account_id", account.id)
    .order("updated_at", { ascending: false })
    .limit(200)
    .returns<TutorialRow[]>();

  const tutorials = tuts ?? [];
  const ids = tutorials.map((t) => t.id);

  // Schrittzahl + Selektor-Zahl je Tutorial: EINE Query über alle Schritte der 200
  // Tutorials, danach in JS aggregieren (kein N+1). selector ist jsonb -> non-null zählt.
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

  // Kategorie-Namen je Tutorial: EINE Query über die vorkommenden category_ids. Über id
  // gefiltert (nicht account_id) -> löst auch GLOBALE Kategorien (account_id IS NULL) auf.
  const catIds = [...new Set(tutorials.map((t) => t.category_id).filter((v): v is string => !!v))];
  const catById = new Map<string, { id: string; name: string }>();
  if (catIds.length) {
    const { data: cats } = await admin
      .from("categories")
      .select("id, name")
      .in("id", catIds)
      .returns<{ id: string; name: string | null }[]>();
    for (const c of cats ?? []) catById.set(c.id, { id: c.id, name: c.name ?? "" });
  }

  const out = tutorials.map((t) => {
    const c = counts.get(t.id) ?? { stepCount: 0, selectorCount: 0 };
    return {
      id: t.id,
      title: t.title ?? "",
      slug: t.slug ?? null,
      status: t.status ?? "draft",
      visibility: t.visibility ?? null,
      site_domains: Array.isArray(t.site_domains) ? t.site_domains : [],
      stepCount: c.stepCount,
      selectorCount: c.selectorCount,
      category: t.category_id ? catById.get(t.category_id) ?? null : null,
      updated_at: t.updated_at,
    };
  });

  return NextResponse.json({ tutorials: out }, { status: 200, headers: RECORDER_ME_CORS });
}
