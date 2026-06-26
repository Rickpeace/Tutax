import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TeamManager } from "@/components/app/team-manager";

export default async function TeamPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();

  const [{ data: memberRows }, { data: invRows }, usersRes] = await Promise.all([
    admin.from("account_members").select("user_id, role").eq("account_id", account.id),
    admin
      .from("invitations")
      .select("id, email, role, status, token, created_at")
      .eq("account_id", account.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
  ]);

  const emailById = new Map((usersRes.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const members = (memberRows ?? []).map((m) => ({
    userId: m.user_id,
    role: m.role,
    email: emailById.get(m.user_id) ?? "—",
    isYou: m.user_id === user?.id,
  }));
  const myRole = members.find((m) => m.isYou)?.role ?? "editor";

  return (
    <TeamManager
      members={members}
      invitations={invRows ?? []}
      isOwner={myRole === "owner"}
    />
  );
}
