import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  accountForRecorderToken,
  recorderJson,
  recorderPreflight,
} from "@/lib/recorder";
import { MAX_GUIDE_STEPS } from "@/lib/guide";

// Sofort-Anleitung (Welle 22), Schritt 1: Handshake.
// Die Extension schickt ihren Verbindungs-Token + die Zahl der Screenshots (count).
// Wir prüfen den Token (Admin-Client, keine Session — cross-origin) und erzeugen count
// SIGNIERTE Upload-URLs für den PRIVATEN Bucket „tutorial-images" unter
//   {accountId}/guide-{uuid}/{i}.webp
// Entwurfs-Bilder sind PRIVAT (public entsteht erst beim Veröffentlichen). Die WebPs
// wandern damit direkt von der Extension nach Supabase Storage — NIE durch diese Route.
// CORS-Begründung: siehe src/lib/recorder.ts.

const IMAGE_BUCKET = "tutorial-images";

export async function OPTIONS() {
  return recorderPreflight();
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; count?: unknown };
  const account = await accountForRecorderToken(body?.token);
  if (!account) {
    return recorderJson({ error: "Ungültiger oder unbekannter Verbindungs-Token." }, 401);
  }

  // count: 1..MAX_GUIDE_STEPS. Alles andere → 400.
  const count = body?.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > MAX_GUIDE_STEPS) {
    return recorderJson({ error: `Ungültige Schrittzahl (1..${MAX_GUIDE_STEPS}).` }, 400);
  }

  // Ein gemeinsamer Ordner je Aufnahme, damit die Bilder eines Entwurfs beisammenliegen.
  const folder = `${account.id}/guide-${crypto.randomUUID()}`;
  const admin = createAdminClient();

  const uploads: { path: string; uploadUrl: string; token: string }[] = [];
  for (let i = 0; i < count; i++) {
    const path = `${folder}/${i}.webp`;
    const { data, error } = await admin.storage
      .from(IMAGE_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data?.signedUrl || !data?.token) {
      return recorderJson({ error: "Upload-URLs konnten nicht erstellt werden." }, 500);
    }
    uploads.push({ path, uploadUrl: data.signedUrl, token: data.token });
  }

  return recorderJson({ uploads, accountName: account.name });
}
