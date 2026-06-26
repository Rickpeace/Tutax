import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiConfigured, AI } from "@/lib/ai";
import { openai } from "@/lib/openai";
import { CI_ANALYSIS_SYSTEM, ciAnalysisUser } from "@/lib/ai-prompts";

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

  return { url: pageUrl, title, themeColor, ogImage, colors, fonts: [...fonts], logo };
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
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TutaxBot/1.0)" },
    });
    clearTimeout(to);
    const html = (await resp.text()).slice(0, 200_000);
    const signals = extractSignals(html, url);

    const userContent: OpenAIUserContent = signals.ogImage
      ? [
          { type: "text", text: ciAnalysisUser(signals) },
          { type: "image_url", image_url: { url: signals.ogImage } },
        ]
      : ciAnalysisUser(signals);

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

    // Logo der Website holen und in den öffentlichen Bucket legen.
    let aiLogoPath: string | null = null;
    if (signals.logo && accountId) {
      try {
        const imgRes = await fetch(signals.logo, { signal: AbortSignal.timeout(8000) });
        const ct = imgRes.headers.get("content-type") ?? "";
        if (imgRes.ok && ct.startsWith("image/")) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          if (buf.length > 0 && buf.length < 3_000_000) {
            const ext = ct.includes("svg")
              ? "svg"
              : ct.includes("webp")
                ? "webp"
                : ct.includes("jpeg") || ct.includes("jpg")
                  ? "jpg"
                  : ct.includes("icon") || ct.includes("ico")
                    ? "ico"
                    : "png";
            const path = `${accountId}/brand/ai-logo.${ext}`;
            const { error: upErr } = await createAdminClient()
              .storage.from("tutorial-images-public")
              .upload(path, buf, { contentType: ct, upsert: true });
            if (!upErr) aiLogoPath = path;
          }
        }
      } catch {
        // Logo optional – Fehler ignorieren.
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
