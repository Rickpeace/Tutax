"use server";

import { takeHourlyAiRun } from "@/lib/ai-rate-limit";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAccount, requireTutorialAccess } from "@/lib/account";
import { aiConfigured, AI } from "@/lib/ai";
import { openai } from "@/lib/openai";
import { reindexTutorialIfLive } from "@/lib/kb";
import { invalidateStepTags } from "@/lib/cache-tags";
import { markTranslationsStaleByStep } from "@/lib/translate-stale";
import { translateStepDelta } from "@/lib/translate-jobs";
import { ensureStepAudio } from "@/lib/tts";
import { withUserErrors, UserError } from "@/lib/action-error";
import { isPro, PRO_REQUIRED } from "@/lib/plan";

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
export const applyDriftSuggestions = withUserErrors(async function applyDriftSuggestions(alertId: string, indices: number[]) {
  // Nur Inhaber/Bearbeiter (KI-Kosten + Schreiben); Mitarbeiter weist requireAccount ab.
  const { account, userId } = await requireAccount();
  // KI-Aufruf (kostet) → erst ab Pro.
  if (!isPro(account)) throw new UserError(PRO_REQUIRED);
  if (!aiConfigured()) throw new UserError("KI ist nicht aktiviert.");
  // Kostenbremse pro Person (Audit 23.09.: ohne Grenze beliebig oft auslösbar).
  if (!(await takeHourlyAiRun(userId, "ai_drift_apply", 30)))
    throw new UserError("Sie haben diese KI-Funktion in dieser Stunde schon oft genutzt. Bitte später erneut versuchen.");
  const supabase = await createClient();

  const { data: alert } = await supabase
    .from("change_alerts")
    .select("id, tutorial_id, details")
    .eq("id", alertId)
    .single();
  if (!alert) throw new UserError("Hinweis nicht gefunden.");
  // Nur Anleitungen des AKTIVEN Kontos (RLS zeigt Hinweise aller Konten, in denen man
  // Mitglied ist — auch als Mitarbeiter anderswo). Vor dem KI-Aufruf prüfen.
  await requireTutorialAccess(alert.tutorial_id as string);

  const details = (alert.details ?? {}) as { issues?: Issue[] };
  const issues = details.issues ?? [];
  const selected = indices.map((i) => issues[i]).filter(Boolean) as Issue[];
  if (!selected.length) throw new UserError("Position nicht gefunden.");

  const { data: steps } = await supabase
    .from("steps")
    .select("id, title, body, position")
    .eq("tutorial_id", alert.tutorial_id)
    .order("position", { ascending: true });
  if (!steps?.length) throw new UserError("Keine Schritte vorhanden.");

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
  if (!target) throw new UserError("Passender Schritt nicht gefunden – bitte im Editor anpassen.");

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
          "Du verbesserst EINEN Schritt einer Kunden-Anleitung (Organisation). Arbeite ALLE genannten Korrekturen GEMEINSAM in einen stimmigen Schritt ein. Sie-Anrede, kurz, klar, fachlich korrekt. Gib JSON {\"title\": \"…\", \"body\": \"…\"} zurück (body 1–3 Sätze).",
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
    throw new UserError("KI-Antwort unlesbar.");
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
  // Dieselben Folgen wie beim Speichern im Editor (updateStep): Hilfe-Seite sofort neu,
  // Übersetzungen veraltet + Delta nachziehen, Vorlesen neu, Chatbot-Index nachziehen.
  // Früher lief nur der Chatbot-Index — die Hilfe-Seite zeigte bis zu 1 h den alten Text,
  // Übersetzungen und Vorlesen blieben dauerhaft beim alten Stand.
  const stepId = target.id as string;
  const tutorialId = alert.tutorial_id as string;
  await invalidateStepTags(stepId);
  await markTranslationsStaleByStep(stepId);
  after(() => translateStepDelta(stepId));
  after(() => ensureStepAudio(stepId));
  after(() => reindexTutorialIfLive(tutorialId));

  // Alle einbezogenen Positionen als übernommen markieren.
  for (const i of indices) if (issues[i]) issues[i] = { ...issues[i], applied: true };
  await supabase.from("change_alerts").update({ details: { ...details, issues } }).eq("id", alertId);

  revalidatePath("/app/alerts");
  return { ok: true, stepTitle: newTitle };
});

export const updateAlertStatus = withUserErrors(async function updateAlertStatus(
  alertId: string,
  status: "acknowledged" | "resolved" | "dismissed",
) {
  await requireAccount();
  const supabase = await createClient();
  const { data: alert } = await supabase
    .from("change_alerts")
    .select("tutorial_id")
    .eq("id", alertId)
    .maybeSingle();
  if (!alert) throw new UserError("Diesen Hinweis gibt es nicht mehr – bitte die Seite neu laden.");
  await requireTutorialAccess(alert.tutorial_id as string);

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
});
