import { redirect } from "next/navigation";

// Welle 50c: Einstellungen neu sortiert. „Branding“ heißt jetzt „Aussehen“ (Name → Allgemein, Adresse → Teilen, Sprachen → eigene Seite).
// Alte URL bleibt als Weiterleitung erhalten (Links aus E-Mails, Extension, Doku).
export default function BrandingRedirect() {
  redirect("/app/settings/aussehen");
}
