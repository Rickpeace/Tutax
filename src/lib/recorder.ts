import "server-only";
import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Gemeinsame Bausteine der Steply-Recorder-Direkt-Upload-Routen (/api/recorder/*).
//
// AUTH-MODELL: Die Browser-Extension ruft diese Routen CROSS-ORIGIN auf (sie läuft
// auf der Kunden-Website, nicht auf unserer Domain). Cookie-Auth ist damit unmöglich
// und auch unerwünscht. Stattdessen ein pro-Konto widerrufbarer, hochentropischer
// UUID-Token (recorder_tokens, pro Person + Organisation seit Migration 0037; seit 0041
// mehrere je Person — einer pro Browser/Gerät), den der Nutzer in den Einstellungen erzeugt. Der Token wird via Admin-Client (RLS-Bypass) geprüft.
//
// CORS: Weil kein Cookie/keine Session mitgeschickt wird, ist `Access-Control-Allow-
// Origin: *` unkritisch — es gibt keine ambient authority, die ein fremder Origin
// missbrauchen könnte. Wer den Token hat, darf hochladen; das ist genau das gewollte
// Verhalten. Ohne gültigen Token → 401, unabhängig vom Origin.

export const RECORDER_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// CORS fuer GET /api/recorder/me (Ein-Klick-Pairing, Welle 25). Der Token reist im
// Authorization-Header (nicht als Cookie/Query) -> „Access-Control-Allow-Headers:
// Authorization" ist noetig, damit der Preflight durchgeht. `Origin: *` bleibt
// unkritisch (dieselbe Begruendung wie oben: keine ambient authority ohne Token).
export const RECORDER_ME_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

/**
 * Token aus einem „Authorization: Bearer <token>"-Header ziehen (Ein-Klick-Pairing).
 * Gibt den rohen Token-String oder "" zurueck (Validierung macht accountForRecorderToken).
 */
export function bearerToken(header: string | null): string {
  if (!header) return "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : "";
}

export const VIDEO_BUCKET = "tutorial-videos";

// JSON-Antwort mit CORS-Headern (die Extension liest Fehlermeldungen aus).
export function recorderJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: RECORDER_CORS });
}

// Preflight: leere 204-Antwort mit CORS.
export function recorderPreflight() {
  return new NextResponse(null, { status: 204, headers: RECORDER_CORS });
}

export type RecorderAccount = {
  id: string;
  name: string;
  slug: string;
  /** Person hinter dem Token (für personenbezogene Kostenbremsen, z. B. KI-Feinschliff). */
  userId: string;
  /** Tarif (free/pro/business) — z. B. damit die Erweiterung Video-Aufnahmen vorab als „ab Pro“ zeigt. */
  plan: string | null;
};

/**
 * Token → Konto. Gibt das Konto zurück oder null (unbekannt/leer/kein String).
 * Nutzt den Admin-Client, weil die Anfrage ohne Session kommt (RLS würde blocken).
 */
export async function accountForRecorderToken(token: unknown): Promise<RecorderAccount | null> {
  if (typeof token !== "string") return null;
  const t = token.trim();
  // UUID-Form vorab prüfen: schützt die uuid-Spalte vor Query-Fehlern bei Müll-Eingaben.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return null;
  const admin = createAdminClient();
  const { data: tok } = await admin
    .from("recorder_tokens")
    .select("account_id, user_id")
    .eq("token", t)
    .maybeSingle();
  if (!tok) return null;
  // Nur solange die Person noch Inhaber/Bearbeiter in dieser Organisation ist (Entfernen/
  // Herabstufen löscht den Token zwar schon — doppelt hält besser).
  const [{ data: member }, { data }] = await Promise.all([
    admin
      .from("account_members")
      .select("role")
      .eq("account_id", tok.account_id)
      .eq("user_id", tok.user_id)
      .maybeSingle(),
    admin.from("accounts").select("id, name, slug, plan").eq("id", tok.account_id).maybeSingle(),
  ]);
  if (!data || !member || (member.role !== "owner" && member.role !== "editor")) return null;
  touchRecorderToken(t);
  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    userId: tok.user_id as string,
    plan: (data.plan as string | null) ?? null,
  };
}

// „Zuletzt genutzt" (Migration 0041) gedrosselt pflegen: höchstens alle 10 Minuten je Token
// — pro Server-Instanz im Speicher UND in der DB (Bedingung auf last_used_at), damit viele
// Instanzen nicht bei jedem Upload-Aufruf schreiben. Fire-and-forget: Fehler (z. B. Spalte
// fehlt, solange 0041 nicht angewendet ist) werden bewusst ignoriert — die Prüfung des
// Tokens hängt nie davon ab.
const TOUCH_EVERY_MS = 10 * 60_000;
const lastTouch = new Map<string, number>();

function touchRecorderToken(token: string) {
  const now = Date.now();
  if (now - (lastTouch.get(token) ?? 0) < TOUCH_EVERY_MS) return;
  lastTouch.set(token, now);
  if (lastTouch.size > 5000) lastTouch.clear(); // Speicher begrenzen (nur eine Drossel)
  const cutoff = new Date(now - TOUCH_EVERY_MS).toISOString();
  const write = async () => {
    try {
      await createAdminClient()
        .from("recorder_tokens")
        .update({ last_used_at: new Date(now).toISOString() })
        .eq("token", token)
        .or(`last_used_at.is.null,last_used_at.lt.${cutoff}`);
    } catch {
      /* egal — nur Anzeige */
    }
  };
  try {
    after(write); // nach der Antwort, ohne sie zu verzögern
  } catch {
    void write(); // außerhalb eines Requests (after nicht verfügbar)
  }
}

/**
 * „Trennen“ in der Erweiterung (Audit 24.09.): genau DIESEN Verbindungs-Token löschen. Wer den
 * Token besitzt, darf ihn auch widerrufen — eine weitere Prüfung (Rolle/Konto) braucht es dafür
 * nicht. Gibt true zurück, wenn ein Eintrag entfernt wurde (false: unbekannt/Müll/Fehler).
 */
export async function revokeRecorderToken(token: unknown): Promise<boolean> {
  if (typeof token !== "string") return false;
  const t = token.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return false;
  const { data, error } = await createAdminClient()
    .from("recorder_tokens")
    .delete()
    .eq("token", t)
    .select("token");
  lastTouch.delete(t);
  return !error && Array.isArray(data) && data.length > 0;
}

// ── Sensible Werte in Aufnahmen (Audit 24.09.) ───────────────────────────────────────────────
// Sicherheitsnetz zur Erkennung in der Erweiterung (content.js, looksSensitiveValue): dieselben
// WERT-Muster — IBAN (mod 97), dt. Steuernummer (12/345/67890 bzw. 13 Ziffern), Steuer-ID
// (11 Ziffern), SV-Nummer, Krankenversichertennummer, Kreditkarte (Luhn). Ältere Erweiterungen
// schickten solche Werte als typed_value mit; sie landeten dann im Schritt-Titel.

function ibanValid(raw: string): boolean {
  const s = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const r = s.slice(4) + s.slice(0, 4);
  let mod = 0;
  for (const ch of r) {
    const v = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) mod = (mod * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return mod === 1;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Enthält der Text eine typische sensible Kennung (IBAN, Steuernummer, …)? */
export function looksSensitiveValue(value: unknown): boolean {
  if (typeof value !== "string" || !value) return false;
  const v = value.slice(0, 2000);
  for (const cand of v.match(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/gi) ?? []) {
    const s = cand.replace(/\s+/g, "");
    for (let n = Math.min(34, s.length); n >= 15; n--) if (ibanValid(s.slice(0, n))) return true;
  }
  // Steuernummer im Länder-Format — nur mit 10–12 Ziffern insgesamt (Aktenzeichen wie
  // „2024/0815/12345“ haben 13 und bleiben stehen; Regressions-Audit 24.09.).
  for (const m of v.match(/(?:^|[^\d/])\d{2,4}\/\d{3,4}\/\d{4,5}(?![\d/])/g) ?? []) {
    const n = m.replace(/\D/g, "").length;
    if (n >= 10 && n <= 12) return true;
  }
  if (/(^|[^A-Z0-9])\d{2}\s?\d{6}\s?[A-Z]\s?\d{2}\s?\d(?![A-Z0-9])/i.test(v)) return true;
  // Krankenversichertennummer: Buchstabe + 9 Ziffern — nur mit gültiger Prüfziffer
  // (Artikel-/Kundennummern wie „K123456789“ bleiben stehen).
  for (const m of v.match(/(?:^|[^A-Z0-9])[A-Z]\d{9}(?![A-Z0-9])/gi) ?? []) {
    if (kvnrValid(m.replace(/[^A-Z0-9]/gi, ""))) return true;
  }
  // Ziffernfolgen: Telefonnummern (+49 …, 0049 …) auslassen; 11 Ziffern nur als gültige
  // Steuer-ID (Prüfziffer), 14–19 mit Luhn = Kartennummer. 13 Ziffern (EAN/ELSTER) nur über
  // die Feld-Beschriftung (SENSITIVE_FIELD_RE), sonst fielen Artikelnummern mit raus.
  const re = /\d(?:[ -]?\d){10,18}/g;
  for (let m = re.exec(v); m; m = re.exec(v)) {
    const d = m[0].replace(/[ -]/g, "");
    const before = v.slice(Math.max(0, m.index - 1), m.index);
    if (before === "+" || d.startsWith("00")) continue;
    if (d.length === 11 && steuerIdValid(d)) return true;
    if (d.length >= 14 && d.length <= 19 && luhnValid(d)) return true;
  }
  return false;
}

/** Steuer-Identifikationsnummer: 11 Ziffern, erste ≠ 0, Prüfziffer nach ISO 7064 (Mod 11,10). */
function steuerIdValid(d: string): boolean {
  if (!/^[1-9]\d{10}$/.test(d)) return false;
  let product = 10;
  for (let i = 0; i < 10; i++) {
    let sum = (Number(d[i]) + product) % 10;
    if (sum === 0) sum = 10;
    product = (sum * 2) % 11;
  }
  let check = 11 - product;
  if (check === 10) check = 0;
  return check === Number(d[10]);
}

/** Krankenversichertennummer (Buchstabe + 8 Ziffern + Prüfziffer), Gewichte 1-2 im Wechsel. */
function kvnrValid(s: string): boolean {
  if (!/^[A-Z]\d{9}$/i.test(s)) return false;
  const pos = s.toUpperCase().charCodeAt(0) - 64;
  const digits = String(pos).padStart(2, "0") + s.slice(1, 9);
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let p = Number(digits[i]) * (i % 2 === 0 ? 1 : 2);
    if (p > 9) p -= 9;
    sum += p;
  }
  return sum % 10 === Number(s[9]);
}

// Beschriftungen, bei denen ein Eingabewert nie in Titel/Text gehört (ergänzt die Liste in
// lib/guide.ts um Steuer-/Personal-Kennungen, Audit 24.09.).
const SENSITIVE_FIELD_RE =
  /(steuer[-_ ]?(nummer|nr|id|identifikations)|steueridentifikations|identifikationsnummer|ust[-_ .]?id|umsatzsteuer[-_ ]?id|tax[-_ ]?(id|number)|sozialversicherungs|rentenversicherungs|krankenversicherungs|versicherten[-_ ]?(nummer|nr)|social[-_ ]?security|geburtsdatum|date[-_ ]?of[-_ ]?birth|birth[-_ ]?date|personalausweis|ausweis[-_ ]?(nummer|nr)|reisepass|pass[-_ ]?(nummer|nr)|passport|pin[-_ ]?code|tan[-_ ]?(nummer|nr|code))/i;
const SENSITIVE_FIELD_WORD_RE =
  /(^|[^a-z0-9äöüß])(pin|tan|puk|idnr|ssn|sv[-_ .]?(nummer|nr)|rv[-_ .]?(nummer|nr)|kv[-_ .]?(nummer|nr))(?![a-z0-9äöüß])/i;

type ScrubbableStep = {
  label: string;
  /** Seitentitel beim Klick (landet im Erklärtext). */
  title?: string;
  file_meta?: { filename?: string };
  interaction?: { dropLabel?: string; hoverLabel?: string };
  action: string;
  rect: { x: number; y: number; w: number; h: number };
  sensitive?: { x: number; y: number; w: number; h: number }[];
  typed_value?: string;
};

/**
 * Sicherheitsnetz vor dem Speichern (guide-complete): sensible Eingabewerte fliegen raus, statt
 * im Titel zu landen, und das Feld bekommt — wie bei der Erkennung in der Erweiterung — einen
 * Verpixelungsvorschlag. Kennungen in einer Beschriftung werden durch „•••“ ersetzt. Ändert die
 * Schritte an Ort und Stelle; gibt die Zahl der bereinigten Schritte zurück.
 */
export function scrubSensitiveGuideSteps(steps: ScrubbableStep[]): number {
  let n = 0;
  for (const s of steps) {
    let hit = false;
    if (
      s.typed_value &&
      (looksSensitiveValue(s.typed_value) ||
        SENSITIVE_FIELD_RE.test(s.label) ||
        SENSITIVE_FIELD_WORD_RE.test(s.label))
    ) {
      delete s.typed_value;
      hit = true;
    }
    // Kennungen auch TEILWEISE in Texten maskieren — Beschriftung, Seitentitel, Dateiname,
    // Ziel-/Hover-Beschriftung (Sicherheits-Audit 24.09.: „Mandant X – Steuernummer 12/345/67890“
    // im Seitentitel und „Steuer-ID 12345678903 X.pdf“ als Dateiname landeten im Klartext).
    const scrubText = (v: string | undefined): string | undefined => {
      if (!v) return v;
      const m = maskSensitive(v);
      if (m !== v) hit = true;
      return m;
    };
    s.label = scrubText(s.label) ?? s.label;
    if (s.title) s.title = scrubText(s.title);
    if (s.file_meta?.filename) s.file_meta.filename = scrubText(s.file_meta.filename);
    if (s.interaction?.dropLabel) s.interaction.dropLabel = scrubText(s.interaction.dropLabel);
    if (s.interaction?.hoverLabel) s.interaction.hoverLabel = scrubText(s.interaction.hoverLabel);
    if (!hit) continue;
    n++;
    // Eingabe-Schritt: das Klick-Rechteck IST das Feld → als Verpixelungsvorschlag ergänzen.
    const r = s.rect;
    if (s.action === "type" && r && r.w > 0 && r.h > 0) {
      const list = s.sensitive ?? [];
      const dup = list.some((q) => Math.abs(q.x - r.x) < 0.002 && Math.abs(q.y - r.y) < 0.002);
      if (!dup && list.length < 10) s.sensitive = [...list, { x: r.x, y: r.y, w: r.w, h: r.h }];
    }
  }
  return n;
}

/** Kennungen in einem Text durch „•••“ ersetzen (jeder Kandidat einzeln geprüft). */
function maskSensitive(text: string): string {
  const mask = (m: string) => (looksSensitiveValue(m) ? "•••" : m);
  return text
    .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/gi, mask)
    .replace(/\d{2,4}\/\d{3,4}\/\d{4,5}/g, mask)
    .replace(/\b\d{2}\s?\d{6}\s?[A-Z]\s?\d{2}\s?\d\b/gi, mask)
    .replace(/\b[A-Z]\d{9}\b/gi, mask)
    .replace(/\d(?:[ -]?\d){10,18}/g, mask);
}

export type RecorderConnection = {
  /** Öffentliche Kennung (null, solange Migration 0041 fehlt). Der Token selbst NIE. */
  id: string | null;
  label: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
};

/** Verbundene Browser einer Person in einem Konto (neueste zuerst). Nur Server. */
export async function listRecorderConnections(accountId: string, userId: string): Promise<RecorderConnection[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("recorder_tokens")
    .select("id, label, created_at, last_used_at")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (!error) {
    return (data ?? []).map((r) => ({
      id: r.id as string,
      label: (r.label as string | null) ?? null,
      createdAt: (r.created_at as string | null) ?? null,
      lastUsedAt: (r.last_used_at as string | null) ?? null,
    }));
  }
  // Vor Migration 0041 (Spalten fehlen): höchstens eine Verbindung, ohne Trennen-Kennung.
  const legacy = await admin
    .from("recorder_tokens")
    .select("created_at")
    .eq("account_id", accountId)
    .eq("user_id", userId);
  return (legacy.data ?? []).map((r) => ({
    id: null,
    label: null,
    createdAt: (r.created_at as string | null) ?? null,
    lastUsedAt: null,
  }));
}
