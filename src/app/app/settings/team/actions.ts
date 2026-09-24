"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertActiveAccount, orgSwitchedError, requireAccount } from "@/lib/account";
import { findAuthUserByEmail } from "@/lib/auth-admin";
import { appBaseUrl } from "@/lib/url";
import { ROLE_HINT, ROLE_LABEL, asRole, type Role } from "@/lib/roles";
import { sendEmail, type SendResult } from "@/lib/email/send";
import { inviteEmail, teamJoinedEmail } from "@/lib/email/templates";
import { teamLimit } from "@/lib/plan";
import { teamHasRoom } from "@/lib/team-room";
import { INVITE_VALID_DAYS, inviteCutoffIso, isInviteExpired } from "@/lib/invitations";
import { withUserErrors, UserError } from "@/lib/action-error";
import { uebersetzeAuthFehler } from "@/lib/auth-errors";

const appUrl = appBaseUrl;
const newToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

export type InviteResult = { ok: boolean; message: string; link?: string };

const roleInfo = (role: unknown) => {
  const r = asRole(role);
  return { label: ROLE_LABEL[r], hint: ROLE_HINT[r] };
};

/**
 * Einladungs-Mail direkt über Resend – für ALLE Adressen (neu wie bestehend).
 * Ohne Konfiguration -> "unconfigured" (Aufrufer nutzt Fallback / Link).
 */
async function sendInviteEmail(to: string, orgName: string, link: string, role: string): Promise<SendResult> {
  const mail = inviteEmail({ baseUrl: appUrl(), orgName, role: roleInfo(role), link, validDays: INVITE_VALID_DAYS });
  return sendEmail({ to, ...mail, tag: "einladung" });
}

/**
 * Bestätigung nach dem Beitritt („Sie sind jetzt im Team …“) — nach der Antwort verschickt
 * (after), damit das Beitreten nicht auf den Mailversand wartet. Fehler nur im Log.
 */
function sendJoinedEmailLater(to: string, accountId: string, role: string, newAccount: boolean) {
  after(async () => {
    const { data: acc } = await createAdminClient().from("accounts").select("name").eq("id", accountId).maybeSingle();
    const mail = teamJoinedEmail({
      baseUrl: appUrl(),
      email: to,
      orgName: acc?.name ?? "Ihrem Team",
      role: roleInfo(role),
      newAccount,
    });
    await sendEmail({ to, ...mail, tag: "team-beitritt" });
  });
}

/**
 * Stellt sicher, dass der Aufrufer INHABER des aktuellen Kontos ist.
 * Schützt die Team-Verwaltung serverseitig (nicht nur über die UI).
 */
async function requireOwner() {
  const ctx = await requireAccount();
  const { account, userId, role } = ctx;
  if (role !== "owner") throw new UserError("Nur der Inhaber darf das Team verwalten.");
  return { account, userId, ctx };
}

/**
 * Wie requireOwner, aber für Aktionen mit `InviteResult`-Rückgabe: die Ablehnung kommt als
 * `{ ok: false, message }` zurück statt als Wurf. Sonst sah ein inzwischen herabgestufter
 * Inhaber (Team-Seite noch offen) beim Einladen/Neu senden im Produktions-Build nur Nexts
 * englische Standardmeldung bzw. die Fehlerseite.
 */
async function ownerOrRejection(): Promise<Awaited<ReturnType<typeof requireOwner>> | InviteResult> {
  try {
    return await requireOwner();
  } catch (e) {
    if (e instanceof UserError) return { ok: false, message: e.message };
    throw e;
  }
}

/** Eingabe -> gültige Rolle (unbekannt = Bearbeiter, wie bisher der Standard). */
function parseRole(v: unknown): Role {
  return v === "owner" || v === "member" ? v : "editor";
}

const INVITE_EXPIRED = `Diese Einladung ist abgelaufen (gültig ${INVITE_VALID_DAYS} Tage). Bitten Sie den Inhaber, sie neu zu senden.`;

const TEAM_FULL =
  "Das Team ist voll – der Tarif der Organisation erlaubt keine weiteren Personen. Bitte wenden Sie sich an den Inhaber.";

/** Erweiterungs-Verbindung einer Person in diesem Konto ungültig machen (Migration 0037). */
async function dropRecorderTokens(admin: ReturnType<typeof createAdminClient>, accountId: string, userId: string) {
  await admin.from("recorder_tokens").delete().eq("account_id", accountId).eq("user_id", userId);
}

export async function inviteMember(formData: FormData): Promise<InviteResult> {
  const owner = await ownerOrRejection();
  if ("message" in owner) return owner;
  const { account, userId, ctx } = owner;
  // Org in einem anderen Tab gewechselt -> nicht in die falsche Organisation einladen.
  const switched = orgSwitchedError(formData.get("accountId"), ctx);
  if (switched) return { ok: false, message: switched };
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
  const sent = await sendInviteEmail(email, account.name, link, role);
  if (sent === "sent") return { ok: true, message: `Einladung an ${email} gesendet.`, link };
  return {
    ok: true,
    message:
      sent === "unconfigured"
        ? "E-Mail-Versand ist nicht eingerichtet – teilen Sie der Person einfach diesen Beitritts-Link:"
        : `Die E-Mail an ${email} konnte nicht verschickt werden (Adresse prüfen). Die Einladung gilt trotzdem – teilen Sie diesen Beitritts-Link:`,
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
  const isNew = !existing;
  if (existing) {
    // Hat schon ein Konto -> mit dem VORHANDENEN Passwort anmelden (NICHT überschreiben).
    const { error } = await supabase.auth.signInWithPassword({ email: inv.email, password });
    if (error) {
      const wrongPassword = /invalid login credentials/i.test(error.message);
      return {
        ok: false,
        message: wrongPassword
          ? "Das Passwort stimmt nicht. Bitte verwenden Sie das Passwort Ihres bestehenden Kontos – oder setzen Sie es über „Passwort vergessen“ neu."
          : uebersetzeAuthFehler(error.message),
      };
    }
    userId = existing.id;
  } else {
    // Neu -> Konto anlegen (Invite-Metadaten => Trigger legt kein Eigen-Konto an).
    if (password.length < 8)
      return { ok: false, message: "Das Passwort muss mindestens 8 Zeichen haben." };
    const { data: created, error } = await admin.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
      user_metadata: { tutax_invite_token: token },
    });
    if (error || !created?.user) {
      // Supabase-Texte sind englisch; parallel angelegtes Konto eigens erklären.
      const taken = !!error && /already (been )?registered|already exists/i.test(error.message);
      return {
        ok: false,
        message: taken
          ? "Für diese Adresse gibt es inzwischen ein Konto. Bitte laden Sie die Seite neu und melden Sie sich mit dessen Passwort an."
          : error
            ? uebersetzeAuthFehler(error.message)
            : "Konto konnte nicht angelegt werden. Bitte versuchen Sie es erneut.",
      };
    }
    userId = created.user.id;
  }

  // Beitritt (idempotent) + Einladung als akzeptiert markieren — beim neuen Konto VOR dem
  // Einloggen: scheitert das Einloggen, ist die Person trotzdem im Team und kann sich normal
  // anmelden (vorher: Konto ohne Organisation -> „kein Team“, Einladung weiter offen).
  await admin.from("account_members").upsert(
    { account_id: inv.account_id, user_id: userId, role: inv.role },
    { onConflict: "account_id,user_id", ignoreDuplicates: true },
  );
  await admin
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", inv.id);
  sendJoinedEmailLater(inv.email, inv.account_id, inv.role, isNew);

  if (isNew) {
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: inv.email, password });
    if (signErr) return { ok: false, message: "Konto angelegt – bitte melden Sie sich jetzt mit Ihrem neuen Passwort an." };
  }

  // Direkt in der neuen Org landen.
  await supabase.auth.updateUser({ data: { active_account_id: inv.account_id } });
  return { ok: true };
}

/**
 * Formular-Variante von acceptInvite (useActionState, wie Login/Registrierung): funktioniert
 * auch, wenn der Knopf gedrückt wird, bevor die Seite fertig geladen ist — vorher lud ein
 * früher Klick die Seite nur neu und das eingegebene Passwort war weg.
 */
export async function acceptInviteForm(
  _prev: { message?: string },
  formData: FormData,
): Promise<{ message?: string }> {
  const r = await acceptInvite(String(formData.get("token") ?? ""), String(formData.get("password") ?? ""));
  if (!r.ok) return { message: r.message ?? "Beitritt fehlgeschlagen." };
  revalidatePath("/", "layout");
  redirect("/app");
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
  sendJoinedEmailLater(inv.email, inv.account_id, inv.role, false);
  // Direkt in der neuen Org landen.
  await supabase.auth.updateUser({ data: { active_account_id: inv.account_id } });
  return { ok: true };
}

export const revokeInvitation = withUserErrors(async function revokeInvitation(id: string): Promise<void> {
  const { account } = await requireOwner();
  const admin = createAdminClient();
  const { error } = await admin
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("account_id", account.id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings/team");
});

export const removeMember = withUserErrors(async function removeMember(expectedAccountId: string, userId: string) {
  const { account, userId: me, ctx } = await requireOwner();
  assertActiveAccount(expectedAccountId, ctx);
  if (me === userId) throw new UserError("Sie können sich nicht selbst entfernen.");
  const admin = createAdminClient();
  // Letzten Inhaber nicht entfernen -> Konto würde sonst ohne Inhaber verwaisen.
  const { data: owners } = await admin
    .from("account_members")
    .select("user_id")
    .eq("account_id", account.id)
    .eq("role", "owner");
  const list = owners ?? [];
  if (list.some((o) => o.user_id === userId) && list.length <= 1) {
    throw new UserError("Der letzte Inhaber kann nicht entfernt werden.");
  }
  await admin
    .from("account_members")
    .delete()
    .eq("account_id", account.id)
    .eq("user_id", userId);
  // Ihre Steply-Erweiterung verliert damit sofort den Zugang zu diesem Konto.
  await dropRecorderTokens(admin, account.id, userId);
  revalidatePath("/app/settings/team");
});

/**
 * Rolle eines Mitglieds ändern (nur Inhaber). Der letzte Inhaber kann nicht herabgestuft
 * werden (sonst verwaist das Konto) — auch nicht er selbst. Wird jemand Mitarbeiter,
 * verliert seine Erweiterung den Zugang (Mitarbeiter erstellen keine Inhalte).
 */
export const changeMemberRole = withUserErrors(async function changeMemberRole(
  expectedAccountId: string,
  userId: string,
  nextRole: string,
): Promise<void> {
  const { account, ctx } = await requireOwner();
  assertActiveAccount(expectedAccountId, ctx);
  const role = parseRole(nextRole);
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("account_members")
    .select("user_id, role")
    .eq("account_id", account.id);
  const list = rows ?? [];
  const target = list.find((m) => m.user_id === userId);
  if (!target) throw new UserError("Diese Person ist nicht (mehr) im Team.");
  if (target.role === role) return;
  const owners = list.filter((m) => m.role === "owner");
  if (target.role === "owner" && owners.length <= 1) {
    throw new UserError("Der letzte Inhaber kann nicht herabgestuft werden. Machen Sie zuerst jemand anderen zum Inhaber.");
  }
  const { error } = await admin
    .from("account_members")
    .update({ role })
    .eq("account_id", account.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (role === "member") await dropRecorderTokens(admin, account.id, userId);
  revalidatePath("/app/settings/team");
});

/**
 * Einladung neu senden (nur Inhaber): gleicher Empfänger, gleiche Rolle, NEUER Link mit
 * frischer Gültigkeit — der alte Link wird ungültig (inviteMember ersetzt offene Einladungen
 * an dieselbe Adresse). Geht auch für abgelaufene Einladungen.
 */
export async function resendInvitation(id: string): Promise<InviteResult> {
  const owner = await ownerOrRejection();
  if ("message" in owner) return owner;
  const { account } = owner;
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
  fd.set("accountId", account.id); // Einladung gehört nachweislich zu diesem Konto
  return inviteMember(fd);
}

/**
 * Organisation selbst verlassen (jede Rolle). Der letzte Inhaber kann nicht gehen (das
 * Konto verwaiste sonst) — er muss erst jemand anderen zum Inhaber machen. Danach wird die
 * nächste eigene Organisation aktiv; gibt es keine mehr, meldet die App beim nächsten
 * Aufruf sauber ab (requireAccount -> /login?error=kein-team).
 */
export async function leaveTeam(
  expectedAccountId: string,
): Promise<{ ok: true; hasOtherOrg: boolean } | { ok: false; error: string }> {
  const ctx = await requireAccount({ allowMember: true });
  // Org in einem anderen Tab gewechselt: NICHT die jetzt aktive Organisation verlassen —
  // die Seite (und die Abfrage „„A“ verlassen?“) zeigte eine andere.
  const switched = orgSwitchedError(expectedAccountId, ctx);
  if (switched) return { ok: false, error: switched };
  const { account, userId, role, memberships } = ctx;
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
