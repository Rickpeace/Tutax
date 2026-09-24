/**
 * Name der Organisation für ÖFFENTLICHE Seiten. Ohne eigenen Namen legt die Registrierung die
 * E-Mail-Adresse als Namen an — die stand dann im Kopf und im Titel der Hilfe-Seite (und über die
 * Sitemap bei Suchmaschinen, Runde 4). Eine E-Mail-Adresse wird darum nie öffentlich gezeigt.
 */
export function publicAccountName(name: string | null | undefined): string {
  const n = String(name ?? "").trim();
  if (!n || /\S+@\S+\.\S+/.test(n)) return "Hilfe-Center";
  return n;
}
