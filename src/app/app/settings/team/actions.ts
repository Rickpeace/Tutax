"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { appBaseUrl } from "@/lib/url";

const appUrl = appBaseUrl;
const newToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

export type InviteResult = { ok: boolean; message: string; link?: string };

/**
 * Stellt sicher, dass der Aufrufer INHABER des aktuellen Kontos ist.
 * Schützt die Team-Verwaltung serverseitig (nicht nur über die UI).
 */
async function requireOwner() {
  const { account, userId } = await requireAccount();
  const supabase = await createClient();
  const { data } = await supabase
    .from("account_members")
    .select("role")
    .eq("account_id", account.id)
    .eq("user_id", userId)
    .single();
  if (data?.role !== "owner") throw new Error("Nur der Inhaber darf das Team verwalten.");
  return { account, userId };
}

export async function inviteMember(formData: FormData): Promise<InviteResult> {
  const { account, userId } = await requireOwner();
  const supabase = await createClient();
  const admin = createAdminClient();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "editor") === "owner" ? "owner" : "editor";
  if (!email) return { ok: false, message: "Bitte E-Mail eingeben." };

  // Bereits Mitglied dieses Kontos? -> kein zweites Mal einladen.
  const { data: existingUser } = await admin
    .from("account_members")
    .select("user_id")
    .eq("account_id", account.id);
  if (existingUser?.length) {
    const ids = existingUser.map((m) => m.user_id);
    const { data: usersPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const already = (usersPage?.users ?? []).some(
      (u) => ids.includes(u.id) && (u.email ?? "").toLowerCase() === email,
    );
    if (already) return { ok: false, message: "Diese Person ist bereits im Team." };
  }

  // Alte offene Einladungen an dieselbe Adresse aufräumen (keine Duplikate).
  await admin
    .from("invitations")
    .delete()
    .eq("account_id", account.id)
    .eq("email", email)
    .eq("status", "pending");

  const token = newToken();
  const { error: insErr } = await supabase.from("invitations").insert({
    account_id: account.id,
    email,
    role,
    token,
    invited_by: userId,
  });
  if (insErr) return { ok: false, message: insErr.message };

  const link = `${appUrl()}/invite/${token}`;
  // Einladungs-Mail über Supabase (Versand via Resend-SMTP).
  const { error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { tutax_invite_token: token },
    redirectTo: link,
  });

  revalidatePath("/app/settings/team");
  if (mailErr) {
    const code = (mailErr as { code?: string }).code;
    const status = (mailErr as { status?: number }).status;
    if (code === "over_email_send_rate_limit" || status === 429) {
      return {
        ok: false,
        message:
          "E-Mail-Limit von Supabase erreicht. Bitte in ~1 Stunde erneut versuchen oder das Limit erhöhen (Supabase → Auth → Rate Limits). Solange kannst du diesen Link teilen:",
        link,
      };
    }
    if (code === "email_exists") {
      return {
        ok: true,
        message:
          "Diese Adresse hat bereits ein Konto. Schicke ihr diesen Link – nach dem Login tritt sie automatisch dem Team bei:",
        link,
      };
    }
    return {
      ok: true,
      message: "E-Mail konnte nicht gesendet werden. Teile stattdessen diesen Link:",
      link,
    };
  }
  return { ok: true, message: `Einladung an ${email} gesendet.`, link };
}

export async function revokeInvitation(id: string) {
  const { account } = await requireOwner();
  const admin = createAdminClient();
  await admin
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("account_id", account.id);
  revalidatePath("/app/settings/team");
}

export async function removeMember(userId: string) {
  const { account, userId: me } = await requireOwner();
  if (me === userId) throw new Error("Sie können sich nicht selbst entfernen.");
  const admin = createAdminClient();
  await admin
    .from("account_members")
    .delete()
    .eq("account_id", account.id)
    .eq("user_id", userId);
  revalidatePath("/app/settings/team");
}
