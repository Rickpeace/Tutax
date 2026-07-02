"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { AI, aiConfigured } from "@/lib/ai";
import { openai } from "@/lib/openai";

/** Tiptap-Doc aus einem Absatz-Text bauen (gleiches Muster wie video-worker/index.mjs). */
const mkBody = (t: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] }],
});

type DraftStep = { title: string; body: string };
type DraftFrame = { title: string; steps: DraftStep[] };

const SYSTEM =
  "Du hilfst einer Organisation, aus einer unbeantwortet gebliebenen Kundenfrage einen " +
  "ENTWURFS-RAHMEN für eine Schritt-für-Schritt-Anleitung zu erstellen. Die Anleitung " +
  "richtet sich an Endkunden und spricht sie höflich in der Sie-Form an. " +
  "Du kennst die konkrete Software/Oberfläche der Organisation NICHT — sei deshalb ehrlich " +
  "generisch, wo dir Details fehlen, und erfinde keine Knopf-Beschriftungen oder Menüpfade, " +
  "die du nicht kennen kannst. Formuliere die Schritte so, dass die Organisation sie leicht " +
  "mit ihren echten Screenshots und Bezeichnungen konkretisieren kann.";

function buildUser(question: string): string {
  return (
    `Unbeantwortete Kundenfrage: „${question}"\n\n` +
    "Erstelle einen Anleitungs-Entwurf. Antworte AUSSCHLIESSLICH als JSON-Objekt nach diesem Schema:\n" +
    "{\n" +
    '  "title": "kurzer, klarer Anleitungs-Titel (Deutsch, ohne Anführungszeichen)",\n' +
    '  "steps": [ { "title": "Schritt-Titel (kurz)", "body": "1–3 Sätze, was zu tun ist (Sie-Form)" } ]\n' +
    "}\n\n" +
    "Regeln:\n" +
    "- 3 bis 6 Schritte (inkl. dem Hinweis-Schritt am Ende).\n" +
    "- Sei generisch, wo dir Details fehlen (z. B. „Öffnen Sie den entsprechenden Bereich“ " +
    "statt einen erfundenen Menüpunkt zu nennen).\n" +
    "- Der LETZTE Schritt ist immer ein Hinweis-Schritt mit Titel „[Screenshots ergänzen]“ " +
    "und einem Body, der die Organisation auffordert, die Schritte mit echten Screenshots " +
    "und den korrekten Bezeichnungen aus ihrer Software zu vervollständigen.\n" +
    "- Kein Markdown, kein Text vor oder nach dem JSON."
  );
}

/**
 * Frage-Lücken-Miner (REVIEW H1): erzeugt aus einer unbeantworteten Chat-Frage einen
 * Tutorial-ENTWURF (status draft) mit linearem Schritt-Fluss. Danach werden alle
 * gleichlautenden (normalisiert lower/trim) unbeantworteten Chat-Events dieses Kontos
 * als erledigt markiert (handled_at = now), damit die Frage aus der Insights-Lücken-
 * liste verschwindet. Gibt { tutorialId } zurück (kein Redirect — das macht der Client).
 */
export async function createDraftFromQuestion(question: string): Promise<{ tutorialId: string }> {
  const q = String(question ?? "").trim();
  if (!q) throw new Error("Keine Frage angegeben.");
  if (!aiConfigured()) throw new Error("Die KI ist nicht aktiviert (OPENAI_API_KEY fehlt).");

  const { account } = await requireAccount();
  const supabase = await createClient();

  // 1) KI-Entwurfsrahmen erzeugen.
  let frame: DraftFrame;
  try {
    const completion = await openai().chat.completions.create({
      model: AI.models.chat,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUser(q.slice(0, 300)) },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 700,
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim().slice(0, 200)
        : q.slice(0, 120);
    const steps: DraftStep[] = Array.isArray(parsed.steps)
      ? parsed.steps
          .filter((s: unknown): s is Record<string, unknown> => !!s && typeof s === "object")
          .map((s: Record<string, unknown>) => ({
            title: typeof s.title === "string" ? s.title.trim().slice(0, 200) : "",
            body: typeof s.body === "string" ? s.body.trim() : "",
          }))
          .filter((s: DraftStep) => s.title || s.body)
      : [];
    frame = { title, steps };
  } catch (e) {
    console.error("[insights-miner] KI-Fehler:", e instanceof Error ? e.message : e);
    throw new Error("Der Entwurf konnte nicht erstellt werden. Bitte versuchen Sie es erneut.");
  }

  // Absicherung: immer mindestens ein Hinweis-Schritt.
  if (!frame.steps.length) {
    frame.steps = [
      {
        title: "Vorgehen beschreiben",
        body: "Beschreiben Sie hier die einzelnen Schritte für Ihre Kundinnen und Kunden.",
      },
    ];
  }
  const lastTitle = frame.steps[frame.steps.length - 1].title.toLowerCase();
  if (!lastTitle.includes("screenshot")) {
    frame.steps.push({
      title: "[Screenshots ergänzen]",
      body: "Ergänzen Sie die Schritte mit echten Screenshots und den korrekten Bezeichnungen aus Ihrer Software, damit die Anleitung eindeutig wird.",
    });
  }

  // 2) Tutorial + Schritte + lineare Branches + root_step_id anlegen (RLS-Client;
  //    Muster wie duplicateTutorial in app/actions.ts).
  const { data: tutorial, error: tErr } = await supabase
    .from("tutorials")
    .insert({
      account_id: account.id,
      title: frame.title,
      status: "draft",
    })
    .select("id")
    .single();
  if (tErr || !tutorial) throw new Error(tErr?.message ?? "Entwurf konnte nicht angelegt werden.");

  const stepIds: string[] = [];
  for (let i = 0; i < frame.steps.length; i++) {
    const s = frame.steps[i];
    const { data: ns, error: sErr } = await supabase
      .from("steps")
      .insert({
        tutorial_id: tutorial.id,
        title: s.title || `Schritt ${i + 1}`,
        body: mkBody(s.body),
        position: i + 1,
        is_decision: false,
        highlights: [],
      })
      .select("id")
      .single();
    if (sErr || !ns) throw new Error(sErr?.message ?? "Schritt konnte nicht angelegt werden.");
    stepIds.push(ns.id);
  }

  // Lineare Verkettung: jeder Schritt -> nächster („Weiter"). Der letzte hat keinen Branch.
  const branchRows = stepIds.slice(0, -1).map((id, i) => ({
    step_id: id,
    label: "Weiter",
    color: null,
    target_step_id: stepIds[i + 1],
    position: 1,
  }));
  if (branchRows.length) {
    const { error: bErr } = await supabase.from("step_branches").insert(branchRows);
    if (bErr) throw new Error(bErr.message);
  }

  // root_step_id setzen (Startschritt).
  const { error: rErr } = await supabase
    .from("tutorials")
    .update({ root_step_id: stepIds[0] })
    .eq("id", tutorial.id);
  if (rErr) throw new Error(rErr.message);

  // 3) Gleichlautende unbeantwortete Chat-Fragen dieses Kontos als erledigt markieren
  //    (normalisiert lower/trim). Admin-Client, weil Mitglieder events nur LESEN dürfen.
  //    Kein .throwOnError — Tracking-Wartung darf den Erfolg nicht kippen.
  try {
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from("events")
      .select("id, question")
      .eq("account_id", account.id)
      .eq("type", "chat")
      .eq("status", "no_answer")
      .is("handled_at", null)
      .not("question", "is", null);
    const norm = q.toLowerCase();
    const matchIds = (rows ?? [])
      .filter((r) => (r.question ?? "").trim().toLowerCase() === norm)
      .map((r) => r.id);
    if (matchIds.length) {
      await admin
        .from("events")
        .update({ handled_at: new Date().toISOString() })
        .in("id", matchIds);
    }
  } catch (e) {
    console.error("[insights-miner] handled_at:", e instanceof Error ? e.message : e);
  }

  return { tutorialId: tutorial.id };
}
