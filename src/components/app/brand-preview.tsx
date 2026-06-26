import { brandFonts } from "@/lib/theme";

type Tokens = {
  colors?: Record<string, string>;
  shape?: { radius?: number | string; buttonStyle?: string };
};

/** Kompakte Vorschau, wie die Hilfe-Seite mit einem Design aussieht. */
export function BrandPreview({
  tokens,
  logoUrl,
  accountName,
}: {
  tokens: unknown;
  logoUrl: string | null;
  accountName: string;
}) {
  const t = (tokens ?? {}) as Tokens;
  const c = t.colors ?? {};
  const fonts = brandFonts(tokens);
  const bg = c.background ?? "#f6f7fe";
  const surface = c.surface ?? "#ffffff";
  const ink = c.text ?? "#101524";
  const accent = c.primary ?? "#3d4ee6";
  const border = c.border ?? "rgba(16,21,36,0.08)";
  const rawRadius = t.shape?.radius;
  const radius = rawRadius != null ? `${parseInt(String(rawRadius), 10) || 12}px` : "14px";
  const pill = t.shape?.buttonStyle === "pill";
  const initial = accountName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className="overflow-hidden rounded-xl border border-border"
      style={{ background: bg, fontFamily: fonts.body, color: ink }}
    >
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-9 rounded-lg border border-black/5 bg-white object-contain p-0.5" />
          ) : (
            <div
              className="flex size-9 items-center justify-center rounded-lg text-sm font-extrabold text-white"
              style={{ background: accent, borderRadius: radius }}
            >
              {initial}
            </div>
          )}
          <div className="text-sm font-extrabold" style={{ fontFamily: fonts.heading }}>
            {accountName || "Ihre Kanzlei"}
          </div>
        </div>

        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2 p-2.5" style={{ background: surface, border: `1px solid ${border}`, borderRadius: radius }}>
            <div className="size-7 shrink-0" style={{ background: accent, opacity: 0.18, borderRadius: radius }} />
            <div className="min-w-0">
              <div className="text-xs font-bold">{i === 1 ? "SmartLogin einrichten" : "Belege hochladen"}</div>
              <div className="truncate text-[10px]" style={{ opacity: 0.6 }}>In wenigen Schritten erklärt</div>
            </div>
          </div>
        ))}

        <div
          className="inline-flex px-3 py-1.5 text-xs font-bold text-white"
          style={{ background: accent, borderRadius: pill ? "999px" : radius }}
        >
          Frage stellen
        </div>
      </div>
    </div>
  );
}
