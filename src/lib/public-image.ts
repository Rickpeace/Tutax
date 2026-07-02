const PUBLIC_BUCKET = "tutorial-images-public";

/** Öffentliche CDN-URL für eine Datei im public Bucket (kein Signieren nötig). */
export function publicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`;
}

/** Öffentliche CDN-URL für ein veröffentlichtes Bild. */
export function publicImageUrl(path: string): string {
  return publicUrl(path);
}

/** Öffentliche CDN-URL für eine veröffentlichte Vorlese-Audiodatei (Welle 14). */
export function publicAudioUrl(path: string): string {
  return publicUrl(path);
}
