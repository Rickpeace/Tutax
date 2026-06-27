/**
 * Sicherheits-Sanitizer für KI-generiertes „Skin"-CSS (Extrem-Design).
 *
 * Regeln:
 * - alle Selektoren werden unter `scope` (.tutax-skin) gekapselt -> wirkt NUR
 *   auf die Hilfe-Seite, kann die Host-Seite (Embed) nicht beeinflussen
 * - @import / @charset / expression() / behavior / javascript: werden entfernt
 * - url(...) nur für https: und data:image: erlaubt (kein Tracking/JS)
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
  // url(): nur https: / data:image: zulassen
  css = css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (m, _q, u) => {
    const url = String(u || "").trim().toLowerCase();
    return url.startsWith("https://") || url.startsWith("data:image/") ? m : "none";
  });

  return scopeCss(css, scope).slice(0, 40000);
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
        // verschachtelte Regeln im Inneren ebenfalls kapseln
        result.push(`${prelude} { ${scopeCss(body, scope)} }`);
      } else if (/^@(font-face|(-webkit-)?keyframes)/i.test(prelude)) {
        result.push(`${prelude} { ${body} }`); // definiert nur Namen -> unkritisch
      }
      // alle anderen @-Regeln verwerfen
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

    if (scoped) result.push(`${scoped} { ${body} }`);
  }

  return result.join("\n");
}
