import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicImageUrl } from "@/lib/public-image";

const PUBLIC_BUCKET = "tutorial-images-public";

async function currentAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, accountId: null as string | null };
  const { data: mem } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", user.id)
    .single();
  return { supabase, accountId: (mem?.account_id as string | undefined) ?? null };
}

/** Logo hochladen. target=manual -> logo_path, target=ai -> ai_logo_path. */
export async function POST(req: NextRequest) {
  const { supabase, accountId } = await currentAccount();
  if (!accountId) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob))
    return NextResponse.json({ error: "Keine Datei" }, { status: 400 });
  const target = String(form.get("target") ?? "manual") === "ai" ? "ai" : "manual";
  const col = target === "ai" ? "ai_logo_path" : "logo_path";

  const admin = createAdminClient();

  // altes Logo der jeweiligen Quelle entfernen
  const { data: theme } = await supabase
    .from("themes")
    .select("logo_path, ai_logo_path")
    .eq("account_id", accountId)
    .single();
  const oldPath = target === "ai" ? theme?.ai_logo_path : theme?.logo_path;
  if (oldPath) await admin.storage.from(PUBLIC_BUCKET).remove([oldPath]);

  const path = `${accountId}/branding/${target === "ai" ? "ai-logo" : "logo"}-${Date.now()}.webp`;
  const { error } = await admin.storage
    .from(PUBLIC_BUCKET)
    .upload(path, file, { upsert: true, contentType: "image/webp" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("themes").update({ [col]: path }).eq("account_id", accountId);

  return NextResponse.json({ logoPath: path, url: publicImageUrl(path) });
}

/** Logo entfernen (?target=manual|ai). */
export async function DELETE(req: NextRequest) {
  const { supabase, accountId } = await currentAccount();
  if (!accountId) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  const target = new URL(req.url).searchParams.get("target") === "ai" ? "ai" : "manual";
  const col = target === "ai" ? "ai_logo_path" : "logo_path";

  const { data: theme } = await supabase
    .from("themes")
    .select("logo_path, ai_logo_path")
    .eq("account_id", accountId)
    .single();
  const oldPath = target === "ai" ? theme?.ai_logo_path : theme?.logo_path;
  if (oldPath) {
    const admin = createAdminClient();
    await admin.storage.from(PUBLIC_BUCKET).remove([oldPath]);
  }
  await supabase.from("themes").update({ [col]: null }).eq("account_id", accountId);
  return NextResponse.json({ ok: true });
}
