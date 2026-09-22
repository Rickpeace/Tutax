// Kontakt/Eskalation im Hilfe-Chat: gemeinsame Prüfregeln für das Speichern
// (settings/eskalation/actions.ts) und die Ausgabe an Besucher (/api/chat).
// Die Werte landen als href im öffentlichen Chat-Widget — deshalb nur http(s)-Links,
// plausible E-Mail-Adressen und Telefonnummern (nie javascript:/data: o. Ä.).

/** http(s)-URL oder null. */
export function safeHttpUrl(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Plausible E-Mail-Adresse oder null (kein Leerzeichen, kein ?/&, genau ein @). */
export function safeEmail(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return /^[^\s@?&/]+@[^\s@?&/]+\.[^\s@?&/]+$/.test(s) ? s : null;
}

/** Telefonnummer (Ziffern, +, Leerzeichen, / ( ) -) oder null. */
export function safePhone(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return /^\+?[0-9 ()/-]{3,30}$/.test(s) && /[0-9]{3}/.test(s.replace(/\D/g, "")) ? s : null;
}
