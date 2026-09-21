import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TeamManager } from "@/components/app/team-manager";
import { SettingsHeader } from "@/components/app/settings-ui";

export default async function TeamPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();

  const [{ data: memberRows }, { data: invRows }] = await Promise.all([
    admin.from("account_members").select("user_id, role").eq("account_id", account.id),
    admin
      .from("invitations")
      .select("id, email, role, status, token, created_at")
      .eq("account_id", account.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  // E-Mails gezielt pro Member (getUserById) statt listUsers-Seite -> korrekt unabhängig
  // von der Gesamt-Nutzerzahl und weniger Datenübertragung.
  const rows = memberRows ?? [];
  const userRes = await Promise.all(rows.map((m) => admin.auth.admin.getUserById(m.user_id)));
  const emailById = new Map(rows.map((m, i) => [m.user_id, userRes[i].data?.user?.email ?? ""]));
  const members = (memberRows ?? []).map((m) => ({
    userId: m.user_id,
    role: m.role,
    email: emailById.get(m.user_id) ?? "—",
    isYou: m.user_id === user?.id,
  }));
  const myRole = members.find((m) => m.isYou)?.role ?? "editor";

  return (
    <div className="grid gap-[18px]">
      <SettingsHeader
        group="Arbeitsbereich"
        title="Team"
        lead="Laden Sie Mitarbeitende ein, die gemeinsam mit Ihnen an Anleitungen arbeiten."
      />
      {/* Einladungen (inkl. Token = Beitritts-Link) NUR an Inhaber geben – ein Editor
          könnte sonst aus dem Client-Payload einen offenen Owner-Invite-Token abgreifen. */}
      <TeamManager
        members={members}
        invitations={myRole === "owner" ? (invRows ?? []) : []}
        isOwner={myRole === "owner"}
      />
    </div>
  );
}
