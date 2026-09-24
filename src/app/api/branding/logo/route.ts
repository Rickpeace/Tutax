import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicImageUrl } from "@/lib/public-image";
import { activeAccountId } from "@/lib/account";
import { revalidateHubByAccountId } from "@/lib/cache-tags";
import { isAccountStoragePath } from "@/lib/storage-path";
import { isPro, PRO_REQUIRED } from "@/lib/plan";

const PUBLIC_BUCKET = "tutorial-images-public";

/**
 * Nur Logos im EIGENEN Branding-Ordner löschen: `logo_path`/`ai_logo_path` sind per REST
 * beschreibbar — ein eingetragener fremder Pfad darf nie mit dem Admin-Client gelöscht werden.
 * `branding/` = Upload hier, `brand/` = KI-Design (theme/analyze, theme/extreme).
 */
const isOwnLogoPath = (accountId: string, path: string | null | undefined) =>
  isAccountStoragePath(accountId, path, ["branding", "brand"]);

async function currentAccount() {
  const supabase = await createClient();
  // AKTIVE Org (Metadaten), nicht "irgendein" Konto -> korrekt bei Mehrfach-Mitgliedschaft.
  const a = await activeAccountId();
  return { supabase, accountId: a?.accountId ?? null };
}

/** Logo hochladen. target=manual -> logo_path, target=ai -> ai_logo_path. */
export async function POST(req: NextRequest) {
  const { supabase, accountId } = await currentAccount();
  if (!accountId) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  // Eigenes Logo erst ab Pro (Tarifseite). Entfernen (DELETE) bleibt immer möglich.
  const { data: acc } = await supabase.from("accounts").select("plan").eq("id", accountId).single();
  if (!isPro(acc ?? {})) return NextResponse.json({ error: PRO_REQUIRED }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob))
    return NextResponse.json({ error: "Keine Datei" }, { status: 400 });
  const target = String(form.get("target") ?? "manual") === "ai" ? "ai" : "manual";
  const col = target === "ai" ? "ai_logo_path" : "logo_path";

  // Echte Bilddatei? Vorher wurden beliebige Bytes als .webp öffentlich abgelegt (Audit 24.09.).
  // ERST prüfen, dann das alte Logo entfernen — sonst war bei Fehlern das alte Logo weg.
  if (file.size > 8 * 1024 * 1024)
    return NextResponse.json({ error: "Das Logo ist zu groß (höchstens 8 MB)." }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) throw new Error("kein Bild");
  } catch {
    return NextResponse.json({ error: "Das ist keine gültige Bilddatei. Bitte PNG, JPG, WebP oder SVG hochladen." }, { status: 400 });
  }

  const admin = createAdminClient();

  // altes Logo der jeweiligen Quelle entfernen
  const { data: theme } = await supabase
    .from("themes")
    .select("logo_path, ai_logo_path")
    .eq("account_id", accountId)
    .single();
  const oldPath = target === "ai" ? theme?.ai_logo_path : theme?.logo_path;
  if (oldPath && isOwnLogoPath(accountId, oldPath)) await admin.storage.from(PUBLIC_BUCKET).remove([oldPath]);

  const path = `${accountId}/branding/${target === "ai" ? "ai-logo" : "logo"}-${Date.now()}.webp`;
  const { error } = await admin.storage
    .from(PUBLIC_BUCKET)
    .upload(path, buf, { upsert: true, contentType: "image/webp" });
  if (error) {
    console.error("[branding/logo] Upload:", error.message);
    return NextResponse.json({ error: "Das Logo konnte nicht gespeichert werden. Bitte erneut versuchen." }, { status: 500 });
  }

  await supabase.from("themes").update({ [col]: path }).eq("account_id", accountId);

  await revalidateHubByAccountId(accountId); // /h-Cache aktualisieren
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
  if (oldPath && isOwnLogoPath(accountId, oldPath)) {
    const admin = createAdminClient();
    await admin.storage.from(PUBLIC_BUCKET).remove([oldPath]);
  }
  await supabase.from("themes").update({ [col]: null }).eq("account_id", accountId);
  await revalidateHubByAccountId(accountId); // /h-Cache aktualisieren
  return NextResponse.json({ ok: true });
}
