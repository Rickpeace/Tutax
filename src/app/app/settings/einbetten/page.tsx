import { redirect } from "next/navigation";

// Welle 50c: Einstellungen neu sortiert. „Einbetten“ ist aufgeteilt in „Adresse & Teilen“, „Chat auf Ihrer Website“ und „Steply-Erweiterung“; Ziel ist „Teilen“.
// Alte URL bleibt als Weiterleitung erhalten (Links aus E-Mails, Extension, Doku).
export default function EinbettenRedirect() {
  redirect("/app/settings/teilen");
}
