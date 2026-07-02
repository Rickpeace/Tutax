// Tarif-Logik. Bewusst simpel: Gating liest NUR accounts.plan — wie der Wert
// gesetzt wurde (manuell vom Plattform-Admin oder später via LemonSqueezy-Webhook),
// ist für die Feature-Prüfung egal. So kann Richard Kunden Vollzugriff geben,
// bevor es einen Zahlungsanbieter gibt.
//
// Stufen: free < pro < business.
//  - free: 1 Hilfe-Seite, bis FREE_TUTORIAL_LIMIT Tutorials, voller Builder.
//  - pro: unbegrenzt + Chatbot/Wissen + manuelles Branding + Insights.
//  - business: + KI-CI, Mehrsprachigkeit, Vorlesen (TTS), interne Schulungen.

export const FREE_TUTORIAL_LIMIT = 5;

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
  "Dieses Feature ist im Business-Tarif enthalten. Upgrade unter Einstellungen → Abo.";
