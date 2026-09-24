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
  // Keine Pfad-Tricks („..“, „%2e%2e“, Backslashes, doppelte/führende Slashes, Steuerzeichen).
  if (!isSafeStorageKey(path)) return false;
  const prefixes = subdirs?.length ? subdirs.map((d) => `${accountId}/${d}/`) : [`${accountId}/`];
  return prefixes.some((p) => path.startsWith(p) && path.length > p.length);
}

/**
 * Nur „harmlose“ Speicher-Schlüssel: Buchstaben, Ziffern, `.`, `_`, `-` und `/` als Trenner, kein
 * Abschnitt `.`/`..`, keine leeren Abschnitte. Sicherheitsprüfung Runde 4 (24.09.2026): Supabase-
 * Storage dekodiert beim DOWNLOAD Prozent-Kodierung — `<konto>/%2e%2e/<fremd>/…` lief an der alten
 * „..“-Prüfung vorbei, und das Veröffentlichen kopierte fremde private Bilder öffentlich. Alle
 * echten Pfade (UUIDs, Zeitstempel, Endungen) bestehen nur aus diesen Zeichen.
 */
export function isSafeStorageKey(path: string | null | undefined): boolean {
  if (typeof path !== "string" || !path || path.length > 512) return false;
  if (!/^[A-Za-z0-9._/-]+$/.test(path)) return false;
  return path.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}
