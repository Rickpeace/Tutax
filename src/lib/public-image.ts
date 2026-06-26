const PUBLIC_BUCKET = "tutorial-images-public";

/** Öffentliche CDN-URL für ein veröffentlichtes Bild (kein Signieren nötig). */
export function publicImageUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`;
}
