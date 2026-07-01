import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { InviteConfirm } from "@/components/auth/invite-confirm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Einladung", robots: { index: false } };

/**
 * Einladung annehmen. Drei Fälle:
 * - eingeloggt + passende Adresse: Bestätigungs-Abfrage „Beitreten?" (kein stiller Join).
 * - eingeloggt + andere Adresse: Hinweis + „Abmelden & als <invite> beitreten".
 * - nicht eingeloggt: Formular (anmelden bei bestehendem Konto / Passwort festlegen bei neuem).
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

  const orgName = (inv.accounts as { name?: string } | null)?.name ?? "";
  const role = inv.role ?? "editor";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const mismatch = !!inv.email && (user.email ?? "").toLowerCase() !== inv.email.toLowerCase();
    if (mismatch) {
      return (
        <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center px-5 py-10">
          <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <h1 className="text-lg font-extrabold text-ink">Andere Adresse</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Diese Einladung ist für <b>{inv.email}</b>, du bist aber als <b>{user.email}</b> angemeldet.
            </p>
            <a
              href={`/logout?next=/invite/${token}`}
              className="mt-5 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Abmelden &amp; als {inv.email} beitreten
            </a>
          </div>
        </div>
      );
    }
    return <InviteConfirm token={token} orgName={orgName} role={role} currentEmail={user.email ?? ""} />;
  }

  // Nicht eingeloggt: hat die Adresse schon ein Konto? -> "anmelden" statt "Passwort festlegen".
  let hasAccount = false;
  if (inv.email) {
    const { data: page } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    hasAccount = (page?.users ?? []).some(
      (u) => (u.email ?? "").toLowerCase() === inv.email!.toLowerCase(),
    );
  }
  return <AcceptInviteForm token={token} email={inv.email ?? ""} orgName={orgName} hasAccount={hasAccount} />;
}
