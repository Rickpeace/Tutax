import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiConfigured, AI } from "@/lib/ai";
import { openai, embed } from "@/lib/openai";
import { chatSystem } from "@/lib/ai-prompts";

export const maxDuration = 30;

type Source = { title: string; slug: string };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const accountSlug = String(body.accountSlug ?? "").trim();
  const question = String(body.question ?? "").trim().slice(0, 500);
  if (!accountSlug || !question)
    return NextResponse.json({ error: "accountSlug/question fehlt" }, { status: 400 });

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id, name, slug")
    .eq("slug", accountSlug)
    .single();
  if (!account) return NextResponse.json({ error: "Unbekannt" }, { status: 404 });

  if (!aiConfigured()) {
    return NextResponse.json({
      answer:
        "Der Hilfe-Assistent ist noch nicht aktiviert. Bitte schauen Sie sich solange die Anleitungen oben an.",
      sources: [],
    });
  }

  try {
    const qVec = await embed(question);
    const { data: matches } = await admin.rpc("match_kb", {
      p_account: account.id,
      p_embedding: JSON.stringify(qVec),
      p_count: 6,
    });

    const rows = (matches ?? []) as {
      chunk: string;
      metadata: { title?: string; slug?: string };
      similarity: number;
    }[];

    if (!rows.length) {
      return NextResponse.json({
        answer:
          "Dazu habe ich leider keine passende Anleitung. Bitte wenden Sie sich an Ihre Kanzlei.",
        sources: [],
      });
    }

    const context = rows
      .map((r) =>
        r.metadata.slug
          ? `Anleitung „${r.metadata.title ?? ""}": ${r.chunk}`
          : `Info: ${r.chunk}`,
      )
      .join("\n\n");

    const completion = await openai().chat.completions.create({
      model: AI.models.chat,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        { role: "system", content: chatSystem(account.name) },
        {
          role: "user",
          content: `Frage des Mandanten: ${question}\n\nVerfügbare Ausschnitte:\n${context}\n\nAntworte nur auf Basis dieser Ausschnitte.`,
        },
      ],
    });

    const answer = completion.choices[0].message.content?.trim() ?? "";

    // Quellen (eindeutig nach slug)
    const seen = new Set<string>();
    const sources: Source[] = [];
    for (const r of rows) {
      const slug = r.metadata.slug;
      const title = r.metadata.title;
      if (slug && title && !seen.has(slug)) {
        seen.add(slug);
        sources.push({ title, slug });
      }
    }

    return NextResponse.json({ answer, sources: sources.slice(0, 3) });
  } catch (e) {
    return NextResponse.json(
      { answer: "", error: e instanceof Error ? e.message : "Fehler" },
      { status: 200 },
    );
  }
}
