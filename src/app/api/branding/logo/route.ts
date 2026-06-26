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

/** Logo hochladen (in den public Bucket; themes.logo_path setzen). */
export async function POST(req: NextRequest) {
  const { supabase, accountId } = await currentAccount();
  if (!accountId) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob))
    return NextResponse.json({ error: "Keine Datei" }, { status: 400 });

  const admin = createAdminClient();

  // altes Logo entfernen
  const { data: theme } = await supabase
    .from("themes")
    .select("logo_path")
    .eq("account_id", accountId)
    .single();
  if (theme?.logo_path) {
    await admin.storage.from(PUBLIC_BUCKET).remove([theme.logo_path]);
  }

  const path = `${accountId}/branding/logo-${Date.now()}.webp`;
  const { error } = await admin.storage
    .from(PUBLIC_BUCKET)
    .upload(path, file, { upsert: true, contentType: "image/webp" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("themes").update({ logo_path: path }).eq("account_id", accountId);

  return NextResponse.json({ logoPath: path, url: publicImageUrl(path) });
}

/** Logo entfernen. */
export async function DELETE() {
  const { supabase, accountId } = await currentAccount();
  if (!accountId) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  const { data: theme } = await supabase
    .from("themes")
    .select("logo_path")
    .eq("account_id", accountId)
    .single();
  if (theme?.logo_path) {
    const admin = createAdminClient();
    await admin.storage.from(PUBLIC_BUCKET).remove([theme.logo_path]);
  }
  await supabase.from("themes").update({ logo_path: null }).eq("account_id", accountId);
  return NextResponse.json({ ok: true });
}
