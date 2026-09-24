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
  // Hohe Ganzseiten-Screenshots nicht über die LANGE Seite auf 1600 px drücken — ein
  // 1400×12000-Bild wurde 186 px breit und unlesbar (Grenzfall-Audit 24.09.). Bei hohen Bildern
  // bestimmt die Breite (max. 1600), die Höhe darf bis 4800 px gehen.
  const orig = await readImageSize(file);
  const tall = orig.height > orig.width;
  const longSide = tall
    ? Math.min(4800, Math.max(1600, Math.round(orig.height * Math.min(1, 1600 / Math.max(1, orig.width)))))
    : 1600;
  const webp = await imageCompression(file, {
    maxWidthOrHeight: longSide,
    maxSizeMB: longSide > 1600 ? 2 : 1,
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
