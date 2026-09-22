/**
 * Einladungen laufen nach INVITE_VALID_DAYS ab (Produktentscheid 22.09.2026): ein alter
 * Link in einem vergessenen Postfach soll nicht ewig Zugang geben. „Neu senden" im Team-Tab
 * erzeugt einen frischen Link. Abgelaufene Einladungen belegen keinen Team-Platz mehr.
 * Grundlage ist created_at (neu senden = neue Zeile mit neuem Zeitstempel).
 */
export const INVITE_VALID_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ablaufzeitpunkt einer Einladung. */
export function inviteExpiresAt(createdAt: string | Date): Date {
  return new Date(new Date(createdAt).getTime() + INVITE_VALID_DAYS * DAY_MS);
}

/** Ältere Einladungen als dieser Zeitpunkt sind abgelaufen (für DB-Filter .gte("created_at", …)). */
export function inviteCutoffIso(now = Date.now()): string {
  return new Date(now - INVITE_VALID_DAYS * DAY_MS).toISOString();
}

export function isInviteExpired(createdAt: string | Date | null | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  return inviteExpiresAt(createdAt).getTime() <= now;
}
