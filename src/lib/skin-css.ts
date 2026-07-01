/**
 * Sicherheits-Sanitizer für KI-generiertes „Skin"-CSS (Extrem-Design).
 *
 * Regeln:
 * - alle Selektoren werden unter `scope` (.tutax-skin) gekapselt -> wirkt NUR
 *   auf die Hilfe-Seite, kann die Host-Seite (Embed) nicht beeinflussen
 * - @import / @charset / expression() / behavior / javascript: werden entfernt
 * - url(...) NUR data:image: erlaubt — KEINE externen URLs (sonst würde die Hilfe-Seite
 *   die IP jedes Endkunden an Dritt-Hosts leaken = Tracking; Schweigepflicht-relevant).
 *   Eigene Logos werden separat in unseren Bucket gespiegelt, nicht per CSS-url geladen.
 * - Länge begrenzt
 */
export function sanitizeSkinCss(input: unknown, scope = ".tutax-skin"): string {
  if (typeof input !== "string" || !input.trim()) return "";
  let css = input.slice(0, 30000);

  css = css.replace(/```[a-z]*/gi, ""); // Markdown-Codefences
  css = css.replace(/\/\*[\s\S]*?\*\//g, ""); // Kommentare
  css = css.replace(/@import[^;]*;?/gi, "");
  css = css.replace(/@charset[^;]*;?/gi, "");
  css = css.replace(/expression\s*\(/gi, "(");
  css = css.replace(/(behavior|-moz-binding)\s*:/gi, "/* blocked */:");
  css = css.replace(/javascript:/gi, "");
  // url(): NUR data:image: zulassen (keine externen URLs -> kein Tracking/IP-Leak der Endkunden)
  css = css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (m, _q, u) => {
    const url = String(u || "").trim().toLowerCase();
    return url.startsWith("data:image/") ? m : "none";
  });

  return scopeCss(css, scope).slice(0, 40000);
}

// Nur „malende" Eigenschaften erlauben – KEINE Struktur (display/position/float/
// width/height/grid/flex/transform/z-index/overflow). So kann der Skin das saubere
// Basis-Layout nicht zerbrechen, nur einfärben/typografieren/dekorieren.
const EXTRA_PROPS = new Set([
  "color", "line-height", "letter-spacing", "word-spacing", "opacity",
  "box-shadow", "cursor", "content", "list-style", "list-style-type",
  "filter", "backdrop-filter", "fill", "stroke", "gap", "white-space",
  "text-fill-color", "clip-path", "aspect-ratio",
]);
function allowedProp(prop: string): boolean {
  const p = prop.toLowerCase().replace(/^-(webkit|moz|ms|o)-/, "");
  if (/^(border|background|font|margin|padding|text|transition|outline)/.test(p)) return true;
  return EXTRA_PROPS.has(p);
}
function filterDeclarations(body: string): string {
  return body
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => {
      const i = d.indexOf(":");
      if (i < 1) return false;
      return allowedProp(d.slice(0, i).trim());
    })
    .join("; ");
}

function splitTopLevel(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of css) {
    buf += ch;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth <= 0) {
        out.push(buf);
        buf = "";
        depth = 0;
      }
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function scopeCss(css: string, scope: string): string {
  const rules = splitTopLevel(css);
  const result: string[] = [];

  for (const rule of rules) {
    const open = rule.indexOf("{");
    if (open === -1) continue;
    const prelude = rule.slice(0, open).trim();
    const close = rule.lastIndexOf("}");
    const body = rule.slice(open + 1, close === -1 ? undefined : close).trim();
    if (!prelude) continue;

    if (prelude.startsWith("@")) {
      if (/^@(media|supports)/i.test(prelude)) {
        // verschachtelte Regeln im Inneren ebenfalls kapseln + filtern
        result.push(`${prelude} { ${scopeCss(body, scope)} }`);
      }
      // font-face/keyframes verwerfen (brauchen wir nicht; keyframes nutzen transform o. Ä.)
      continue;
    }

    const scoped = prelude
      .split(",")
      .map((sel) => {
        const s = sel.trim();
        if (!s) return "";
        if (/^(html|body|:root)$/i.test(s)) return scope;
        // direkter Bezug auf den Container selbst nicht doppeln
        if (s === scope || s.startsWith(`${scope} `) || s.startsWith(`${scope}.`)) return s;
        return `${scope} ${s}`;
      })
      .filter(Boolean)
      .join(", ");

    const cleanBody = filterDeclarations(body);
    if (scoped && cleanBody) result.push(`${scoped} { ${cleanBody} }`);
  }

  return result.join("\n");
}
