/**
 * Anzeigename eines Nutzers aus den Auth-Metadaten (falls gepflegt, z. B. über
 * „Mein Profil“). Gibt null zurück, wenn kein Name hinterlegt ist — Aufrufer fallen
 * dann auf die E-Mail zurück. Liest bewusst mehrere übliche Schlüssel, damit ein
 * später gewählter Name (full_name/name/display_name) ohne Code-Änderung greift.
 */
export function userDisplayName(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  for (const key of ["full_name", "name", "display_name"]) {
    const v = m[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}
