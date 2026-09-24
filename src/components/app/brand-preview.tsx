import { brandFonts, brandStyle } from "@/lib/theme";

type Tokens = {
  shape?: { buttonStyle?: string };
};

/**
 * Kompakte Vorschau, wie die Hilfe-Seite mit einem Design aussieht.
 *
 * Audit 24.09.: Die Farben kommen aus DERSELBEN Ableitung wie die echte Hilfe-Seite
 * (`brandStyle` → CSS-Variablen: Papier, Kartenfarbe, Textstufen, Text auf Akzent). Vorher
 * rechnete die Vorschau eigene Werte (fest weiße Karten, weißer Knopftext) — dunkle
 * Designs und helle Akzente sahen hier anders aus als live.
 */
export function BrandPreview({
  tokens,
  logoUrl,
  accountName,
  compact = false,
  testId,
}: {
  tokens: unknown;
  logoUrl: string | null;
  accountName: string;
  /** Mini-Vorschau (Auswahlkarten): nur Kopf, eine Karte, Knopf. */
  compact?: boolean;
  /** data-testid am äußeren Rahmen (Einstellungs-Test prüft dort die Hintergrundfarbe). */
  testId?: string;
}) {
  const t = (tokens ?? {}) as Tokens;
  const fonts = brandFonts(tokens);
  const outlineBtn = t.shape?.buttonStyle === "outline";
  const initial = accountName.trim().charAt(0).toUpperCase() || "?";
  const radius = "var(--brand-radius, 14px)";
  const cardBorder = "var(--brand-card-bw, 1px) solid var(--brand-card-border, rgba(16,21,36,0.10))";

  return (
    <div
      data-testid={testId}
      className="overflow-hidden rounded-xl border border-border"
      style={{
        ...brandStyle(tokens),
        background: "var(--brand-bg)",
        color: "var(--brand-ink)",
        fontFamily: fonts.body,
      }}
    >
      {/* Kopf wie auf der Hilfe-Seite: Leiste auf dem „Papier“. */}
      <div
        className={`flex items-center gap-2.5 border-b-2 ${compact ? "px-2.5 py-2" : "px-4 py-3"}`}
        style={{
          background: "var(--brand-paper, #fff)",
          borderColor: "color-mix(in srgb, var(--brand-ink) 8%, transparent)",
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="h-9 w-auto min-w-9 max-w-[120px] shrink-0 border border-black/5 bg-white object-contain p-0.5"
            style={{ borderRadius: radius }}
          />
        ) : (
          <div
            className="flex size-9 shrink-0 items-center justify-center text-sm font-extrabold"
            style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg, #fff)", borderRadius: radius }}
          >
            {initial}
          </div>
        )}
        <div className="min-w-0">
          <div
            className="truncate text-base leading-tight"
            style={{
              fontFamily: fonts.heading,
              fontWeight: "var(--brand-heading-weight, 800)",
              color: "var(--brand-title, var(--brand-ink))",
            }}
          >
            {accountName || "Ihre Organisation"}
          </div>
          <div className="text-[10px] font-bold" style={{ color: "var(--muted-foreground)" }}>
            Hilfe &amp; Anleitungen
          </div>
        </div>
      </div>

      <div className={compact ? "space-y-2 p-2.5" : "space-y-3 p-4"}>
        {(compact ? ["SmartLogin einrichten"] : ["SmartLogin einrichten", "Belege hochladen"]).map((title) => (
          <div
            key={title}
            className="flex items-center gap-2.5 p-2.5"
            style={{
              background: "var(--brand-card-bg, #fff)",
              border: cardBorder,
              borderRadius: radius,
              boxShadow: "var(--brand-card-shadow, none)",
            }}
          >
            <div
              className="size-7 shrink-0"
              style={{ background: "var(--brand-icon-bg, var(--brand-soft))", border: cardBorder, borderRadius: radius }}
            />
            <div className="min-w-0">
              <div
                className="text-xs"
                style={{
                  fontFamily: fonts.heading,
                  fontWeight: "var(--brand-heading-weight, 800)",
                  color: "var(--brand-title, var(--brand-ink))",
                }}
              >
                {title}
              </div>
              <div className="truncate text-[10px] font-bold" style={{ color: "var(--muted-foreground)" }}>
                In wenigen Schritten erklärt
              </div>
            </div>
          </div>
        ))}

        <div
          className="inline-flex px-3 py-1.5 text-xs font-bold"
          style={{
            background: outlineBtn ? "transparent" : "var(--brand-accent)",
            color: outlineBtn ? "var(--brand-accent-strong, var(--brand-accent))" : "var(--brand-accent-fg, #fff)",
            border: outlineBtn ? "1.5px solid var(--brand-accent-strong, var(--brand-accent))" : "none",
            borderRadius: "var(--brand-btn-radius, 999px)",
          }}
        >
          Weiter
        </div>
      </div>
    </div>
  );
}
