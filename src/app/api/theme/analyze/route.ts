import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiConfigured, AI } from "@/lib/ai";
import { openai } from "@/lib/openai";
import { CI_ANALYSIS_SYSTEM, ciAnalysisUser } from "@/lib/ai-prompts";
import { safeFetch } from "@/lib/ssrf";
import { activeAccountId } from "@/lib/account";

export const maxDuration = 60;

function extractSignals(html: string, pageUrl: string) {
  const get = (re: RegExp) => html.match(re)?.[1]?.trim();
  const title = get(/<title[^>]*>([^<]+)<\/title>/i);
  const themeColor = get(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
  let ogImage = get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogImage) {
    try {
      ogImage = new URL(ogImage, pageUrl).href;
    } catch {
      ogImage = undefined;
    }
  }

  const colorCounts = new Map<string, number>();
  for (const m of html.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const c = m[0].toLowerCase();
    colorCounts.set(c, (colorCounts.get(c) ?? 0) + 1);
  }
  const colors = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);

  const fonts = new Set<string>();
  for (const m of html.matchAll(/font-family:\s*([^;"'}]+)/gi)) {
    fonts.add(m[1].replace(/["']/g, "").split(",")[0].trim());
  }

  // Logo-Kandidat: apple-touch-icon > icon > og:image (Reihenfolge rel/href egal)
  const abs = (u?: string) => {
    if (!u) return undefined;
    const dec = u.replace(/&amp;/g, "&").replace(/&#38;/g, "&").trim();
    try {
      return new URL(dec, pageUrl).href;
    } catch {
      return undefined;
    }
  };
  const linkTags = html.match(/<link[^>]*>/gi) ?? [];
  const iconHref = (relKeyword: string) => {
    for (const tag of linkTags) {
      if (new RegExp(`rel=["'][^"']*${relKeyword}[^"']*["']`, "i").test(tag)) {
        const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
        if (href) return href;
      }
    }
    return undefined;
  };
  const logo = abs(iconHref("apple-touch-icon")) || abs(iconHref("icon")) || abs(ogImage);

  const cssHrefs: string[] = [];
  for (const tag of linkTags) {
    if (/rel=["'][^"']*stylesheet[^"']*["']/i.test(tag)) {
      const u = abs(tag.match(/href=["']([^"']+)["']/i)?.[1]);
      if (u) cssHrefs.push(u);
    }
  }

  // Echte Texte der Seite (für Slogan/Untertitel)
  const description =
    get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const heroText = html
    .match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ?.replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { url: pageUrl, title, themeColor, ogImage, colors, fonts: [...fonts], logo, cssHrefs, description, heroText };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  let url = String(body.url ?? "").trim();
  if (!url) return NextResponse.json({ error: "URL fehlt" }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  const accountId = (await activeAccountId())?.accountId;
  if (accountId) {
    await supabase.from("themes").update({ source_url: url, status: "analyzing" }).eq("account_id", accountId);
  }

  if (!aiConfigured()) {
    if (accountId) await supabase.from("themes").update({ status: "draft" }).eq("account_id", accountId);
    return NextResponse.json({
      configured: false,
      message: "Website gespeichert. KI-CI-Übernahme startet, sobald der OPENAI_API_KEY hinterlegt ist.",
    });
  }

  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 9000);
    const resp = await safeFetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TutaxBot/1.0)" },
    });
    clearTimeout(to);
    const html = (await resp.text()).slice(0, 200_000);
    const signals = extractSignals(html, url);

    // Externe CSS holen und Markenfarben extrahieren (HTML allein reicht meist nicht).
    const rgbToHex = (s: string) => {
      const p = s.split(",").map((x) => parseInt(x.trim(), 10));
      if (p.length < 3 || p.some((n) => Number.isNaN(n))) return null;
      return "#" + p.slice(0, 3).map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");
    };
    let cssText = "";
    try {
      cssText = (
        await Promise.all(
          signals.cssHrefs.slice(0, 3).map(async (u) => {
            try {
              const r = await safeFetch(u, { signal: AbortSignal.timeout(6000) });
              if (r.ok) return (await r.text()).slice(0, 300_000);
            } catch {
              /* ignore */
            }
            return "";
          }),
        )
      ).join("\n");
      if (cssText) {
        const counts = new Map<string, number>();
        const bump = (c: string) => counts.set(c, (counts.get(c) ?? 0) + 1);
        for (const m of cssText.matchAll(/#[0-9a-fA-F]{6}\b/g)) bump(m[0].toLowerCase());
        for (const m of cssText.matchAll(/rgba?\(([^)]+)\)/gi)) {
          const hex = rgbToHex(m[1]);
          if (hex) bump(hex);
        }
        const cssColors = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
        signals.colors = [...new Set([...cssColors, ...signals.colors])].slice(0, 15);
      }
    } catch {
      /* CSS optional */
    }

    // Markenfarben über CHROMA (max-min) erkennen: erfasst auch GEDÄMPFTE Töne
    // (Salbeigrün, Taupe, Altrosa), schließt aber echtes Grau/Schwarz/Weiß aus.
    const isBrandColor = (hex: string) => {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      return max - min >= 12 && l > 30 && l < 236;
    };
    const brandColors = signals.colors.filter(isBrandColor).slice(0, 8);

    // Heuristik: nutzt die Seite die Markenfarbe v. a. als Rahmen (Outline) oder als Fläche?
    let cardHint = "";
    try {
      let borderN = 0;
      let fillN = 0;
      for (const hex of brandColors) {
        const esc = hex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        for (const m of cssText.matchAll(new RegExp(`[a-z-]+\\s*:\\s*[^;{}]*${esc}`, "gi"))) {
          const seg = m[0].toLowerCase();
          if (seg.includes("border")) borderN++;
          else if (seg.includes("background")) fillN++;
        }
      }
      if (borderN >= 3 && borderN > fillN) cardHint = "outline";
      else if (fillN > borderN) cardHint = "filled";
    } catch {
      /* optional */
    }

    // Form-Hinweis aus border-radius im CSS (Pill / rund / eckig).
    let radiusHint = "";
    try {
      const radii: number[] = [];
      for (const m of cssText.matchAll(/border-radius:\s*([0-9.]+)(px|rem|em)?/gi)) {
        let v = parseFloat(m[1]);
        const unit = (m[2] || "px").toLowerCase();
        if (unit === "rem" || unit === "em") v *= 16;
        if (!Number.isNaN(v)) radii.push(v);
      }
      const pill = radii.filter((v) => v >= 100).length;
      const round = radii.filter((v) => v >= 14 && v < 100).length;
      const sharp = radii.filter((v) => v <= 4).length;
      if (pill >= 2) radiusHint = "pill";
      else if (round >= 2 && round >= sharp) radiusHint = "rund";
      else if (sharp >= 2 && sharp > round) radiusHint = "eckig";
    } catch {
      /* optional */
    }

    // Logo EINMAL selbst herunterladen (mit Browser-UA) – für Vision (Base64) und zum Speichern.
    let logoBuf: Buffer | null = null;
    let logoCt = "";
    if (signals.logo) {
      try {
        const r = await safeFetch(signals.logo, {
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; TutaxBot/1.0)" },
        });
        const ct = r.headers.get("content-type") ?? "";
        if (r.ok && ct.startsWith("image/")) {
          const b = Buffer.from(await r.arrayBuffer());
          if (b.length > 0 && b.length < 3_000_000) {
            logoBuf = b;
            logoCt = ct;
          }
        }
      } catch {
        /* Logo optional – darf die Analyse nicht stoppen */
      }
    }

    // Screenshot der gerenderten Seite holen (bestes Signal – zuverlässiger als CSS).
    let shotDataUrl = "";
    try {
      const shotUrl = `https://image.thum.io/get/width/1200/crop/1500/noanimate/${url}`;
      const r = await fetch(shotUrl, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TutaxBot/1.0)" },
      });
      const ct = r.headers.get("content-type") ?? "";
      if (r.ok && /image\/(png|jpe?g|webp)/i.test(ct)) {
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length > 3000) shotDataUrl = `data:${ct};base64,${b.toString("base64")}`;
      }
    } catch {
      /* Screenshot optional */
    }

    // Bilder an die Vision: Screenshot zuerst (Hauptsignal), dann Logo (Raster).
    const isRaster = /image\/(png|jpe?g|gif|webp)/i.test(logoCt);
    const images: string[] = [];
    if (shotDataUrl) images.push(shotDataUrl);
    if (logoBuf && isRaster) images.push(`data:${logoCt};base64,${logoBuf.toString("base64")}`);

    const userText = ciAnalysisUser({ ...signals, brandColors, cardHint, radiusHint, hasShot: !!shotDataUrl });
    const userContent: OpenAIUserContent = images.length
      ? [
          { type: "text", text: userText },
          ...images.map((u) => ({ type: "image_url" as const, image_url: { url: u } })),
        ]
      : userText;

    const completion = await openai().chat.completions.create({
      model: AI.models.vision,
      messages: [
        { role: "system", content: CI_ANALYSIS_SYSTEM },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 800,
    });

    const tokens = JSON.parse(completion.choices[0].message.content ?? "{}");

    // Heruntergeladenes Logo in den öffentlichen Bucket legen (SVG ist als Anzeige ok).
    let aiLogoPath: string | null = null;
    if (logoBuf && accountId) {
      try {
        const ext = logoCt.includes("svg")
          ? "svg"
          : logoCt.includes("webp")
            ? "webp"
            : /jpe?g/.test(logoCt)
              ? "jpg"
              : /icon|ico/.test(logoCt)
                ? "ico"
                : "png";
        const path = `${accountId}/brand/ai-logo.${ext}`;
        const { error: upErr } = await createAdminClient()
          .storage.from("tutorial-images-public")
          .upload(path, logoBuf, { contentType: logoCt, upsert: true });
        if (!upErr) aiLogoPath = path;
      } catch {
        /* optional */
      }
    }

    if (accountId) {
      const update: Record<string, unknown> = {
        ai_tokens: tokens,
        status: "ready",
        updated_at: new Date().toISOString(),
      };
      if (aiLogoPath) update.ai_logo_path = aiLogoPath;
      await supabase.from("themes").update(update).eq("account_id", accountId);
    }
    return NextResponse.json({ configured: true, ok: true, tokens, logo: aiLogoPath });
  } catch (e) {
    if (accountId) await supabase.from("themes").update({ status: "failed" }).eq("account_id", accountId);
    return NextResponse.json(
      { configured: true, ok: false, error: e instanceof Error ? e.message : "Analyse fehlgeschlagen" },
      { status: 200 },
    );
  }
}

type OpenAIUserContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;
