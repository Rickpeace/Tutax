import { Mail, KeyRound, LogOut } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { LeaveTeam } from "@/components/app/leave-team";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";
import { PasswordForm } from "@/components/app/password-form";
import { EmailForm } from "@/components/app/email-form";
import { SettingsCard, SettingsHeader } from "@/components/app/settings-ui";

export default async function ProfilPage() {
  const { account, role } = await requireAccount({ allowMember: true });
  const supabase = await createClient();
  // Letzter Inhaber darf nicht gehen (Server prüft zusätzlich) -> Knopf gleich gesperrt + Grund.
  let blockedReason: string | undefined;
  if (role === "owner") {
    const { count } = await createAdminClient()
      .from("account_members")
      .select("user_id", { count: "exact", head: true })
      .eq("account_id", account.id)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      blockedReason =
        "Sie sind der einzige Inhaber. Um die Organisation zu verlassen, machen Sie zuerst eine andere Person zum Inhaber (Einstellungen → Team).";
    }
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="grid gap-[18px]">
      <SettingsHeader
        group="Persönlich"
        title="Mein Profil"
        lead="Ihre persönlichen Zugangsdaten. Sie gelten für alle Organisationen, in denen Sie Mitglied sind."
      />

      <SettingsCard
        title="E-Mail-Adresse"
        icon={Mail}
        description={
          <>
            Sie melden sich an mit <b className="text-ink">{user?.email}</b>.
          </>
        }
      >
        <EmailForm current={user?.email ?? ""} />
      </SettingsCard>

      <SettingsCard title="Passwort ändern" icon={KeyRound}>
        <PasswordForm />
      </SettingsCard>

      <SettingsCard
        title="Organisation verlassen"
        icon={LogOut}
        description={
          <>
            Sie sind Mitglied von <b className="text-ink">{account.name}</b>. Nach dem Verlassen haben Sie
            keinen Zugriff mehr; der Inhaber kann Sie jederzeit neu einladen.
          </>
        }
      >
        <LeaveTeam accountId={account.id} orgName={account.name} blockedReason={blockedReason} />
      </SettingsCard>
    </div>
  );
}
