import { Mail, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";
import { PasswordForm } from "@/components/app/password-form";
import { EmailForm } from "@/components/app/email-form";
import { SettingsCard, SettingsHeader } from "@/components/app/settings-ui";

export default async function ProfilPage() {
  await requireAccount({ allowMember: true });
  const supabase = await createClient();
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
    </div>
  );
}
