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
  // Beide fließen in den Speicherpfad — nur echte UUIDs (kein „../“ o. ä.).
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(tutorialId) || !UUID.test(stepId))
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });

  // RLS: zeigt das Tutorial nur, wenn es dem User gehört.
  const { data: tutorial } = await supabase
    .from("tutorials")
    .select("account_id")
    .eq("id", tutorialId)
    .single();
  if (!tutorial?.account_id)
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  // Sehen reicht nicht: Mitarbeiter (nur Schulungen) sehen Anleitungen, dürfen aber nichts
  // hochladen. Die signierte URL umgeht die Storage-RLS -> Schreibrecht hier prüfen
  // (dieselbe DB-Funktion wie die restriktiven Policies, Migration 0037).
  const { data: canEdit } = await supabase.rpc("can_edit_account", { aid: tutorial.account_id });
  if (canEdit !== true) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  let path = `${tutorial.account_id}/${tutorialId}/${stepId}.webp`;

  const admin = createAdminClient();
  // Welle 51a — geteilte Bilder („Bild in neuen Schritt übernehmen“, Duplikate, Automations-
  // Schnappschüsse): Nutzt ein ANDERER Schritt den Standard-Pfad dieses Schritts, würde das
  // Überschreiben (upsert) dessen Bild still mit austauschen. Dann eigenen, neuen Pfad vergeben.
  const [{ count: stepRefs }, { count: autoRefs }] = await Promise.all([
    admin.from("steps").select("id", { count: "exact", head: true }).eq("image_path", path).neq("id", stepId),
    admin.from("automation_steps").select("id", { count: "exact", head: true }).eq("image_path", path),
  ]);
  if ((stepRefs ?? 0) > 0 || (autoRefs ?? 0) > 0) {
    path = `${tutorial.account_id}/${tutorialId}/${stepId}-${crypto.randomUUID().slice(0, 8)}.webp`;
  }

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
