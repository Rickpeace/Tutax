// „Link kopieren“ (Welle 51a, Kundenwunsch „stabiler, individueller Link“).
// Der Link einer veröffentlichten Anleitung ist /h/<account_slug>/<tutorial_slug>. Stabil ist er
// bereits: ensureSlug (app/app/actions.ts) behält einen vorhandenen Slug beim erneuten
// Veröffentlichen, und Umbenennen (renameTutorial/setTutorialTitle) ändert nur den Titel.
// Nur im Browser verwenden (window/navigator).

export const STABLE_LINK_HINT = "Der Link bleibt gleich, auch wenn Sie die Anleitung umbenennen.";

/** Volle öffentliche Adresse einer Anleitung auf der Hilfe-Seite. */
export function hubTutorialUrl(accountSlug: string, tutorialSlug: string): string {
  return `${window.location.origin}/h/${encodeURIComponent(accountSlug)}/${encodeURIComponent(tutorialSlug)}`;
}

/** Text in die Zwischenablage; Fallback für Browser ohne Clipboard-API/ohne Berechtigung. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Fallback unten */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
