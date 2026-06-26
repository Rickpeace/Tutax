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
    .select("id, name, slug, escalation")
    .eq("slug", accountSlug)
    .single();
  if (!account) return NextResponse.json({ error: "Unbekannt" }, { status: 404 });

  type CatEsc = { name?: string; calendarUrl?: string; email?: string; phone?: string };
  type Esc = {
    enabled?: boolean;
    message?: string;
    contactName?: string;
    calendarUrl?: string;
    email?: string;
    phone?: string;
    byCategory?: Record<string, CatEsc>;
  };
  const esc = (account.escalation ?? {}) as Esc;
  // Generische Eskalation: liefert die konfigurierten Kontakt-Wege (Kalender/E-Mail/Telefon).
  const buildEscalation = (categoryName?: string | null) => {
    if (!esc.enabled) return null;
    const cat = categoryName && esc.byCategory ? esc.byCategory[categoryName] : undefined;
    const calendarUrl = cat?.calendarUrl || esc.calendarUrl;
    const email = cat?.email || esc.email;
    const phone = cat?.phone || esc.phone;
    const name = cat?.name || esc.contactName || account.name;
    const methods: { type: string; label: string; value: string }[] = [];
    if (calendarUrl)
      methods.push({ type: "calendar", label: name ? `Termin buchen · ${name}` : "Termin buchen", value: calendarUrl });
    if (email) methods.push({ type: "email", label: email, value: `mailto:${email}` });
    if (phone) methods.push({ type: "phone", label: phone, value: `tel:${phone}` });
    if (!methods.length) return null;
    return { message: esc.message || "Gerne helfen wir Ihnen persönlich weiter.", methods };
  };

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
      metadata: { title?: string; slug?: string; category?: string | null };
      similarity: number;
    }[];

    // Eindeutige Anleitungen als Quellen-Kandidaten nummerieren ([1], [2], …).
    const tutList: { idx: number; title: string; slug: string }[] = [];
    const tutIndex = new Map<string, number>();
    for (const r of rows) {
      if (r.metadata.slug && r.metadata.title && !tutIndex.has(r.metadata.slug)) {
        const idx = tutList.length + 1;
        tutIndex.set(r.metadata.slug, idx);
        tutList.push({ idx, title: r.metadata.title, slug: r.metadata.slug });
      }
    }

    const context = rows.length
      ? rows
          .map((r) =>
            r.metadata.slug
              ? `[${tutIndex.get(r.metadata.slug)}] Anleitung „${r.metadata.title ?? ""}": ${r.chunk}`
              : `Info: ${r.chunk}`,
          )
          .join("\n\n")
      : "(keine passenden Inhalte gefunden)";

    const completion = await openai().chat.completions.create({
      model: AI.models.chat,
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: chatSystem(account.name) },
        {
          role: "user",
          content: `Frage des Mandanten: ${question}\n\nVerfügbare Ausschnitte:\n${context}\n\nAntworte nur auf Basis dieser Ausschnitte.`,
        },
      ],
    });

    // KI-Selbsteinschätzung: onTopic (zum Thema?) + resolved (beantwortet?).
    const raw = completion.choices[0].message.content ?? "{}";
    let answer = "";
    let resolved = true;
    let onTopic = true;
    let used: number[] = [];
    try {
      const p = JSON.parse(raw);
      answer = String(p.answer ?? "").trim();
      resolved = p.resolved !== false;
      onTopic = p.onTopic !== false;
      used = Array.isArray(p.sources)
        ? p.sources.map((s: unknown) => Number(s)).filter((n: number) => Number.isInteger(n))
        : [];
    } catch {
      answer = raw.trim();
    }

    // Quellen = NUR die von der KI per Nummer genannten Anleitungen
    // (Reranking im selben Call -> keine nur „themennahen" Fehlvorschläge).
    const seen = new Set<string>();
    const sources: Source[] = [];
    for (const n of used) {
      const t = tutList.find((x) => x.idx === n);
      if (t && !seen.has(t.slug)) {
        seen.add(t.slug);
        sources.push({ title: t.title, slug: t.slug });
      }
    }

    // Off-Topic (z. B. Kochrezept): freundlich abgrenzen, NICHT eskalieren.
    if (!onTopic) {
      return NextResponse.json({
        answer:
          answer ||
          `Ich bin der Hilfe-Assistent von ${account.name} und kann Ihnen nur bei Fragen rund um die Kanzlei und ihre Anleitungen weiterhelfen.`,
        sources: [],
      });
    }

    // Zum Thema, aber nicht beantwortbar -> an einen Menschen verweisen.
    if (!resolved) {
      const escalation = buildEscalation(rows[0]?.metadata?.category);
      return NextResponse.json({
        answer: answer || "Das kann ich Ihnen leider nicht sicher beantworten.",
        sources: sources.slice(0, 3),
        escalation,
        weak: true,
      });
    }

    return NextResponse.json({ answer, sources: sources.slice(0, 3) });
  } catch (e) {
    return NextResponse.json(
      { answer: "", error: e instanceof Error ? e.message : "Fehler" },
      { status: 200 },
    );
  }
}
