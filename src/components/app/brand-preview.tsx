import { brandFonts, DEFAULT_BRAND_COLORS } from "@/lib/theme";

type Tokens = {
  colors?: Record<string, string>;
  typography?: { headingWeight?: number | string };
  shape?: { radius?: number | string; buttonStyle?: string; cardStyle?: string };
  content?: { tagline?: string };
};

/** Kompakte Vorschau, wie die Hilfe-Seite mit einem Design aussieht. */
export function BrandPreview({
  tokens,
  logoUrl,
  accountName,
  compact = false,
}: {
  tokens: unknown;
  logoUrl: string | null;
  accountName: string;
  /** Mini-Vorschau (Auswahlkarten): nur Kopf, eine Karte, Knopf. */
  compact?: boolean;
}) {
  const t = (tokens ?? {}) as Tokens;
  const c = t.colors ?? {};
  const fonts = brandFonts(tokens);
  // Fallbacks = dieselben warmen Standard-Farben wie die echte Hilfe-Seite (lib/theme.ts).
  const bg = c.background || DEFAULT_BRAND_COLORS.background;
  const surface = c.surface || DEFAULT_BRAND_COLORS.surface;
  const ink = c.text || DEFAULT_BRAND_COLORS.text;
  const accent = c.primary || DEFAULT_BRAND_COLORS.primary;
  const border = c.border ?? "rgba(16,21,36,0.10)";
  const rawRadius = t.shape?.radius;
  const radius = rawRadius != null ? `${parseInt(String(rawRadius), 10) || 0}px` : "14px";
  const pill = t.shape?.buttonStyle === "pill";
  const cardStyle = t.shape?.cardStyle ?? "filled";
  const outline = cardStyle === "outline";
  const headingWeight = t.typography?.headingWeight ?? 800;
  const initial = accountName.trim().charAt(0).toUpperCase() || "?";

  const cardBg = outline ? bg : "#ffffff";
  const cardBorder = outline ? accent : border;
  const cardBw = outline ? "1.5px" : "1px";
  const titleColor = outline ? accent : ink;
  const iconBg = outline ? "transparent" : surface;
  const shadow = cardStyle === "elevated" ? "0 6px 20px rgba(16,21,36,0.08)" : "none";
  const headingColor = outline ? accent : ink;

  return (
    <div className="overflow-hidden rounded-xl border border-border" style={{ background: bg, fontFamily: fonts.body, color: ink }}>
      <div className={compact ? "space-y-2 p-2.5" : "space-y-3 p-4"}>
        <div className="flex items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-9 rounded-lg border border-black/5 bg-white object-contain p-0.5" style={{ borderRadius: radius }} />
          ) : (
            <div
              className="flex size-9 items-center justify-center text-sm font-extrabold text-white"
              style={{ background: accent, borderRadius: radius }}
            >
              {initial}
            </div>
          )}
          <div>
            <div className="text-base leading-tight" style={{ fontFamily: fonts.heading, fontWeight: headingWeight, color: headingColor }}>
              {accountName || "Ihre Organisation"}
            </div>
            <div className="text-[10px]" style={{ opacity: 0.6 }}>Hilfe &amp; Anleitungen</div>
          </div>
        </div>

        {(compact ? ["SmartLogin einrichten"] : ["SmartLogin einrichten", "Belege hochladen"]).map((title) => (
          <div
            key={title}
            className="flex items-center gap-2.5 p-2.5"
            style={{ background: cardBg, border: `${cardBw} solid ${cardBorder}`, borderRadius: radius, boxShadow: shadow }}
          >
            <div
              className="size-7 shrink-0"
              style={{ background: iconBg, border: `${cardBw} solid ${cardBorder}`, borderRadius: radius }}
            />
            <div className="min-w-0">
              <div className="text-xs" style={{ fontFamily: fonts.heading, fontWeight: headingWeight, color: titleColor }}>
                {title}
              </div>
              <div className="truncate text-[10px]" style={{ opacity: 0.6 }}>In wenigen Schritten erklärt</div>
            </div>
          </div>
        ))}

        <div
          className="inline-flex px-3 py-1.5 text-xs font-bold"
          style={{
            background: t.shape?.buttonStyle === "outline" ? "transparent" : accent,
            color: t.shape?.buttonStyle === "outline" ? accent : "#fff",
            border: t.shape?.buttonStyle === "outline" ? `${cardBw} solid ${accent}` : "none",
            borderRadius: pill ? "999px" : radius,
          }}
        >
          Weiter
        </div>
      </div>
    </div>
  );
}
