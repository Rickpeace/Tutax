import { redirect } from "next/navigation";

// Welle 50c: Einstellungen neu sortiert. „Konto“ heißt jetzt „Mein Profil“ (Einrichtung/Löschen → Allgemein).
// Alte URL bleibt als Weiterleitung erhalten (Links aus E-Mails, Extension, Doku).
export default function KontoRedirect() {
  redirect("/app/settings/profil");
}
