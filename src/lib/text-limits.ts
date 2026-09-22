// Höchstlängen frei eingegebener Texte. EINE Quelle für Formular (maxLength) und
// Server-Action (harte Prüfung) — sonst kippt ein 3000-Zeichen-Name das Layout der
// öffentlichen Hilfe-Seite (QA-Befund 09/2026).
// Kategorienamen haben ihre eigene Quelle: lib/category-name.ts (CATEGORY_NAME_MAX).

/** Name der Organisation (Kopf der Hilfe-Seite, Einladungs-Mails). */
export const ORG_NAME_MAX = 80;

/** Titel einer Anleitung (Karten, Suchtreffer, KI-Ausschnitte). */
export const GUIDE_TITLE_MAX = 120;

/** Kurzbeschreibung einer Anleitung (Untertitel auf der Karte). */
export const GUIDE_DESCRIPTION_MAX = 160;

/** Name einer Automation (Liste + Detailseite). */
export const AUTOMATION_TITLE_MAX = 120;

export const tooLongMsg = (what: string, max: number) =>
  `${what} darf höchstens ${max} Zeichen lang sein.`;

export const ORG_NAME_TOO_LONG = tooLongMsg("Der Name", ORG_NAME_MAX);
