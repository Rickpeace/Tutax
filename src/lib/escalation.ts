// Kontakt/Eskalation im Hilfe-Chat: gemeinsame Prüfregeln für das Speichern
// (settings/eskalation/actions.ts) und die Ausgabe an Besucher (/api/chat).
// Die Werte landen als href im öffentlichen Chat-Widget — deshalb nur http(s)-Links,
// plausible E-Mail-Adressen und Telefonnummern (nie javascript:/data: o. Ä.).

import { t, type HubLang } from "@/lib/i18n-hub";

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

export type EscalationExpert = {
  name?: string;
  expertise?: string;
  calendarUrl?: string;
  email?: string;
  phone?: string;
};
export type EscalationSettings = {
  enabled?: boolean;
  message?: string;
  contactName?: string;
  calendarUrl?: string;
  email?: string;
  phone?: string;
  experts?: EscalationExpert[];
};
export type EscalationMethod = { type: "calendar" | "email" | "phone"; label: string; value: string };
export type EscalationBox = { message: string; methods: EscalationMethod[] };

export const DEFAULT_ESCALATION_MESSAGE = t("de", "escDefaultMessage");

/**
 * Kontaktbox, die der Kunde im Chat sieht: gewählte Person (expertIdx) mit ihren
 * Kontaktwegen, fehlende Wege vom allgemeinen Kontakt ergänzt. null = nichts anzeigen
 * (ausgeschaltet oder kein gültiger Kontaktweg). EINE Quelle für /api/chat UND die
 * Vorschau auf der Einstellungsseite (dort immer Deutsch = Default).
 * Feste Bausteine in der Sprache der Hilfe-Seite; ein eigener Text des Kunden bleibt,
 * wie er ihn geschrieben hat.
 */
export function buildEscalationBox(
  esc: EscalationSettings,
  expertIdx: number | null | undefined,
  accountName: string,
  lang: HubLang = "de",
): EscalationBox | null {
  if (!esc.enabled) return null;
  const experts = Array.isArray(esc.experts) ? esc.experts : [];
  const p = typeof expertIdx === "number" ? experts[expertIdx] : undefined;
  // Nur sichere Werte ausliefern (landen als href im Widget) — auch für Altdaten.
  const calendarUrl = safeHttpUrl(p?.calendarUrl) ?? safeHttpUrl(esc.calendarUrl);
  const email = safeEmail(p?.email) ?? safeEmail(esc.email);
  const phone = safePhone(p?.phone) ?? safePhone(esc.phone);
  const name = p?.name || esc.contactName || accountName;
  // Eingetragener Name („Name oder Team“ bzw. Fachperson) auch an E-Mail/Telefon — bisher
  // erschien er nur zusammen mit einem Termin-Link (Audit 24.09.). Der bloße Organisations-
  // name wird dort nicht wiederholt (steht ohnehin über dem ganzen Chat), und mit Termin-Link
  // steht der Name schon dort — nicht doppelt.
  const who = (p?.name || esc.contactName || "").trim();
  const withWho = (v: string) => (who && !calendarUrl ? `${who} · ${v}` : v);
  const methods: EscalationMethod[] = [];
  if (calendarUrl)
    methods.push({
      type: "calendar",
      label: name ? t(lang, "escBookWith", { name }) : t(lang, "escBook"),
      value: calendarUrl,
    });
  if (email) methods.push({ type: "email", label: withWho(email), value: `mailto:${email}` });
  if (phone) methods.push({ type: "phone", label: withWho(phone), value: `tel:${phone}` });
  if (!methods.length) return null;
  const base = esc.message || t(lang, "escDefaultMessage");
  const message = p?.name
    ? `${base} ${t(lang, "escRightPerson", { person: `${p.name}${p.expertise ? ` (${p.expertise})` : ""}` })}`
    : base;
  return { message, methods };
}
