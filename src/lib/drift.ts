import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfigured, AI } from "@/lib/ai";
import { DRIFT_SYSTEM } from "@/lib/ai-prompts";

/**
 * Gemeinsame Drift-Check-Kernlogik (REVIEW C, Aktualitäts-Autopilot).
 * Wird sowohl von der manuellen Route (`/api/tutorials/[id]/check`) als auch vom
 * wöchentlichen Cron (`/api/cron/drift`) genutzt — Verhalten identisch halten
 * (Cooldown 60 Min, Kosten-Schutz, Quellen-Merge, change_alerts-Ablösung).
 *
 * Die Route reicht ihren RLS-Client durch (Autorisierung bleibt dort), der Cron
 * den Admin-Client. Der Ergebnis-Typ bildet die bisherigen Route-Antworten ab.
 */
export type DriftResult =
  | { kind: "not_configured" }
  | { kind: "cooldown"; sinceMin: number; waitMin: number }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      is_stale: boolean;
      severity?: string;
      summary?: string;
      issues: { step?: string; problem?: string; suggestion?: string }[];
      sources: { title: string; url: string }[];
    };

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

/**
 * Führt den Drift-Check für EIN Tutorial aus. Setzt beim (Nicht-)Veraltet-Sein
 * freshness/drift_checked_at und legt bei is_stale ein change_alert an.
 * `supabase` muss Lese-/Schreibrechte auf steps/tutorials/change_alerts haben.
 */
export async function runDriftCheck(
  supabase: SupabaseClient,
  tutorialId: string,
): Promise<DriftResult> {
  const { data: tut } = await supabase
    .from("tutorials")
    .select("title, drift_checked_at")
    .eq("id", tutorialId)
    .single();
  if (!tut) return { kind: "error", message: "Kein Zugriff" };

  if (!aiConfigured()) return { kind: "not_configured" };

  // Cooldown (Kosten-Schutz, teuerster KI-Call = web_search): max. 1×/Stunde.
  if (tut.drift_checked_at) {
    const last = new Date(tut.drift_checked_at).getTime();
    const elapsedMin = (Date.now() - last) / 60_000;
    if (Number.isFinite(elapsedMin) && elapsedMin < 60) {
      const waitMin = Math.max(1, Math.ceil(60 - elapsedMin));
      const sinceMin = Math.max(0, Math.floor(elapsedMin));
      return { kind: "cooldown", sinceMin, waitMin };
    }
  }

  const { data: steps } = await supabase
    .from("steps")
    .select("title, body, position")
    .eq("tutorial_id", tutorialId)
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
      .eq("tutorial_id", tutorialId)
      .eq("status", "open");

    if (result.is_stale) {
      await supabase.from("change_alerts").insert({
        tutorial_id: tutorialId,
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
        .eq("id", tutorialId);
    } else {
      await supabase
        .from("tutorials")
        .update({ freshness: "ok", drift_checked_at: new Date().toISOString() })
        .eq("id", tutorialId);
    }

    return {
      kind: "ok",
      is_stale: !!result.is_stale,
      severity: result.severity,
      summary: result.summary,
      issues,
      sources,
    };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "Fehler" };
  }
}
