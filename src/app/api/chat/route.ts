import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiConfigured, AI } from "@/lib/ai";
import { openai, embed } from "@/lib/openai";
import { chatSystem } from "@/lib/ai-prompts";

export const maxDuration = 30;

type Source = { title: string; slug: string };

// Best-effort Rate-Limit (pro Instanz, ohne externe Infra) gegen Kosten-DoS auf dem
// öffentlichen Chat-Endpunkt. Input ist zusätzlich hart gekappt (Frage 500, History 8×1000).
const RL = new Map<string, { count: number; reset: number }>();
function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const e = RL.get(key);
  if (!e || e.reset < now) {
    RL.set(key, { count: 1, reset: now + windowMs });
    if (RL.size > 5000) for (const [k, v] of RL) if (v.reset < now) RL.delete(k); // simple Bereinigung
    return false;
  }
  e.count += 1;
  return e.count > limit;
}

/**
 * Zieht den (ggf. noch unvollständigen) Wert des JSON-Feldes "answer" aus dem bisher
 * gestreamten Rohtext. So können wir den Antworttext live rausstreamen, obwohl das
 * Modell ein JSON-Objekt {"answer":"…","status":…} produziert. { text, closed }.
 */
function extractAnswer(raw: string): { text: string; closed: boolean } | null {
  const ki = raw.indexOf('"answer"');
  if (ki < 0) return null;
  let i = raw.indexOf(":", ki + 8);
  if (i < 0) return null;
  i++;
  while (i < raw.length && /\s/.test(raw[i])) i++;
  if (raw[i] !== '"') return null;
  i++;
  let out = "";
  let closed = false;
  while (i < raw.length) {
    const c = raw[i];
    if (c === "\\") {
      const n = raw[i + 1];
      if (n === undefined) break; // unvollständiges Escape -> auf mehr warten
      if (n === "n") out += "\n";
      else if (n === "t") out += "\t";
      else if (n === "r") out += "\r";
      else if (n === "u") {
        const hex = raw.slice(i + 2, i + 6);
        if (hex.length < 4) break; // unvollständiges \uXXXX
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else out += n; // ", \\, / und Rest
      i += 2;
      continue;
    }
    if (c === '"') { closed = true; break; }
    out += c;
    i++;
  }
  return { text: out, closed };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const accountSlug = String(body.accountSlug ?? "").trim();
  const question = String(body.question ?? "").trim().slice(0, 500);
  if (!accountSlug || !question)
    return NextResponse.json({ error: "accountSlug/question fehlt" }, { status: 400 });

  // Rate-Limit pro IP (20/Minute) + pro Kanzlei (120/Minute) gegen Missbrauch.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(`ip:${ip}`, 20, 60_000) || rateLimited(`acc:${accountSlug}`, 120, 60_000)) {
    return NextResponse.json(
      { answer: "Zu viele Anfragen – bitte einen Moment warten und erneut versuchen.", sources: [] },
      { status: 429 },
    );
  }

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

    const oaStream = await openai().chat.completions.create({
      model: AI.models.chat,
      temperature: 0.2,
      max_completion_tokens: 400,
      response_format: { type: "json_object" },
      stream: true,
      messages: [
        { role: "system", content: chatSystem(account.name) },
        ...history.map((h) => ({
          role: h.role === "bot" ? ("assistant" as const) : ("user" as const),
          content: String(h.text).slice(0, 1000),
        })),
        {
          role: "user",
          content: `Frage des Kunden: ${question}\n\nVerfügbare Ausschnitte:\n${context}${expertsText}\n\nBeziehe den bisherigen Gesprächsverlauf ein. Antworte nur auf Basis der Ausschnitte (und des Verlaufs).`,
        },
      ],
    });

    // NDJSON-Stream: {"delta":"..."} für den live wachsenden Antworttext, am Ende
    // {"meta":{status, sources, escalation, weak}}. Der Antworttext wird inkrementell
    // aus dem JSON-Feld "answer" extrahiert, damit die Blase sofort mitläuft.
    const enc = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
        let raw = "";
        let emitted = "";
        try {
          for await (const chunk of oaStream) {
            raw += chunk.choices[0]?.delta?.content ?? "";
            const ext = extractAnswer(raw);
            if (ext && ext.text.startsWith(emitted) && ext.text.length > emitted.length) {
              send({ delta: ext.text.slice(emitted.length) });
              emitted = ext.text;
            }
          }
        } catch {
          /* OpenAI-Stream abgebrochen -> mit dem bisher Erhaltenen weiter */
        }

        // Vollständig parsen für Status/Quellen/Eskalation (KI-Selbsteinschätzung).
        let status = "answered";
        let used: number[] = [];
        let expertIdx: number | null = null;
        try {
          const p = JSON.parse(raw);
          if (typeof p.status === "string") status = p.status;
          used = Array.isArray(p.sources)
            ? p.sources.map((s: unknown) => Number(s)).filter((n: number) => Number.isInteger(n))
            : [];
          const ei = Number(p.expert);
          expertIdx = Number.isInteger(ei) ? ei : null;
        } catch {
          /* raw evtl. kein gültiges JSON -> gestreamten Text behalten */
        }

        // Falls (fast) nichts ankam: statusabhängigen Fallback-Text nachschieben.
        if (!emitted.trim()) {
          const fb =
            status === "off_topic"
              ? `Ich bin der Hilfe-Assistent von ${account.name} und kann Ihnen nur bei Fragen rund um die Organisation und ihre Anleitungen weiterhelfen.`
              : status === "clarify"
                ? "Können Sie Ihr Anliegen bitte etwas genauer beschreiben?"
                : status === "no_answer"
                  ? "Das kann ich Ihnen leider nicht sicher beantworten."
                  : "Es ist gerade ein Fehler aufgetreten – bitte später erneut versuchen.";
          send({ delta: fb });
        }

        // Quellen nur bei beantworteten Fragen; Eskalation nur bei echter Sackgasse.
        const seen = new Set<string>();
        const sources: Source[] = [];
        if (status === "answered") {
          for (const n of used) {
            const t = tutList.find((x) => x.idx === n);
            if (t && !seen.has(t.slug)) { seen.add(t.slug); sources.push({ title: t.title, slug: t.slug }); }
          }
        }
        const escalation = status === "no_answer" ? buildEscalation(expertIdx) : null;

        send({ meta: { status, sources: sources.slice(0, 3), escalation, weak: status === "no_answer" } });
        controller.close();
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("chat error:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { answer: "Es ist gerade ein Fehler aufgetreten – bitte später erneut versuchen.", sources: [], error: true },
      { status: 200 },
    );
  }
}
