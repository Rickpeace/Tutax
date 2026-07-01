import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Einladung", robots: { index: false } };

/**
 * Einladung annehmen – selbst-enthaltend (keine Magic-/Recovery-Mail-Abhängigkeit):
 * - Eingeloggt + passende Adresse: direkt beitreten -> /app.
 * - Nicht eingeloggt: Passwort-Formular -> setzt Passwort, tritt bei, loggt ein.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: inv } = await admin
    .from("invitations")
    .select("id, account_id, role, status, email, accounts(name)")
    .eq("token", token)
    .maybeSingle();
  if (!inv || inv.status === "revoked") redirect("/login?error=invite");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    if (inv.email && (user.email ?? "").toLowerCase() !== inv.email.toLowerCase()) {
      redirect("/app?error=invite_email");
    }
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
    redirect("/app");
  }

  const orgName = (inv.accounts as { name?: string } | null)?.name ?? "";
  return <AcceptInviteForm token={token} email={inv.email ?? ""} orgName={orgName} />;
}
