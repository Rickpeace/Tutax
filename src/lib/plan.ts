// Tarif-Logik. Bewusst simpel: Gating liest NUR accounts.plan — wie der Wert
// gesetzt wurde (manuell vom Plattform-Admin oder später via LemonSqueezy-Webhook),
// ist für die Feature-Prüfung egal. So kann Richard Kunden Vollzugriff geben,
// bevor es einen Zahlungsanbieter gibt.

export const FREE_TUTORIAL_LIMIT = 5;

export function isPro(account: { plan?: string | null }): boolean {
  return account?.plan === "pro";
}
