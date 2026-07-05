import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI, aiConfigured } from "@/lib/ai";
import { openai } from "@/lib/openai";
import { mkBody } from "@/lib/guide";

// KI-FEINSCHLIFF der „Sofort-Anleitung" (Welle 22), bewusst billig + ausfallsicher:
// EIN Chat-Call (KEIN Vision, KEINE Bilder), der die Vorlagen-Texte natürlicher
// formuliert. Fehler ⇒ die Vorlagen bleiben unverändert (nie schlechter als vorher).
//
// Aufruf via after() NACH dem Insert: der Nutzer sieht sofort den Entwurf; der
// Feinschliff aktualisiert Titel/Text im Hintergrund. Labels bleiben WÖRTLICH,
// nichts wird erfunden.

type RoughStep = {
  id: string;
  title: string; // Vorlagen-Titel
  bodyText: string; // Vorlagen-Fließtext (ein Absatz)
  label: string; // wörtliches Label des geklickten Elements ("" wenn keins)
  action: "click" | "type";
};

const SYSTEM =
  "Du formulierst die Schritt-Texte einer Klick-Anleitung (Software-Tutorial) " +
  "natürlicher und einheitlicher. Sprich in der deutschen Sie-Form, freundlich und " +
  "knapp wie eine gute Software-Anleitung. WICHTIG: Erfinde NICHTS dazu — keine neuen " +
  "Schaltflächen, Werte oder Schritte. Wenn ein Label (der exakte Text des geklickten " +
  "Elements) angegeben ist, MUSST du es wörtlich und in typografischen Anführungszeichen " +
  "(„…“) übernehmen. Titel höchstens 60 Zeichen; Text ein bis zwei kurze Sätze.";

function buildUser(steps: RoughStep[]): string {
  const list = steps.map((s, i) => ({
    n: i + 1,
    aktion: s.action,
    label: s.label || null,
    titel_vorlage: s.title,
    text_vorlage: s.bodyText,
  }));
  return (
    "Hier sind die Schritte einer Anleitung (Vorlagen-Texte). Formuliere sie natürlicher, " +
    "OHNE Fakten zu ändern.\n\n" +
    JSON.stringify(list, null, 2) +
    "\n\nAntworte AUSSCHLIESSLICH als JSON nach diesem Schema (gleiche Reihenfolge und " +
    "Anzahl wie oben):\n" +
    "{\n" +
    '  "steps": [\n' +
    '    { "n": 1, "title": "kurzer Titel (≤60 Zeichen)", "body": "ein bis zwei Sätze" }\n' +
    "  ]\n" +
    "}\n\n" +
    "Regeln: gleiche Anzahl Schritte; „label“ (falls vorhanden) wörtlich und in „…“ " +
    "behalten; nichts erfinden; kein Markdown, kein Text vor/nach dem JSON."
  );
}

type Refined = { n: number; title: string; body: string };

function coerce(parsed: unknown, count: number): Map<number, Refined> {
  const list = (parsed as { steps?: unknown })?.steps;
  const map = new Map<number, Refined>();
  if (!Array.isArray(list)) return map;
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const n = typeof r.n === "number" ? r.n : NaN;
    if (!Number.isInteger(n) || n < 1 || n > count) continue;
    const title = typeof r.title === "string" ? r.title.trim().slice(0, 60) : "";
    const body = typeof r.body === "string" ? r.body.trim().slice(0, 600) : "";
    if (!title && !body) continue;
    map.set(n, { n, title, body });
  }
  return map;
}

/**
 * Feinschliff der Schritt-Texte via EIN Chat-Call. Aktualisiert title/body der bereits
 * angelegten Steps. Vollständig ausfallsicher: ohne KI-Key oder bei jedem Fehler bleibt
 * alles beim Alten (die Vorlagen sind bereits gespeichert).
 *
 * @param admin  Admin-Client (Update immer eng auf die konkreten Step-IDs begrenzt).
 */
export async function refineGuideSteps(
  admin: SupabaseClient,
  steps: RoughStep[],
): Promise<void> {
  if (!aiConfigured() || steps.length === 0) return;

  let refined: Map<number, Refined>;
  try {
    const completion = await openai().chat.completions.create({
      model: AI.models.chat,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUser(steps) },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1500,
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    refined = coerce(parsed, steps.length);
  } catch (e) {
    console.error("[guide-ai] Feinschliff-KI-Fehler:", e instanceof Error ? e.message : e);
    return; // Vorlagen bleiben
  }

  if (refined.size === 0) return;

  // Jeden verbesserten Schritt einzeln aktualisieren (nur title/body; nie Bild/Highlight).
  await Promise.all(
    steps.map(async (s, i) => {
      const r = refined.get(i + 1);
      if (!r) return;
      const patch: Record<string, unknown> = {};
      if (r.title) patch.title = r.title;
      if (r.body) patch.body = mkBody(r.body);
      if (Object.keys(patch).length === 0) return;
      await admin.from("steps").update(patch).eq("id", s.id);
    }),
  ).catch((e) => {
    console.error("[guide-ai] Feinschliff-Update-Fehler:", e instanceof Error ? e.message : e);
  });
}
