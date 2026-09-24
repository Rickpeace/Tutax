import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Account } from "@/lib/types";
import { asRole, canEdit, MEMBER_HOME, type Role } from "@/lib/roles";
import { UserError } from "@/lib/action-error";

export type Membership = { id: string; name: string; role: string };

/**
 * Aktueller Auth-User – pro Request via React cache() dedupliziert. getUser() ist eine
 * Netzwerk-Verifikation; ohne Dedup lief sie mehrfach pro Navigation (Layout + Seite +
 * Admin-Check). Jetzt genau EINMAL pro Request.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

type AccountContext = {
  userId: string;
  email: string | null;
  account: Account;
  memberships: Membership[];
  /** Rolle im AKTIVEN Konto. */
  role: Role;
};

/**
 * Lädt den aktuellen User + sein AKTIVES Konto. Ein Nutzer kann mehreren
 * Organisationen angehören (eigene + per Einladung beigetretene). Das aktive Konto
 * kommt aus den User-Metadaten `active_account_id` (falls Mitglied) — geräteübergreifend
 * gemerkt —, sonst das erste. /login wenn nicht angemeldet; /logout, wenn ganz ohne Org.
 */
const loadAccount = cache(async (): Promise<AccountContext> => {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("account_members")
    .select("account_id, role, accounts(*)")
    .eq("user_id", user.id);

  const valid = (rows ?? [])
    .map((r) => {
      const acc = (Array.isArray(r.accounts) ? r.accounts[0] : r.accounts) as Account | undefined;
      return acc ? { role: r.role as string, accounts: acc } : null;
    })
    .filter((x): x is { role: string; accounts: Account } => x !== null);
  if (!valid.length) {
    // Eingeloggt, aber keiner Organisation zugeordnet (z. B. aus dem Team entfernt) ->
    // sauber ausloggen (kein Loop) und auf der Anmeldeseite erklären, warum.
    redirect("/logout?next=" + encodeURIComponent("/login?error=kein-team"));
  }

  const activeId = (user.user_metadata as { active_account_id?: string } | null)?.active_account_id;
  const active = valid.find((r) => r.accounts.id === activeId) ?? valid[0];

  // Stale active_account_id (nicht mehr Mitglied) best-effort bereinigen. Fire-and-forget +
  // catch: in reinen RSC-Reads sind Cookie-Writes verboten -> dort still verworfen (die
  // Metadaten-Aktualisierung persistiert serverseitig trotzdem); in Actions greift sie.
  if (activeId && activeId !== active.accounts.id) {
    void supabase.auth.updateUser({ data: { active_account_id: active.accounts.id } }).catch(() => {});
  }

  const memberships: Membership[] = valid.map((r) => ({ id: r.accounts.id, name: r.accounts.name, role: r.role }));

  return {
    userId: user.id,
    email: user.email ?? null,
    account: active.accounts,
    memberships,
    role: asRole(active.role),
  };
});

/**
 * Aktueller User + aktives Konto + Rolle. MITARBEITER (Rolle „member", nur Schulungen)
 * werden standardmäßig abgewiesen -> Schulungen. Sicherer Standard: jede Seite/Aktion ist
 * für Mitarbeiter zu, außer sie ruft ausdrücklich `requireAccount({ allowMember: true })`
 * (Schulungen, Profil, App-Rahmen). So öffnet eine neue Seite nicht versehentlich
 * Schreibrechte — wichtig, weil viele Server-Aktionen den Admin-Client (ohne RLS) nutzen.
 */
export async function requireAccount(opts?: { allowMember?: boolean }): Promise<AccountContext> {
  const ctx = await loadAccount();
  if (!opts?.allowMember && !canEdit(ctx.role)) redirect(MEMBER_HOME);
  return ctx;
}

export const ORG_SWITCHED =
  "Sie haben inzwischen die Organisation gewechselt – bitte laden Sie die Seite neu.";

/**
 * Org-Wechsel in einem anderen Tab: Aktionen schreiben ins AKTIVE Konto (Metadaten), die
 * offene Seite zeigt aber evtl. noch die vorige Organisation. Seiten geben deshalb die
 * angezeigte `account.id` mit; stimmt sie nicht mehr, lehnen die Aktionen ab, statt still in
 * die falsche Organisation zu schreiben. Liefert die Meldung oder null (= passt).
 */
export function orgSwitchedError(expectedAccountId: unknown, ctx: { account: { id: string } }): string | null {
  return typeof expectedAccountId === "string" && expectedAccountId === ctx.account.id ? null : ORG_SWITCHED;
}

/** Wie orgSwitchedError, wirft aber `UserError` (für mit `withUserErrors` exportierte Aktionen). */
export function assertActiveAccount(expectedAccountId: unknown, ctx: { account: { id: string } }): void {
  const err = orgSwitchedError(expectedAccountId, ctx);
  if (err) throw new UserError(err);
}

/**
 * Nur die aktive Konto-ID (ohne Redirect) – für API-Routen. Berücksichtigt
 * `active_account_id` aus den Metadaten (falls Mitglied), sonst die erste Org.
 * Gibt null zurück, wenn nicht angemeldet, ohne Org oder nur Mitarbeiter (die Aufrufer —
 * Logo, Theme-Analyse, Video-Import — schreiben; Mitarbeiter dürfen das nicht).
 */
export const activeAccountId = cache(async (): Promise<{ userId: string; accountId: string } | null> => {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;
  const { data: rows } = await supabase
    .from("account_members")
    .select("account_id, role")
    .eq("user_id", user.id);
  const list = (rows ?? []).filter((r) => r.account_id);
  if (!list.length) return null;
  const activeId = (user.user_metadata as { active_account_id?: string } | null)?.active_account_id;
  const active = list.find((r) => r.account_id === activeId) ?? list[0];
  if (!canEdit(asRole(active.role))) return null;
  return { userId: user.id, accountId: active.account_id as string };
});

/**
 * Editor-Aktionen: Inhaber/Bearbeiter UND die Anleitung gehört zum AKTIVEN Konto.
 * Muss VOR jeder Nebenwirkung laufen: viele Builder-Aktionen räumen mit dem Admin-Client
 * auf (öffentliche Bilder, Vorlese-Audio, Übersetzungs-Flags, KI-Delta-Übersetzung). Nur
 * auf RLS zu vertrauen reichte nicht — ein fremdes oder gesperrtes Update trifft still
 * 0 Zeilen, die Admin-Nebenwirkungen liefen trotzdem (Sicherheitsprüfung 22.09.2026).
 * Admin-Client für den Lookup, damit auch öffentlich lesbare fremde Anleitungen sicher
 * als „nicht gefunden" gelten. Ausnahme: globale Standard-Vorlagen (account_id NULL)
 * bearbeitet der Plattform-Admin im selben Editor.
 */
export async function mayEditTutorialOf(accountId: string | null | undefined, ctx: AccountContext): Promise<boolean> {
  if (accountId && accountId === ctx.account.id) return true;
  if (accountId === null) {
    // is_admin() direkt (lib/admin importiert dieses Modul -> kein Zirkel-Import).
    const { data } = await (await createClient()).rpc("is_admin");
    return data === true;
  }
  return false;
}

export async function requireTutorialAccess(tutorialId: string): Promise<AccountContext> {
  const ctx = await requireAccount();
  const { data } = await createAdminClient()
    .from("tutorials")
    .select("account_id")
    .eq("id", tutorialId)
    .maybeSingle();
  if (!data || !(await mayEditTutorialOf(data.account_id as string | null, ctx))) {
    // Gehört die Anleitung zu einer ANDEREN eigenen Organisation, wurde im anderen Tab
    // gewechselt — das sagen statt „nicht gefunden“ (Lebenszyklus-Audit 24.09.).
    if (data?.account_id && ctx.memberships.some((m) => m.id === data.account_id)) {
      throw new UserError(ORG_SWITCHED);
    }
    throw new UserError("Anleitung nicht gefunden.");
  }
  return ctx;
}

/** Wie requireTutorialAccess, für einen Schritt. Liefert zusätzlich dessen tutorialId. */
export async function requireStepAccess(stepId: string): Promise<AccountContext & { tutorialId: string }> {
  const ctx = await requireAccount();
  // Zwei einfache Abfragen statt Embed: steps<->tutorials hat ZWEI Fremdschlüssel
  // (steps.tutorial_id und tutorials.root_step_id) -> ein Embed ist mehrdeutig und scheitert.
  const admin = createAdminClient();
  const { data: step } = await admin.from("steps").select("tutorial_id").eq("id", stepId).maybeSingle();
  const { data: tut } = step
    ? await admin.from("tutorials").select("account_id").eq("id", step.tutorial_id).maybeSingle()
    : { data: null };
  if (!step || !tut || !(await mayEditTutorialOf((tut.account_id as string | null) ?? null, ctx))) {
    // Schritt einer ANDEREN eigenen Organisation: im anderen Tab gewechselt (Runde 4).
    if (tut?.account_id && ctx.memberships.some((m) => m.id === tut.account_id)) throw new UserError(ORG_SWITCHED);
    throw new UserError("Diesen Schritt gibt es nicht mehr – bitte laden Sie die Seite neu.");
  }
  return { ...ctx, tutorialId: step.tutorial_id as string };
}

/** Wie requireStepAccess, für eine Verzweigung (Branch). */
export async function requireBranchAccess(branchId: string): Promise<AccountContext> {
  const { data } = await createAdminClient()
    .from("step_branches")
    .select("step_id")
    .eq("id", branchId)
    .maybeSingle();
  if (!data) {
    await requireAccount();
    throw new Error("Verzweigung nicht gefunden.");
  }
  return requireStepAccess(data.step_id as string);
}
