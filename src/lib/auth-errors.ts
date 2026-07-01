/**
 * Übersetzt rohe (englische) Supabase-Auth-Fehlermeldungen in verständliches Deutsch.
 * Zentral, damit alle Auth-Flächen (Login/Signup/Reset, Konto-Passwort ändern) dieselbe
 * Sprache sprechen. Unbekannte Meldungen werden unverändert durchgereicht.
 */
export function uebersetzeAuthFehler(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "E-Mail oder Passwort ist falsch.";
  if (m.includes("email not confirmed"))
    return "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.";
  if (m.includes("user already registered"))
    return "Für diese E-Mail existiert bereits ein Konto.";
  if (m.includes("rate limit"))
    return "Zu viele Versuche. Bitte warten Sie einen Moment.";
  if (m.includes("same password") || m.includes("should be different"))
    return "Das neue Passwort muss sich vom bisherigen unterscheiden.";
  if (m.includes("password should be at least") || m.includes("at least 6"))
    return "Das Passwort ist zu kurz.";
  if (m.includes("weak password"))
    return "Das Passwort ist zu schwach. Bitte wählen Sie ein sichereres.";
  return msg;
}
