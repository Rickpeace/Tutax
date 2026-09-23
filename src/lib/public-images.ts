// Öffentliche Bild-Kopien (Bucket `tutorial-images-public`) — EINE Stelle für Neuaufbau und
// Aufräumen (Sicherheitsprüfung Welle 51, H1/H2/M1/M4):
//  - Neuaufbau brennt die Verpixelungen ALLER Schritte mit diesem Bild ein; scheitert irgendetwas,
//    wird die öffentliche Kopie ENTFERNT (lieber ein fehlendes Bild als Klartext) und der Fehler
//    weitergereicht, damit die Oberfläche „nicht gespeichert“ zeigt.
//  - Aufräumen entfernt Kopien nur, wenn kein ANDERER veröffentlichter, öffentlicher Schritt den
//    Pfad noch nutzt (Duplikate / „Bild in neuen Schritt übernehmen“ teilen Pfade).
//  - Kurzes Cache-Control, damit eine nachträglich verpixelte Fassung schnell ankommt.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { burnBlur, unionBlurs } from "@/lib/redact";
import { isAccountStoragePath } from "@/lib/storage-path";

export const PUBLIC_IMAGE_BUCKET = "tutorial-images-public";
const PRIVATE_IMAGE_BUCKET = "tutorial-images";
const PUBLIC_CACHE_SECONDS = "60";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Welche dieser Pfade nutzt noch ein Schritt einer VERÖFFENTLICHTEN, ÖFFENTLICHEN Anleitung —
 * außer den ausgenommenen Schritten bzw. der ausgenommenen Anleitung?
 */
export async function pathsStillPublic(
  admin: Admin,
  paths: string[],
  opts: { exceptStepIds?: string[]; exceptTutorialId?: string } = {},
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!paths.length) return out;
  const { data, error } = await admin
    .from("steps")
    .select("id, image_path, tutorial_id, tutorials!steps_tutorial_id_fkey!inner(status, visibility)")
    .in("image_path", paths)
    .eq("tutorials.status", "published")
    .eq("tutorials.visibility", "public");
  // Im Zweifel (Abfrage gescheitert) NICHTS als „noch genutzt“ werten wäre riskant für die
  // Verfügbarkeit, aber sicher für den Datenschutz — genau das wollen wir beim Aufräumen.
  if (error || !data) return out;
  const except = new Set(opts.exceptStepIds ?? []);
  for (const s of data as { id: string; image_path: string | null; tutorial_id: string }[]) {
    if (!s.image_path || except.has(s.id)) continue;
    if (opts.exceptTutorialId && s.tutorial_id === opts.exceptTutorialId) continue;
    out.add(s.image_path);
  }
  return out;
}

/**
 * Öffentliche Kopien entfernen, die kein anderer veröffentlichter Schritt mehr braucht.
 * `accountId` = Konto der Anleitung (aus der DB-Zeile): nur Pfade in DESSEN Ordner werden
 * gelöscht — `steps.image_path` ist per REST beschreibbar, ein fremder Pfad darf nie mit dem
 * Admin-Client gelöscht werden (Sicherheitsprüfung 23.09.2026). Vorlagen (null) → nichts.
 */
export async function removeUnusedPublicCopies(
  paths: (string | null | undefined)[],
  opts: { accountId: string | null | undefined; exceptStepIds?: string[]; exceptTutorialId?: string },
): Promise<void> {
  const unique = [...new Set(paths.filter((p): p is string => isAccountStoragePath(opts.accountId, p)))];
  if (!unique.length) return;
  const admin = createAdminClient();
  const stillUsed = await pathsStillPublic(admin, unique, opts);
  const remove = unique.filter((p) => !stillUsed.has(p));
  if (remove.length) await admin.storage.from(PUBLIC_IMAGE_BUCKET).remove(remove);
}

/**
 * Öffentliche Kopie EINES Bildpfads neu erzeugen (Vereinigung aller Verpixelungen der Schritte
 * mit diesem Pfad eingebrannt). Scheitert Download, Einbrennen oder Upload: Kopie entfernen und
 * werfen — nie still das alte (evtl. unverpixelte) Bild stehen lassen.
 * `accountId` = Konto der Anleitung (aus der DB-Zeile): ein fremder Pfad wird weder gelesen
 * noch veröffentlicht noch gelöscht (Sicherheitsprüfung 23.09.2026).
 */
export async function rebuildPublicCopy(path: string, accountId: string | null | undefined): Promise<void> {
  if (!isAccountStoragePath(accountId, path)) {
    console.warn("Öffentliche Bildkopie übersprungen: Pfad liegt nicht im Ordner des Kontos.");
    return;
  }
  const admin = createAdminClient();
  try {
    const { data: blob, error: dlErr } = await admin.storage.from(PRIVATE_IMAGE_BUCKET).download(path);
    if (dlErr || !blob) throw new Error("Bild nicht ladbar");
    const { data: sharing, error: shErr } = await admin
      .from("steps")
      .select("highlights")
      .eq("image_path", path);
    if (shErr) throw new Error("Markierungen nicht ladbar");
    let buf: Buffer = Buffer.from(await blob.arrayBuffer());
    const blurs = unionBlurs((sharing ?? []).map((s) => s.highlights));
    if (blurs.length) buf = await burnBlur(buf, blurs);
    const { error: upErr } = await admin.storage
      .from(PUBLIC_IMAGE_BUCKET)
      .upload(path, buf, { upsert: true, contentType: "image/webp", cacheControl: PUBLIC_CACHE_SECONDS });
    if (upErr) throw new Error("Hochladen fehlgeschlagen");
  } catch (e) {
    await admin.storage.from(PUBLIC_IMAGE_BUCKET).remove([path]).catch(() => {});
    console.error("Öffentliche Bildkopie entfernt (Neuaufbau fehlgeschlagen):", e instanceof Error ? e.message : e);
    throw new Error("Die Verpixelung konnte nicht veröffentlicht werden – das Bild wurde vorsorglich von der Hilfe-Seite entfernt.");
  }
}

/**
 * Verpixelungen mit kaputten Koordinaten (nicht endlich) — beim Speichern ablehnen.
 * NEGATIVE Breite/Höhe gilt bewusst als gültig („von rechts/unten aufgezogen“): Anzeige
 * (viewer-image) und Einbrennen (redact.normalizeRect) normalisieren sie identisch.
 */
export function hasInvalidBlur(highlights: unknown): boolean {
  if (!Array.isArray(highlights)) return false;
  return highlights.some((h) => {
    if (!h || typeof h !== "object" || (h as { type?: unknown }).type !== "blur") return false;
    const { x, y, w, h: hh } = h as { x?: unknown; y?: unknown; w?: unknown; h?: unknown };
    return [x, y, w, hh].some((v) => typeof v !== "number" || !Number.isFinite(v));
  });
}
