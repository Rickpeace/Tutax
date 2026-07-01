import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SessionFromHash } from "@/components/auth/session-from-hash";

export const dynamic = "force-dynamic";
export const metadata = { title: "Einladung", robots: { index: false } };

/**
 * Einladung annehmen: dem Organisations-Konto beitreten, dann Passwort setzen.
 * - Eingeloggt (via /auth/confirm ODER Fragment-Fallback unten): Beitritt + -> /reset.
 * - Nicht eingeloggt: impliziter #-Magic-Link -> Session aus Fragment holen und neu laden;
 *   ohne Fragment -> Login (bestehende Nutzer mit Passwort).
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: inv } = await admin
    .from("invitations")
    .select("id, account_id, role, status, email")
    .eq("token", token)
    .maybeSingle();
  if (!inv || inv.status === "revoked") redirect("/login?error=invite");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Nur die eingeladene Adresse darf beitreten (weitergeleitete Links).
    if (inv.email && (user.email ?? "").toLowerCase() !== inv.email.toLowerCase()) {
      redirect("/app?error=invite_email");
    }
    // Beitritt idempotent – bestehende Rolle NICHT überschreiben.
    await admin.from("account_members").upsert(
      { account_id: inv.account_id, user_id: user.id, role: inv.role },
      { onConflict: "account_id,user_id", ignoreDuplicates: true },
    );
    if (inv.status !== "accepted") {
      await admin
        .from("invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", inv.id);
    }
    // Neu Eingeladene haben noch kein Passwort -> setzen lassen, dann in die App.
    redirect("/reset");
  }

  return (
    <SessionFromHash next={`/invite/${token}`} fallback={`/login?next=/invite/${token}`} />
  );
}
