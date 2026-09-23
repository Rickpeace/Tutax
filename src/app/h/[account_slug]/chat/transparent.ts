/**
 * Chat-only-Seite läuft als kleines, rundes iFrame (76 px) auf Kunden-Websites: Seite UND
 * der persistente Marken-Wrapper aus ../layout.tsx ([data-hub-brand]) müssen durchsichtig
 * sein, sonst zeigt das iFrame eine farbige Scheibe um den 56-px-Knopf. Gilt auch für den
 * Ladezustand (loading.tsx). Nur hier gesetzt — Hub/Anleitung behalten ihre Markenfarbe.
 */
export const EMBED_TRANSPARENT_CSS = "html,body,[data-hub-brand]{background:transparent!important}";
