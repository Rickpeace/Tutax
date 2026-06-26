import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, AI } from "@/lib/ai";
import { openai } from "@/lib/openai";
import { DRIFT_SYSTEM } from "@/lib/ai-prompts";

export const maxDuration = 40;

function plainBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const node = n as { text?: string; content?: unknown[] };
    if (typeof node.text === "string") out.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(body);
  return out.join(" ").trim();
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { data: tut } = await supabase
    .from("tutorials")
    .select("title")
    .eq("id", id)
    .single();
  if (!tut) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  if (!aiConfigured()) {
    return NextResponse.json({
      configured: false,
      message: "Drift-Prüfung startet, sobald der OPENAI_API_KEY hinterlegt ist.",
    });
  }

  const { data: steps } = await supabase
    .from("steps")
    .select("title, body, position")
    .eq("tutorial_id", id)
    .order("position", { ascending: true });

  const content =
    `Titel: ${tut.title}\n\nSchritte:\n` +
    (steps ?? [])
      .map((s, i) => `${i + 1}. ${s.title ?? ""}: ${plainBody(s.body)}`)
      .join("\n");

  try {
    const completion = await openai().chat.completions.create({
      model: AI.models.chat,
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DRIFT_SYSTEM },
        { role: "user", content },
      ],
    });
    const result = JSON.parse(completion.choices[0].message.content ?? "{}") as {
      is_stale?: boolean;
      severity?: string;
      summary?: string;
      affected_steps?: string[];
    };

    if (result.is_stale) {
      await supabase.from("change_alerts").insert({
        tutorial_id: id,
        severity: ["info", "warning", "critical"].includes(result.severity ?? "")
          ? result.severity
          : "warning",
        summary: result.summary ?? "Mögliche Änderung erkannt.",
        details: { affected_steps: result.affected_steps ?? [] },
      });
      await supabase.from("tutorials").update({ freshness: "stale" }).eq("id", id);
    } else {
      await supabase.from("tutorials").update({ freshness: "ok" }).eq("id", id);
    }

    return NextResponse.json({ configured: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { configured: true, error: e instanceof Error ? e.message : "Fehler" },
      { status: 200 },
    );
  }
}
