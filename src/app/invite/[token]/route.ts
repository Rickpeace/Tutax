import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Einladung annehmen: tritt dem Organisation-Konto bei und leitet zum Passwort-Setzen.
 * Aufruf i. d. R. aus der Einladungs-Mail (Nutzer ist dann eingeloggt).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { origin } = new URL(req.url);
  const admin = createAdminClient();

  const { data: inv } = await admin
    .from("invitations")
    .select("id, account_id, role, status, email")
    .eq("token", token)
    .maybeSingle();
  if (!inv || inv.status === "revoked") {
    return NextResponse.redirect(`${origin}/login?error=invite`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Nicht eingeloggt -> nach Login zurück hierher.
    return NextResponse.redirect(`${origin}/login?next=/invite/${token}`);
  }

  // Sicherheit: nur wer als die eingeladene Adresse eingeloggt ist, darf beitreten.
  // Verhindert versehentliche Beitritte/Rollen-Änderungen durch weitergeleitete Links.
  if (inv.email && (user.email ?? "").toLowerCase() !== inv.email.toLowerCase()) {
    return NextResponse.redirect(`${origin}/app?error=invite_email`);
  }

  // Beitritt (idempotent) – bestehende Mitgliedschaft NICHT überschreiben,
  // sonst würde ein Inhaber beim Klick auf einen eigenen Link zu "editor" herabgestuft.
  await admin
    .from("account_members")
    .upsert(
      { account_id: inv.account_id, user_id: user.id, role: inv.role },
      { onConflict: "account_id,user_id", ignoreDuplicates: true },
    );
  if (inv.status !== "accepted") {
    await admin
      .from("invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", inv.id);
  }

  // Passwort setzen (neu Eingeladene haben noch keins) -> danach in die App.
  return NextResponse.redirect(`${origin}/reset`);
}
