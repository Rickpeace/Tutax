const rtf = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });

/** "vor 3 Tagen", "gestern", "vor 2 Stunden" … */
export function relativeDe(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (abs >= secs) return rtf.format(Math.round(diffSec / secs), unit);
  }
  return "gerade eben";
}

const dateFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** "02.07.2026" – absolutes Datum (z. B. Schulungsnachweis). */
export function dateDe(iso: string): string {
  return dateFmt.format(new Date(iso));
}
