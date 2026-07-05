import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Gemeinsame Bausteine der Steply-Recorder-Direkt-Upload-Routen (/api/recorder/*).
//
// AUTH-MODELL: Die Browser-Extension ruft diese Routen CROSS-ORIGIN auf (sie läuft
// auf der Kunden-Website, nicht auf unserer Domain). Cookie-Auth ist damit unmöglich
// und auch unerwünscht. Stattdessen ein pro-Konto widerrufbarer, hochentropischer
// UUID-Token (accounts.recorder_token, Migration 0023), den der Nutzer aus den
// Einstellungen kopiert. Der Token wird via Admin-Client (RLS-Bypass) geprüft.
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

export type RecorderAccount = { id: string; name: string; slug: string };

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
  const { data, error } = await admin
    .from("accounts")
    .select("id, name, slug")
    .eq("recorder_token", t)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id as string, name: data.name as string, slug: data.slug as string };
}
