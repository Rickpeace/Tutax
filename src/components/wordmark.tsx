/**
 * Marken-Zeichen (Design-Handoff 07/2026): Koralle-Kreis mit „S" + Wortmarke
 * in Nunito 900. Ersetzt die alten Ja/Nein-Punkte.
 */
export function Wordmark({
  size = "base",
  tone = "ink",
}: {
  size?: "base" | "lg";
  /** "light" für dunkle Flächen (z. B. dunkle Landing-Sektion). */
  tone?: "ink" | "light";
}) {
  const badge = size === "lg" ? "size-8 text-base" : "size-7 text-sm";
  const word = size === "lg" ? "text-[19px]" : "text-[17px]";
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`${badge} grid shrink-0 place-items-center rounded-full bg-primary font-black text-white`}
        aria-hidden
      >
        S
      </span>
      <span
        className={`font-black tracking-tight ${word} ${
          tone === "light" ? "text-background" : "text-ink"
        }`}
      >
        Steply
      </span>
    </span>
  );
}
