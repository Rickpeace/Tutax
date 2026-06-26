import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "tutorial-images";

/**
 * Komprimiert ein Bild zu WebP (max ~1600px) und lädt es via Signed Upload
 * URL in den privaten Bucket. Liefert Pfad + Maße (für relative Highlights).
 */
export async function compressAndUpload(
  file: File,
  tutorialId: string,
  stepId: string,
): Promise<{ path: string; width: number; height: number }> {
  const webp = await imageCompression(file, {
    maxWidthOrHeight: 1600,
    maxSizeMB: 1,
    fileType: "image/webp",
    useWebWorker: true,
  });

  const { width, height } = await readImageSize(webp);

  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tutorialId, stepId }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? "Upload-URL fehlgeschlagen");
  }
  const { path, token } = (await res.json()) as { path: string; token: string };

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(path, token, webp, { contentType: "image/webp" });
  if (error) throw new Error(error.message);

  return { path, width, height };
}

/** Signierte Anzeige-URL (kurzlebig) für den privaten Bucket. */
export async function signedImageUrl(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

function readImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht gelesen werden"));
    };
    img.src = url;
  });
}
