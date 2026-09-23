/**
 * Speicherpfade aus der Datenbank absichern (Sicherheitsprüfung 23.09.2026).
 *
 * Pfad-Spalten wie `themes.logo_path`, `steps.image_path` oder `steps.audio_path` können
 * Inhaber/Bearbeiter per REST selbst beschreiben. Der Server löscht/kopiert Dateien aber mit
 * dem ADMIN-Client (ohne Storage-RLS). Ohne Prüfung ließe sich so ein fremder Pfad
 * (`<fremdes-konto>/…`) eintragen und vom Server löschen oder veröffentlichen lassen.
 *
 * Regel: Nur Pfade im Ordner des Kontos, dem die DATENBANK-ZEILE gehört (nie aus dem Pfad
 * abgeleitet), werden angefasst — sonst still überspringen.
 *
 * Bewusst ohne Imports → auch aus Test-Skripten ladbar (node --experimental-strip-types).
 */
export function isAccountStoragePath(
  accountId: string | null | undefined,
  path: string | null | undefined,
  subdirs?: string[],
): boolean {
  if (!accountId || typeof path !== "string" || !path) return false;
  // Keine Pfad-Tricks: „..“, Backslashes, doppelte/führende Slashes, Steuerzeichen.
  if (path.includes("..") || path.includes("\\") || path.includes("//") || path.startsWith("/")) return false;
  if (/[\x00-\x1f\x7f]/.test(path)) return false;
  const prefixes = subdirs?.length ? subdirs.map((d) => `${accountId}/${d}/`) : [`${accountId}/`];
  return prefixes.some((p) => path.startsWith(p) && path.length > p.length);
}
