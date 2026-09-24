/**
 * EINE Passwort-Regel für Registrierung, Zurücksetzen und Ändern (Runde 4: acht Leerzeichen
 * wurden überall angenommen). Liefert die Fehlermeldung oder null.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Das Passwort muss mindestens 8 Zeichen haben.";
  if (!password.trim()) return "Das Passwort darf nicht nur aus Leerzeichen bestehen.";
  return null;
}
