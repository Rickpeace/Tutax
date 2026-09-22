"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { findAuthUserByEmail } from "@/lib/auth-admin";
import { appBaseUrl } from "@/lib/url";
import { ROLE_LABEL, asRole, type Role } from "@/lib/roles";
import { teamLimit } from "@/lib/plan";
import { INVITE_VALID_DAYS, inviteCutoffIso, isInviteExpired } from "@/lib/invitations";

const appUrl = appBaseUrl;
const newToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

export type InviteResult = { ok: boolean; message: string; link?: string };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Einladungs-Mail direkt über Resend – für ALLE Adressen (neu wie bestehend).
 * Braucht RESEND_API_KEY + INVITE_FROM_EMAIL (z. B. "Steply <einladung@deine-domain.de>").
 * Ohne Konfiguration -> false (Aufrufer nutzt Fallback / Link).
 */
async function sendInviteEmail(to: string, orgName: string, link: string, role: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_FROM_EMAIL;
  if (!key || !from) return false;
  const roleLabel = ROLE_LABEL[asRole(role)];
  const org = escapeHtml(orgName);
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#2b2320">
    <p style="margin:0 0 4px;font-weight:700;color:#ef6a4e">Steply</p>
    <h2 style="margin:0 0 8px">Einladung zu ${org}</h2>
    <p style="color:#5c5049;line-height:1.55">Sie wurden als <b>${roleLabel}</b> zum Team von <b>${org}</b> auf Steply eingeladen. Haben Sie schon ein Steply-Konto, melden Sie sich einfach mit Ihrem bestehenden Passwort an — Sie wechseln danach automatisch ins neue Team. Sonst legen Sie beim Beitreten ein Passwort fest:</p>
    <p style="margin:24px 0"><a href="${link}" style="background:#ef6a4e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600;display:inline-block">Einladung annehmen</a></p>
    <p style="color:#8a7d75;font-size:12px">Der Link ist ${INVITE_VALID_DAYS} Tage gültig.</p>
    <p style="color:#8a7d75;font-size:12px;word-break:break-all">Falls der Knopf nicht funktioniert, öffnen Sie diesen Link:<br>${link}</p>
  </div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: `Einladung zu ${orgName} auf Steply`, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Stellt sicher, dass der Aufrufer INHABER des aktuellen Kontos ist.
 * Schützt die Team-Verwaltung serverseitig (nicht nur über die UI).
 */
async function requireOwner() {
  const { account, userId, role } = await requireAccount();
  if (role !== "owner") throw new Error("Nur der Inhaber darf das Team verwalten.");
  return { account, userId };
}

/** Eingabe -> gültige Rolle (unbekannt = Bearbeiter, wie bisher der Standard). */
function parseRole(v: unknown): Role {
  return v === "owner" || v === "member" ? v : "editor";
}

/**
 * Zweite Grenzprüfung beim ANNEHMEN (die erste läuft beim Einladen): schützt vor parallel
 * angelegten Einladungen und vor einem Tarif-Downgrade zwischen Einladen und Annehmen.
 * Wer schon Mitglied ist, zählt nicht (Annehmen ist dann ein No-op).
 */
async function teamHasRoom(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  userId: string,
): Promise<boolean> {
  const [{ data: acc }, { data: rows }] = await Promise.all([
    admin.from("accounts").select("plan").eq("id", accountId).maybeSingle(),
    admin.from("account_members").select("user_id").eq("account_id", accountId),
  ]);
  const list = rows ?? [];
  if (list.some((m) => m.user_id === userId)) return true;
  return list.length < teamLimit(acc ?? {});
}

const INVITE_EXPIRED = `Diese Einladung ist abgelaufen (gültig ${INVITE_VALID_DAYS} Tage). Bitten Sie den Inhaber, sie neu zu senden.`;

const TEAM_FULL =
  "Das Team ist voll – der Tarif der Organisation erlaubt keine weiteren Personen. Bitte wenden Sie sich an den Inhaber.";

/** Erweiterungs-Verbindung einer Person in diesem Konto ungültig machen (Migration 0037). */
async function dropRecorderTokens(admin: ReturnType<typeof createAdminClient>, accountId: string, userId: string) {
  await admin.from("recorder_tokens").delete().eq("account_id", accountId).eq("user_id", userId);
}

export async function inviteMember(formData: FormData): Promise<InviteResult> {
  const { account, userId } = await requireOwner();
  const admin = createAdminClient();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = parseRole(formData.get("role"));
  if (!email) return { ok: false, message: "Bitte E-Mail eingeben." };

  // Bereits Mitglied dieses Kontos? -> kein zweites Mal einladen.
  const { data: existingUser } = await admin
    .from("account_members")
    .select("user_id")
    .eq("account_id", account.id);
  if (existingUser?.length) {
    const ids = new Set(existingUser.map((m) => m.user_id));
    const u = await findAuthUserByEmail(admin, email);
    if (u && ids.has(u.id)) return { ok: false, message: "Diese Person ist bereits im Team." };
  }

  // Team-Grenze je Tarif (Free 1, Pro 5, Business unbegrenzt): Mitglieder + offene
  // Einladungen (ohne eine offene an DIESELBE Adresse — die wird gleich ersetzt).
  const limit = teamLimit(account);
  if (Number.isFinite(limit)) {
    const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
      admin.from("account_members").select("user_id", { count: "exact", head: true }).eq("account_id", account.id),
      admin
        .from("invitations")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account.id)
        .eq("status", "pending")
        .gte("created_at", inviteCutoffIso())
        .neq("email", email),
    ]);
    if ((memberCount ?? 0) + (pendingCount ?? 0) >= limit) {
      return {
        ok: false,
        message:
          limit <= 1
            ? "Im kostenlosen Tarif arbeiten Sie allein. Für ein Team wechseln Sie unter Einstellungen → Tarif zu Pro."
            : `Ihr Tarif erlaubt ${limit} Personen im Team (inkl. offener Einladungen). Für mehr wechseln Sie unter Einstellungen → Tarif zu Business.`,
      };
    }
  }

  // Alte offene Einladungen an dieselbe Adresse aufräumen (keine Duplikate).
  await admin
    .from("invitations")
    .delete()
    .eq("account_id", account.id)
    .eq("email", email)
    .eq("status", "pending");

  const token = newToken();
  // Über den Admin-Client NACH der Grenzprüfung: Nutzer schreiben Einladungen nicht mehr
  // direkt (RLS nur noch Lesen, Migration 0038) — sonst ließe sich die Grenze per REST umgehen.
  const { error: insErr } = await admin.from("invitations").insert({
    account_id: account.id,
    email,
    role,
    token,
    invited_by: userId,
  });
  if (insErr) return { ok: false, message: insErr.message };

  const link = `${appUrl()}/invite/${token}`;
  revalidatePath("/app/settings/team");

  // Einladungs-Mail über Resend (funktioniert für neue UND bestehende Adressen).
  // BEWUSST KEIN Supabase-inviteUserByEmail-Fallback: das würde sofort einen
  // passwortlosen Auth-User anlegen ("Einladungs-Leiche"). Der Auth-User entsteht
  // erst beim Annehmen (acceptInvite). Klappt der Mailversand nicht -> Link teilen.
  if (await sendInviteEmail(email, account.name, link, role)) {
    return { ok: true, message: `Einladung an ${email} gesendet.`, link };
  }
  return {
    ok: true,
    message: "E-Mail-Versand ist nicht konfiguriert – teile der Person einfach diesen Beitritts-Link:",
    link,
  };
}

/**
 * Einladung annehmen: Passwort setzen (User anlegen/aktualisieren) + Konto beitreten
 * + einloggen. Wird vom EINGELADENEN aufgerufen (nicht eingeloggt) – Autorisierung
 * erfolgt über den Besitz des Einladungs-Tokens. Kein Magic-Link/Recovery nötig.
 */
export async function acceptInvite(
  token: string,
  password: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!password) return { ok: false, message: "Bitte ein Passwort eingeben." };

  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("invitations")
    .select("id, account_id, role, status, email, created_at")
    .eq("token", token)
    .maybeSingle();
  if (!inv || inv.status !== "pending" || !inv.email)
    return { ok: false, message: "Diese Einladung ist ungültig, bereits eingelöst oder zurückgezogen." };
  if (isInviteExpired(inv.created_at))
    return { ok: false, message: INVITE_EXPIRED };

  const supabase = await createClient();
  const existing = await findAuthUserByEmail(admin, inv.email);
  if (!(await teamHasRoom(admin, inv.account_id, existing?.id ?? ""))) return { ok: false, message: TEAM_FULL };

  let userId: string;
  if (existing) {
    // Hat schon ein Konto -> mit dem VORHANDENEN Passwort anmelden (NICHT überschreiben).
    const { error } = await supabase.auth.signInWithPassword({ email: inv.email, password });
    if (error)
      return {
        ok: false,
        message: "Das Passwort stimmt nicht. Bitte verwenden Sie das Passwort Ihres bestehenden Kontos – oder setzen Sie es über „Passwort vergessen“ neu.",
      };
    userId = existing.id;
  } else {
    // Neu -> Konto anlegen (Invite-Metadaten => Trigger legt kein Eigen-Konto an) + einloggen.
    if (password.length < 8)
      return { ok: false, message: "Das Passwort muss mindestens 8 Zeichen haben." };
    const { data: created, error } = await admin.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
      user_metadata: { tutax_invite_token: token },
    });
    if (error || !created?.user) return { ok: false, message: error?.message ?? "Konto konnte nicht angelegt werden." };
    userId = created.user.id;
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: inv.email, password });
    if (signErr) return { ok: false, message: "Konto angelegt – bitte melden Sie sich jetzt an." };
  }

  // Beitritt (idempotent) + Einladung als akzeptiert markieren.
  await admin.from("account_members").upsert(
    { account_id: inv.account_id, user_id: userId, role: inv.role },
    { onConflict: "account_id,user_id", ignoreDuplicates: true },
  );
  await admin
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", inv.id);

  // Direkt in der neuen Org landen.
  await supabase.auth.updateUser({ data: { active_account_id: inv.account_id } });
  return { ok: true };
}

/**
 * Einladung annehmen für einen BEREITS EINGELOGGTEN Nutzer (Bestätigungs-Klick).
 * Prüft, dass die eingeloggte Adresse = eingeladene Adresse ist, und tritt bei.
 */
export async function joinInvite(token: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sie sind nicht angemeldet." };

  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("invitations")
    .select("id, account_id, role, status, email, created_at")
    .eq("token", token)
    .maybeSingle();
  if (!inv || inv.status !== "pending" || !inv.email)
    return { ok: false, message: "Diese Einladung ist ungültig, bereits eingelöst oder zurückgezogen." };
  if (isInviteExpired(inv.created_at))
    return { ok: false, message: INVITE_EXPIRED };
  if ((user.email ?? "").toLowerCase() !== inv.email.toLowerCase())
    return { ok: false, message: "Diese Einladung ist für eine andere Adresse." };
  if (!(await teamHasRoom(admin, inv.account_id, user.id))) return { ok: false, message: TEAM_FULL };

  await admin.from("account_members").upsert(
    { account_id: inv.account_id, user_id: user.id, role: inv.role },
    { onConflict: "account_id,user_id", ignoreDuplicates: true },
  );
  await admin
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", inv.id);
  // Direkt in der neuen Org landen.
  await supabase.auth.updateUser({ data: { active_account_id: inv.account_id } });
  return { ok: true };
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
  // Letzten Inhaber nicht entfernen -> Konto würde sonst ohne Inhaber verwaisen.
  const { data: owners } = await admin
    .from("account_members")
    .select("user_id")
    .eq("account_id", account.id)
    .eq("role", "owner");
  const list = owners ?? [];
  if (list.some((o) => o.user_id === userId) && list.length <= 1) {
    throw new Error("Der letzte Inhaber kann nicht entfernt werden.");
  }
  await admin
    .from("account_members")
    .delete()
    .eq("account_id", account.id)
    .eq("user_id", userId);
  // Ihre Steply-Erweiterung verliert damit sofort den Zugang zu diesem Konto.
  await dropRecorderTokens(admin, account.id, userId);
  revalidatePath("/app/settings/team");
}

/**
 * Rolle eines Mitglieds ändern (nur Inhaber). Der letzte Inhaber kann nicht herabgestuft
 * werden (sonst verwaist das Konto) — auch nicht er selbst. Wird jemand Mitarbeiter,
 * verliert seine Erweiterung den Zugang (Mitarbeiter erstellen keine Inhalte).
 */
export async function changeMemberRole(userId: string, nextRole: string): Promise<void> {
  const { account } = await requireOwner();
  const role = parseRole(nextRole);
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("account_members")
    .select("user_id, role")
    .eq("account_id", account.id);
  const list = rows ?? [];
  const target = list.find((m) => m.user_id === userId);
  if (!target) throw new Error("Diese Person ist nicht (mehr) im Team.");
  if (target.role === role) return;
  const owners = list.filter((m) => m.role === "owner");
  if (target.role === "owner" && owners.length <= 1) {
    throw new Error("Der letzte Inhaber kann nicht herabgestuft werden. Machen Sie zuerst jemand anderen zum Inhaber.");
  }
  const { error } = await admin
    .from("account_members")
    .update({ role })
    .eq("account_id", account.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (role === "member") await dropRecorderTokens(admin, account.id, userId);
  revalidatePath("/app/settings/team");
}

/**
 * Einladung neu senden (nur Inhaber): gleicher Empfänger, gleiche Rolle, NEUER Link mit
 * frischer Gültigkeit — der alte Link wird ungültig (inviteMember ersetzt offene Einladungen
 * an dieselbe Adresse). Geht auch für abgelaufene Einladungen.
 */
export async function resendInvitation(id: string): Promise<InviteResult> {
  const { account } = await requireOwner();
  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("invitations")
    .select("email, role, status")
    .eq("id", id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!inv || inv.status !== "pending") return { ok: false, message: "Einladung nicht gefunden." };
  const fd = new FormData();
  fd.set("email", inv.email);
  fd.set("role", inv.role);
  return inviteMember(fd);
}

/**
 * Organisation selbst verlassen (jede Rolle). Der letzte Inhaber kann nicht gehen (das
 * Konto verwaiste sonst) — er muss erst jemand anderen zum Inhaber machen. Danach wird die
 * nächste eigene Organisation aktiv; gibt es keine mehr, meldet die App beim nächsten
 * Aufruf sauber ab (requireAccount -> /login?error=kein-team).
 */
export async function leaveTeam(): Promise<{ ok: true; hasOtherOrg: boolean } | { ok: false; error: string }> {
  const { account, userId, role, memberships } = await requireAccount({ allowMember: true });
  const admin = createAdminClient();
  if (role === "owner") {
    const { count } = await admin
      .from("account_members")
      .select("user_id", { count: "exact", head: true })
      .eq("account_id", account.id)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "Sie sind der einzige Inhaber. Machen Sie zuerst eine andere Person zum Inhaber (Einstellungen → Team).",
      };
    }
  }
  const { error } = await admin
    .from("account_members")
    .delete()
    .eq("account_id", account.id)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  await dropRecorderTokens(admin, account.id, userId);
  const next = memberships.find((m) => m.id !== account.id);
  const supabase = await createClient();
  await supabase.auth.updateUser({ data: { active_account_id: next?.id ?? null } });
  return { ok: true, hasOtherOrg: !!next };
}
