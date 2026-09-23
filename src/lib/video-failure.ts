// Gescheiterte Video-Aufträge (Welle 51) — EINE Quelle für die Klartext-Begründung,
// geteilt von Bibliothek, Glocke und /api/recorder/video-status (Erweiterung).
//
// Der Video-Worker schreibt in video_jobs.error entweder eine schon freundliche deutsche
// Meldung („Video konnte nicht verarbeitet werden (evtl. unvollständige Aufnahme). Bitte
// erneut aufnehmen.“) oder einen gekappten technischen Rohtext. Wir übersetzen beides in
// einen kurzen Grund, der in den Satz „Video „…“ konnte nicht verarbeitet werden – <Grund>.“
// passt — ohne Technik-Jargon und ohne doppeltes „Bitte erneut aufnehmen“.

/** Wie lange ein Fehlschlag als Hinweis sichtbar bleibt (Tage). */
export const FAILED_VIDEO_DAYS = 7;

/** Kurzer Grund in Klartext (kleingeschrieben, ohne Schlusspunkt). */
export function failedVideoReason(error: string | null | undefined): string {
  const e = (error ?? "").trim();
  if (!e) return "der Grund ist unbekannt";
  // Video-Grenze (Worker-Meldung „Im kostenlosen Tarif sind 3 Anleitungen aus Video …“).
  if (/Anleitungen aus Video/i.test(e))
    return "Anleitungen aus Video sind ab Pro enthalten (Einstellungen → Tarif)";
  // Free-Limit (Worker-Meldung „Der kostenlose Tarif erlaubt keine weiteren Anleitungen …“).
  if (/kostenlose Tarif|Tarif-Grenze/i.test(e))
    return "der kostenlose Tarif erlaubt keine weiteren Anleitungen (größeren Tarif unter Einstellungen → Tarif wählen)";
  if (/unvollständig|nicht gelesen|nicht verarbeitet|zu kurz|Command failed|ffmpeg|ffprobe/i.test(e))
    return "die Aufnahme ließ sich nicht lesen (möglicherweise unvollständig oder zu kurz)";
  if (/^Download|not found|Object not found/i.test(e))
    return "die Videodatei war auf dem Server nicht mehr abrufbar";
  if (/OpenAI|rate limit|429|timeout|timed out|ECONN|ETIMEDOUT|fetch failed|\b50[0-4]\b/i.test(e))
    return "der KI-Dienst war vorübergehend nicht erreichbar";
  if (/dauert ungewöhnlich lange/i.test(e)) return "die Verarbeitung hat zu lange gedauert";
  return "bei der Verarbeitung ist ein Fehler aufgetreten";
}

export type FailedVideoJob = {
  id: string;
  /** Anzeige-Titel (Fallback „Bildschirmaufnahme“). */
  title: string;
  /** Klartext-Grund (siehe failedVideoReason). */
  reason: string;
  /** ISO-Zeitpunkt des Fehlschlags (updated_at, sonst created_at). */
  at: string;
};

/** Zeile aus video_jobs → Anzeige-Objekt. */
export function toFailedVideoJob(row: {
  id: string;
  title: string | null;
  error: string | null;
  created_at: string;
  updated_at?: string | null;
}): FailedVideoJob {
  return {
    id: row.id,
    title: row.title?.trim() || "Bildschirmaufnahme",
    reason: failedVideoReason(row.error),
    at: row.updated_at || row.created_at,
  };
}

/** Grenze für die Abfrage: Fehlschläge seit (jetzt − FAILED_VIDEO_DAYS). */
export function failedVideoSince(now = Date.now()): string {
  return new Date(now - FAILED_VIDEO_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
