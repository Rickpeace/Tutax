import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { burnBlur, hasBlur } from "@/lib/redact";
import type { Highlight } from "@/lib/types";

/**
 * Bilder für Schulungen (/app/lernen): „verpixelt bleibt verpixelt".
 *
 * Vorher bekamen Schulungen signierte URLs auf das ORIGINAL im privaten Bucket; die
 * Verpixelung lag nur als Filter darüber (Bild-URL öffnen = Klartext). Jetzt wird für
 * Schritte mit Verpixelung eine Kopie mit EINGEBRANNTER Verpixelung erzeugt (dieselbe
 * Pixelierung wie für die Hilfe-Seite, lib/redact.ts) und nur diese signiert.
 *
 * Inhalts-adressiert: Pfad = Hash aus Bildpfad + Verpixelungs-Koordinaten. Ändert sich die
 * Verpixelung, entsteht eine neue Kopie; unverändert wird die vorhandene wiederverwendet.
 * Liegt im privaten Bucket unter dem Konto-Ordner (Mitarbeiter haben dort keinen
 * Lesezugriff, Migration 0039 — sie sehen nur diese signierten Kopien).
 *
 * Scheitert das Einbrennen, gibt es für den Schritt KEIN Bild (nie das Original).
 */
const BUCKET = "tutorial-images";
const SIGN_SECONDS = 3600;

type StepImage = { id: string; image_path: string | null; highlights: unknown };

function blurKey(highlights: unknown): string {
  const blurs = (Array.isArray(highlights) ? (highlights as Highlight[]) : []).filter(
    (h) => h && typeof h === "object" && h.type === "blur",
  );
  return blurs
    .map((h) => [h.x, h.y, h.w, h.h].map((v) => Math.round((Number(v) || 0) * 10000)).join(","))
    .sort()
    .join(";");
}

function redactedPath(accountId: string, imagePath: string, highlights: unknown): string {
  const hash = createHash("sha256").update(imagePath + "|" + blurKey(highlights)).digest("hex").slice(0, 32);
  return `${accountId}/_verpixelt/${hash}.webp`;
}

async function ensureRedacted(accountId: string, step: StepImage): Promise<string | null> {
  const admin = createAdminClient();
  const target = redactedPath(accountId, step.image_path!, step.highlights);
  const existing = await admin.storage.from(BUCKET).createSignedUrl(target, SIGN_SECONDS);
  if (existing.data?.signedUrl) return existing.data.signedUrl;
  try {
    const { data: blob, error } = await admin.storage.from(BUCKET).download(step.image_path!);
    if (error || !blob) return null;
    const burned = await burnBlur(Buffer.from(await blob.arrayBuffer()), step.highlights);
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(target, burned, { upsert: true, contentType: "image/webp" });
    if (upErr) return null;
    const signed = await admin.storage.from(BUCKET).createSignedUrl(target, SIGN_SECONDS);
    return signed.data?.signedUrl ?? null;
  } catch (e) {
    console.error("Schulungs-Bild nicht verpixelt (ausgelassen):", e instanceof Error ? e.message : e);
    return null;
  }
}

/** stepId -> signierte Bild-URL. Mit Verpixelung: eingebrannte Kopie; ohne: das Bild selbst. */
export async function trainingImageUrls(accountId: string, steps: StepImage[]): Promise<Record<string, string>> {
  const admin = createAdminClient();
  const withImage = steps.filter((s) => s.image_path);
  const urls = await Promise.all(
    withImage.map(async (s) => {
      if (hasBlur(s.highlights)) return ensureRedacted(accountId, s);
      const { data } = await admin.storage.from(BUCKET).createSignedUrl(s.image_path!, SIGN_SECONDS);
      return data?.signedUrl ?? null;
    }),
  );
  const out: Record<string, string> = {};
  withImage.forEach((s, i) => {
    if (urls[i]) out[s.id] = urls[i]!;
  });
  return out;
}
