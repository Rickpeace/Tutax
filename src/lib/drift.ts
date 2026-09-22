import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { aiConfigured, AI } from "@/lib/ai";
import { openai } from "@/lib/openai";
import { DRIFT_SYSTEM } from "@/lib/ai-prompts";
import { burnBlur, unionBlurs } from "@/lib/redact";

/**
 * Gemeinsame Kernlogik von „Aktualität prüfen“ (REVIEW C, Aktualitäts-Autopilot).
 * Wird sowohl von der manuellen Route (`/api/tutorials/[id]/check`) als auch vom
 * wöchentlichen Cron (`/api/cron/drift`) genutzt — Verhalten identisch halten
 * (Cooldown 60 Min, Kosten-Schutz, change_alerts-Ablösung).
 *
 * Seit 09/2026: Die KI vergleicht Titel/Erklärtext jedes Schritts mit SEINEM Screenshot
 * (Bild-Eingabe) und meldet nur sichtbare Abweichungen. Vorher lief eine Web-Suche über den
 * Anleitungstext — die hat fremde Produkte „erkannt“ (Steply-Screenshots als ChatGPT-Workspace)
 * und daraus Hinweise gebaut. Keine Web-Suche mehr, keine Vermutungen über Produkt/Anbieter.
 *
 * Datenschutz: Verpixelungen werden VOR dem Versand in die Pixel eingebrannt (wie bei den
 * öffentlichen Bildkopien); das private Original verlässt den Server nie unredigiert.
 *
 * Die Route reicht ihren RLS-Client durch (Autorisierung bleibt dort), der Cron
 * den Admin-Client. Der Ergebnis-Typ bildet die Route-Antworten ab.
 */
export type DriftIssue = { step?: string; problem?: string; suggestion?: string };

export type DriftResult =
  | { kind: "not_configured" }
  | { kind: "cooldown"; sinceMin: number; waitMin: number }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      is_stale: boolean;
      severity?: string;
      summary?: string;
      issues: DriftIssue[];
      /** Bleibt für die Hinweis-Seite erhalten (früher Web-Quellen); jetzt immer leer. */
      sources: { title: string; url: string }[];
      /** Anzahl Schritte, deren Screenshot verglichen wurde (0 = nichts zu vergleichen). */
      compared: number;
      /** id des neu angelegten Glocken-Hinweises (nur bei Abweichungen). */
      alertId?: string;
    };

/** Höchstens so viele Screenshots pro Prüfung (Kosten-/Zeitdeckel). */
const MAX_IMAGES = 12;
/** Bildbreite für die KI: reicht für Knopf-/Menü-Beschriftungen, hält Tokens klein. */
const IMAGE_WIDTH = 1280;

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

type StepRow = {
  title: string | null;
  body: unknown;
  position: number;
  image_path: string | null;
  highlights: unknown;
};

/** Privates Bild laden, Verpixelungen einbrennen, verkleinern -> data:-URL (oder null). */
async function redactedImage(
  supabase: SupabaseClient,
  path: string,
  blurs: unknown,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from("tutorial-images").download(path);
    if (error || !data) return null;
    const original = Buffer.from(await data.arrayBuffer());
    const redacted = await burnBlur(original, blurs);
    const jpg = await sharp(redacted)
      .resize({ width: IMAGE_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch {
    return null; // kaputtes/fehlendes Bild: Schritt wird dann nicht verglichen
  }
}

/** „N. Titel“ — dieselbe Schreibweise, die applyDriftSuggestions zurück auflöst. */
const stepRef = (i: number, s: StepRow) => `${i + 1}. ${s.title?.trim() ?? ""}`.trim();

/**
 * Führt die Prüfung für EINE Anleitung aus. Setzt freshness/drift_checked_at und legt NUR
 * bei echten Abweichungen einen Glocken-Hinweis (change_alert) an.
 * `supabase` muss Lese-/Schreibrechte auf steps/tutorials/change_alerts + Bild-Lesezugriff haben.
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

  // Cooldown (Kosten-Schutz): max. 1×/Stunde.
  if (tut.drift_checked_at) {
    const last = new Date(tut.drift_checked_at).getTime();
    const elapsedMin = (Date.now() - last) / 60_000;
    if (Number.isFinite(elapsedMin) && elapsedMin < 60) {
      const waitMin = Math.max(1, Math.ceil(60 - elapsedMin));
      const sinceMin = Math.max(0, Math.floor(elapsedMin));
      return { kind: "cooldown", sinceMin, waitMin };
    }
  }

  const { data: stepRows } = await supabase
    .from("steps")
    .select("title, body, position, image_path, highlights")
    .eq("tutorial_id", tutorialId)
    .order("position", { ascending: true });
  const steps = (stepRows ?? []) as StepRow[];

  // Geteilte Bilder (mehrere Schritte, ein image_path): Vereinigung aller Verpixelungen
  // einbrennen — lieber zu viel als zu wenig unkenntlich (wie bei den öffentlichen Kopien).
  const blursByPath = new Map<string, unknown[]>();
  for (const s of steps) {
    if (!s.image_path) continue;
    const list = blursByPath.get(s.image_path) ?? [];
    list.push(s.highlights);
    blursByPath.set(s.image_path, list);
  }

  const withImage = steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !!s.image_path)
    .slice(0, MAX_IMAGES);
  const images = await Promise.all(
    withImage.map(({ s }) =>
      redactedImage(supabase, s.image_path!, unionBlurs(blursByPath.get(s.image_path!) ?? [])),
    ),
  );
  const imageByIndex = new Map<number, string>();
  withImage.forEach(({ i }, k) => {
    if (images[k]) imageByIndex.set(i, images[k]!);
  });

  // Nichts zu vergleichen (keine Screenshots): keine KI-Kosten, nichts speichern.
  if (imageByIndex.size === 0) {
    return {
      kind: "ok",
      is_stale: false,
      summary: "Keine Screenshots zum Vergleichen.",
      issues: [],
      sources: [],
      compared: 0,
    };
  }

  // Pro Schritt: Text, direkt gefolgt von SEINEM Screenshot (sonst ordnet die KI Bilder falsch zu).
  type Part =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } };
  const parts: Part[] = [
    {
      type: "text",
      text: `Anleitung: ${tut.title ?? ""}\nAnzahl Schritte: ${steps.length}`,
    },
  ];
  steps.forEach((s, i) => {
    const img = imageByIndex.get(i);
    parts.push({
      type: "text",
      text:
        `\n--- Schritt ${stepRef(i, s)}\n` +
        `Titel: ${s.title?.trim() || "(ohne Titel)"}\n` +
        `Erklärtext: ${plainBody(s.body) || "(leer)"}\n` +
        (img ? "Screenshot dieses Schritts:" : "(kein Screenshot – diesen Schritt NICHT bewerten)"),
    });
    if (img) parts.push({ type: "image_url", image_url: { url: img, detail: "high" } });
  });

  try {
    const completion = await openai().chat.completions.create(
      {
        model: AI.models.vision,
        messages: [
          { role: "system", content: DRIFT_SYSTEM },
          { role: "user", content: parts },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 3000,
      },
      { timeout: 45_000 },
    );
    const text = completion.choices[0]?.message?.content ?? "";

    let parsed: { issues?: unknown } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* unparsebar -> keine Befunde (lieber nichts melden als Unsinn) */
    }
    // Nur vollständige Befunde zu Schritten, die wirklich einen Screenshot hatten.
    const comparedRefs = new Set([...imageByIndex.keys()].map((i) => i + 1));
    const issues: DriftIssue[] = (Array.isArray(parsed.issues) ? parsed.issues : [])
      .filter((x): x is DriftIssue => !!x && typeof x === "object")
      .map((x) => ({
        step: typeof x.step === "string" ? x.step.trim() : undefined,
        problem: typeof x.problem === "string" ? x.problem.trim() : undefined,
        suggestion: typeof x.suggestion === "string" ? x.suggestion.trim() : undefined,
      }))
      .filter((x) => {
        if (!x.problem || !x.step) return false;
        const n = x.step.match(/^\s*(\d+)/);
        return !n || comparedRefs.has(parseInt(n[1], 10));
      })
      .slice(0, 8);

    const isStale = issues.length > 0;
    const summary = isStale
      ? issues.length === 1
        ? "1 mögliche Abweichung zwischen Text und Screenshot gefunden."
        : `${issues.length} mögliche Abweichungen zwischen Text und Screenshot gefunden.`
      : "Texte und Screenshots passen zusammen.";

    // Re-Check löst vorherige offene Hinweise ab.
    await supabase
      .from("change_alerts")
      .update({ status: "resolved" })
      .eq("tutorial_id", tutorialId)
      .eq("status", "open");

    let alertId: string | undefined;
    if (isStale) {
      // Glocken-Hinweis NUR bei echten Abweichungen.
      const { data: alert } = await supabase
        .from("change_alerts")
        .insert({
          tutorial_id: tutorialId,
          severity: "warning",
          summary,
          details: {
            issues,
            sources: [],
            affected_steps: issues.map((i) => i.step).filter(Boolean),
          },
        })
        .select("id")
        .maybeSingle();
      alertId = (alert?.id as string | undefined) ?? undefined;
    }
    await supabase
      .from("tutorials")
      .update({ freshness: isStale ? "stale" : "ok", drift_checked_at: new Date().toISOString() })
      .eq("id", tutorialId);

    return {
      kind: "ok",
      is_stale: isStale,
      severity: isStale ? "warning" : undefined,
      summary,
      issues,
      sources: [],
      compared: imageByIndex.size,
      alertId,
    };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "Fehler" };
  }
}
