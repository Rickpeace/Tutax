"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, AI } from "@/lib/ai";
import { openai } from "@/lib/openai";

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

type Issue = { step?: string; problem?: string; suggestion?: string; applied?: boolean };

/**
 * Wendet die Verbesserungsvorschläge EINES Schritts (eine oder mehrere Positionen)
 * gemeinsam an: ein einziges Umschreiben, das alle Probleme zusammen einarbeitet.
 */
export async function applyDriftSuggestions(alertId: string, indices: number[]) {
  if (!aiConfigured()) throw new Error("KI ist nicht aktiviert.");
  const supabase = await createClient();

  const { data: alert } = await supabase
    .from("change_alerts")
    .select("id, tutorial_id, details")
    .eq("id", alertId)
    .single();
  if (!alert) throw new Error("Hinweis nicht gefunden.");

  const details = (alert.details ?? {}) as { issues?: Issue[] };
  const issues = details.issues ?? [];
  const selected = indices.map((i) => issues[i]).filter(Boolean) as Issue[];
  if (!selected.length) throw new Error("Position nicht gefunden.");

  const { data: steps } = await supabase
    .from("steps")
    .select("id, title, body, position")
    .eq("tutorial_id", alert.tutorial_id)
    .order("position", { ascending: true });
  if (!steps?.length) throw new Error("Keine Schritte vorhanden.");

  // Ziel-Schritt aus der ersten Position bestimmen: „N. Titel" -> Nummer; sonst Titel-Match.
  const stepStr = String(selected[0].step ?? "");
  const norm = (s: string) => s.toLowerCase().replace(/^\s*\d+[.)]\s*/, "").trim();
  let target: (typeof steps)[number] | null = null;
  const numMatch = stepStr.match(/^\s*(\d+)/);
  if (numMatch) target = steps[parseInt(numMatch[1], 10) - 1] ?? null;
  if (!target) {
    const want = norm(stepStr);
    target =
      steps.find((s) => {
        const t = norm(s.title ?? "");
        return t && (want.includes(t) || t.includes(want));
      }) ?? null;
  }
  if (!target) throw new Error("Passender Schritt nicht gefunden – bitte im Editor anpassen.");

  const punkte = selected
    .map((it, k) => `${k + 1}) Problem: ${it.problem ?? ""}\n   Korrektur: ${it.suggestion ?? ""}`)
    .join("\n");

  const completion = await openai().chat.completions.create({
    model: AI.models.chat,
    temperature: 0.3,
    max_completion_tokens: 400,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Du verbesserst EINEN Schritt einer Mandanten-Anleitung (Steuerkanzlei). Arbeite ALLE genannten Korrekturen GEMEINSAM in einen stimmigen Schritt ein. Sie-Anrede, kurz, klar, fachlich korrekt. Gib JSON {\"title\": \"…\", \"body\": \"…\"} zurück (body 1–3 Sätze).",
      },
      {
        role: "user",
        content: `Aktueller Titel: ${target.title ?? ""}\nAktueller Text: ${plainBody(target.body)}\n\nUmzusetzende Korrekturen:\n${punkte}\n\nSchreibe den Schritt verbessert um (alle Korrekturen zusammen, eine konsistente Fassung).`,
      },
    ],
  });

  let out: { title?: string; body?: string } = {};
  try {
    out = JSON.parse(completion.choices[0].message.content ?? "{}");
  } catch {
    throw new Error("KI-Antwort unlesbar.");
  }
  const newTitle = typeof out.title === "string" && out.title.trim() ? out.title.trim() : target.title;
  const newText = typeof out.body === "string" ? out.body.trim() : "";
  const bodyDoc = {
    type: "doc",
    content: [{ type: "paragraph", content: newText ? [{ type: "text", text: newText }] : [] }],
  };

  const { error: upErr } = await supabase
    .from("steps")
    .update({ title: newTitle, body: bodyDoc })
    .eq("id", target.id);
  if (upErr) throw new Error(upErr.message);

  // Alle einbezogenen Positionen als übernommen markieren.
  for (const i of indices) if (issues[i]) issues[i] = { ...issues[i], applied: true };
  await supabase.from("change_alerts").update({ details: { ...details, issues } }).eq("id", alertId);

  revalidatePath("/app/alerts");
  return { ok: true, stepTitle: newTitle };
}

export async function updateAlertStatus(
  alertId: string,
  status: "acknowledged" | "resolved" | "dismissed",
) {
  const supabase = await createClient();
  const { data: alert } = await supabase
    .from("change_alerts")
    .select("tutorial_id")
    .eq("id", alertId)
    .single();

  const patch: Record<string, unknown> = { status };
  if (status === "resolved" || status === "dismissed") {
    patch.resolved_at = new Date().toISOString();
  }
  const { error } = await supabase.from("change_alerts").update(patch).eq("id", alertId);
  if (error) throw new Error(error.message);

  // Wenn das Tutorial keine offenen Hinweise mehr hat -> „Prüfen"-Flag entfernen.
  if ((status === "resolved" || status === "dismissed") && alert?.tutorial_id) {
    const { count } = await supabase
      .from("change_alerts")
      .select("id", { count: "exact", head: true })
      .eq("tutorial_id", alert.tutorial_id)
      .eq("status", "open");
    if (!count) {
      await supabase.from("tutorials").update({ freshness: "ok" }).eq("id", alert.tutorial_id);
    }
  }

  revalidatePath("/app/alerts");
  revalidatePath("/app");
}
