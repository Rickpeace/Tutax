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

  const history = Array.isArray(body.history)
    ? (body.history as { role?: string; text?: string }[])
        .filter((h) => h && (h.role === "user" || h.role === "bot") && typeof h.text === "string")
        .slice(-8)
    : [];

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id, name, slug, escalation")
    .eq("slug", accountSlug)
    .single();
  if (!account) return NextResponse.json({ error: "Unbekannt" }, { status: 404 });

  type Expert = { name?: string; expertise?: string; calendarUrl?: string; email?: string; phone?: string };
  type Esc = {
    enabled?: boolean;
    message?: string;
    contactName?: string;
    calendarUrl?: string;
    email?: string;
    phone?: string;
    experts?: Expert[];
  };
  const esc = (account.escalation ?? {}) as Esc;
  const experts = Array.isArray(esc.experts) ? esc.experts : [];
  // Eskalation: passende Person (von der KI gewählt) ODER allgemeiner Fallback.
  const buildEscalation = (expertIdx?: number | null) => {
    if (!esc.enabled) return null;
    const p = typeof expertIdx === "number" ? experts[expertIdx] : undefined;
    const calendarUrl = p?.calendarUrl || esc.calendarUrl;
    const email = p?.email || esc.email;
    const phone = p?.phone || esc.phone;
    const name = p?.name || esc.contactName || account.name;
    const methods: { type: string; label: string; value: string }[] = [];
    if (calendarUrl)
      methods.push({ type: "calendar", label: name ? `Termin buchen · ${name}` : "Termin buchen", value: calendarUrl });
    if (email) methods.push({ type: "email", label: email, value: `mailto:${email}` });
    if (phone) methods.push({ type: "phone", label: phone, value: `tel:${phone}` });
    if (!methods.length) return null;
    const base = esc.message || "Gerne helfen wir Ihnen persönlich weiter.";
    const message = p?.name
      ? `${base} ${p.name}${p.expertise ? ` (${p.expertise})` : ""} ist hierfür die richtige Ansprechperson.`
      : base;
    return { message, methods };
  };

  if (!aiConfigured()) {
    return NextResponse.json({
      answer:
        "Der Hilfe-Assistent ist noch nicht aktiviert. Bitte schauen Sie sich solange die Anleitungen oben an.",
      sources: [],
    });
  }

  try {
    // Folgefragen verstehen: letzte Nutzer-Nachrichten in die Suchanfrage einbeziehen.
    const priorUser = history.filter((h) => h.role === "user").map((h) => String(h.text));
    const embedInput = [...priorUser.slice(-2), question].join("\n");
    const qVec = await embed(embedInput);
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

    const expertsText = experts.length
      ? `\n\nAnsprechpartner (für mögliche Weiterleitung):\n${experts
          .map((e, i) => `[${i}] ${e.name ?? "?"}${e.expertise ? " – " + e.expertise : ""}`)
          .join("\n")}`
      : "";

    const completion = await openai().chat.completions.create({
      model: AI.models.chat,
      temperature: 0.2,
      max_completion_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: chatSystem(account.name) },
        ...history.map((h) => ({
          role: h.role === "bot" ? ("assistant" as const) : ("user" as const),
          content: String(h.text).slice(0, 1000),
        })),
        {
          role: "user",
          content: `Frage des Mandanten: ${question}\n\nVerfügbare Ausschnitte:\n${context}${expertsText}\n\nBeziehe den bisherigen Gesprächsverlauf ein. Antworte nur auf Basis der Ausschnitte (und des Verlaufs).`,
        },
      ],
    });

    // KI-Selbsteinschätzung: status (answered | clarify | no_answer | off_topic).
    const raw = completion.choices[0].message.content ?? "{}";
    let answer = "";
    let status = "answered";
    let used: number[] = [];
    let expertIdx: number | null = null;
    try {
      const p = JSON.parse(raw);
      answer = String(p.answer ?? "").trim();
      if (typeof p.status === "string") status = p.status;
      used = Array.isArray(p.sources)
        ? p.sources.map((s: unknown) => Number(s)).filter((n: number) => Number.isInteger(n))
        : [];
      const ei = Number(p.expert);
      expertIdx = Number.isInteger(ei) ? ei : null;
    } catch {
      answer = raw.trim();
    }

    // Quellen nur bei beantworteten Fragen (Reranking: KI nennt die genutzten Nummern).
    const seen = new Set<string>();
    const sources: Source[] = [];
    if (status === "answered") {
      for (const n of used) {
        const t = tutList.find((x) => x.idx === n);
        if (t && !seen.has(t.slug)) {
          seen.add(t.slug);
          sources.push({ title: t.title, slug: t.slug });
        }
      }
    }

    // Off-Topic: freundlich abgrenzen. KEINE Eskalation.
    if (status === "off_topic") {
      return NextResponse.json({
        answer:
          answer ||
          `Ich bin der Hilfe-Assistent von ${account.name} und kann Ihnen nur bei Fragen rund um die Kanzlei und ihre Anleitungen weiterhelfen.`,
        sources: [],
      });
    }

    // Rückfrage nötig: nachfragen, NICHT eskalieren.
    if (status === "clarify") {
      return NextResponse.json({
        answer: answer || "Können Sie Ihr Anliegen bitte etwas genauer beschreiben?",
        sources: [],
      });
    }

    // Echte Sackgasse (zum Thema, nicht lösbar) -> an einen Menschen verweisen.
    if (status === "no_answer") {
      const escalation = buildEscalation(expertIdx);
      return NextResponse.json({
        answer: answer || "Das kann ich Ihnen leider nicht sicher beantworten.",
        sources: [],
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
