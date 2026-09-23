import type { Step } from "@/lib/types";

/**
 * Schritt für die ÖFFENTLICHE Hilfe-Seite zuschneiden, bevor er an eine Client-Komponente
 * geht (landet sonst komplett im HTML/RSC-Payload jeder öffentlichen Seite).
 *
 * Nur was der Player zum Anzeigen braucht. Aufnahme-Metadaten bleiben serverseitig:
 * page_url (volle Adresse inkl. Query — kann Mandanten-IDs/Tokens enthalten), selector
 * (Text des geklickten Elements), condition/jump/interaction (Automationen), video_time,
 * audio_hash und alle künftigen Spalten (z. B. Dateinamen von Up-/Downloads).
 */
export function toPublicStep(s: Step): Step {
  return {
    id: s.id,
    tutorial_id: s.tutorial_id,
    chapter_id: null,
    title: s.title,
    body: s.body,
    image_path: s.image_path,
    image_width: s.image_width,
    image_height: s.image_height,
    highlights: s.highlights,
    page_url: null,
    selector: null,
    condition: null,
    jump: null,
    interaction: null,
    position: s.position,
    is_decision: s.is_decision,
    video_time: null,
    audio_path: s.audio_path,
    audio_hash: null,
    created_at: s.created_at,
  };
}
