import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, AI } from "@/lib/ai";
import { DRIFT_SYSTEM } from "@/lib/ai-prompts";

export const maxDuration = 60;

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
    .select("title, drift_checked_at")
    .eq("id", id)
    .single();
  if (!tut) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  if (!aiConfigured()) {
    return NextResponse.json({
      configured: false,
      message: "Drift-Prüfung startet, sobald der OPENAI_API_KEY hinterlegt ist.",
    });
  }

  // Cooldown (Kosten-Schutz, teuerster KI-Call = web_search): max. 1×/Stunde.
  if (tut.drift_checked_at) {
    const last = new Date(tut.drift_checked_at).getTime();
    const elapsedMin = (Date.now() - last) / 60_000;
    if (Number.isFinite(elapsedMin) && elapsedMin < 60) {
      const waitMin = Math.max(1, Math.ceil(60 - elapsedMin));
      const sinceMin = Math.max(0, Math.floor(elapsedMin));
      return NextResponse.json(
        {
          configured: true,
          cooldown: true,
          error: `Zuletzt vor ${sinceMin} Min geprüft – bitte noch ${waitMin} Min warten.`,
        },
        { status: 429 },
      );
    }
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
    // Responses-API mit Web-Suche -> echte Quellen + detaillierte Prüfung.
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${AI.openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI.models.chat,
        tools: [{ type: "web_search" }],
        input: [
          { role: "system", content: DRIFT_SYSTEM },
          { role: "user", content },
        ],
        max_output_tokens: 1400,
      }),
      signal: AbortSignal.timeout(55000),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message);

    type Anno = { type?: string; url?: string; title?: string };
    type Content = { type?: string; text?: string; annotations?: Anno[] };
    const contents = (Array.isArray(j.output) ? j.output : []).flatMap(
      (o: { content?: Content[] }) => o.content ?? [],
    );
    const text = contents
      .filter((c: Content) => c.type === "output_text")
      .map((c: Content) => c.text ?? "")
      .join("\n")
      .trim();
    const citations = contents
      .flatMap((c: Content) => c.annotations ?? [])
      .filter((a: Anno) => a.type === "url_citation" && a.url)
      .map((a: Anno) => ({ title: a.title || a.url!, url: a.url! }));

    let result: {
      is_stale?: boolean;
      severity?: string;
      summary?: string;
      issues?: { step?: string; problem?: string; suggestion?: string }[];
      sources?: { title?: string; url?: string }[];
    } = {};
    try {
      const m = text.match(/\{[\s\S]*\}/);
      result = JSON.parse(m ? m[0] : text);
    } catch {
      /* unparsebar -> als nicht-stale behandeln */
    }

    // Quellen mergen (Modell + echte Zitate), nach URL deduplizieren.
    const srcMap = new Map<string, { title: string; url: string }>();
    for (const s of [...(result.sources ?? []), ...citations]) {
      if (s?.url) srcMap.set(s.url, { title: s.title || s.url, url: s.url });
    }
    const sources = [...srcMap.values()].slice(0, 5);
    const issues = (Array.isArray(result.issues) ? result.issues : []).slice(0, 8);

    // Re-Check löst vorherige offene Hinweise ab.
    await supabase
      .from("change_alerts")
      .update({ status: "resolved" })
      .eq("tutorial_id", id)
      .eq("status", "open");

    if (result.is_stale) {
      await supabase.from("change_alerts").insert({
        tutorial_id: id,
        severity: ["info", "warning", "critical"].includes(result.severity ?? "")
          ? result.severity
          : "warning",
        summary: result.summary ?? "Mögliche Änderung erkannt.",
        details: {
          issues,
          sources,
          affected_steps: issues.map((i) => i.step).filter(Boolean),
        },
      });
      await supabase
        .from("tutorials")
        .update({ freshness: "stale", drift_checked_at: new Date().toISOString() })
        .eq("id", id);
    } else {
      await supabase
        .from("tutorials")
        .update({ freshness: "ok", drift_checked_at: new Date().toISOString() })
        .eq("id", id);
    }

    return NextResponse.json({
      configured: true,
      is_stale: !!result.is_stale,
      severity: result.severity,
      summary: result.summary,
      issues,
      sources,
    });
  } catch (e) {
    return NextResponse.json(
      { configured: true, error: e instanceof Error ? e.message : "Fehler" },
      { status: 200 },
    );
  }
}
