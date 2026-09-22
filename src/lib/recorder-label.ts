// Grober Name einer Erweiterungs-Verbindung aus dem User-Agent, z. B. „Chrome · Windows“
// (Migration 0041: mehrere Verbindungen pro Person, eine je Browser/Gerät). Nur zur
// Wiedererkennung in „Einstellungen → Steply-Erweiterung“ — keine Sicherheitsentscheidung.
// Reine Funktion (ohne server-only), damit sie direkt testbar ist.

export const RECORDER_MAX_CONNECTIONS = 10;

export function recorderLabelFromUserAgent(ua: string | null | undefined): string {
  const s = String(ua ?? "");
  // Reihenfolge zählt: Edge/Opera/Brave-artige tragen auch „Chrome/“ im UA.
  const browser = /Edg(?:e|A|iOS)?\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /Firefox\/|FxiOS\//.test(s)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(s)
          ? "Chrome"
          : /Safari\//.test(s)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(s)
    ? "Windows"
    : /iPhone|iPad|iPod/.test(s)
      ? "iOS"
      : /Mac OS X|Macintosh/.test(s)
        ? "macOS"
        : /Android/.test(s)
          ? "Android"
          : /CrOS/.test(s)
            ? "ChromeOS"
            : /Linux/.test(s)
              ? "Linux"
              : "";
  return os ? `${browser} · ${os}` : browser;
}
