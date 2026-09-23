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
    admin.from("accounts").select("id, name, slug").eq("id", tok.account_id).maybeSingle(),
  ]);
  if (!data || !member || (member.role !== "owner" && member.role !== "editor")) return null;
  touchRecorderToken(t);
  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    userId: tok.user_id as string,
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
