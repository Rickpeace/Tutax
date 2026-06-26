"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { appBaseUrl } from "@/lib/url";

const appUrl = appBaseUrl;
const newToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

export type InviteResult = { ok: boolean; message: string; link?: string };

export async function inviteMember(formData: FormData): Promise<InviteResult> {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "editor") === "owner" ? "owner" : "editor";
  if (!email) return { ok: false, message: "Bitte E-Mail eingeben." };

  const token = newToken();
  const { error: insErr } = await supabase.from("invitations").insert({
    account_id: account.id,
    email,
    role,
    token,
    invited_by: user?.id ?? null,
  });
  if (insErr) return { ok: false, message: insErr.message };

  const link = `${appUrl()}/invite/${token}`;
  // Einladungs-Mail über Supabase (Versand via Resend-SMTP).
  const admin = createAdminClient();
  const { error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { tutax_invite_token: token },
    redirectTo: link,
  });

  revalidatePath("/app/settings/team");
  if (mailErr) {
    // z. B. „email_exists" -> kein automatischer Mailversand möglich, Link zum Teilen.
    return {
      ok: true,
      message:
        "Konnte keine Einladungs-Mail senden (vermutlich existiert bereits ein Konto mit dieser E-Mail). Teile stattdessen diesen Link:",
      link,
    };
  }
  return { ok: true, message: `Einladung an ${email} gesendet.`, link };
}

export async function revokeInvitation(id: string) {
  const { account } = await requireAccount();
  const supabase = await createClient();
  await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("account_id", account.id);
  revalidatePath("/app/settings/team");
}

export async function removeMember(userId: string) {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === userId) throw new Error("Sie können sich nicht selbst entfernen.");
  await supabase
    .from("account_members")
    .delete()
    .eq("account_id", account.id)
    .eq("user_id", userId);
  revalidatePath("/app/settings/team");
}
