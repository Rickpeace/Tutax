import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI, aiConfigured } from "@/lib/ai";
import { openai } from "@/lib/openai";

const BUCKET = "tutorial-images";

/**
 * KI-Schritt-Assistent (§Zusatz): aus einem Screenshot Titel, Anleitungstext
 * und optional die wichtigste Markierung (relative Box) vorschlagen.
 */
export async function POST(req: NextRequest) {
  if (!aiConfigured())
    return NextResponse.json({ error: "KI ist nicht aktiviert (OPENAI_API_KEY fehlt)." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  let body: { tutorialId?: string; imagePath?: string; tutorialTitle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  const { tutorialId, imagePath, tutorialTitle } = body;
  if (!tutorialId || !imagePath)
    return NextResponse.json({ error: "tutorialId/imagePath fehlt" }, { status: 400 });

  // Zugriff: Tutorial ist via RLS nur sichtbar, wenn es dem User gehört.
  const { data: tutorial } = await supabase
    .from("tutorials")
    .select("account_id")
    .eq("id", tutorialId)
    .single();
  if (!tutorial) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  if (tutorial.account_id && !imagePath.startsWith(`${tutorial.account_id}/`))
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  const admin = createAdminClient();
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(imagePath, 600);
  if (!signed?.signedUrl)
    return NextResponse.json({ error: "Bild nicht gefunden" }, { status: 404 });

  const system =
    "Du hilfst einer Organisation, eine bebilderte Schritt-für-Schritt-Anleitung für Kunden zu erstellen. " +
    "Analysiere den Screenshot und beschreibe genau EINEN Bedienschritt: was der Nutzer hier tun soll. " +
    "Sprich die Kunden höflich in der Sie-Form an. Erfinde nichts, was nicht im Bild zu sehen ist.";
  const instruction =
    `Kontext – Anleitung: „${tutorialTitle || "(ohne Titel)"}".\n` +
    "Antworte ausschließlich als JSON mit:\n" +
    '- "title": kurzer Schritt-Titel im Imperativ (Deutsch, max. 6 Wörter)\n' +
    '- "body": 1–2 klare Sätze, was zu tun ist (Deutsch, Sie-Form)\n' +
    '- "highlight": das WICHTIGSTE anzuklickende/auszufüllende Element als relative Box ' +
    '{"x":0..1,"y":0..1,"w":0..1,"h":0..1} (Ursprung oben links). null, wenn nicht eindeutig.\n' +
    "Gib IMMER ein JSON-Objekt zurück (niemals null). title und body sind Pflicht; " +
    "ist der Screenshot unklar, beschreibe trotzdem bestmöglich den wahrscheinlichen Schritt.";

  try {
    const res = await openai().chat.completions.create({
      model: AI.models.vision,
      response_format: { type: "json_object" },
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: signed.signedUrl, detail: "high" } },
          ],
        },
      ],
    });

    const raw = res.choices[0]?.message?.content || "{}";
    let parsed: Record<string, unknown> = {};
    try {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") parsed = p as Record<string, unknown>;
    } catch {
      parsed = {};
    }

    const title = typeof parsed.title === "string" ? parsed.title.trim().slice(0, 120) : "";
    const text = typeof parsed.body === "string" ? parsed.body.trim() : "";

    let highlight: { x: number; y: number; w: number; h: number } | null = null;
    const h = parsed.highlight as Record<string, unknown> | null;
    if (h && [h.x, h.y, h.w, h.h].every((n) => typeof n === "number")) {
      const cl = (v: number) => Math.max(0, Math.min(1, v));
      const x = cl(h.x as number), y = cl(h.y as number);
      highlight = { x, y, w: cl(Math.min(h.w as number, 1 - x)), h: cl(Math.min(h.h as number, 1 - y)) };
    }

    if (!title && !text)
      return NextResponse.json(
        { error: "Konnte aus dem Screenshot nichts ableiten – bitte manuell ausfüllen." },
        { status: 422 },
      );

    return NextResponse.json({ title, body: text, highlight });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "KI-Fehler" },
      { status: 500 },
    );
  }
}
