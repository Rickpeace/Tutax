// Tarif-Logik. Bewusst simpel: Gating liest NUR accounts.plan — wie der Wert
// gesetzt wurde (manuell vom Plattform-Admin oder später via LemonSqueezy-Webhook),
// ist für die Feature-Prüfung egal. So kann Richard Kunden Vollzugriff geben,
// bevor es einen Zahlungsanbieter gibt.
//
// Stufen: free < pro < business.
//  - free: 1 Hilfe-Seite, bis FREE_TUTORIAL_LIMIT Tutorials, voller Builder.
//  - pro: unbegrenzt + Chatbot/Wissen + manuelles Branding + Insights + Team bis 5
//         + Schulungen mit Nachweis (öffentliche Anleitungen zusätzlich „Team“).
//  - business: + KI-CI, Mehrsprachigkeit, Vorlesen (TTS), interne Schulungen.

export const FREE_TUTORIAL_LIMIT = 5;
/**
 * Kostenlos: so viele Anleitungen aus Video. 0 = Video ist Pro (Produktentscheid 23.09.2026:
 * Gratis nutzt keine KI, die Geld kostet — Video = Spracherkennung + Bildanalyse).
 */
export const FREE_VIDEO_LIMIT = 0;

/** Darf das Konto Anleitungen aus Video (KI) erstellen? (Oberfläche; Server: videoQuotaErrorFor) */
export function videoAllowed(account: { plan?: string | null }): boolean {
  return isPro(account) || FREE_VIDEO_LIMIT > 0;
}

export type PlanKey = "free" | "pro" | "business";

/** Pro ODER höher (Business schließt alle Pro-Rechte ein). */
export function isPro(account: { plan?: string | null }): boolean {
  return account?.plan === "pro" || account?.plan === "business";
}

/** Nur die höchste Stufe. */
export function isBusiness(account: { plan?: string | null }): boolean {
  return account?.plan === "business";
}

/** Einheitliche Fehlermeldung für Business-Features. */
export const BUSINESS_REQUIRED =
  "Dieses Feature ist im Business-Tarif enthalten. Upgrade unter Einstellungen → Tarif.";

/** Einheitliche Fehlermeldung für Pro-Features (z. B. Schulungen mit Schulungsnachweis). */
export const PRO_REQUIRED =
  "Dieses Feature ist ab dem Pro-Tarif enthalten. Upgrade unter Einstellungen → Tarif.";

/**
 * Pro-Funktionen laut Tarifseite (lib/pricing.ts), serverseitig durchgesetzt (Produktentscheid
 * 23.09.2026): KI-Assistent + Wissensdatenbank + Chat-Bubble, Insights/Offene Fragen, eigenes
 * Logo & CI-Farben, ohne „Erstellt mit Steply“. Gratis-Konten zeigen auf der Hilfe-Seite die
 * Steply-Standardgestaltung — gespeicherte Werte bleiben erhalten und gelten nach dem Upgrade.
 */
export function brandedTheme<T>(account: { plan?: string | null }, theme: T | null): T | null {
  return isPro(account) ? theme : null;
}

/**
 * Tarif-Prüfung für die Zielgruppe einer Anleitung (setTutorialAudience). Liefert die
 * Fehlermeldung oder null (= erlaubt). Regeln laut Tarifseite (lib/pricing.ts):
 *  - „nur Team“ (publicOn=false → intern) ist Business;
 *  - öffentlich + „Team“ (Schulungen mit Schulungsnachweis) ist Pro — aber nur beim
 *    EINSCHALTEN: was schon Schulung ist (in_lernen oder intern, etwa nach einem Downgrade),
 *    bleibt erlaubt; Abwählen geht immer. Bestehende Daten werden so nie angefasst.
 * Rein und ohne Imports → auch aus Test-Skripten importierbar (node --experimental-strip-types).
 */
export function audienceGateError(
  account: { plan?: string | null },
  current: { visibility: string; in_lernen: boolean | null },
  audience: { publicOn: boolean; lernenOn: boolean },
): string | null {
  if (!audience.publicOn && !isBusiness(account)) return BUSINESS_REQUIRED;
  const alreadyTraining = !!current.in_lernen || current.visibility === "internal";
  if (audience.publicOn && audience.lernenOn && !alreadyTraining && !isPro(account)) {
    return PRO_REQUIRED;
  }
  return null;
}

/**
 * Wie viele Personen (alle Rollen, inkl. offener Einladungen) das Team haben darf.
 * Kostenlos = nur der Inhaber, Pro bis 5, Business unbegrenzt (Produktentscheid 22.09.2026).
 * Bestehende größere Teams werden nicht verkleinert — nur neue Einladungen gesperrt.
 */
export function teamLimit(account: { plan?: string | null }): number {
  if (isBusiness(account)) return Infinity;
  if (isPro(account)) return 5;
  return 1;
}
