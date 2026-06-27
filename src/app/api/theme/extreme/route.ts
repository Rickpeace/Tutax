import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiConfigured, AI } from "@/lib/ai";
import { openai } from "@/lib/openai";
import { EXTREME_SYSTEM, extremeUser, EXTREME_REFINE_SYSTEM, extremeRefineUser } from "@/lib/ai-prompts";
import { sanitizeSkinCss } from "@/lib/skin-css";

export const maxDuration = 60;

type UserContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

function extract(html: string, pageUrl: string) {
  const get = (re: RegExp) => html.match(re)?.[1]?.trim();
  const title = get(/<title[^>]*>([^<]+)<\/title>/i);
  const description =
    get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const heroText = html
    .match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ?.replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const fonts = new Set<string>();
  for (const m of html.matchAll(/font-family:\s*([^;"'}]+)/gi)) {
    fonts.add(m[1].replace(/["']/g, "").split(",")[0].trim());
  }
  const abs = (u?: string) => {
    if (!u) return undefined;
    try {
      return new URL(u.replace(/&amp;/g, "&").trim(), pageUrl).href;
    } catch {
      return undefined;
    }
  };
  const linkTags = html.match(/<link[^>]*>/gi) ?? [];
  const icon = (kw: string) => {
    for (const t of linkTags)
      if (new RegExp(`rel=["'][^"']*${kw}[^"']*["']`, "i").test(t))
        return t.match(/href=["']([^"']+)["']/i)?.[1];
    return undefined;
  };
  const ogImage = get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const logo = abs(icon("apple-touch-icon")) || abs(icon("icon")) || abs(ogImage);
  return { title, description, heroText, fonts: [...fonts], logo };
}

function validLayout(l: unknown) {
  const o = (l ?? {}) as Record<string, string>;
  const pick = (v: string, allowed: string[], def: string) =>
    allowed.includes(v) ? v : def;
  return {
    header: pick(o.header, ["left", "center", "banner"], "left"),
    cards: pick(o.cards, ["grid", "list"], "grid"),
    hero: pick(o.hero, ["none", "band"], "none"),
  };
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

  const { data: mem } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", user.id)
    .single();
  const accountId = mem?.account_id as string | undefined;

  if (!aiConfigured()) {
    return NextResponse.json({ configured: false, message: "OPENAI_API_KEY fehlt." });
  }
  if (accountId) {
    await supabase.from("themes").update({ source_url: url }).eq("account_id", accountId);
  }

  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 9000);
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TutaxBot/1.0)" },
    });
    clearTimeout(to);
    const html = (await resp.text()).slice(0, 200_000);
    const sig = extract(html, url);

    // Logo (Raster) für Vision + Speicherung
    let logoBuf: Buffer | null = null;
    let logoCt = "";
    if (sig.logo) {
      try {
        const r = await fetch(sig.logo, {
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
        /* optional */
      }
    }

    // Screenshot (Hauptsignal)
    let shotDataUrl = "";
    try {
      const r = await fetch(`https://image.thum.io/get/width/1200/crop/1500/noanimate/${url}`, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TutaxBot/1.0)" },
      });
      const ct = r.headers.get("content-type") ?? "";
      if (r.ok && /image\/(png|jpe?g|webp)/i.test(ct)) {
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length > 3000) shotDataUrl = `data:${ct};base64,${b.toString("base64")}`;
      }
    } catch {
      /* optional */
    }

    const isRaster = /image\/(png|jpe?g|gif|webp)/i.test(logoCt);
    const images: string[] = [];
    if (shotDataUrl) images.push(shotDataUrl);
    if (logoBuf && isRaster) images.push(`data:${logoCt};base64,${logoBuf.toString("base64")}`);

    const userText = extremeUser({ ...sig, url, hasShot: !!shotDataUrl });
    const userContent: UserContent = images.length
      ? [
          { type: "text", text: userText },
          ...images.map((u) => ({ type: "image_url" as const, image_url: { url: u } })),
        ]
      : userText;

    const completion = await openai().chat.completions.create({
      model: AI.models.vision,
      messages: [
        { role: "system", content: EXTREME_SYSTEM },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
    });

    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    const tokens = {
      style: parsed.style,
      colors: parsed.colors,
      typography: parsed.typography,
      shape: parsed.shape,
      content: parsed.content,
    };

    // Pass 2 – Selbst-Review: KI räumt ihren eigenen Skin nach Design-Regeln auf.
    let rawCss = typeof parsed.css === "string" ? parsed.css : "";
    if (rawCss.trim()) {
      try {
        const refine = await openai().chat.completions.create({
          model: AI.models.chat,
          messages: [
            { role: "system", content: EXTREME_REFINE_SYSTEM },
            { role: "user", content: extremeRefineUser(tokens, rawCss) },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 2000,
        });
        const rp = JSON.parse(refine.choices[0].message.content ?? "{}");
        if (rp && typeof rp.css === "string" && rp.css.trim().length > 40) rawCss = rp.css;
      } catch {
        /* Refine optional – Pass-1-CSS behalten */
      }
    }
    const css = sanitizeSkinCss(rawCss);
    const layout = validLayout(parsed.layout);

    // Logo ablegen
    let logoPath: string | null = null;
    if (logoBuf && accountId) {
      try {
        const ext = logoCt.includes("svg")
          ? "svg"
          : logoCt.includes("webp")
            ? "webp"
            : /jpe?g/.test(logoCt)
              ? "jpg"
              : "png";
        const path = `${accountId}/brand/extreme-logo.${ext}`;
        const { error: upErr } = await createAdminClient()
          .storage.from("tutorial-images-public")
          .upload(path, logoBuf, { contentType: logoCt, upsert: true });
        if (!upErr) logoPath = path;
      } catch {
        /* optional */
      }
    }

    if (accountId) {
      const update: Record<string, unknown> = {
        extreme_tokens: tokens,
        extreme_css: css,
        extreme_layout: layout,
        updated_at: new Date().toISOString(),
      };
      if (logoPath) update.extreme_logo_path = logoPath;
      await supabase.from("themes").update(update).eq("account_id", accountId);
    }

    return NextResponse.json({ configured: true, ok: true, tokens, css, layout, logo: logoPath });
  } catch (e) {
    return NextResponse.json(
      { configured: true, ok: false, error: e instanceof Error ? e.message : "Analyse fehlgeschlagen" },
      { status: 200 },
    );
  }
}
