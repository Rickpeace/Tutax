import { type NextRequest, NextResponse } from "next/server";
import {
  accountForRecorderToken,
  bearerToken,
  RECORDER_ME_CORS,
} from "@/lib/recorder";
import { createAdminClient } from "@/lib/supabase/admin";

// Titel + Kategorie in der Extension (Welle 31d): GET /api/recorder/categories.
//
// Die Extension-Seitenleiste bietet beim Aufnehmen einer neuen Sofort-Anleitung eine
// Kategorie-Auswahl. Diese Route liefert die Kategorien des verbundenen Kontos.
//
// AUTH wie /api/recorder/me + /api/recorder/tutorials: „Authorization: Bearer
// <recorder_token>" (accountForRecorderToken, Admin-Client/RLS-Bypass, weil die Extension
// cross-origin ohne Session aufruft). KEINE Cookies. CORS: RECORDER_ME_CORS (GET/OPTIONS
// + Authorization).
//
// Antwort: { categories: [{ id, name }] } — NUR die Kategorien des Token-Kontos
// (account_id = Konto; globale Kategorien mit account_id IS NULL bleiben außen vor),
// nach `position` aufsteigend sortiert.

type CategoryRow = { id: string; name: string | null };

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
  const { data } = await admin
    .from("categories")
    .select("id, name")
    .eq("account_id", account.id)
    .order("position", { ascending: true })
    .returns<CategoryRow[]>();

  const categories = (data ?? []).map((c) => ({ id: c.id, name: c.name ?? "" }));
  return NextResponse.json({ categories }, { status: 200, headers: RECORDER_ME_CORS });
}
