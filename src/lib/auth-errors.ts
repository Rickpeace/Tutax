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
  // „User already registered“ (Registrierung) bzw. „A user with this email address has already
  // been registered“ (E-Mail-Wechsel im Profil, Code email_exists).
  if (m.includes("user already registered") || m.includes("already been registered") || m.includes("email_exists"))
    return "Für diese E-Mail existiert bereits ein Konto.";
  // „For security purposes, you can only request this after 25 seconds.“ (zweiter Anmelde-Link zu
  // schnell, Runde 5) — kam roh auf Englisch an.
  if (m.includes("security purposes") || m.includes("only request this after"))
    return "Aus Sicherheitsgründen können Sie erst in einigen Sekunden einen neuen Link anfordern.";
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
