import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  accountForRecorderToken,
  recorderJson,
  recorderPreflight,
  VIDEO_BUCKET,
} from "@/lib/recorder";
import {
  PLAN_LIMIT_CODE,
  videoQuotaErrorFor,
} from "@/lib/tutorial-quota";

// Steply-Recorder-Direkt-Upload, Schritt 1: Handshake.
// Die Extension schickt ihren Verbindungs-Token; wir prüfen ihn (Admin-Client, keine
// Session — die Extension ruft cross-origin), erzeugen einen Storage-Pfad im privaten
// Bucket und geben eine SIGNIERTE Upload-URL zurück. Das Video wandert damit direkt
// von der Extension nach Supabase Storage — NIE durch unsere Vercel-Route (dort gilt
// ein ~4,5-MB-Body-Limit). CORS-Begründung: siehe src/lib/recorder.ts.

export async function OPTIONS() {
  return recorderPreflight();
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const account = await accountForRecorderToken((body as { token?: unknown })?.token);
  if (!account) {
    return recorderJson({ error: "Ungültiger oder unbekannter Verbindungs-Token." }, 401);
  }

  const admin = createAdminClient();
  // Free-Limit VOR dem Video-Upload (sonst lädt die Erweiterung das ganze Video hoch, und erst
  // complete lehnt ab). complete + Worker prüfen zusätzlich.
  // Kostenlos zusätzlich: höchstens FREE_VIDEO_LIMIT Anleitungen aus Video.
  const quotaErr = await videoQuotaErrorFor(admin, account.id);
  if (quotaErr) return recorderJson({ error: quotaErr, code: PLAN_LIMIT_CODE }, 403);

  const path = `${account.id}/${crypto.randomUUID()}.webm`;
  const { data, error } = await admin.storage
    .from(VIDEO_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data?.signedUrl || !data?.token) {
    return recorderJson({ error: "Upload-URL konnte nicht erstellt werden." }, 500);
  }

  // uploadUrl = vollständige signierte URL (PUT); token = Upload-Token (für
  // uploadToSignedUrl, falls die Extension die SDK-Variante nutzt). path + accountName
  // braucht die Extension für den complete-Call bzw. die Erfolgsmeldung.
  return recorderJson({
    uploadUrl: data.signedUrl,
    token: data.token,
    path,
    accountName: account.name,
  });
}
