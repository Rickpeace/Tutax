/**
 * Team-Rollen (Migration 0037). Eine Quelle für Werte, Anzeigenamen und Rechte.
 *  - owner  „Inhaber"     — alles, inkl. Team verwalten
 *  - editor „Bearbeiter"  — Anleitungen, Wissen, Automationen, Erweiterung, Einstellungen
 *  - member „Mitarbeiter" — nur Schulungen ansehen/abschließen
 * Durchgesetzt in der DB (restriktive RLS-Policies) UND in der App (requireAccount lässt
 * Mitarbeiter standardmäßig nicht durch — nur ausdrücklich freigegebene Seiten).
 */
export type Role = "owner" | "editor" | "member";

export const ROLES: readonly Role[] = ["owner", "editor", "member"] as const;

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Inhaber",
  editor: "Bearbeiter",
  member: "Mitarbeiter",
};

/** Kurzbeschreibung für Einladen/Rolle ändern. */
export const ROLE_HINT: Record<Role, string> = {
  owner: "Alles, inkl. Team verwalten",
  editor: "Anleitungen, Wissen, Automationen & Einstellungen",
  member: "Nur Schulungen ansehen und abschließen",
};

/** Unbekannte/alte Werte gelten als die schwächste Rolle (sicherer Standard). */
export function asRole(value: unknown): Role {
  return value === "owner" || value === "editor" ? value : "member";
}

/** Darf Inhalte und Einstellungen bearbeiten (Inhaber, Bearbeiter). */
export function canEdit(role: Role): boolean {
  return role === "owner" || role === "editor";
}

/** Wohin Mitarbeiter geleitet werden, wenn sie eine gesperrte Seite öffnen. */
export const MEMBER_HOME = "/app/lernen";
