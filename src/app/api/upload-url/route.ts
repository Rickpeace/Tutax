import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "tutorial-images";

/**
 * Signed Upload URL (§5). Server prüft, dass der User zum account_id des
 * Tutorials gehört (per RLS-sichtbarer Tutorial-Zeile), und gibt dann eine
 * signierte Upload-URL für den Pfad {account_id}/{tutorialId}/{stepId}.webp aus.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  let body: { tutorialId?: string; stepId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  const { tutorialId, stepId } = body;
  if (!tutorialId || !stepId)
    return NextResponse.json({ error: "tutorialId/stepId fehlt" }, { status: 400 });

  // RLS: zeigt das Tutorial nur, wenn es dem User gehört.
  const { data: tutorial } = await supabase
    .from("tutorials")
    .select("account_id")
    .eq("id", tutorialId)
    .single();
  if (!tutorial?.account_id)
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  const path = `${tutorial.account_id}/${tutorialId}/${stepId}.webp`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data)
    return NextResponse.json(
      { error: error?.message ?? "Upload-URL fehlgeschlagen" },
      { status: 500 },
    );

  return NextResponse.json({ path, token: data.token });
}
